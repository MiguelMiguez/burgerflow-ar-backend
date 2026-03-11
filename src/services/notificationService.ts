import { logger } from "../utils/logger";
import type { Order, OrderStatus } from "../models/order";
import { sendMessage } from "./metaService";
import { getTenantById } from "./tenantService";

/**
 * NOTA: Este servicio está parcialmente deshabilitado debido a la migración a Meta API.
 * Las notificaciones ahora se envían directamente desde el bot refactorizado.
 * Este archivo se mantiene para referencia futura.
 */

const STATUS_MESSAGES: Record<OrderStatus, (order: Order) => string> = {
  pendiente_pago: (order) =>
    `⏳ *Pedido #${order.id.slice(-6).toUpperCase()} esperando pago*\n\n` +
    `Hola ${order.customerName}! Tu pedido está pendiente de pago.\n` +
    `Una vez confirmado el pago, comenzaremos a prepararlo. 💳`,

  pendiente: (order) =>
    `📋 *Pedido #${order.id.slice(-6).toUpperCase()} recibido*\n\n` +
    `Hola ${order.customerName}! Tu pedido está siendo revisado.\n` +
    `Te avisaremos cuando sea confirmado. 🍔`,

  confirmado: (order) =>
    `✅ *Pedido #${order.id.slice(-6).toUpperCase()} confirmado*\n\n` +
    `¡Buenas noticias, ${order.customerName}!\n` +
    `Tu pedido ha sido confirmado y pronto comenzaremos a prepararlo. 👨‍🍳`,

  en_preparacion: (order) =>
    `👨‍🍳 *Pedido #${order.id.slice(-6).toUpperCase()} en preparación*\n\n` +
    `${order.customerName}, ya estamos cocinando tu pedido.\n` +
    `¡Pronto estará listo! 🔥`,

  listo: (order) => {
    if (order.orderType === "delivery") {
      return (
        `🎉 *Pedido #${order.id.slice(-6).toUpperCase()} listo*\n\n` +
        `${order.customerName}, tu pedido está listo y esperando al repartidor.\n` +
        `¡En breve saldrá para tu domicilio! 🏍️`
      );
    }
    return (
      `🎉 *Pedido #${order.id.slice(-6).toUpperCase()} listo para retirar*\n\n` +
      `${order.customerName}, tu pedido está listo para retirar.\n` +
      `¡Te esperamos en el local! 📍`
    );
  },

  en_camino: (order) =>
    `🏍️ *Pedido #${order.id.slice(-6).toUpperCase()} en camino*\n\n` +
    `${order.customerName}, tu pedido ya salió.\n` +
    `Dirección: ${order.deliveryAddress || "No especificada"}\n\n` +
    `¡Estará llegando pronto! 📦`,

  entregado: (order) => {
    if (order.orderType === "pickup") {
      return (
        `🎊 *Pedido #${order.id.slice(-6).toUpperCase()} retirado*\n\n` +
        `¡Gracias por tu compra, ${order.customerName}!\n` +
        `Esperamos que disfrutes tu comida. 🍔\n\n` +
        `¡Hasta la próxima! 👋`
      );
    }
    return (
      `🎊 *Pedido #${order.id.slice(-6).toUpperCase()} entregado*\n\n` +
      `¡Gracias por tu compra, ${order.customerName}!\n` +
      `Esperamos que disfrutes tu comida. 🍔\n\n` +
      `¡Hasta la próxima! 👋`
    );
  },

  cancelado: (order) =>
    `❌ *Pedido #${order.id.slice(-6).toUpperCase()} cancelado*\n\n` +
    `${order.customerName}, lamentamos informarte que tu pedido fue cancelado.\n\n` +
    `Si tienes alguna consulta, no dudes en escribirnos. 📞`,
};

/**
 * Obtiene el chatId correcto para enviar mensajes
 * Si ya es un chatId completo (xxx@lid o xxx@c.us) lo usa directamente
 * Si es solo un número, lo formatea como @c.us
 */
