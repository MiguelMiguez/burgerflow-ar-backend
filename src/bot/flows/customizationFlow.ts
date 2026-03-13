import { logger } from "../../utils/logger";
import { sendMessage, sendInteractiveButtons } from "../../services/metaService";
import { listIngredients } from "../../services/ingredientService";
import { listActiveExtras } from "../../services/extraService";
import { getStateMachine } from "../stateMachine";
import { BUTTON_IDS } from "../constants";
import * as templates from "../templates";
import {
  isAffirmative,
  isNegative,
  isAddIntent,
  isRemoveIntent,
  isDoneCommand,
  isBackCommand,
  parseSelectionNumber,
} from "../utils";
import { formatCart } from "../utils/formatters";
import { askOrderType } from "./deliveryFlow";
import type { FlowContext, FlowResult, OrderCustomization } from "../types";
import type { Ingredient } from "../../models/ingredient";
import type { Extra } from "../../models/extra";

const stateMachine = getStateMachine();

/**
 * Inicia el flujo de personalización
 */
export const askCustomization = async (ctx: FlowContext): Promise<void> => {
  const { phoneNumber, tenant, state } = ctx;

  // Mostrar el carrito actual
  await sendMessage(phoneNumber, formatCart(state.cart), tenant);

  await stateMachine.transitionTo(phoneNumber, tenant.id, "askingCustomization");

  await sendInteractiveButtons(
    phoneNumber,
    templates.getCustomizationQuestionMessage(),
    [
      { id: BUTTON_IDS.CUSTOM_YES, title: "✅ Sí, personalizar" },
      { id: BUTTON_IDS.CUSTOM_NO, title: "❌ No, continuar" },
    ],
    tenant,
  );
};

/**
 * Muestra la lista de hamburguesas para elegir cuál personalizar
 */
const showBurgerSelection = async (ctx: FlowContext): Promise<void> => {
  const { phoneNumber, tenant, state } = ctx;

  await stateMachine.transitionTo(
    phoneNumber,
    tenant.id,
    "selectingBurgerToCustomize",
  );

  await sendMessage(
    phoneNumber,
    templates.getBurgerSelectionMessage(state.cart),
    tenant,
  );
};

/**
 * Muestra las opciones de personalización (Agregar/Quitar/Continuar)
 */
const showCustomizationActions = async (
  ctx: FlowContext,
  burgerIndex: number,
): Promise<void> => {
  const { phoneNumber, tenant, state } = ctx;
  const burger = state.cart[burgerIndex];

  await stateMachine.transitionTo(
    phoneNumber,
    tenant.id,
    "selectingCustomizationAction",
    { currentBurgerIndex: burgerIndex },
  );

  await sendInteractiveButtons(
    phoneNumber,
    templates.getCustomizationActionsMessage(
      burger.product.name,
      burger.customizations,
    ),
    [
      { id: BUTTON_IDS.ADD, title: "➕ Agregar" },
      { id: BUTTON_IDS.REMOVE, title: "➖ Quitar" },
      { id: BUTTON_IDS.DONE, title: "✅ Listo" },
    ],
    tenant,
  );
};

/**
 * Muestra los ingredientes disponibles para agregar
 */
const showIngredientsToAdd = async (ctx: FlowContext): Promise<void> => {
  const { phoneNumber, tenant, state } = ctx;

  try {
    const [allIngredients, allExtras] = await Promise.all([
      listIngredients(state.tenantId),
      listActiveExtras(state.tenantId),
    ]);

    // Filtrar ingredientes con stock y que tienen un Extra vinculado
    const ingredientsWithExtras = allIngredients
      .filter((ing) => ing.stock > 0)
      .map((ing) => {
        const linkedExtra = allExtras.find(
          (extra) => extra.linkedProductId === ing.id,
        );
        return linkedExtra ? { ingredient: ing, extra: linkedExtra } : null;
      })
      .filter(
        (item): item is { ingredient: Ingredient; extra: Extra } =>
          item !== null,
      );

    if (ingredientsWithExtras.length === 0) {
      await sendMessage(
        phoneNumber,
        templates.getNoIngredientsAvailableMessage(),
        tenant,
      );
      await showCustomizationActions(ctx, state.currentBurgerIndex ?? 0);
      return;
    }

    await stateMachine.transitionTo(
      phoneNumber,
      tenant.id,
      "selectingIngredientToAdd",
      {
        availableIngredients: ingredientsWithExtras.map((i) => i.ingredient),
        ingredientExtrasMap: ingredientsWithExtras,
      },
    );

    await sendMessage(
      phoneNumber,
      templates.getIngredientsToAddMessage(ingredientsWithExtras),
      tenant,
    );
  } catch (error) {
    logger.error("Error al obtener ingredientes para agregar", error);
    await sendMessage(
      phoneNumber,
      templates.getIngredientLoadErrorMessage(),
      tenant,
    );
    await showCustomizationActions(ctx, state.currentBurgerIndex ?? 0);
  }
};

