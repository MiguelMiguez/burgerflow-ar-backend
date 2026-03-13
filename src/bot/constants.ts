/**
 * Constantes y configuraciones del bot
 */

/** Palabra clave para cancelar el flujo */
export const CANCEL_KEYWORD = "cancelar";

/** Nombre por defecto para clientes sin nombre */
export const CUSTOMER_FALLBACK_NAME = "Cliente WhatsApp";

/** Tiempo de expiración del estado en milisegundos (30 minutos) */
export const STATE_TTL_MS = 30 * 60 * 1000;

/** Etiquetas de estado para mostrar al usuario */
export const STATUS_LABELS: Record<string, string> = {
  pendiente_pago: "⏳ Esperando pago",
  pendiente: "📋 Esperando confirmación del restaurante",
  confirmado: "✅ Confirmado - próximamente en preparación",
  en_preparacion: "👨‍🍳 En preparación",
  listo: "🎉 Listo para entrega/retiro",
  en_camino: "🏍️ En camino",
};

/** Tiempos estimados de entrega */
export const ESTIMATED_TIMES = {
  delivery: "40-50 minutos",
  pickup: "20-30 minutos",
} as const;

/** IDs de botones interactivos */
export const BUTTON_IDS = {
  // Menú de pedido activo
  ORDER_STATUS: "btn_order_status",
  ORDER_ISSUE: "btn_order_issue",
  CONTACT_RESTAURANT: "btn_contact_restaurant",
  OK: "btn_ok",
  
  // Personalización
  CUSTOM_YES: "btn_custom_si",
  CUSTOM_NO: "btn_custom_no",
  
  // Acciones de personalización
  ADD: "btn_agregar",
  REMOVE: "btn_quitar",
  DONE: "btn_listo",
  
  // Extras
  EXTRAS_YES: "btn_extras_si",
  EXTRAS_NO: "btn_extras_no",
  
  // Tipo de entrega
  DELIVERY: "btn_delivery",
  PICKUP: "btn_pickup",
  
  // Pago
  CASH: "btn_efectivo",
  TRANSFER: "btn_transferencia",
  
  // Confirmación
  CONFIRM: "btn_confirmar",
  CANCEL: "btn_cancelar",
} as const;

/** Patrones de detección de intención */
export const INTENT_PATTERNS = {
  greeting: /^(hola|buenas|buen dia|buenos dias|hey|hi|hello)/i,
  yes: /^(si|sí|ok|dale|bueno|claro|perfecto)$/i,
  no: /^(no|nop|nope|nel)$/i,
  cancel: /^(cancelar|cancela|salir|exit)$/i,
  status: /(estado|pedido|orden)/i,
  problem: /(problema|error|reclamo|queja)/i,
  contact: /(contactar|llamar|hablar)/i,
  thanks: /(gracias|bien|ok|nada)/i,
} as const;
