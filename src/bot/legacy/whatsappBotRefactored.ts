/**
 * Bot de WhatsApp refactorizado para Meta WhatsApp Business API
 * Este archivo reemplaza la lógica de whatsapp-web.js con la Cloud API de Meta
 */

import { logger } from "../utils/logger";
import { sendMessage } from "../services/metaService";
import type { Tenant } from "../models/tenant";
import {
  createBooking,
  isSlotAvailable,
  isWithinBusinessHours,
  listBookings,
  suggestAvailableSlots,
} from "../services/bookingService";
import { listServices } from "../services/serviceService";
import type { Booking } from "../models/booking";
import type { Service } from "../models/service";
import { isHttpError } from "../utils/httpError";

// ============================================================================
// CONSTANTES
// ============================================================================

const HELP_MESSAGE = [
  "¡Hola! Soy el asistente de turnos.",
  "",
  "Comandos disponibles:",
  "- menu: Ver esta ayuda.",
  "- servicios: Listar servicios activos.",
  "- turnos: Mostrar los próximos turnos.",
  "- Reservar turno: Iniciar una reserva guiada paso a paso.",
  "- Cancelar: Abandonar la reserva actual.",
].join("\n");

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^\d{2}:\d{2}$/;
const CANCEL_KEYWORD = "cancelar";
const CUSTOMER_FALLBACK_NAME = "Cliente WhatsApp";

// ============================================================================
// TIPOS
// ============================================================================

type ConversationStep = "idle" | "awaitingDate" | "awaitingTime";

interface ConversationState {
  step: ConversationStep;
  selectedService?: string;
  pendingDate?: string;
}

/**
 * Estructura del mensaje entrante desde el webhook
 */
export interface IncomingMessage {
  from: string; // Número de teléfono del remitente (ej: "5491112345678")
  messageId: string; // ID del mensaje de Meta
  text: string; // Contenido del mensaje
  timestamp: string; // Timestamp del mensaje
  name?: string; // Nombre del contacto (si está disponible)
}

// ============================================================================
// GESTIÓN DE CONVERSACIONES
// ============================================================================

/**
 * Almacén de estados de conversación por usuario
 * Key: número de teléfono (from)
 * Value: estado de la conversación
 */
const conversations = new Map<string, ConversationState>();

const getConversationState = (phoneNumber: string): ConversationState => {
  return conversations.get(phoneNumber) ?? { step: "idle" };
};

const setConversationState = (
  phoneNumber: string,
  state: ConversationState
): void => {
  conversations.set(phoneNumber, state);
};

const resetConversation = (phoneNumber: string): void => {
  conversations.delete(phoneNumber);
};

// ============================================================================
// VALIDACIONES
// ============================================================================

const isValidDateInput = (value: string): boolean => {
  if (!DATE_REGEX.test(value)) {
    return false;
  }

  const candidate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(candidate.getTime())) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  candidate.setHours(0, 0, 0, 0);

  return candidate.getTime() >= today.getTime();
};

