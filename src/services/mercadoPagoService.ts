import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import axios from "axios";
import env from "../config/env";
import { logger } from "../utils/logger";
import type { Tenant } from "../models/tenant";
import { updateTenant } from "./tenantService";

/**
 * Servicio para integración con Mercado Pago Checkout Pro
 * Documentación: https://www.mercadopago.com.ar/developers/es/docs/checkout-pro
 */

/**
 * Interfaz para los items de la preferencia de pago
 */
interface PreferenceItem {
  id: string;
  title: string;
  description?: string;
  quantity: number;
  unit_price: number;
  currency_id: string;
}

/**
 * Interfaz para la respuesta de OAuth de Mercado Pago
 */
interface MercadoPagoOAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  user_id: number;
  refresh_token: string;
  public_key: string;
}

/**
 * Interfaz para la respuesta al crear una preferencia
 */
interface CreatePreferenceResponse {
  preferenceId: string;
  initPoint: string; // URL para redirigir al checkout
  sandboxInitPoint: string; // URL para pruebas
}

/**
 * Verifica si el tenant tiene Mercado Pago configurado
 */
export const hasMercadoPagoConfigured = (tenant: Tenant): boolean => {
  return !!(tenant.mercadoPagoAccessToken);
};

/**
 * Obtiene la URL de autorización para OAuth de Mercado Pago
 * El tenant debe autorizar la aplicación para poder procesar pagos
 */
export const getOAuthAuthorizationUrl = (tenantId: string): string => {
  if (!env.mercadoPagoAppId) {
    throw new Error("MERCADO_PAGO_APP_ID no está configurado");
  }

  const redirectUri = encodeURIComponent(env.mercadoPagoRedirectUri);
  const state = encodeURIComponent(tenantId); // Usamos el tenantId como state para identificarlo en el callback

  return `https://auth.mercadopago.com.ar/authorization?client_id=${env.mercadoPagoAppId}&response_type=code&platform_id=mp&state=${state}&redirect_uri=${redirectUri}`;
};

/**
 * Intercambia el código de autorización por tokens de acceso
 * Este proceso se realiza después de que el usuario autoriza la app
 */
