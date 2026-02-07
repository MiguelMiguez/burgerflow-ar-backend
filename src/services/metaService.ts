import axios, { AxiosError } from "axios";
import env from "../config/env";
import { logger } from "../utils/logger";
import type { Tenant } from "../models/tenant";

/**
 * Servicio para interactuar con la API de WhatsApp Business (Meta Graph API)
 * Documentación: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

interface MetaMessagePayload {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "text";
  text: {
    preview_url?: boolean;
    body: string;
  };
}

interface MetaErrorResponse {
  error?: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

interface MetaMessageResponse {
  messaging_product: string;
  contacts: Array<{
    input: string;
    wa_id: string;
  }>;
  messages: Array<{
    id: string;
  }>;
}

/**
 * Valida que el tenant tenga las credenciales necesarias para usar la API de Meta
 */
const validateTenantCredentials = (tenant: Tenant): void => {
  if (!tenant.metaPhoneNumberId) {
    throw new Error(
      `El tenant ${tenant.id} (${tenant.name}) no tiene configurado metaPhoneNumberId`,
    );
  }

  if (!tenant.metaAccessToken) {
    throw new Error(
      `El tenant ${tenant.id} (${tenant.name}) no tiene configurado metaAccessToken`,
    );
  }
};

/**
 * Construye la URL base para la Graph API de Meta
 */
const getGraphApiUrl = (phoneNumberId: string): string => {
  return `https://graph.facebook.com/${env.metaApiVersion}/${phoneNumberId}/messages`;
};

/**
 * Maneja errores de axios y los convierte en mensajes legibles
 * @throws Error siempre (nunca retorna normalmente)
 */
const handleMetaApiError = (error: unknown, context: string): never => {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<MetaErrorResponse>;

    // Error de respuesta del servidor (4xx, 5xx)
    if (axiosError.response) {
      const status = axiosError.response.status;
      const metaError = axiosError.response.data?.error;

      if (metaError) {
        const errorMsg = `Meta API Error (${status}): ${metaError.message} [${metaError.type}]`;
        logger.error(errorMsg, {
          code: metaError.code,
          subcode: metaError.error_subcode,
          traceId: metaError.fbtrace_id,
        });
        throw new Error(errorMsg);
      }

      logger.error(
        `Meta API HTTP Error (${status}): ${axiosError.message}`,
        axiosError,
      );
      throw new Error(
        `Error de comunicación con WhatsApp API (${status}): ${axiosError.message}`,
      );
    }

    // Error de request (red, timeout, etc.)
    if (axiosError.request) {
      logger.error(`Meta API Request Error: ${axiosError.message}`, axiosError);
      throw new Error(
        `No se pudo conectar con WhatsApp API: ${axiosError.message}`,
      );
    }

    // Error en la configuración del request
    logger.error(`Meta API Config Error: ${axiosError.message}`, axiosError);
    throw new Error(`Error de configuración: ${axiosError.message}`);
  }

  // Error genérico
  logger.error(`${context}: Error desconocido`);
  throw new Error(`Error inesperado en ${context}`);
};

/**
 * Envía un mensaje de texto a través de WhatsApp Business API
 *
 * @param to - Número de teléfono del destinatario (con código de país, sin +)
 * @param text - Texto del mensaje a enviar
 * @param tenant - Objeto Tenant con las credenciales de Meta
 * @returns ID del mensaje enviado
 *
 * @example
 * await sendMessage("5491112345678", "¡Hola! Tu reserva fue confirmada.", tenant);
 */
