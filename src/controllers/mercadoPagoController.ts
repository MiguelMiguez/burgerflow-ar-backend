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
import {
  updateOrder,
  getOrderById,
} from "../services/orderService";
import { sendMessage } from "../services/metaService";
import { sendNewOrderNotification } from "../services/notificationService";

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
    const tenantId =
      (req.headers["x-tenant-id"] as string) || (req.query.tenantId as string);

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
      logger.error(
        `Error en OAuth de Mercado Pago: ${error} - ${error_description}`,
      );
      // Redirigir al frontend con error
      res.redirect(
        `${env.frontendUrl}/configuracion?mp_error=${encodeURIComponent(String(error_description || error))}`,
      );
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
    res.redirect(
      `${env.frontendUrl}/configuracion?mp_error=${encodeURIComponent("Error al conectar con Mercado Pago")}`,
    );
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

// Set para rastrear pagos ya procesados (en memoria, para evitar duplicados en ráfagas)
// En producción con múltiples instancias, usar Redis u otra solución distribuida
const processedPayments = new Set<string>();
const PROCESSED_PAYMENT_TTL = 5 * 60 * 1000; // 5 minutos

/**
 * Webhook de Mercado Pago para notificaciones de pago
 * POST /webhooks/mercadopago
 *
 * Mercado Pago puede enviar notificaciones en dos formatos:
 * 1. Body: { type: "payment", data: { id: "xxx" } }
 * 2. Query: ?id=xxx&topic=payment o ?id=xxx&topic=merchant_order
 */
export const handlePaymentWebhook = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    logger.info("Webhook de Mercado Pago recibido", {
      body: req.body,
      query: req.query,
    });

    // Responder 200 inmediatamente para evitar reintentos
    res.sendStatus(200);

    // Extraer datos del webhook (puede venir en body o query)
    let type = req.body?.type || req.query?.topic;
    let paymentId = req.body?.data?.id || req.query?.id;

    // Si es merchant_order, necesitamos obtener los pagos de esa orden
    if (type === "merchant_order" && paymentId) {
      logger.info(`Webhook de merchant_order: ${paymentId}, procesando...`);
      // Por ahora ignoramos merchant_order ya que el pago debería llegar como notificación separada
      return;
    }

    // Solo procesar notificaciones de pago
    if (type !== "payment" || !paymentId) {
      logger.debug(`Webhook ignorado: type=${type}, paymentId=${paymentId}`);
      return;
    }

    paymentId = String(paymentId);
    
    // Verificar si este pago ya fue procesado recientemente (deduplicación)
    if (processedPayments.has(paymentId)) {
      logger.info(`Pago ${paymentId} ya fue procesado recientemente, ignorando webhook duplicado`);
      return;
    }
    
    // Marcar como procesado
    processedPayments.add(paymentId);
    // Limpiar después del TTL
    setTimeout(() => {
      processedPayments.delete(paymentId);
    }, PROCESSED_PAYMENT_TTL);
    
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
        logger.info(
          `Pago ${paymentId} corresponde a orden ${orderId}, status: ${paymentStatus.status}`,
        );

        // Buscar la orden usando el tenant actual (ya sabemos que el pago es de este tenant)
        let order;
        try {
          order = await getOrderById(tenant.id, orderId);
        } catch {
          logger.warn(`Orden ${orderId} no encontrada en tenant ${tenant.id}`);
          continue;
        }

        if (!order) {
          logger.warn(`Orden ${orderId} no encontrada`);
          continue;
        }

        // Verificar si el pedido ya fue procesado (evitar notificaciones duplicadas)
        if (order.paymentStatus === "pagado") {
          logger.info(`Orden ${orderId} ya tiene pago confirmado, ignorando webhook duplicado`);
          return;
        }

        // Actualizar según el estado del pago
        if (paymentStatus.status === "approved") {
          // Verificar nuevamente que no esté ya pagado (doble check)
          if (order.status !== "pendiente_pago") {
            logger.info(`Orden ${orderId} ya no está pendiente de pago (status: ${order.status}), ignorando`);
            return;
          }
          
          await updateOrder(tenant.id, orderId, {
            paymentStatus: "pagado",
            status: "pendiente", // Ahora sí está confirmado para preparar
          });

          // Obtener la orden actualizada y notificar al admin
          try {
            const updatedOrder = await getOrderById(tenant.id, orderId);
            await sendNewOrderNotification(updatedOrder);
          } catch (notifError) {
            logger.warn(
              `Error al enviar notificación de pago confirmado: ${notifError}`,
            );
          }

          // Notificar al cliente por WhatsApp
          if (order.whatsappChatId) {
            const estimatedTime =
              order.orderType === "delivery"
                ? "40-50 minutos"
                : "20-30 minutos";
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
        } else if (
          paymentStatus.status === "rejected" ||
          paymentStatus.status === "cancelled"
        ) {
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
          logger.info(
            `Pago ${paymentId} en estado ${paymentStatus.status}, esperando...`,
          );
        }

        return; // Pago procesado exitosamente
      } catch (error) {
        // Este tenant no puede acceder al pago, continuar con el siguiente
        logger.debug(
          `Tenant ${tenant.id} no pudo acceder al pago ${paymentId}`,
        );
        continue;
      }
    }

    logger.warn(
      `No se pudo procesar el pago ${paymentId} - no encontrado en ningún tenant`,
    );
  } catch (error) {
    logger.error("Error procesando webhook de Mercado Pago", error);
    // No fallar, ya respondimos 200
  }
};

/**
 * Handler para las URLs de retorno de Mercado Pago (success, failure, pending)
 * Redirige a WhatsApp del negocio para continuar la conversación
 */
export const handlePaymentReturn = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const {
      collection_status,
      status,
      external_reference,
      payment_id,
    } = req.query;

    // Determinar el estado del pago
    const paymentStatus = status || collection_status || "unknown";
    const orderId = String(external_reference || "");

    logger.info(
      `Retorno de pago: status=${paymentStatus}, orderId=${orderId}, paymentId=${payment_id}`,
    );

    // Buscar la orden para obtener el número de WhatsApp del negocio
    if (orderId) {
      const { listTenants } = await import("../services/tenantService");
      const tenants = await listTenants();

      for (const tenant of tenants) {
        try {
          const order = await getOrderById(tenant.id, orderId);
          if (order) {
            // Obtener el número de WhatsApp del negocio
            const businessPhone = tenant.whatsappNumber || tenant.phone;
            
            if (businessPhone) {
              // Limpiar el número de teléfono (solo dígitos)
              const cleanPhone = businessPhone.replace(/\D/g, "");
              
              // Construir URL de WhatsApp
              const whatsappUrl = `https://wa.me/${cleanPhone}`;
              
              logger.info(`Redirigiendo a WhatsApp del negocio: ${whatsappUrl}`);
              res.redirect(whatsappUrl);
              return;
            }
            break;
          }
        } catch {
          continue;
        }
      }
    }

    // Fallback: si no se encontró la orden o no hay número de WhatsApp, redirigir al frontend
    logger.warn("No se pudo determinar el número de WhatsApp, redirigiendo al frontend");
    const frontendUrl = env.frontendUrl || "https://burgerflow.netlify.app";
    res.redirect(`${frontendUrl}/pedido-completado?status=${paymentStatus}&order=${orderId}`);
  } catch (error) {
    logger.error("Error en retorno de pago", error);
    // Fallback al frontend con error
    const frontendUrl = env.frontendUrl || "https://burgerflow.netlify.app";
    res.redirect(`${frontendUrl}?payment_error=true`);
  }
};