export const exchangeCodeForTokens = async (
  code: string,
  tenantId: string,
): Promise<MercadoPagoOAuthResponse> => {
  try {
    if (!env.mercadoPagoAppId || !env.mercadoPagoClientSecret) {
      throw new Error("Credenciales de Mercado Pago no configuradas");
    }

    logger.info(`Intercambiando código OAuth para tenant ${tenantId}`);

    const response = await axios.post<MercadoPagoOAuthResponse>(
      "https://api.mercadopago.com/oauth/token",
      {
        client_id: env.mercadoPagoAppId,
        client_secret: env.mercadoPagoClientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: env.mercadoPagoRedirectUri,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const tokens = response.data;

    // Calcular fecha de expiración
    const expiryDate = new Date();
    expiryDate.setSeconds(expiryDate.getSeconds() + tokens.expires_in);

    // Guardar los tokens en el tenant
    await updateTenant(tenantId, {
      mercadoPagoAccessToken: tokens.access_token,
      mercadoPagoRefreshToken: tokens.refresh_token,
      mercadoPagoPublicKey: tokens.public_key,
      mercadoPagoUserId: String(tokens.user_id),
      mercadoPagoTokenExpiry: expiryDate.toISOString(),
    });

    logger.info(`Tokens de Mercado Pago guardados para tenant ${tenantId}`);

    return tokens;
  } catch (error) {
    logger.error("Error al intercambiar código OAuth de Mercado Pago", error);
    throw new Error("No se pudo conectar con Mercado Pago. Intenta nuevamente.");
  }
};

/**
 * Refresca el access token usando el refresh token
 */
export const refreshAccessToken = async (tenant: Tenant): Promise<string> => {
  try {
    if (!tenant.mercadoPagoRefreshToken) {
      throw new Error("No hay refresh token disponible");
    }

    logger.info(`Refrescando access token para tenant ${tenant.id}`);

    const response = await axios.post<MercadoPagoOAuthResponse>(
      "https://api.mercadopago.com/oauth/token",
      {
        client_id: env.mercadoPagoAppId,
        client_secret: env.mercadoPagoClientSecret,
        refresh_token: tenant.mercadoPagoRefreshToken,
        grant_type: "refresh_token",
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const tokens = response.data;

    // Calcular fecha de expiración
    const expiryDate = new Date();
    expiryDate.setSeconds(expiryDate.getSeconds() + tokens.expires_in);

    // Actualizar tokens en el tenant
    await updateTenant(tenant.id, {
      mercadoPagoAccessToken: tokens.access_token,
      mercadoPagoRefreshToken: tokens.refresh_token,
      mercadoPagoTokenExpiry: expiryDate.toISOString(),
    });

    logger.info(`Access token refrescado para tenant ${tenant.id}`);

    return tokens.access_token;
  } catch (error) {
    logger.error("Error al refrescar access token de Mercado Pago", error);
    throw new Error("No se pudo refrescar el token de Mercado Pago");
  }
};

/**
 * Obtiene un access token válido, refrescándolo si es necesario
 */
const getValidAccessToken = async (tenant: Tenant): Promise<string> => {
  if (!tenant.mercadoPagoAccessToken) {
    throw new Error("Mercado Pago no está configurado para este tenant");
  }

  // Verificar si el token está por expirar (menos de 1 hora)
  if (tenant.mercadoPagoTokenExpiry) {
    const expiry = new Date(tenant.mercadoPagoTokenExpiry);
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    if (expiry < oneHourFromNow && tenant.mercadoPagoRefreshToken) {
      return await refreshAccessToken(tenant);
    }
  }

  return tenant.mercadoPagoAccessToken;
};

/**
 * Crea una preferencia de pago para Checkout Pro
 * Retorna la URL donde el cliente puede completar el pago
 */
export const createPaymentPreference = async (
  tenant: Tenant,
  orderId: string,
  items: PreferenceItem[],
  payerPhone: string,
  payerName?: string,
): Promise<CreatePreferenceResponse> => {
  try {
    const accessToken = await getValidAccessToken(tenant);

    const client = new MercadoPagoConfig({
      accessToken,
    });

    const preference = new Preference(client);

    // Calcular el total
    const total = items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);

    logger.info(`Creando preferencia de pago para orden ${orderId}, total: $${total}`);

    const result = await preference.create({
      body: {
        items: items.map(item => ({
          id: item.id,
          title: item.title,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          currency_id: "ARS",
        })),
        payer: {
          phone: {
            number: payerPhone,
          },
          name: payerName || "Cliente",
        },
        external_reference: orderId, // Para vincular el pago con la orden
        notification_url: `${env.mercadoPagoRedirectUri.replace('/callback', '')}/webhooks/mercadopago`,
        back_urls: {
          success: `${env.mercadoPagoRedirectUri.replace('/callback', '')}/payment/success`,
          failure: `${env.mercadoPagoRedirectUri.replace('/callback', '')}/payment/failure`,
          pending: `${env.mercadoPagoRedirectUri.replace('/callback', '')}/payment/pending`,
        },
        auto_return: "approved",
        statement_descriptor: tenant.name.substring(0, 22), // Descripción en el resumen de cuenta
        expires: true,
        expiration_date_from: new Date().toISOString(),
        expiration_date_to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 horas
      },
    });

    if (!result.id || !result.init_point) {
      throw new Error("Mercado Pago no devolvió una preferencia válida");
    }

    logger.info(`Preferencia creada: ${result.id}, init_point: ${result.init_point}`);

    return {
      preferenceId: result.id,
      initPoint: result.init_point,
      sandboxInitPoint: result.sandbox_init_point || result.init_point,
    };
  } catch (error) {
    logger.error("Error al crear preferencia de pago", error);
    throw new Error("No se pudo generar el link de pago. Intenta nuevamente.");
  }
};

/**
 * Obtiene el estado de un pago por su ID
 */
export const getPaymentStatus = async (
  tenant: Tenant,
  paymentId: string,
): Promise<{ status: string; statusDetail: string; externalReference: string }> => {
  try {
    const accessToken = await getValidAccessToken(tenant);

    const client = new MercadoPagoConfig({
      accessToken,
    });

    const payment = new Payment(client);
    const result = await payment.get({ id: paymentId });

    return {
      status: result.status || "unknown",
      statusDetail: result.status_detail || "",
      externalReference: result.external_reference || "",
    };
  } catch (error) {
    logger.error(`Error al obtener estado del pago ${paymentId}`, error);
    throw new Error("No se pudo verificar el estado del pago");
  }
};

/**
 * Procesa la notificación de webhook de Mercado Pago
 */
export const processPaymentWebhook = async (
  tenant: Tenant,
  webhookData: { type: string; data: { id: string } },
): Promise<{ orderId: string; status: string } | null> => {
  try {
    // Solo procesar notificaciones de pago
    if (webhookData.type !== "payment") {
      logger.debug(`Webhook ignorado, tipo: ${webhookData.type}`);
      return null;
    }

    const paymentId = webhookData.data.id;
    logger.info(`Procesando webhook de pago ${paymentId} para tenant ${tenant.id}`);

    const paymentStatus = await getPaymentStatus(tenant, paymentId);

    logger.info(`Pago ${paymentId}: status=${paymentStatus.status}, orderId=${paymentStatus.externalReference}`);

    return {
      orderId: paymentStatus.externalReference,
      status: paymentStatus.status,
    };
  } catch (error) {
    logger.error("Error al procesar webhook de Mercado Pago", error);
    return null;
  }
};

/**
 * Desconecta Mercado Pago del tenant (revoca tokens)
 */
export const disconnectMercadoPago = async (tenantId: string): Promise<void> => {
  await updateTenant(tenantId, {
    mercadoPagoAccessToken: undefined,
    mercadoPagoRefreshToken: undefined,
    mercadoPagoPublicKey: undefined,
    mercadoPagoUserId: undefined,
    mercadoPagoTokenExpiry: undefined,
  });

  logger.info(`Mercado Pago desconectado para tenant ${tenantId}`);
};