/**
 * Muestra los ingredientes que se pueden quitar
 */
const showIngredientsToRemove = async (ctx: FlowContext): Promise<void> => {
  const { phoneNumber, tenant, state } = ctx;
  const burgerIndex = state.currentBurgerIndex ?? 0;
  const burger = state.cart[burgerIndex];

  // Ingredientes originales removibles
  const removableIngredients = burger.product.ingredients.filter(
    (ing) => ing.isRemovable,
  );

  // Filtrar los que ya fueron quitados
  const alreadyRemoved = burger.customizations
    .filter((c) => c.type === "quitar")
    .map((c) => c.ingredientId);

  const availableOriginalToRemove = removableIngredients.filter(
    (ing) => !alreadyRemoved.includes(ing.ingredientId),
  );

  // Ingredientes agregados
  const addedIngredients = burger.customizations.filter(
    (c) => c.type === "agregar",
  );

  if (availableOriginalToRemove.length === 0 && addedIngredients.length === 0) {
    await sendMessage(
      phoneNumber,
      templates.getNoIngredientsToRemoveMessage(),
      tenant,
    );
    await showCustomizationActions(ctx, burgerIndex);
    return;
  }

  await stateMachine.transitionTo(
    phoneNumber,
    tenant.id,
    "selectingIngredientToRemove",
  );

  await sendMessage(
    phoneNumber,
    templates.getIngredientsToRemoveMessage(
      availableOriginalToRemove,
      addedIngredients,
    ),
    tenant,
  );
};

/**
 * Pregunta si desea personalizar otra hamburguesa
 */
const askForAnotherBurgerCustomization = async (
  ctx: FlowContext,
): Promise<void> => {
  const { phoneNumber, tenant, state } = ctx;

  if (state.cart.length > 1) {
    await stateMachine.transitionTo(
      phoneNumber,
      tenant.id,
      "askingCustomization",
      { currentBurgerIndex: undefined },
    );

    await sendInteractiveButtons(
      phoneNumber,
      "¿Querés personalizar otra hamburguesa?",
      [
        { id: BUTTON_IDS.CUSTOM_YES, title: "✅ Sí, otra más" },
        { id: BUTTON_IDS.CUSTOM_NO, title: "❌ No, continuar" },
      ],
      tenant,
    );
  } else {
    await askOrderType(ctx);
  }
};

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * Handler: ¿Desea personalizar?
 */
export const handleCustomizationQuestion = async (
  ctx: FlowContext,
): Promise<FlowResult> => {
  const { phoneNumber, text, tenant, state } = ctx;

  if (isAffirmative(text) || text.toLowerCase().includes("personalizar")) {
    if (state.cart.length === 1) {
      // Solo hay una hamburguesa, ir directo
      await showCustomizationActions(ctx, 0);
    } else {
      await showBurgerSelection(ctx);
    }
    return { handled: true };
  }

  if (isNegative(text)) {
    await askOrderType(ctx);
    return { handled: true };
  }

  // Respuesta no reconocida
  await sendInteractiveButtons(
    phoneNumber,
    "Por favor, seleccioná una opción:",
    [
      { id: BUTTON_IDS.CUSTOM_YES, title: "✅ Sí, personalizar" },
      { id: BUTTON_IDS.CUSTOM_NO, title: "❌ No, continuar" },
    ],
    tenant,
  );

  return { handled: true };
};

/**
 * Handler: Selección de hamburguesa a personalizar
 */
export const handleBurgerSelection = async (
  ctx: FlowContext,
): Promise<FlowResult> => {
  const { phoneNumber, text, tenant, state } = ctx;
  const index = parseSelectionNumber(text);

  if (index < 0 || index >= state.cart.length) {
    await sendMessage(
      phoneNumber,
      templates.getInvalidSelectionMessage(state.cart.length, false),
      tenant,
    );
    return { handled: true };
  }

  await showCustomizationActions(ctx, index);
  return { handled: true };
};

/**
 * Handler: Acción de personalización (Agregar/Quitar/Listo)
 */
export const handleCustomizationAction = async (
  ctx: FlowContext,
): Promise<FlowResult> => {
  const { state } = ctx;

  if (isAddIntent(ctx.text)) {
    await showIngredientsToAdd(ctx);
    return { handled: true };
  }

  if (isRemoveIntent(ctx.text)) {
    await showIngredientsToRemove(ctx);
    return { handled: true };
  }

  if (isDoneCommand(ctx.text)) {
    await askForAnotherBurgerCustomization(ctx);
    return { handled: true };
  }

  // Respuesta no reconocida - mostrar opciones de nuevo
  await showCustomizationActions(ctx, state.currentBurgerIndex ?? 0);
  return { handled: true };
};