const getChatId = (phone: string): string => {
  // Si ya tiene formato de chatId (termina en @lid o @c.us), usarlo directamente
  if (phone.includes("@")) {
    return phone;
  }

  // Formatear como número de teléfono tradicional
  let cleaned = phone.replace(/\D/g, "");

  // Si ya tiene el formato completo, usarlo directamente
  if (cleaned.length >= 12 && cleaned.startsWith("54")) {
    return `${cleaned}@c.us`;
  }

  // Si tiene 10 dígitos (formato argentino sin código de país), agregar 54
  if (cleaned.length === 10) {
    cleaned = `54${cleaned}`;
  }

  // Si tiene 11 dígitos y empieza con 9, agregar 54 (celular con 9)
  if (cleaned.length === 11 && cleaned.startsWith("9")) {
    cleaned = `54${cleaned}`;
  }

  return `${cleaned}@c.us`;
};

/**
 * Envía una notificación de WhatsApp al cliente sobre el estado de su pedido
 */
export const sendOrderStatusNotification = async (
  order: Order,
  newStatus: OrderStatus,
): Promise<boolean> => {
  try {
    // Obtener el tenant del pedido
    const tenant = await getTenantById(order.tenantId);

    if (!tenant) {
      logger.warn(
        `No se encontró tenant ${order.tenantId} para enviar notificación`,
      );
      return false;
    }

    // Verificar que el tenant tenga credenciales de Meta
    if (!tenant.metaPhoneNumberId || !tenant.metaAccessToken) {
      logger.warn(
        `Tenant ${tenant.name} no tiene credenciales de Meta configuradas`,
      );
      return false;
    }

    const messageGenerator = STATUS_MESSAGES[newStatus];
    if (!messageGenerator) {
      logger.warn(`No hay mensaje configurado para el estado: ${newStatus}`);
      return false;
    }

    // Crear orden temporal con el nuevo estado para generar el mensaje
    const orderWithNewStatus = { ...order, status: newStatus };
    const message = messageGenerator(orderWithNewStatus);

    // Usar customerPhone directamente (sin formato @c.us)
    await sendMessage(order.customerPhone, message, tenant);

    logger.info(
      `Notificación enviada a ${order.customerPhone} - Pedido #${order.id.slice(-6)} -> ${newStatus}`,
    );
    return true;
  } catch (error) {
    logger.error(
      `Error al enviar notificación a ${order.customerPhone}`,
      error,
    );
    return false;
  }
};

/**
 * Envía un mensaje personalizado a un número de teléfono
 */
export const sendWhatsappMessage = async (
  phone: string,
  message: string,
  tenantId: string,
): Promise<boolean> => {
  try {
    const tenant = await getTenantById(tenantId);

    if (!tenant) {
      logger.warn(`No se encontró tenant ${tenantId} para enviar mensaje`);
      return false;
    }

    if (!tenant.metaPhoneNumberId || !tenant.metaAccessToken) {
      logger.warn(
        `Tenant ${tenant.name} no tiene credenciales de Meta configuradas`,
      );
      return false;
    }

    await sendMessage(phone, message, tenant);
    logger.info(`Mensaje enviado a ${phone}`);
    return true;
  } catch (error) {
    logger.error(`Error al enviar mensaje a ${phone}`, error);
    return false;
  }
};

/**
 * Envía una notificación al admin/dueño cuando llega un pedido nuevo
 */
export const sendNewOrderNotification = async (
  order: Order,
): Promise<boolean> => {
  try {
    const tenant = await getTenantById(order.tenantId);

    if (!tenant) {
      logger.warn(
        `No se encontró tenant ${order.tenantId} para enviar notificación`,
      );
      return false;
    }

    // Verificar que el tenant tenga número de notificación configurado
    if (!tenant.notificationPhone) {
      logger.debug(
        `Tenant ${tenant.name} no tiene teléfono de notificación configurado`,
      );
      return false;
    }

    if (!tenant.metaPhoneNumberId || !tenant.metaAccessToken) {
      logger.warn(
        `Tenant ${tenant.name} no tiene credenciales de Meta configuradas`,
      );
      return false;
    }

    const formatPrice = (price: number): string =>
      `$${price.toLocaleString("es-AR", { minimumFractionDigits: 0 })}`;

    const orderTypeEmoji = order.orderType === "delivery" ? "🏍️" : "🏪";
    const orderTypeLabel =
      order.orderType === "delivery" ? "Delivery" : "Retiro";

    const itemsList = order.items
      .map((item) => `• ${item.quantity}x ${item.productName}`)
      .join("\n");

    const message =
      `🔔 *NUEVO PEDIDO #${order.id.slice(-6).toUpperCase()}*\n\n` +
      `👤 *Cliente:* ${order.customerName}\n` +
      `📱 *Tel:* ${order.customerPhone}\n` +
      `${orderTypeEmoji} *Tipo:* ${orderTypeLabel}\n` +
      (order.deliveryAddress
        ? `📍 *Dirección:* ${order.deliveryAddress}\n`
        : "") +
      `💳 *Pago:* ${order.paymentMethod === "efectivo" ? "Efectivo" : "Transferencia"}\n\n` +
      `📝 *Productos:*\n${itemsList}\n\n` +
      `💰 *Total: ${formatPrice(order.total)}*\n\n` +
      `Ingresa al panel para confirmar el pedido.`;

    await sendMessage(tenant.notificationPhone, message, tenant);

    logger.info(
      `Notificación de nuevo pedido enviada a ${tenant.notificationPhone} - Pedido #${order.id.slice(-6)}`,
    );
    return true;
  } catch (error) {
    logger.error(
      `Error al enviar notificación de nuevo pedido al admin`,
      error,
    );
    return false;
  }
};