export const sendMessage = async (
  to: string,
  text: string,
  tenant: Tenant,
): Promise<string> => {
  try {
    // Validar credenciales del tenant
    validateTenantCredentials(tenant);

    // Sanitizar número de teléfono (remover espacios, guiones, paréntesis)
    const sanitizedPhone = to.replace(/[\s\-\(\)\+]/g, "");

    // Preparar payload
    const payload: MetaMessagePayload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: sanitizedPhone,
      type: "text",
      text: {
        preview_url: false,
        body: text,
      },
    };

    // Construir URL de la API
    const url = getGraphApiUrl(tenant.metaPhoneNumberId!);

    logger.info(
      `Enviando mensaje a ${sanitizedPhone} (tenant: ${tenant.name})`,
    );

    // Realizar request a Meta Graph API
    const response = await axios.post<MetaMessageResponse>(url, payload, {
      headers: {
        Authorization: `Bearer ${tenant.metaAccessToken}`,
        "Content-Type": "application/json",
      },
      timeout: 15000, // 15 segundos de timeout
    });

    const messageId = response.data.messages[0]?.id;

    if (!messageId) {
      throw new Error("Meta API no devolvió un ID de mensaje válido");
    }

    logger.info(
      `Mensaje enviado exitosamente. ID: ${messageId}, Destinatario: ${sanitizedPhone}`,
    );

    return messageId;
  } catch (error) {
    return handleMetaApiError(error, "sendMessage");
  }
};

/**
 * Envía un mensaje de texto con vista previa de URL habilitada
 *
 * @param to - Número de teléfono del destinatario
 * @param text - Texto del mensaje (debe incluir una URL)
 * @param tenant - Objeto Tenant con las credenciales de Meta
 * @returns ID del mensaje enviado
 */
export const sendMessageWithPreview = async (
  to: string,
  text: string,
  tenant: Tenant,
): Promise<string> => {
  try {
    validateTenantCredentials(tenant);

    const sanitizedPhone = to.replace(/[\s\-\(\)\+]/g, "");

    const payload: MetaMessagePayload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: sanitizedPhone,
      type: "text",
      text: {
        preview_url: true, // Habilitar vista previa de links
        body: text,
      },
    };

    const url = getGraphApiUrl(tenant.metaPhoneNumberId!);

    const response = await axios.post<MetaMessageResponse>(url, payload, {
      headers: {
        Authorization: `Bearer ${tenant.metaAccessToken}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    });

    const messageId = response.data.messages[0]?.id;

    if (!messageId) {
      throw new Error("Meta API no devolvió un ID de mensaje válido");
    }

    logger.info(
      `Mensaje con preview enviado. ID: ${messageId}, Destinatario: ${sanitizedPhone}`,
    );

    return messageId;
  } catch (error) {
    return handleMetaApiError(error, "sendMessageWithPreview");
  }
};

/**
 * Marca un mensaje como leído
 *
 * @param messageId - ID del mensaje a marcar como leído
 * @param tenant - Objeto Tenant con las credenciales de Meta
 */
export const markMessageAsRead = async (
  messageId: string,
  tenant: Tenant,
): Promise<void> => {
  try {
    validateTenantCredentials(tenant);

    const url = getGraphApiUrl(tenant.metaPhoneNumberId!);

    await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      },
      {
        headers: {
          Authorization: `Bearer ${tenant.metaAccessToken}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      },
    );

    logger.debug(`Mensaje ${messageId} marcado como leído`);
  } catch (error) {
    // No fallar si marcar como leído falla
    logger.warn(`No se pudo marcar mensaje ${messageId} como leído`);
  }
};

/**
 * Interfaz para botones interactivos
 */
interface InteractiveButton {
  id: string;
  title: string;
}

/**
 * Envía un mensaje con botones interactivos (máximo 3 botones)
 * Los usuarios pueden tocar los botones para responder
 *
 * @param to - Número de teléfono del destinatario
 * @param body - Texto del mensaje principal
 * @param buttons - Array de botones (máximo 3)
 * @param tenant - Objeto Tenant con las credenciales de Meta
 * @param header - Texto opcional del encabezado
 * @param footer - Texto opcional del pie
 * @returns ID del mensaje enviado
 */
