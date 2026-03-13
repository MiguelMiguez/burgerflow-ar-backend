import { formatPrice } from "../utils/formatters";
import type { CartItem, OrderCustomization } from "../types";
import type { Ingredient } from "../../models/ingredient";
import type { Extra } from "../../models/extra";

/**
 * Pregunta si desea personalizar hamburguesas
 */
export const getCustomizationQuestionMessage = (): string => {
  return "¿Querés personalizar alguna hamburguesa?\n_(Agregar o quitar ingredientes)_";
};

/**
 * Lista de hamburguesas para seleccionar cuál personalizar
 */
export const getBurgerSelectionMessage = (cart: CartItem[]): string => {
  const burgerList = cart.map((item, index) => {
    const mods =
      item.customizations.length > 0
        ? ` _(${item.customizations.length} modificación/es)_`
        : "";
    return `*${index + 1}.* ${item.quantity}x ${item.product.name}${mods}`;
  });

  return (
    `¿Cuál hamburguesa querés personalizar?\n\n` +
    `${burgerList.join("\n")}\n\n` +
    `Escribí el *número* de la hamburguesa.`
  );
};

/**
 * Menú de personalización de hamburguesa
 */
export const getCustomizationActionsMessage = (
  productName: string,
  customizations: OrderCustomization[],
): string => {
  let currentMods = "";
  if (customizations.length > 0) {
    const mods = customizations.map(
      (c) => `${c.type === "agregar" ? "+" : "-"} ${c.ingredientName}`,
    );
    currentMods = `\nModificaciones: _${mods.join(", ")}_\n`;
  }

  return `Personalizando: *${productName}*${currentMods}\n¿Qué querés hacer?`;
};

/**
 * Lista de ingredientes para agregar
 */
export const getIngredientsToAddMessage = (
  ingredients: { ingredient: Ingredient; extra: Extra }[],
): string => {
  const ingredientsList = ingredients.map(
    ({ ingredient, extra }, index) =>
      `*${index + 1}.* ${ingredient.name} (+${formatPrice(extra.price)})`,
  );

  return (
    `➕ *Ingredientes disponibles para agregar:*\n\n` +
    `${ingredientsList.join("\n")}\n\n` +
    `Escribí el *número* del ingrediente o *volver* para cancelar.`
  );
};

/**
 * Lista de ingredientes para quitar
 */
export const getIngredientsToRemoveMessage = (
  originalIngredients: { ingredientId: string; ingredientName: string }[],
  addedIngredients: OrderCustomization[],
): string => {
  const ingredientsList: string[] = [];

  // Primero los ingredientes originales
  originalIngredients.forEach((ing, index) => {
    ingredientsList.push(`*${index + 1}.* ${ing.ingredientName}`);
  });

  // Luego los ingredientes agregados (con indicador)
  addedIngredients.forEach((ing, index) => {
    const listIndex = originalIngredients.length + index + 1;
    ingredientsList.push(`*${listIndex}.* ${ing.ingredientName} _(agregado)_`);
  });

  return (
    `➖ *Ingredientes para quitar:*\n\n` +
    `${ingredientsList.join("\n")}\n\n` +
    `Escribí el *número* del ingrediente o *volver* para cancelar.`
  );
};

/**
 * Mensaje de ingrediente agregado
 */
export const getIngredientAddedMessage = (
  ingredientName: string,
  price: number,
): string => {
  return `✅ Agregaste *${ingredientName}* (+${formatPrice(price)})`;
};

/**
 * Mensaje de ingrediente ya agregado
 */
export const getIngredientAlreadyAddedMessage = (
  ingredientName: string,
): string => {
  return `*${ingredientName}* ya está agregado a esta hamburguesa.`;
};

/**
 * Mensaje de ingrediente quitado
 */
export const getIngredientRemovedMessage = (ingredientName: string): string => {
  return `❌ Quitaste *${ingredientName}*`;
};

/**
 * Mensaje de extra removido
 */
export const getExtraRemovedMessage = (ingredientName: string): string => {
  return `❌ Removiste el extra *${ingredientName}*`;
};

/**
 * Mensaje de no hay ingredientes disponibles
 */
export const getNoIngredientsAvailableMessage = (): string => {
  return "No hay ingredientes disponibles para agregar en este momento.";
};

/**
 * Mensaje de no hay ingredientes para quitar
 */
export const getNoIngredientsToRemoveMessage = (): string => {
  return "No hay más ingredientes que puedas quitar de esta hamburguesa.";
};

/**
 * Mensaje de error al cargar ingredientes
 */
export const getIngredientLoadErrorMessage = (): string => {
  return "Hubo un error al cargar los ingredientes. Intenta nuevamente.";
};

/**
 * Mensaje de selección inválida
 */
export const getInvalidSelectionMessage = (
  max: number,
  includeBack = true,
): string => {
  const backText = includeBack ? ", o *volver*" : "";
  return `Por favor, escribí un número válido entre 1 y ${max}${backText}.`;
};

/**
 * Pregunta si desea agregar extras al pedido
 */
export const getExtrasQuestionMessage = (): string => {
  return "🍟 ¿Querés agregar algo más a tu pedido?\n_(Papas, bebidas, aros de cebolla, etc.)_";
};

/**
 * Lista de extras disponibles
 */
export const getExtrasListMessage = (extras: Extra[]): string => {
  const extrasList = extras.map(
    (extra, index) =>
      `*${index + 1}.* ${extra.name} - ${formatPrice(extra.price)}`,
  );

  return (
    `🍟 *Extras disponibles:*\n\n` +
    `${extrasList.join("\n")}\n\n` +
    `Escribí el *número* del extra que querés agregar.\n` +
    `Escribí *listo* cuando termines.`
  );
};

/**
 * Mensaje de extra agregado
 */
export const getExtraAddedMessage = (
  extraName: string,
  price: number,
): string => {
  return (
    `✅ Agregaste *${extraName}* (+${formatPrice(price)})\n\n` +
    `Escribí otro número para más extras o *listo* para continuar.`
  );
};