const sanitizePhoneNumber = (phoneNumber: string): string => {
  // Los números ya vienen en formato internacional desde Meta
  return phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`;
};

// ============================================================================
// FORMATEO DE RESPUESTAS
// ============================================================================

const formatServices = (services: Service[]): string => {
  if (services.length === 0) {
    return "No hay servicios configurados en este momento.";
  }

  const items = services.map((service) => {
    const duration =
      service.durationMinutes !== undefined
        ? `${service.durationMinutes} min`
        : "Duración no informada";
    const price =
      service.price !== undefined
        ? `$${service.price.toFixed(2)}`
        : "Sin precio";
    const description = service.description ? `\n${service.description}` : "";
    return `• ${service.name} (${duration}) - ${price}${description}`;
  });

  return `Estos son los servicios disponibles:\n\n${items.join("\n\n")}`;
};

const formatBookings = (bookings: Booking[]): string => {
  if (bookings.length === 0) {
    return "No hay turnos registrados por ahora.";
  }

  const items = bookings.slice(0, 5).map((booking) => {
    return `• ${booking.date} ${booking.time} - ${booking.name} (${booking.phone})`;
  });

  return `Próximos turnos:\n\n${items.join("\n")}`;
};

// ============================================================================
// FLUJO DE RESERVA
// ============================================================================

const startReservationFlow = async (
  phoneNumber: string,
  tenant: Tenant
): Promise<void> => {
  try {
    const services = await listServices();

    if (services.length === 0) {
      await sendMessage(
        phoneNumber,
        "Todavía no hay servicios configurados. Agrega uno desde el panel de administración.",
        tenant
      );
      return;
    }

    const selectedService = services[0];

    setConversationState(phoneNumber, {
      step: "awaitingDate",
      selectedService: selectedService.name,
    });

    await sendMessage(
      phoneNumber,
      `Perfecto, reservemos un turno para ${selectedService.name}.`,
      tenant
    );
    await sendMessage(
      phoneNumber,
      "¿Qué día te viene bien? Escribe la fecha en formato YYYY-MM-DD (ejemplo 2025-10-18). Puedes escribir *cancelar* para salir.",
      tenant
    );
  } catch (error) {
    logger.error(
      "No se pudieron obtener los servicios para iniciar la reserva"
    );
    await sendMessage(
      phoneNumber,
      "No pude obtener la lista de servicios en este momento. Intenta más tarde.",
      tenant
    );
  }
};

const handleDateStep = async (
  phoneNumber: string,
  dateText: string,
  state: ConversationState,
  tenant: Tenant
): Promise<void> => {
  if (!isValidDateInput(dateText)) {
    await sendMessage(
      phoneNumber,
      "Necesito una fecha válida a partir de hoy en formato YYYY-MM-DD (ejemplo 2025-10-18).",
      tenant
    );
    return;
  }

  setConversationState(phoneNumber, {
    ...state,
    step: "awaitingTime",
    pendingDate: dateText,
  });

  await sendMessage(
    phoneNumber,
    "Genial. ¿A qué hora? Usa el formato HH:mm (ejemplo 15:30). Los turnos disponibles son de 09:00 a 19:00.",
    tenant
  );
};

const handleTimeStep = async (
  phoneNumber: string,
  timeText: string,
  state: ConversationState,
  tenant: Tenant,
  customerName: string
): Promise<void> => {
  if (!TIME_REGEX.test(timeText)) {
    await sendMessage(
      phoneNumber,
      "Por favor escribe la hora en formato HH:mm (ejemplo 15:30).",
      tenant
    );
    return;
  }

  if (!isWithinBusinessHours(timeText)) {
    await sendMessage(
      phoneNumber,
      "Ese horario está fuera de la franja disponible (09:00 a 19:00). Elige otro horario.",
      tenant
    );
    return;
  }

  const date = state.pendingDate;
  if (!date) {
    resetConversation(phoneNumber);
    await sendMessage(
      phoneNumber,
      "Perdí la fecha del turno. Escribe *reservar turno* para comenzar nuevamente.",
      tenant
    );
    return;
  }

  const serviceName = state.selectedService ?? "Turno";

  try {
    const slotAvailable = await isSlotAvailable(date, timeText, serviceName);

    if (!slotAvailable) {
      const suggestions = await suggestAvailableSlots(date, serviceName);
      const alternatives = suggestions.filter((slot) => slot !== timeText);

      let reply = "Ese horario ya no está disponible.";

      if (alternatives.length > 0) {
        reply += ` Horarios libres: ${alternatives.join(", ")}.`;
      } else {
        reply += " No quedan turnos libres para ese día.";
      }

      reply += " Elige otro horario en formato HH:mm.";
      await sendMessage(phoneNumber, reply, tenant);
      return;
    }

    const customerPhone = sanitizePhoneNumber(phoneNumber);

    const booking = await createBooking({
      name: customerName,
      service: serviceName,
      date,
      time: timeText,
      phone: customerPhone,
    });

    await sendMessage(
      phoneNumber,
      `¡Listo ${customerName}! Reservamos ${serviceName} para el ${booking.date} a las ${booking.time}.`,
      tenant
    );

    resetConversation(phoneNumber);
  } catch (error) {
    logger.error("No se pudo crear el turno durante la conversación");

    if (isHttpError(error)) {
      await sendMessage(
        phoneNumber,
        `No se pudo crear el turno: ${error.message}`,
        tenant
      );
    } else {
      await sendMessage(
        phoneNumber,
        "Tuvimos un problema al crear el turno. Intenta nuevamente más tarde.",
        tenant
      );
    }

    resetConversation(phoneNumber);
  }
};

const handleReserveCommand = async (
  phoneNumber: string,
  rawInput: string,
  tenant: Tenant
): Promise<void> => {
  const parts = rawInput
    .split("|")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (parts.length < 5) {
    await sendMessage(
      phoneNumber,
      "Formato inválido. Usa: reservar Nombre|Servicio|YYYY-MM-DD|HH:mm|Telefono",
      tenant
    );
    return;
  }

  const [name, service, dateString, timeString, phone] = parts;

  if (!isValidDateInput(dateString)) {
    await sendMessage(
      phoneNumber,
      `Fecha inválida: ${dateString}. Debe ser YYYY-MM-DD y a partir de hoy.`,
      tenant
    );
    return;
  }

  if (!TIME_REGEX.test(timeString)) {
    await sendMessage(
      phoneNumber,
      `Hora inválida: ${timeString}. Debe ser HH:mm.`,
      tenant
    );
    return;
  }

  try {
    const booking = await createBooking({
      name,
      service,
      date: dateString,
      time: timeString,
      phone,
    });

    await sendMessage(
      phoneNumber,
      `Turno creado: ${booking.service} el ${booking.date} a las ${booking.time} para ${booking.name} (${booking.phone}).`,
      tenant
    );
  } catch (error) {
    logger.error("No se pudo crear el turno directo");

    if (isHttpError(error)) {
      await sendMessage(
        phoneNumber,
        `No se pudo crear el turno: ${error.message}`,
        tenant
      );
    } else {
      await sendMessage(
        phoneNumber,
        "Tuvimos un problema al crear el turno. Intenta nuevamente más tarde.",
        tenant
      );
    }
  }
};

// ============================================================================
// PROCESADOR PRINCIPAL DE MENSAJES
// ============================================================================

/**
 * Función principal que procesa mensajes entrantes desde el webhook
 * Esta función es llamada por el webhookController
 *
 * @param message - Mensaje entrante desde Meta
 * @param tenant - Tenant al que pertenece el mensaje
 */
export const processIncomingMessage = async (
  message: IncomingMessage,
  tenant: Tenant
): Promise<void> => {
  try {
    const { from: phoneNumber, text, name } = message;
    const customerName = name || CUSTOMER_FALLBACK_NAME;

    if (text.trim().length === 0) {
      return;
    }

    const normalized = text.toLowerCase().trim();

    // Cancelar conversación
    if (normalized === CANCEL_KEYWORD) {
      resetConversation(phoneNumber);
      await sendMessage(
        phoneNumber,
        "Cancelé la solicitud. Escribe *reservar turno* si querés comenzar nuevamente.",
        tenant
      );
      return;
    }

    // Comando reservar con formato directo
    if (normalized.startsWith("reservar") && text.includes("|")) {
      const payload = text
        .slice("reservar".length)
        .replace(/^[:\s-]+/, "")
        .trim();
      await handleReserveCommand(phoneNumber, payload, tenant);
      return;
    }

    // Verificar si el usuario está en una conversación activa
    const state = getConversationState(phoneNumber);

    if (state.step === "awaitingDate") {
      await handleDateStep(phoneNumber, text.trim(), state, tenant);
      return;
    }

    if (state.step === "awaitingTime") {
      await handleTimeStep(
        phoneNumber,
        text.trim(),
        state,
        tenant,
        customerName
      );
      return;
    }

    // Comandos principales (estado idle)
    logger.info(
      `Mensaje entrante de ${phoneNumber} (tenant: ${tenant.name}): ${text}`
    );

    // Saludos
    const greetings = ["hola", "hello", "buenas", "buenos días", "buenas tardes"];
    if (greetings.some((term) => normalized.startsWith(term))) {
      await sendMessage(
        phoneNumber,
        "¡Hola! Soy el asistente de turnos.",
        tenant
      );
      await sendMessage(
        phoneNumber,
        "¿En qué te puedo ayudar?\n- Reservar turno\nEscribe *reservar turno* para comenzar o *menu* para ver todas las opciones.",
        tenant
      );
      return;
    }

    // Menú de ayuda
    if (["menu", "help", "ayuda"].includes(normalized)) {
      await sendMessage(phoneNumber, HELP_MESSAGE, tenant);
      return;
    }

    // Iniciar reserva
    if (normalized === "reservar turno" || normalized === "reservar") {
      await startReservationFlow(phoneNumber, tenant);
      return;
    }

    // Listar servicios
    if (normalized === "servicios") {
      try {
        const services = await listServices();
        await sendMessage(phoneNumber, formatServices(services), tenant);
      } catch (error) {
        logger.error("No se pudieron obtener los servicios para WhatsApp");
        await sendMessage(
          phoneNumber,
          "No pude recuperar la lista de servicios. Intenta más tarde.",
          tenant
        );
      }
      return;
    }

    // Listar turnos
    if (normalized === "turnos") {
      try {
        const bookings = await listBookings();
        await sendMessage(phoneNumber, formatBookings(bookings), tenant);
      } catch (error) {
        logger.error("No se pudieron obtener los turnos para WhatsApp");
        await sendMessage(
          phoneNumber,
          "No pude recuperar los turnos. Intenta más tarde.",
          tenant
        );
      }
      return;
    }

    // Comando reservar con formato directo (sin pipe)
    if (normalized.startsWith("reservar")) {
      const payload = text
        .slice("reservar".length)
        .replace(/^[:\s-]+/, "")
        .trim();
      await handleReserveCommand(phoneNumber, payload, tenant);
      return;
    }

    // Mensaje no reconocido
    await sendMessage(
      phoneNumber,
      "No entiendo tu mensaje. Escribe *menu* para ver los comandos disponibles o *reservar turno* para iniciar una reserva.",
      tenant
    );
  } catch (error) {
    logger.error(
      `Error procesando mensaje de ${message.from} (tenant: ${tenant.name})`
    );

    // Intentar enviar mensaje de error al usuario
    try {
      await sendMessage(
        message.from,
        "Ocurrió un error procesando tu mensaje. Por favor intenta nuevamente.",
        tenant
      );
    } catch (sendError) {
      logger.error("No se pudo enviar mensaje de error al usuario");
    }
  }
};

/**
 * Limpia conversaciones antiguas (cleanup opcional)
 * Puede ser llamado periódicamente para liberar memoria
 */
export const cleanupOldConversations = (): void => {
  // Por ahora solo registramos cuántas hay
  logger.info(
    `Conversaciones activas: ${conversations.size}`
  );

  // TODO: Implementar limpieza de conversaciones inactivas por más de X tiempo
  // Necesitaríamos agregar timestamps a ConversationState
};
