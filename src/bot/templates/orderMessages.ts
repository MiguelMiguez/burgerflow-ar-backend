import { STATUS_LABELS, ESTIMATED_TIMES } from "../constants";
import { formatPrice, formatOrderId } from "../utils/formatters";
import type { Order } from "../../models/order";

/**
 * Mensaje con información del pedido activo
 */
export const getActiveOrderInfoMessage = (order: Order): string => {
  const statusLabel = STATUS_LABELS[order.status] || order.status;
  const orderTypeLabel =
    order.orderType === "delivery" ? "🚗 Delivery" : "🏪 Retiro en local";

  return (
    `Hola! 👋 Ya tenés un pedido en curso:\n\n` +
    `📦 *Pedido #${formatOrderId(order.id)}*\n` +
    `${statusLabel}\n` +
    `${orderTypeLabel}\n` +
    `💰 Total: ${formatPrice(order.total)}\n\n` +
    `¿En qué podemos ayudarte?`
  );
};

/**
 * Mensaje detallado del estado del pedido
 */
export const getOrderStatusMessage = (order: Order): string => {
  const statusLabel = STATUS_LABELS[order.status] || order.status;
  const orderTypeLabel =
    order.orderType === "delivery" ? "🚗 Delivery" : "🏪 Retiro en local";

  const itemsList = order.items
    .map((item) => `• ${item.quantity}x ${item.productName}`)
    .join("\n");

  let message =
    `📦 *Estado de tu Pedido #${formatOrderId(order.id)}*\n\n` +
    `*Estado:* ${statusLabel}\n` +
    `*Tipo:* ${orderTypeLabel}\n`;

  if (order.orderType === "delivery" && order.deliveryAddress) {
    message += `*Dirección:* ${order.deliveryAddress}\n`;
  }

  message +=
    `\n*Productos:*\n${itemsList}\n\n` +
    `💰 *Total:* ${formatPrice(order.total)}\n\n`;

  // Mensaje según el estado
  const statusMessages: Record<string, string> = {
    pendiente_pago:
      "⏳ Tu pedido está esperando el pago. Una vez confirmado, lo prepararemos.",
    pendiente:
      "📋 Tu pedido está siendo revisado por el restaurante. Te notificaremos cuando sea confirmado.",
    confirmado:
      "✅ Tu pedido fue confirmado. Pronto comenzaremos a prepararlo.",
    en_preparacion: "👨‍🍳 Tu pedido está siendo preparado. ¡Ya falta poco!",
    listo:
      order.orderType === "delivery"
        ? "🎉 Tu pedido está listo y esperando al repartidor."
        : "🎉 Tu pedido está listo para retirar. ¡Te esperamos!",
    en_camino: "🏍️ Tu pedido está en camino. ¡Pronto llegará!",
  };

  message += statusMessages[order.status] || "";

  return message;
};

/**
 * Mensaje de problema reportado
 */
export const getOrderIssueReportedMessage = (orderId: string): string => {
  return (
    `⚠️ *Problema reportado*\n\n` +
    `Hemos notificado al restaurante sobre tu inconveniente con el pedido *#${formatOrderId(orderId)}*.\n\n` +
    `Un representante se comunicará contigo lo antes posible.\n\n` +
    `¡Gracias por tu paciencia! 🙏`
  );
};

/**
 * Mensaje de solicitud de contacto enviada
 */
export const getContactRequestSentMessage = (orderId: string): string => {
  return (
    `📞 *Solicitud de contacto enviada*\n\n` +
    `Hemos notificado al restaurante que deseas comunicarte sobre el pedido *#${formatOrderId(orderId)}*.\n\n` +
    `Un representante se comunicará contigo pronto.\n\n` +
    `¡Gracias por tu paciencia! 🙏`
  );
};

/**
 * Mensaje amigable para respuestas no reconocidas con pedido activo
 */