/**
 * Envía una notificación al restaurante cuando un cliente reporta un problema con su pedido
 */
export const sendOrderIssueNotification = async (
  order: Order,
  customerPhone: string,
): Promise<boolean> => {
  try {
    const tenant = await getTenantById(order.tenantId);

    if (!tenant) {
      logger.warn(
        `No se encontró tenant ${order.tenantId} para enviar notificación de problema`,
      );
      return false;
    }

    if (!tenant.notificationPhone) {
      logger.debug(
        `Tenant ${tenant.name} no tiene teléfono de notificación configurado`,
      );
      return false;
    }

    if (!tenant.metaPhoneNumberId || !tenant.metaAccessToken) {
      logger.warn(
        `Tenant ${tenant.name} no tiene credenciales de Meta configuradas`,
      );
      return false;
    }

    const message =
      `⚠️ *PROBLEMA REPORTADO - PEDIDO #${order.id.slice(-6).toUpperCase()}*\n\n` +
      `👤 *Cliente:* ${order.customerName}\n` +
      `📱 *Teléfono:* ${customerPhone}\n\n` +
      `El cliente ha reportado un problema con su pedido y necesita ser contactado.\n\n` +
      `Por favor, comunícate con el cliente lo antes posible.`;

    await sendMessage(tenant.notificationPhone, message, tenant);

    logger.info(
      `Notificación de problema enviada a ${tenant.notificationPhone} - Pedido #${order.id.slice(-6)}`,
    );
    return true;
  } catch (error) {
    logger.error(`Error al enviar notificación de problema al admin`, error);
    return false;
  }
};

/**
 * Envía una notificación al restaurante cuando un cliente quiere contactarse
 */
export const sendContactRequestNotification = async (
  order: Order,
  customerPhone: string,
): Promise<boolean> => {
  try {
    const tenant = await getTenantById(order.tenantId);

    if (!tenant) {
      logger.warn(
        `No se encontró tenant ${order.tenantId} para enviar notificación de contacto`,
      );
      return false;
    }

    if (!tenant.notificationPhone) {
      logger.debug(
        `Tenant ${tenant.name} no tiene teléfono de notificación configurado`,
      );
      return false;
    }

    if (!tenant.metaPhoneNumberId || !tenant.metaAccessToken) {
      logger.warn(
        `Tenant ${tenant.name} no tiene credenciales de Meta configuradas`,
      );
      return false;
    }

    const message =
      `📞 *SOLICITUD DE CONTACTO - PEDIDO #${order.id.slice(-6).toUpperCase()}*\n\n` +
      `👤 *Cliente:* ${order.customerName}\n` +
      `📱 *Teléfono:* ${customerPhone}\n\n` +
      `El cliente desea comunicarse con el restaurante sobre su pedido.\n\n` +
      `Por favor, contacta al cliente.`;

    await sendMessage(tenant.notificationPhone, message, tenant);

    logger.info(
      `Notificación de contacto enviada a ${tenant.notificationPhone} - Pedido #${order.id.slice(-6)}`,
    );
    return true;
  } catch (error) {
    logger.error(`Error al enviar notificación de contacto al admin`, error);
    return false;
  }
};
