import { Request, Response } from "express";
import crypto from "crypto";
import env from "../config/env";
import { logger } from "../utils/logger";
import { getTenantByPhoneNumberId } from "../services/tenantService";
import {
  processIncomingMessage as processBurgerBotMessage,
  processCatalogOrder as processBurgerBotCatalogOrder,
} from "../bot";
import type { Tenant } from "../models/tenant";

/**
 * Controlador para los webhooks de WhatsApp Business API (Meta)
 * Documentación: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 */

/**
 * Estructura del webhook de Meta para mensajes entrantes
 */
interface MetaInteractiveReply {
  type: "button_reply" | "list_reply";
  button_reply?: {
    id: string;
    title: string;
  };
  list_reply?: {
    id: string;
    title: string;
    description?: string;
  };
}

/**
 * Estructura para productos del catálogo seleccionados por el usuario
 */
interface MetaOrderProductItem {
  product_retailer_id: string; // ID del producto en nuestro sistema
  quantity: number;
  item_price: string; // Precio como string (ej: "1500.00")
  currency: string; // Moneda (ej: "ARS")
}

interface MetaOrder {
  catalog_id: string;
  product_items: MetaOrderProductItem[];
  text?: string; // Mensaje opcional del usuario
}

interface MetaMessage {
  from: string;
  id: string;
  timestamp: string;
  text?: {
    body: string;
  };
  interactive?: MetaInteractiveReply;
  order?: MetaOrder; // Productos seleccionados del catálogo
  type:
    | "text"
    | "image"
    | "audio"
    | "video"
    | "document"
    | "location"
    | "interactive"
    | "order";
}

interface MetaContact {
  profile: {
    name: string;
  };
  wa_id: string;
}

interface MetaStatus {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
}

interface MetaWebhookEntry {
  id: string;
  changes: Array<{
    value: {
      messaging_product: "whatsapp";
      metadata: {
        display_phone_number: string;
        phone_number_id: string;
      };
      contacts?: MetaContact[];
      messages?: MetaMessage[];
      statuses?: MetaStatus[];
    };
    field: string;
  }>;
}

interface MetaWebhookPayload {
  object: "whatsapp_business_account";
  entry: MetaWebhookEntry[];
}

/**
 * Verificación del webhook (GET)
 * Meta envía una petición GET con estos parámetros para validar el webhook
 */
export const verifyWebhook = (req: Request, res: Response): void => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  logger.info("Recibida solicitud de verificación de webhook de Meta");

  // Verificar que los parámetros existan
  if (!mode || !token) {
    logger.warn("Verificación de webhook fallida: parámetros faltantes");
    res.sendStatus(403);
    return;
  }

  // Verificar que el mode sea "subscribe" y el token coincida
  if (mode === "subscribe" && token === env.metaVerifyToken) {
    logger.info("Webhook verificado exitosamente");
    res.status(200).send(challenge);
    return;
  }

  logger.warn(
    `Verificación de webhook fallida: token incorrecto (esperado: ${env.metaVerifyToken}, recibido: ${token})`,
  );
  res.sendStatus(403);
};

/**
 * Recepción de mensajes del webhook (POST)
 * Meta envía los mensajes entrantes a este endpoint
 */
export const receiveWebhook = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    logger.info("========================================");
    logger.info("🔔 WEBHOOK RECIBIDO DE META");
    logger.info(`Body completo: ${JSON.stringify(req.body, null, 2)}`);
    logger.info("========================================");

    const payload = req.body as MetaWebhookPayload;

    // Validar que sea un webhook de WhatsApp Business
    if (payload.object !== "whatsapp_business_account") {
      logger.warn(`Webhook recibido con object incorrecto: ${payload.object}`);
      res.sendStatus(404);
      return;
    }

    // IMPORTANTE: Responder 200 OK inmediatamente a Meta
    // Meta requiere una respuesta en menos de 20 segundos
    res.sendStatus(200);

    // Procesar los mensajes de forma asíncrona
    processWebhookPayload(payload).catch((error) => {
      logger.error("Error procesando webhook de forma asíncrona", error);
    });
  } catch (error) {
    logger.error("Error en receiveWebhook", error);
    logger.error(`Stack trace: ${error}`);
    // Aún así responder 200 para evitar reintentos
    res.sendStatus(200);
  }
};

/**
 * Procesa el payload del webhook de forma asíncrona
 */
async function processWebhookPayload(
  payload: MetaWebhookPayload,
): Promise<void> {
  logger.info(`Procesando webhook con ${payload.entry.length} entrada(s)`);

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      // Solo procesar cambios de "messages"
      if (change.field !== "messages") {
        logger.debug(`Campo ignorado: ${change.field}`);
        continue;
      }

      const { metadata, messages, statuses, contacts } = change.value;
      const phoneNumberId = metadata.phone_number_id;

      // Procesar actualizaciones de estado (opcional)
      if (statuses && statuses.length > 0) {
        logger.debug(
          `Recibido ${statuses.length} actualización(es) de estado para phoneNumberId: ${phoneNumberId}`,
        );
        // TODO: Implementar lógica de actualización de estado si es necesario
        continue;
      }

      // Procesar mensajes entrantes
      if (!messages || messages.length === 0) {
        continue;
      }

      // Buscar el tenant correspondiente al phone_number_id
      const tenant = await getTenantByPhoneNumberId(phoneNumberId);

      if (!tenant) {
        logger.warn(
          `No se encontró tenant para phoneNumberId: ${phoneNumberId}. Mensaje ignorado.`,
        );
        continue;
      }

      logger.info(
        `Mensajes entrantes para tenant: ${tenant.name} (${tenant.id})`,
      );

      // Procesar cada mensaje
      for (const message of messages) {
        await processIncomingMessage(message, contacts, tenant);
      }
    }
  }
}

