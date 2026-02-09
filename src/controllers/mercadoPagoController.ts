import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";
import { HttpError } from "../utils/httpError";
import env from "../config/env";
import { getTenantById } from "../services/tenantService";
import {
  getOAuthAuthorizationUrl,
  exchangeCodeForTokens,
  disconnectMercadoPago,
  getPaymentStatus,
  hasMercadoPagoConfigured,
} from "../services/mercadoPagoService";
import { updateOrder, getOrderByIdGlobal } from "../services/orderService";
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
    const tenantId = (req.headers["x-tenant-id"] as string) || (req.query.tenantId as string);

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
    const tenantId = req.headers["x-tenant-id"] as string;

    if (!tenantId) {
      throw new HttpError(400, "Se requiere tenantId");
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
    const tenantId = req.headers["x-tenant-id"] as string;

    if (!tenantId) {
      throw new HttpError(400, "Se requiere tenantId");
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

    // Solo procesar notificaciones de pago
    if (type !== "payment" || !data?.id) {
      logger.debug(`Webhook ignorado: type=${type}`);
      return;
    }

    const paymentId = String(data.id);
    logger.info(`Procesando pago ${paymentId}`);

    // Buscar la orden usando el paymentId
    // Primero necesitamos obtener el external_reference del pago
    // Para esto, necesitamos iterar por los tenants con MP configurado

    // Alternativa: buscar en todos los tenants con MP
    const { listTenants } = await import("../services/tenantService");
    const tenants = await listTenants();

    for (const tenant of tenants) {
      if (!hasMercadoPagoConfigured(tenant)) {
        continue;
      }

      try {
        // Intentar obtener el estado del pago con este tenant
        const paymentStatus = await getPaymentStatus(tenant, paymentId);

        if (!paymentStatus.externalReference) {
          continue;
        }

        const orderId = paymentStatus.externalReference;
        logger.info(`Pago ${paymentId} corresponde a orden ${orderId}, status: ${paymentStatus.status}`);

        // Buscar la orden
        const order = await getOrderByIdGlobal(orderId);

        if (!order) {
          logger.warn(`Orden ${orderId} no encontrada`);
          continue;
        }

        // Verificar que la orden pertenece a este tenant
        if (order.tenantId !== tenant.id) {
          continue;
        }

        // Actualizar según el estado del pago
        if (paymentStatus.status === "approved") {
          await updateOrder(tenant.id, orderId, {
            paymentStatus: "pagado",
            status: "pendiente", // Ahora sí está confirmado para preparar
          });

          // Notificar al cliente por WhatsApp
          if (order.whatsappChatId) {
            const estimatedTime = order.orderType === "delivery" ? "40-50 minutos" : "20-30 minutos";
            await sendMessage(
              order.whatsappChatId,
              `✅ *¡Pago recibido!*\n\n` +
              `Tu pedido *#${orderId.slice(-6).toUpperCase()}* ha sido confirmado y está siendo preparado.\n\n` +
              `⏱️ Tiempo estimado: ${estimatedTime}\n\n` +
              `¡Gracias por tu compra! 🍔`,
              tenant,
            );
          }

          logger.info(`Orden ${orderId} confirmada - pago aprobado`);
        } else if (paymentStatus.status === "rejected" || paymentStatus.status === "cancelled") {
          await updateOrder(tenant.id, orderId, {
            paymentStatus: "rechazado",
          });

          // Notificar al cliente
          if (order.whatsappChatId) {
            await sendMessage(
              order.whatsappChatId,
              `❌ *Pago no procesado*\n\n` +
              `El pago para tu pedido *#${orderId.slice(-6).toUpperCase()}* no pudo ser procesado.\n\n` +
              `Por favor, intentá nuevamente o contactate con el local.`,
              tenant,
            );
          }

          logger.info(`Orden ${orderId} - pago rechazado`);
        } else {
          // pending, in_process - no hacer nada aún
          logger.info(`Pago ${paymentId} en estado ${paymentStatus.status}, esperando...`);
        }

        return; // Pago procesado exitosamente
      } catch (error) {
        // Este tenant no puede acceder al pago, continuar con el siguiente
        logger.debug(`Tenant ${tenant.id} no pudo acceder al pago ${paymentId}`);
        continue;
      }
    }

    logger.warn(`No se pudo procesar el pago ${paymentId} - no encontrado en ningún tenant`);
  } catch (error) {
    logger.error("Error procesando webhook de Mercado Pago", error);
    // No fallar, ya respondimos 200
  }
};
