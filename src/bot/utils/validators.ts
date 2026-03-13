import { INTENT_PATTERNS, BUTTON_IDS } from "../constants";

/**
 * Normaliza el texto del usuario para comparación
 */
export const normalizeText = (text: string): string => {
  return text.trim().toLowerCase();
};

/**
 * Detecta si el texto es una respuesta afirmativa
 */
export const isAffirmative = (text: string): boolean => {
  const normalized = normalizeText(text);
  return (
    INTENT_PATTERNS.yes.test(normalized) ||
    normalized === BUTTON_IDS.CUSTOM_YES ||
    normalized === BUTTON_IDS.EXTRAS_YES ||
    normalized === "1"
  );
};

/**
 * Detecta si el texto es una respuesta negativa
 */
export const isNegative = (text: string): boolean => {
  const normalized = normalizeText(text);
  return (
    INTENT_PATTERNS.no.test(normalized) ||
    normalized === BUTTON_IDS.CUSTOM_NO ||
    normalized === BUTTON_IDS.EXTRAS_NO ||
    normalized === "2" ||
    normalized.includes("continuar")
  );
};

/**
 * Detecta si el texto es un comando de cancelación
 */
export const isCancelCommand = (text: string): boolean => {
  return INTENT_PATTERNS.cancel.test(normalizeText(text));
};

/**
 * Detecta si el texto es un saludo
 */
export const isGreeting = (text: string): boolean => {
  return INTENT_PATTERNS.greeting.test(normalizeText(text));
};

/**
 * Detecta si el texto indica finalización
 */
export const isDoneCommand = (text: string): boolean => {
  const normalized = normalizeText(text);
  return (
    normalized === BUTTON_IDS.DONE ||
    normalized === "listo" ||
    normalized === "continuar" ||
    normalized === "0"
  );
};

/**
 * Detecta si el texto es un comando para volver atrás
 */
export const isBackCommand = (text: string): boolean => {
  const normalized = normalizeText(text);
  return normalized === "volver" || normalized === "cancelar" || normalized === "0";
};

/**
 * Parsea un número de selección del texto
 * Retorna -1 si no es un número válido
 */
export const parseSelectionNumber = (text: string): number => {
  const index = parseInt(text.trim(), 10);
  return isNaN(index) ? -1 : index - 1; // Convertir a 0-based
};

/**
 * Valida si un texto parece ser una dirección válida
 */
export const isValidAddress = (text: string): boolean => {
  return text.trim().length >= 5;
};

/**
 * Detecta la intención de un botón específico o texto equivalente
 */
export const matchesButton = (
  text: string,
  buttonId: string,
  ...alternatives: string[]
): boolean => {
  const normalized = normalizeText(text);

  if (normalized === buttonId) return true;

  for (const alt of alternatives) {
    if (normalized === alt || normalized.includes(alt)) {
      return true;
    }
  }

  return false;
};

/**
 * Detecta intención de Delivery
 */
export const isDeliveryIntent = (text: string): boolean => {
  return matchesButton(text, BUTTON_IDS.DELIVERY, "1", "delivery");
};

/**
 * Detecta intención de Pickup
 */
export const isPickupIntent = (text: string): boolean => {
  return matchesButton(text, BUTTON_IDS.PICKUP, "2", "retiro", "local");
};

/**
 * Detecta intención de pago en efectivo
 */
export const isCashPaymentIntent = (text: string): boolean => {
  return matchesButton(text, BUTTON_IDS.CASH, "1", "efectivo");
};

/**
 * Detecta intención de pago por transferencia
 */
export const isTransferPaymentIntent = (text: string): boolean => {
  return matchesButton(text, BUTTON_IDS.TRANSFER, "2", "transferencia");
};

/**
 * Detecta intención de agregar
 */
export const isAddIntent = (text: string): boolean => {
  return matchesButton(text, BUTTON_IDS.ADD, "1", "agregar");
};

/**
 * Detecta intención de quitar
 */
export const isRemoveIntent = (text: string): boolean => {
  return matchesButton(text, BUTTON_IDS.REMOVE, "2", "quitar");
};

/**
 * Detecta intención de confirmar
 */
export const isConfirmIntent = (text: string): boolean => {
  return matchesButton(text, BUTTON_IDS.CONFIRM, "confirmar");
};

/**
 * Detecta intención de cancelar en confirmación
 */
export const isCancelConfirmIntent = (text: string): boolean => {
  return matchesButton(text, BUTTON_IDS.CANCEL, "cancelar");
};