/**
 * Procesa un mensaje entrante individual
 * Conecta el webhook con el bot refactorizado
 */
async function processIncomingMessage(
  message: MetaMessage,
  contacts: MetaContact[] | undefined,
  tenant: Tenant,
): Promise<void> {
  try {
    const {
      from,
      id: messageId,
      type,
      text,
      interactive,
      order,
      timestamp,
    } = message;

    logger.info(
      `Procesando mensaje ${messageId} de ${from} (tipo: ${type}, tenant: ${tenant.name})`,
    );

    // Buscar el nombre del contacto si está disponible
    const contactName = contacts?.find((c) => c.wa_id === from)?.profile?.name;

    // Procesar mensajes de tipo "order" (selección de catálogo)
    if (type === "order" && order) {
      logger.info(
        `Orden de catálogo recibida de ${from}: ${order.product_items.length} producto(s)`,
      );

      await processBurgerBotCatalogOrder(
        {
          from,
          messageId,
          timestamp,
          contactName,
          catalogId: order.catalog_id,
          productItems: order.product_items.map((item) => ({
            productRetailerId: item.product_retailer_id,
            quantity: item.quantity,
            itemPrice: item.item_price,
            currency: item.currency,
          })),
          text: order.text,
        },
        tenant,
      );

      logger.info(
        `Orden de catálogo procesada exitosamente (de: ${from}, id: ${messageId})`,
      );
      return;
    }

    let messageText: string | undefined;

    // Procesar según el tipo de mensaje
    if (type === "text" && text) {
      messageText = text.body;
    } else if (type === "interactive" && interactive) {
      // Extraer texto de respuestas interactivas (botones o listas)
      if (interactive.type === "button_reply" && interactive.button_reply) {
        // Para botones, usar el ID como texto (más confiable que el título)
        messageText = interactive.button_reply.id;
        logger.info(
          `Botón presionado: "${interactive.button_reply.title}" (id: ${interactive.button_reply.id})`,
        );
      } else if (interactive.type === "list_reply" && interactive.list_reply) {
        // Para listas, usar el ID como texto
        messageText = interactive.list_reply.id;
        logger.info(
          `Item de lista seleccionado: "${interactive.list_reply.title}" (id: ${interactive.list_reply.id})`,
        );
      }
    }

    if (!messageText) {
      logger.warn(
        `Tipo de mensaje no soportado o sin contenido: ${type}. Mensaje ${messageId} ignorado.`,
      );
      return;
    }

    // Conectar con el bot refactorizado
    await processBurgerBotMessage(
      {
        from,
        messageId,
        text: messageText,
        timestamp,
        contactName,
      },
      tenant,
    );

    logger.info(
      `Mensaje procesado exitosamente: "${messageText}" (de: ${from}, id: ${messageId})`,
    );
  } catch (error) {
    logger.error(`Error procesando mensaje individual ${message.id}`);
    // No lanzar error para no afectar el procesamiento de otros mensajes
  }
}

/**
 * Validación de firma del webhook usando APP_SECRET
 * Meta firma cada webhook con tu App Secret usando HMAC SHA256
 * Documentación: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
 */
export const validateWebhookSignature = (
  req: Request,
  res: Response,
  next: () => void,
): void => {
  // Si no hay APP_SECRET configurado, saltar validación (solo en desarrollo)
  if (!env.metaAppSecret) {
    if (env.nodeEnv === "production") {
      logger.error(
        "META_APP_SECRET no configurado en producción - rechazando webhook",
      );
      res.sendStatus(500);
      return;
    }
    logger.warn(
      "META_APP_SECRET no configurado - saltando validación de firma (solo desarrollo)",
    );
    next();
    return;
  }

  const signature = req.headers["x-hub-signature-256"] as string;

  if (!signature) {
    logger.warn("Webhook recibido sin firma (x-hub-signature-256)");
    res.sendStatus(403);
    return;
  }

  // Usar raw body si está disponible, de lo contrario usar JSON.stringify (fallback)
  // El raw body es necesario porque la firma se calcula sobre el cuerpo exacto enviado por Meta
  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));
  const hash = crypto
    .createHmac("sha256", env.metaAppSecret)
    .update(rawBody)
    .digest("hex");
  const expectedSignature = `sha256=${hash}`;

  // Usar comparación de tiempo constante para prevenir timing attacks
  try {
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      logger.warn(
        "Firma de webhook inválida - posible intento de suplantación",
      );
      res.sendStatus(403);
      return;
    }
  } catch (error) {
    logger.error("Error validando firma de webhook", error);
    res.sendStatus(403);
    return;
  }

  logger.debug("Firma de webhook validada exitosamente");
  next();
};