/**
 * Handler: Selección de ingrediente para agregar
 */
export const handleIngredientToAdd = async (
  ctx: FlowContext,
): Promise<FlowResult> => {
  const { phoneNumber, text, tenant, state } = ctx;

  if (isBackCommand(text)) {
    await showCustomizationActions(ctx, state.currentBurgerIndex ?? 0);
    return { handled: true };
  }

  const index = parseSelectionNumber(text);
  const ingredientExtrasMap = state.ingredientExtrasMap || [];

  if (index < 0 || index >= ingredientExtrasMap.length) {
    await sendMessage(
      phoneNumber,
      templates.getInvalidSelectionMessage(ingredientExtrasMap.length),
      tenant,
    );
    return { handled: true };
  }

  const { ingredient: selectedIngredient, extra: linkedExtra } =
    ingredientExtrasMap[index];
  const burgerIndex = state.currentBurgerIndex ?? 0;

  // Crear la customización
  const customization: OrderCustomization = {
    ingredientId: selectedIngredient.id,
    ingredientName: selectedIngredient.name,
    type: "agregar",
    extraPrice: linkedExtra.price,
  };

  // Verificar que no esté ya agregado
  const updatedCart = [...state.cart];
  const burger = updatedCart[burgerIndex];

  const alreadyAdded = burger.customizations.some(
    (c) =>
      c.ingredientId === customization.ingredientId && c.type === "agregar",
  );

  if (alreadyAdded) {
    await sendMessage(
      phoneNumber,
      templates.getIngredientAlreadyAddedMessage(selectedIngredient.name),
      tenant,
    );
  } else {
    burger.customizations.push(customization);
    await sendMessage(
      phoneNumber,
      templates.getIngredientAddedMessage(
        selectedIngredient.name,
        linkedExtra.price,
      ),
      tenant,
    );
  }

  await stateMachine.setState(phoneNumber, tenant.id, { cart: updatedCart });
  await showCustomizationActions(
    { ...ctx, state: { ...state, cart: updatedCart } },
    burgerIndex,
  );

  return { handled: true };
};

/**
 * Handler: Selección de ingrediente para quitar
 */
export const handleIngredientToRemove = async (
  ctx: FlowContext,
): Promise<FlowResult> => {
  const { phoneNumber, text, tenant, state } = ctx;

  if (isBackCommand(text)) {
    await showCustomizationActions(ctx, state.currentBurgerIndex ?? 0);
    return { handled: true };
  }

  const burgerIndex = state.currentBurgerIndex ?? 0;
  const burger = state.cart[burgerIndex];

  // Calcular opciones disponibles
  const removableIngredients = burger.product.ingredients.filter(
    (ing) => ing.isRemovable,
  );
  const alreadyRemoved = burger.customizations
    .filter((c) => c.type === "quitar")
    .map((c) => c.ingredientId);
  const availableOriginalToRemove = removableIngredients.filter(
    (ing) => !alreadyRemoved.includes(ing.ingredientId),
  );
  const addedIngredients = burger.customizations.filter(
    (c) => c.type === "agregar",
  );

  const totalOptions =
    availableOriginalToRemove.length + addedIngredients.length;
  const index = parseSelectionNumber(text);

  if (index < 0 || index >= totalOptions) {
    await sendMessage(
      phoneNumber,
      templates.getInvalidSelectionMessage(totalOptions),
      tenant,
    );
    return { handled: true };
  }

  const updatedCart = [...state.cart];

  if (index < availableOriginalToRemove.length) {
    // Es un ingrediente original
    const selectedIngredient = availableOriginalToRemove[index];

    const customization: OrderCustomization = {
      ingredientId: selectedIngredient.ingredientId,
      ingredientName: selectedIngredient.ingredientName,
      type: "quitar",
      extraPrice: 0,
    };

    updatedCart[burgerIndex].customizations.push(customization);

    await sendMessage(
      phoneNumber,
      templates.getIngredientRemovedMessage(selectedIngredient.ingredientName),
      tenant,
    );
  } else {
    // Es un ingrediente agregado
    const addedIndex = index - availableOriginalToRemove.length;
    const ingredientToRemove = addedIngredients[addedIndex];

    updatedCart[burgerIndex].customizations = updatedCart[
      burgerIndex
    ].customizations.filter(
      (c) =>
        !(
          c.type === "agregar" &&
          c.ingredientId === ingredientToRemove.ingredientId
        ),
    );

    await sendMessage(
      phoneNumber,
      templates.getExtraRemovedMessage(ingredientToRemove.ingredientName),
      tenant,
    );
  }

  await stateMachine.setState(phoneNumber, tenant.id, { cart: updatedCart });
  await showCustomizationActions(
    { ...ctx, state: { ...state, cart: updatedCart } },
    burgerIndex,
  );

  return { handled: true };
};