export const sendInteractiveButtons = async (
  to: string,
  body: string,
  buttons: InteractiveButton[],
  tenant: Tenant,
  header?: string,
  footer?: string,
): Promise<string> => {
  try {
    validateTenantCredentials(tenant);

    if (buttons.length === 0 || buttons.length > 3) {
      throw new Error("Los mensajes interactivos requieren entre 1 y 3 botones");
    }

    const sanitizedPhone = to.replace(/[\s\-\(\)\+]/g, "");

    const payload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: sanitizedPhone,
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text: body,
        },
        action: {
          buttons: buttons.map((btn) => ({
            type: "reply",
            reply: {
              id: btn.id,
              title: btn.title.substring(0, 20), // WhatsApp limita a 20 caracteres
            },
          })),
        },
      },
    };

    // Agregar header si existe
    if (header) {
      (payload.interactive as Record<string, unknown>).header = {
        type: "text",
        text: header.substring(0, 60), // WhatsApp limita a 60 caracteres
      };
    }

    // Agregar footer si existe
    if (footer) {
      (payload.interactive as Record<string, unknown>).footer = {
        text: footer.substring(0, 60), // WhatsApp limita a 60 caracteres
      };
    }

    const url = getGraphApiUrl(tenant.metaPhoneNumberId!);

    logger.info(
      `Enviando mensaje interactivo (botones) a ${sanitizedPhone} (tenant: ${tenant.name})`,
    );

    const response = await axios.post<MetaMessageResponse>(url, payload, {
      headers: {
        Authorization: `Bearer ${tenant.metaAccessToken}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    });

    const messageId = response.data.messages[0]?.id;

    if (!messageId) {
      throw new Error("Meta API no devolvió un ID de mensaje válido");
    }

    logger.info(
      `Mensaje interactivo enviado. ID: ${messageId}, Destinatario: ${sanitizedPhone}`,
    );

    return messageId;
  } catch (error) {
    return handleMetaApiError(error, "sendInteractiveButtons");
  }
};

/**
 * Interfaz para items de lista
 */
interface ListItem {
  id: string;
  title: string;
  description?: string;
}

/**
 * Interfaz para secciones de lista
 */
interface ListSection {
  title: string;
  rows: ListItem[];
}

/**
 * Envía un mensaje con lista interactiva (para menús largos)
 * Los usuarios pueden seleccionar una opción de la lista
 *
 * @param to - Número de teléfono del destinatario
 * @param body - Texto del mensaje principal
 * @param buttonText - Texto del botón que abre la lista
 * @param sections - Secciones con los items de la lista
 * @param tenant - Objeto Tenant con las credenciales de Meta
 * @param header - Texto opcional del encabezado
 * @param footer - Texto opcional del pie
 * @returns ID del mensaje enviado
 */
export const sendInteractiveList = async (
  to: string,
  body: string,
  buttonText: string,
  sections: ListSection[],
  tenant: Tenant,
  header?: string,
  footer?: string,
): Promise<string> => {
  try {
    validateTenantCredentials(tenant);

    const sanitizedPhone = to.replace(/[\s\-\(\)\+]/g, "");

    const payload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: sanitizedPhone,
      type: "interactive",
      interactive: {
        type: "list",
        body: {
          text: body,
        },
        action: {
          button: buttonText.substring(0, 20), // WhatsApp limita a 20 caracteres
          sections: sections.map((section) => ({
            title: section.title.substring(0, 24), // WhatsApp limita a 24 caracteres
            rows: section.rows.map((row) => ({
              id: row.id,
              title: row.title.substring(0, 24), // WhatsApp limita a 24 caracteres
              description: row.description?.substring(0, 72), // WhatsApp limita a 72 caracteres
            })),
          })),
        },
      },
    };

    // Agregar header si existe
    if (header) {
      (payload.interactive as Record<string, unknown>).header = {
        type: "text",
        text: header.substring(0, 60),
      };
    }

    // Agregar footer si existe
    if (footer) {
      (payload.interactive as Record<string, unknown>).footer = {
        text: footer.substring(0, 60),
      };
    }

    const url = getGraphApiUrl(tenant.metaPhoneNumberId!);

    logger.info(
      `Enviando mensaje interactivo (lista) a ${sanitizedPhone} (tenant: ${tenant.name})`,
    );

    const response = await axios.post<MetaMessageResponse>(url, payload, {
      headers: {
        Authorization: `Bearer ${tenant.metaAccessToken}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    });

    const messageId = response.data.messages[0]?.id;

    if (!messageId) {
      throw new Error("Meta API no devolvió un ID de mensaje válido");
    }

    logger.info(
      `Mensaje de lista enviado. ID: ${messageId}, Destinatario: ${sanitizedPhone}`,
    );

    return messageId;
  } catch (error) {
    return handleMetaApiError(error, "sendInteractiveList");
  }
};
