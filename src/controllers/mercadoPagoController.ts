import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";
import { HttpError } from "../utils/httpError";
import env from "../config/env";
import { getTenantById } from "../services/tenantService";
import {
  getOAuthAuthorizationUrl,
  exchangeCodeForTokens,
  disconnectMercadoPago,
  processPaymentWebhook,
  hasMercadoPagoConfigured,
} from "../services/mercadoPagoService";
import { updateOrder } from "../services/orderService";
import { sendMessage } from "../services/metaService";

/**
 * Controlador para la integración con Mercado Pago
 */

/**
 * Obtiene la URL de autorización OAuth para conectar Mercado Pago
 * GET /mercadopago/auth-url?tenantId=xxx
 */
export const handleGetAuthUrl = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = req.user?.tenantId || (req.query.tenantId as string);

    if (!tenantId) {
      throw new HttpError(400, "Se requiere tenantId");
    }

    // Verificar que el tenant existe
    await getTenantById(tenantId);

    const authUrl = getOAuthAuthorizationUrl(tenantId);

    res.json({ authUrl });
  } catch (error) {
    next(error);
  }
};

/**
 * Callback de OAuth de Mercado Pago
 * GET /mercadopago/callback?code=xxx&state=tenantId
 */
export const handleOAuthCallback = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { code, state: tenantId, error, error_description } = req.query;

    // Manejar errores de OAuth
    if (error) {
      logger.error(`Error en OAuth de Mercado Pago: ${error} - ${error_description}`);
      // Redirigir al frontend con error
      res.redirect(`${env.frontendUrl}/configuracion?mp_error=${encodeURIComponent(String(error_description || error))}`);
      return;
    }

    if (!code || !tenantId) {
      throw new HttpError(400, "Faltan parámetros code o state");
    }

    // Intercambiar código por tokens
    await exchangeCodeForTokens(String(code), String(tenantId));

    logger.info(`Mercado Pago conectado exitosamente para tenant ${tenantId}`);

    // Redirigir al frontend con éxito
    res.redirect(`${env.frontendUrl}/configuracion?mp_success=true`);
  } catch (error) {
    logger.error("Error en callback de Mercado Pago", error);
    res.redirect(`${env.frontendUrl}/configuracion?mp_error=${encodeURIComponent('Error al conectar con Mercado Pago')}`);
  }
};

/**
 * Desconecta Mercado Pago del tenant
 * DELETE /mercadopago/disconnect
 */
export const handleDisconnect = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      throw new HttpError(400, "Se requiere autenticación");
    }

    await disconnectMercadoPago(tenantId);

    res.json({ message: "Mercado Pago desconectado exitosamente" });
  } catch (error) {
    next(error);
  }
};

/**
 * Verifica el estado de conexión de Mercado Pago
 * GET /mercadopago/status
 */
export const handleGetStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      throw new HttpError(400, "Se requiere autenticación");
    }

    const tenant = await getTenantById(tenantId);
    const isConnected = hasMercadoPagoConfigured(tenant);

    res.json({
      connected: isConnected,
      userId: tenant.mercadoPagoUserId || null,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Webhook de Mercado Pago para notificaciones de pago
 * POST /webhooks/mercadopago
 */
export const handlePaymentWebhook = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    logger.info("Webhook de Mercado Pago recibido", { body: req.body, query: req.query });

    // Responder 200 inmediatamente para evitar reintentos
    res.sendStatus(200);

    const { type, data } = req.body;

    if (!type || !data?.id) {
      logger.warn("Webhook de Mercado Pago sin datos válidos");
      return;
    }

    // El webhook no incluye el tenantId directamente
    // Necesitamos obtenerlo del external_reference (orderId) cuando procesamos el pago
    // Por ahora, procesamos todos los tenants que tengan MP configurado

    // TODO: En producción, deberías almacenar el orderId con su tenantId
    // para poder identificar el tenant correcto

    logger.info(`Webhook procesado: type=${type}, paymentId=${data.id}`);
  } catch (error) {
    logger.error("Error procesando webhook de Mercado Pago", error);
    // No fallar, ya respondimos 200
  }
};

/**
 * Procesa la notificación de pago y actualiza la orden
 * Esta función es llamada internamente cuando se confirma un pago
 */
export const processPaymentNotification = async (
  tenantId: string,
  paymentId: string,
): Promise<void> => {
  try {
    const tenant = await getTenantById(tenantId);

    if (!hasMercadoPagoConfigured(tenant)) {
      logger.warn(`Tenant ${tenantId} no tiene Mercado Pago configurado`);
      return;
    }

    const result = await processPaymentWebhook(tenant, {
      type: "payment",
      data: { id: paymentId },
    });

    if (!result) {
      return;
    }

    const { orderId, status } = result;

    // Actualizar el estado de la orden según el estado del pago
    if (status === "approved") {
      await updateOrder(tenantId, orderId, {
        paymentStatus: "pagado",
        status: "pendiente", // Cambiar a pendiente para que se prepare
      });

      // TODO: Enviar mensaje de confirmación por WhatsApp
      // Necesitaríamos el número del cliente de la orden
      logger.info(`Orden ${orderId} marcada como pagada`);
    } else if (status === "rejected" || status === "cancelled") {
      await updateOrder(tenantId, orderId, {
        paymentStatus: "rechazado",
      });
      logger.info(`Pago rechazado para orden ${orderId}`);
    }
    // pending, in_process: mantener el estado actual
  } catch (error) {
    logger.error("Error procesando notificación de pago", error);
  }
};
