import { formatPrice, formatCart } from "../utils/formatters";
import type { CartItem, SelectedExtra } from "../types";
import type { DeliveryZone } from "../../models/deliveryZone";

/**
 * Mensaje para seleccionar zona de delivery
 */
export const getDeliveryZoneSelectionMessage = (
  zones: DeliveryZone[],
): string => {
  const zonesList = zones.map((zone, index) => `*${index + 1}.* ${zone.name}`);

  return (
    `🚗 *Seleccioná tu zona de delivery:*\n\n` +
    `${zonesList.join("\n")}\n\n` +
    `Escribí el *número* de tu zona.`
  );
};

/**
 * Mensaje para pedir dirección
 */
export const getAddressRequestMessage = (zoneName?: string): string => {
  const zoneInfo = zoneName ? `Zona: *${zoneName}*\n\n` : "";

  return (
    `${zoneInfo}` +
    `Por favor, escribí tu *dirección completa*.\n` +
    `_(Calle, número, piso/depto)_`
  );
};

/**
 * Mensaje para pedir dirección sin zonas
 */
export const getAddressRequestNoZonesMessage = (): string => {
  return (
    `Por favor, escribí tu *dirección completa* para el envío.\n\n` +
    `_(Calle, número, piso/depto, barrio)_`
  );
};

/**
 * Mensaje para pedir referencia de entrega
 */
export const getDeliveryNotesRequestMessage = (address: string): string => {
  return (
    `📍 Dirección: *${address}*\n\n` +
    `Escribí una *referencia* para encontrarte más fácil.\n` +
    `_Ej: Casa con portón negro, al lado de la farmacia, etc._`
  );
};

/**
 * Mensaje de resumen del pedido
 */
export const getOrderSummaryMessage = (
  cart: CartItem[],
  generalExtras: SelectedExtra[],
  orderType: "delivery" | "pickup",
  paymentMethod: "efectivo" | "transferencia",
  deliveryAddress?: string,
  selectedZone?: DeliveryZone,
  deliveryNotes?: string,
): string => {
  const deliveryCost = selectedZone?.price ?? 0;
  const paymentText =
    paymentMethod === "efectivo" ? "💵 Efectivo" : "💳 Transferencia";

  let orderTypeText = "🏪 Retiro en local";
  if (orderType === "delivery") {
    orderTypeText = `🚗 Delivery a: ${deliveryAddress}`;
    if (selectedZone) {
      orderTypeText += `\n📍 Zona: ${selectedZone.name}`;
    }
    if (deliveryNotes) {
      orderTypeText += `\n📝 Referencia: ${deliveryNotes}`;
    }
  }

  return (
    `📋 *Resumen de tu pedido*\n\n` +
    `${formatCart(cart, deliveryCost, generalExtras)}\n\n` +
    `${orderTypeText}\n` +
    `Pago: ${paymentText}`
  );
};

/**
 * Mensaje de error al obtener zonas
 */
export const getDeliveryZoneErrorMessage = (): string => {
  return "Hubo un error al cargar las zonas. Intenta nuevamente.";
};

/**
 * Mensaje de dirección inválida
 */
export const getInvalidAddressMessage = (): string => {
  return "Por favor, escribí una dirección más completa.";
};

/**
 * Mensaje de selección de zona inválida
 */
export const getInvalidZoneSelectionMessage = (maxZones: number): string => {
  return `Por favor, escribí un número válido entre 1 y ${maxZones}.`;
};