export const getUnrecognizedWithActiveOrderMessage = (
  orderId: string,
): string => {
  return (
    `No estoy seguro de entender tu mensaje. 🤔\n\n` +
    `Recordá que tenés un *pedido en curso #${formatOrderId(orderId)}*.\n\n` +
    `¿En qué puedo ayudarte?`
  );
};

/**
 * Mensaje de respuesta a saludo con pedido activo
 */
export const getGreetingWithActiveOrderMessage = (order: Order): string => {
  const statusLabel = STATUS_LABELS[order.status] || order.status;
  return (
    `¡Hola! 👋 Veo que tenés un pedido en curso.\n\n` +
    `📦 *Pedido #${formatOrderId(order.id)}*\n` +
    `Estado: ${statusLabel}\n\n` +
    `¿En qué puedo ayudarte?`
  );
};

/**
 * Mensaje cuando ya hay pedido activo e intenta hacer otro
 */
export const getAlreadyHasActiveOrderMessage = (): string => {
  return `⚠️ Ya tenés un pedido en curso. No podés realizar otro pedido hasta que el actual sea completado o cancelado.`;
};

/**
 * Mensaje de pedido recibido (efectivo)
 */
export const getOrderReceivedMessage = (
  orderId: string,
  orderType: "delivery" | "pickup",
  tenantName: string,
): string => {
  const estimatedTime = ESTIMATED_TIMES[orderType];

  return (
    `📋 *¡Pedido recibido!*\n\n` +
    `Número de pedido: *#${formatOrderId(orderId)}*\n\n` +
    `⏳ *Esperando confirmación del restaurante...*\n\n` +
    `Te notificaremos cuando tu pedido sea confirmado y comience a prepararse.\n\n` +
    `Tiempo estimado después de la confirmación: ${estimatedTime}\n\n` +
    `¡Gracias por elegir *${tenantName}*! 🍔`
  );
};

/**
 * Mensaje de pedido con link de pago
 */
export const getOrderWithPaymentLinkMessage = (
  orderId: string,
  paymentUrl: string,
  orderType: "delivery" | "pickup",
): string => {
  const estimatedTime = ESTIMATED_TIMES[orderType];

  return (
    `⏳ *Pedido pendiente de pago*\n\n` +
    `Número de pedido: *#${formatOrderId(orderId)}*\n\n` +
    `💳 *Para confirmar tu pedido, realizá el pago:*\n\n` +
    `👉 ${paymentUrl}\n\n` +
    `⚠️ *Tu pedido NO será preparado hasta confirmar el pago.*\n\n` +
    `Una vez recibido el pago, el restaurante confirmará tu pedido.\n\n` +
    `Tiempo estimado después de la confirmación: ${estimatedTime}`
  );
};

/**
 * Mensaje cuando falla el link de pago
 */
export const getPaymentLinkFailedMessage = (
  orderId: string,
  orderType: "delivery" | "pickup",
  tenantName: string,
): string => {
  const estimatedTime = ESTIMATED_TIMES[orderType];

  return (
    `📋 *¡Pedido recibido!*\n\n` +
    `Número de pedido: *#${formatOrderId(orderId)}*\n\n` +
    `⚠️ No pudimos generar el link de pago automático.\n` +
    `Por favor, coordiná el pago con el local.\n\n` +
    `⏳ *Esperando confirmación del restaurante...*\n\n` +
    `Te notificaremos cuando sea confirmado.\n` +
    `Tiempo estimado después de la confirmación: ${estimatedTime}\n\n` +
    `¡Gracias por elegir *${tenantName}*! 🍔`
  );
};

/**
 * Mensaje de error al crear pedido
 */
export const getOrderCreationErrorMessage = (
  errorMessage?: string,
): string => {
  if (errorMessage) {
    return `No se pudo crear el pedido: ${errorMessage}`;
  }
  return "Hubo un problema al procesar tu pedido. Por favor, intenta nuevamente.";
};
