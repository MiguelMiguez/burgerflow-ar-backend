/**
 * Templates de mensajes de bienvenida
 */

/**
 * Mensaje de bienvenida para nuevos clientes
 */
export const getWelcomeMessage = (
  contactName: string | undefined,
  tenantName: string,
): string => {
  const greeting = contactName ? `¡Hola ${contactName}! 👋` : "¡Hola! 👋";

  return (
    `${greeting}\n\n` +
    `Bienvenido a *${tenantName}* 🍔\n\n` +
    `Para hacer tu pedido, seleccioná las hamburguesas que quieras desde nuestro *catálogo* 📋\n\n` +
    `👉 Tocá el ícono del catálogo en este chat para ver todas nuestras opciones.\n\n` +
    `Una vez que elijas tus productos, te ayudo a completar el pedido. ¡Gracias por elegirnos!`
  );
};

/**
 * Mensaje de despedida al cancelar
 */
export const getCancellationMessage = (tenantName: string): string => {
  return `Pedido cancelado. ¡Esperamos verte pronto en *${tenantName}*! 🍔`;
};

/**
 * Mensaje de despedida genérico
 */
export const getFarewellMessage = (): string => {
  return `¡Perfecto! Si necesitás algo más, no dudes en escribirnos. 😊\n\nTe avisaremos sobre cualquier actualización de tu pedido.`;
};

/**
 * Mensaje cuando el restaurante no tiene opciones de entrega
 */
export const getNoDeliveryOptionsMessage = (): string => {
  return (
    `Lo sentimos, el restaurante no tiene opciones de entrega configuradas en este momento. 😔\n\n` +
    `Por favor, contactá directamente al local para realizar tu pedido.`
  );
};

/**
 * Mensaje cuando solo hay delivery disponible
 */
export const getOnlyDeliveryMessage = (): string => {
  return `📦 Este restaurante solo ofrece *delivery*.\nContinuamos con el envío a domicilio.`;
};

/**
 * Mensaje cuando solo hay pickup disponible
 */
export const getOnlyPickupMessage = (): string => {
  return `🏪 Este restaurante solo ofrece *retiro en local*.\nContinuamos con el retiro.`;
};
