import { logger } from "../utils/logger";
import { sendMessage, sendInteractiveButtons } from "../services/metaService";
import { createOrder } from "../services/orderService";
import { getProductById } from "../services/productService";
import {
  listActiveDeliveryZones,
  listDeliveryZones,
} from "../services/deliveryZoneService";
import { listIngredients } from "../services/ingredientService";
import { listActiveExtras } from "../services/extraService";
import {
  createPaymentPreference,
  hasMercadoPagoConfigured,
} from "../services/mercadoPagoService";
import type { Tenant } from "../models/tenant";
import type { Product } from "../models/product";
import type { DeliveryZone } from "../models/deliveryZone";
import type { Ingredient } from "../models/ingredient";
import type { Extra } from "../models/extra";
import type {
  OrderItem,
  OrderCustomization,
  OrderExtra,
  CreateOrderInput,
} from "../models/order";
import { isHttpError } from "../utils/httpError";

/**
 * Bot de Pedidos de Hamburguesas - Flujo basado en Catálogo de WhatsApp
 *
 * Flujo principal:
 * 1. Cliente saluda → Bot invita a usar el catálogo
 * 2. Cliente selecciona productos del catálogo
 * 3. Bot pregunta si desea personalizar
 * 4. Si sí → Seleccionar hamburguesa → Agregar/Quitar/Continuar
 * 5. Repetir personalización si hay más hamburguesas
 * 6. Seleccionar tipo de entrega (delivery/pickup)
 * 7. Seleccionar método de pago
 * 8. Si es transferencia → Generar link de Mercado Pago
 * 9. Confirmar pedido
 */

// ============================================================================
// TIPOS Y CONSTANTES
// ============================================================================

type ConversationStep =
  | "idle"
  | "askingCustomization" // ¿Deseas personalizar?
  | "selectingBurgerToCustomize" // ¿Cuál hamburguesa personalizar?
  | "selectingCustomizationAction" // Agregar/Quitar/Continuar
  | "selectingIngredientToAdd" // Seleccionar ingrediente para agregar
  | "selectingIngredientToRemove" // Seleccionar ingrediente para quitar
  | "askingExtras" // ¿Deseas agregar extras?
  | "selectingExtras" // Seleccionando extras
  | "selectingOrderType" // Delivery o Pickup
  | "selectingDeliveryZone" // Zona de delivery
  | "awaitingAddress" // Dirección de entrega
  | "awaitingDeliveryNotes" // Referencias de entrega
  | "selectingPayment" // Método de pago
  | "confirmingOrder"; // Confirmar pedido

interface SelectedExtra {
  extra: Extra;
  quantity: number;
}

interface CartItem {
  product: Product;
  quantity: number;
  customizations: OrderCustomization[];
  extras: SelectedExtra[];
}

interface ConversationState {
  step: ConversationStep;
  tenantId: string;
  cart: CartItem[];
  generalExtras: SelectedExtra[]; // Extras generales del pedido (papas, bebidas, etc.)
  currentBurgerIndex?: number; // Índice de la hamburguesa siendo personalizada
  availableIngredients?: Ingredient[]; // Ingredientes disponibles para agregar
  ingredientExtrasMap?: { ingredient: Ingredient; extra: Extra }[]; // Mapa de ingredientes con sus extras vinculados
  availableExtras?: Extra[]; // Extras disponibles
  orderType?: "delivery" | "pickup";
  selectedZone?: DeliveryZone;
  deliveryAddress?: string;
  deliveryNotes?: string;
  paymentMethod?: "efectivo" | "transferencia";
  customerName?: string;
}

const conversations = new Map<string, ConversationState>();

const CANCEL_KEYWORD = "cancelar";
const CUSTOMER_FALLBACK_NAME = "Cliente WhatsApp";

// ============================================================================
// UTILIDADES
// ============================================================================

const formatPrice = (price: number): string => {
  return `$${price.toLocaleString("es-AR", { minimumFractionDigits: 0 })}`;
};

const getConversationState = (
  phoneNumber: string,
  tenantId: string,
): ConversationState => {
  return (
    conversations.get(phoneNumber) ?? {
      step: "idle",
      tenantId,
      cart: [],
      generalExtras: [],
    }
  );
};

const setConversationState = (
  phoneNumber: string,
  state: ConversationState,
): void => {
  conversations.set(phoneNumber, state);
};

const resetConversation = (phoneNumber: string): void => {
  conversations.delete(phoneNumber);
};

const formatCart = (
  cart: CartItem[],
  deliveryCost: number = 0,
  extrasList?: SelectedExtra[],
): string => {
  if (cart.length === 0 && (!extrasList || extrasList.length === 0)) {
    return "Tu carrito está vacío.";
  }

  let subtotal = 0;
  const items = cart.map((item, index) => {
    let itemTotal = item.product.price * item.quantity;

    // Sumar customizaciones con precio extra (solo agregar tiene precio)
    const customizationsTotal = item.customizations
      .filter((c) => c.type === "agregar")
      .reduce((sum, c) => sum + c.extraPrice * item.quantity, 0);
    itemTotal += customizationsTotal;

    // Sumar extras del producto
    const extrasTotal = item.extras.reduce(
      (sum, e) => sum + e.extra.price * e.quantity * item.quantity,
      0,
    );
    itemTotal += extrasTotal;

    subtotal += itemTotal;

    let details = "";
    if (item.customizations.length > 0) {
      const mods = item.customizations.map(
        (c) => `${c.type === "agregar" ? "+" : "-"} ${c.ingredientName}`,
      );
      details += `\n   _${mods.join(", ")}_`;
    }
    if (item.extras.length > 0) {
      const extrasStr = item.extras.map(
        (e) => `+ ${e.quantity}x ${e.extra.name}`,
      );
      details += `\n   _${extrasStr.join(", ")}_`;
    }

    return `${index + 1}. ${item.quantity}x ${item.product.name} - ${formatPrice(itemTotal)}${details}`;
  });

  // Agregar extras generales si existen
  if (extrasList && extrasList.length > 0) {
    extrasList.forEach((e) => {
      const extraTotal = e.extra.price * e.quantity;
      subtotal += extraTotal;
      items.push(
        `🍟 ${e.quantity}x ${e.extra.name} - ${formatPrice(extraTotal)}`,
      );
    });
  }

  const total = subtotal + deliveryCost;
  let result = `🛒 *Tu Pedido*\n\n${items.join("\n")}\n\n*Subtotal: ${formatPrice(subtotal)}*`;
  if (deliveryCost > 0) {
    result += `\n*Envío: ${formatPrice(deliveryCost)}*\n*Total: ${formatPrice(total)}*`;
  }
  return result;
};

// ============================================================================
// MENSAJE DE BIENVENIDA
// ============================================================================

const sendWelcomeMessage = async (
  phoneNumber: string,
  tenant: Tenant,
  contactName?: string,
): Promise<void> => {
  const greeting = contactName ? `¡Hola ${contactName}! 👋` : "¡Hola! 👋";

  await sendMessage(
    phoneNumber,
    `${greeting}\n\n` +
      `Bienvenido a *${tenant.name}* 🍔\n\n` +
      `Para hacer tu pedido, seleccioná las hamburguesas que quieras desde nuestro *catálogo* 📋\n\n` +
      `👉 Tocá el ícono del catálogo en este chat para ver todas nuestras opciones.\n\n` +
      `Una vez que elijas tus productos, te ayudo a completar el pedido. ¡Gracias por elegirnos!`,
    tenant,
  );
};

// ============================================================================
// FLUJO DE PERSONALIZACIÓN
// ============================================================================

/**
 * Pregunta si el cliente desea personalizar alguna hamburguesa
 */
const askCustomization = async (
  phoneNumber: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  // Mostrar el carrito actual
  await sendMessage(phoneNumber, formatCart(state.cart), tenant);

  setConversationState(phoneNumber, {
    ...state,
    step: "askingCustomization",
  });

  await sendInteractiveButtons(
    phoneNumber,
    "¿Querés personalizar alguna hamburguesa?\n_(Agregar o quitar ingredientes)_",
    [
      { id: "btn_custom_si", title: "✅ Sí, personalizar" },
      { id: "btn_custom_no", title: "❌ No, continuar" },
    ],
    tenant,
  );
};

/**
 * Maneja la respuesta de si quiere personalizar
 */
const handleCustomizationQuestion = async (
  phoneNumber: string,
  text: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  const normalized = text.trim().toLowerCase();

  if (
    normalized === "btn_custom_si" ||
    normalized === "si" ||
    normalized === "sí" ||
    normalized.includes("personalizar")
  ) {
    // Mostrar lista de hamburguesas para elegir cuál personalizar
    if (state.cart.length === 1) {
      // Solo hay una hamburguesa, ir directo a personalizarla
      await showCustomizationActions(
        phoneNumber,
        { ...state, currentBurgerIndex: 0 },
        tenant,
      );
    } else {
      // Hay varias, preguntar cuál
      await showBurgerSelection(phoneNumber, state, tenant);
    }
  } else if (
    normalized === "btn_custom_no" ||
    normalized === "no" ||
    normalized.includes("continuar")
  ) {
    // Continuar al flujo de extras
    await askExtras(phoneNumber, state, tenant);
  } else {
    // Respuesta no reconocida
    await sendInteractiveButtons(
      phoneNumber,
      "Por favor, seleccioná una opción:",
      [
        { id: "btn_custom_si", title: "✅ Sí, personalizar" },
        { id: "btn_custom_no", title: "❌ No, continuar" },
      ],
      tenant,
    );
  }
};

/**
 * Muestra la lista de hamburguesas para elegir cuál personalizar
 */
const showBurgerSelection = async (
  phoneNumber: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  setConversationState(phoneNumber, {
    ...state,
    step: "selectingBurgerToCustomize",
  });

  const burgerList = state.cart.map((item, index) => {
    const mods =
      item.customizations.length > 0
        ? ` _(${item.customizations.length} modificación/es)_`
        : "";
    return `*${index + 1}.* ${item.quantity}x ${item.product.name}${mods}`;
  });

  await sendMessage(
    phoneNumber,
    `¿Cuál hamburguesa querés personalizar?\n\n${burgerList.join("\n")}\n\n` +
      `Escribí el *número* de la hamburguesa.`,
    tenant,
  );
};

/**
 * Maneja la selección de qué hamburguesa personalizar
 */
const handleBurgerSelection = async (
  phoneNumber: string,
  text: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  const index = parseInt(text.trim(), 10) - 1;

  if (isNaN(index) || index < 0 || index >= state.cart.length) {
    await sendMessage(
      phoneNumber,
      `Por favor, escribí un número válido entre 1 y ${state.cart.length}.`,
      tenant,
    );
    return;
  }

  await showCustomizationActions(
    phoneNumber,
    { ...state, currentBurgerIndex: index },
    tenant,
  );
};

/**
 * Muestra las opciones de personalización (Agregar/Quitar/Continuar)
 */
const showCustomizationActions = async (
  phoneNumber: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  const burgerIndex = state.currentBurgerIndex ?? 0;
  const burger = state.cart[burgerIndex];

  setConversationState(phoneNumber, {
    ...state,
    step: "selectingCustomizationAction",
    currentBurgerIndex: burgerIndex,
  });

  // Mostrar modificaciones actuales si hay
  let currentMods = "";
  if (burger.customizations.length > 0) {
    const mods = burger.customizations.map(
      (c) => `${c.type === "agregar" ? "+" : "-"} ${c.ingredientName}`,
    );
    currentMods = `\nModificaciones: _${mods.join(", ")}_\n`;
  }

  await sendInteractiveButtons(
    phoneNumber,
    `Personalizando: *${burger.product.name}*${currentMods}\n¿Qué querés hacer?`,
    [
      { id: "btn_agregar", title: "➕ Agregar" },
      { id: "btn_quitar", title: "➖ Quitar" },
      { id: "btn_listo", title: "✅ Listo" },
    ],
    tenant,
  );
};

/**
 * Maneja la selección de acción de personalización
 */
const handleCustomizationAction = async (
  phoneNumber: string,
  text: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  const normalized = text.trim().toLowerCase();

  if (
    normalized === "btn_agregar" ||
    normalized === "1" ||
    normalized.includes("agregar")
  ) {
    await showIngredientsToAdd(phoneNumber, state, tenant);
  } else if (
    normalized === "btn_quitar" ||
    normalized === "2" ||
    normalized.includes("quitar")
  ) {
    await showIngredientsToRemove(phoneNumber, state, tenant);
  } else if (
    normalized === "btn_listo" ||
    normalized === "3" ||
    normalized.includes("listo") ||
    normalized.includes("continuar")
  ) {
    await askForAnotherBurgerCustomization(phoneNumber, state, tenant);
  } else {
    await showCustomizationActions(phoneNumber, state, tenant);
  }
};

/**
 * Muestra los ingredientes disponibles para AGREGAR
 * Solo muestra ingredientes que tienen un Extra vinculado (con precio definido)
 */
const showIngredientsToAdd = async (
  phoneNumber: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  try {
    // Obtener todos los ingredientes y extras del tenant
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
        "No hay ingredientes disponibles para agregar en este momento.",
        tenant,
      );
      await showCustomizationActions(phoneNumber, state, tenant);
      return;
    }

    setConversationState(phoneNumber, {
      ...state,
      step: "selectingIngredientToAdd",
      availableIngredients: ingredientsWithExtras.map((i) => i.ingredient),
      ingredientExtrasMap: ingredientsWithExtras,
    });

    const ingredientsList = ingredientsWithExtras.map(
      ({ ingredient, extra }, index) =>
        `*${index + 1}.* ${ingredient.name} (+${formatPrice(extra.price)})`,
    );

    await sendMessage(
      phoneNumber,
      `➕ *Ingredientes disponibles para agregar:*\n\n${ingredientsList.join("\n")}\n\n` +
        `Escribí el *número* del ingrediente o *volver* para cancelar.`,
      tenant,
    );
  } catch (error) {
    logger.error("Error al obtener ingredientes para agregar", error);
    await sendMessage(
      phoneNumber,
      "Hubo un error al cargar los ingredientes. Intenta nuevamente.",
      tenant,
    );
    await showCustomizationActions(phoneNumber, state, tenant);
  }
};

/**
 * Maneja la selección de ingrediente para agregar
 */
const handleIngredientToAdd = async (
  phoneNumber: string,
  text: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  const normalized = text.trim().toLowerCase();

  if (
    normalized === "volver" ||
    normalized === "cancelar" ||
    normalized === "0"
  ) {
    await showCustomizationActions(phoneNumber, state, tenant);
    return;
  }

  const index = parseInt(text.trim(), 10) - 1;
  const ingredientExtrasMap = state.ingredientExtrasMap || [];

  if (isNaN(index) || index < 0 || index >= ingredientExtrasMap.length) {
    await sendMessage(
      phoneNumber,
      `Por favor, escribí un número válido entre 1 y ${ingredientExtrasMap.length}, o *volver*.`,
      tenant,
    );
    return;
  }

  const { ingredient: selectedIngredient, extra: linkedExtra } =
    ingredientExtrasMap[index];
  const burgerIndex = state.currentBurgerIndex ?? 0;

  // Crear la customización con el precio del Extra vinculado
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
      `*${selectedIngredient.name}* ya está agregado a esta hamburguesa.`,
      tenant,
    );
  } else {
    burger.customizations.push(customization);

    await sendMessage(
      phoneNumber,
      `✅ Agregaste *${selectedIngredient.name}* (+${formatPrice(linkedExtra.price)})`,
      tenant,
    );
  }

  setConversationState(phoneNumber, {
    ...state,
    cart: updatedCart,
  });

  // Volver a mostrar las opciones de personalización
  await showCustomizationActions(
    phoneNumber,
    { ...state, cart: updatedCart },
    tenant,
  );
};

/**
 * Muestra los ingredientes que se pueden QUITAR de la hamburguesa
 */
const showIngredientsToRemove = async (
  phoneNumber: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  const burgerIndex = state.currentBurgerIndex ?? 0;
  const burger = state.cart[burgerIndex];

  // Obtener ingredientes removibles del producto
  const removableIngredients = burger.product.ingredients.filter(
    (ing) => ing.isRemovable,
  );

  // Filtrar los que ya fueron quitados
  const alreadyRemoved = burger.customizations
    .filter((c) => c.type === "quitar")
    .map((c) => c.ingredientId);

  const availableToRemove = removableIngredients.filter(
    (ing) => !alreadyRemoved.includes(ing.ingredientId),
  );

  if (availableToRemove.length === 0) {
    await sendMessage(
      phoneNumber,
      "No hay más ingredientes que puedas quitar de esta hamburguesa.",
      tenant,
    );
    await showCustomizationActions(phoneNumber, state, tenant);
    return;
  }

  setConversationState(phoneNumber, {
    ...state,
    step: "selectingIngredientToRemove",
  });

  const ingredientsList = availableToRemove.map(
    (ing, index) => `*${index + 1}.* ${ing.ingredientName}`,
  );

  await sendMessage(
    phoneNumber,
    `➖ *Ingredientes para quitar:*\n\n${ingredientsList.join("\n")}\n\n` +
      `Escribí el *número* del ingrediente o *volver* para cancelar.`,
    tenant,
  );
};

/**
 * Maneja la selección de ingrediente para quitar
 */
const handleIngredientToRemove = async (
  phoneNumber: string,
  text: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  const normalized = text.trim().toLowerCase();

  if (
    normalized === "volver" ||
    normalized === "cancelar" ||
    normalized === "0"
  ) {
    await showCustomizationActions(phoneNumber, state, tenant);
    return;
  }

  const burgerIndex = state.currentBurgerIndex ?? 0;
  const burger = state.cart[burgerIndex];

  // Obtener ingredientes removibles
  const removableIngredients = burger.product.ingredients.filter(
    (ing) => ing.isRemovable,
  );
  const alreadyRemoved = burger.customizations
    .filter((c) => c.type === "quitar")
    .map((c) => c.ingredientId);
  const availableToRemove = removableIngredients.filter(
    (ing) => !alreadyRemoved.includes(ing.ingredientId),
  );

  const index = parseInt(text.trim(), 10) - 1;

  if (isNaN(index) || index < 0 || index >= availableToRemove.length) {
    await sendMessage(
      phoneNumber,
      `Por favor, escribí un número válido entre 1 y ${availableToRemove.length}, o *volver*.`,
      tenant,
    );
    return;
  }

  const selectedIngredient = availableToRemove[index];

  // Crear la customización
  const customization: OrderCustomization = {
    ingredientId: selectedIngredient.ingredientId,
    ingredientName: selectedIngredient.ingredientName,
    type: "quitar",
    extraPrice: 0,
  };

  // Agregar al carrito
  const updatedCart = [...state.cart];
  updatedCart[burgerIndex].customizations.push(customization);

  await sendMessage(
    phoneNumber,
    `❌ Quitaste *${selectedIngredient.ingredientName}*`,
    tenant,
  );

  setConversationState(phoneNumber, {
    ...state,
    cart: updatedCart,
  });

  // Volver a mostrar las opciones de personalización
  await showCustomizationActions(
    phoneNumber,
    { ...state, cart: updatedCart },
    tenant,
  );
};

/**
 * Pregunta si desea personalizar otra hamburguesa
 */
const askForAnotherBurgerCustomization = async (
  phoneNumber: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  // Verificar si hay más de una hamburguesa
  if (state.cart.length > 1) {
    setConversationState(phoneNumber, {
      ...state,
      step: "askingCustomization",
      currentBurgerIndex: undefined,
    });

    await sendInteractiveButtons(
      phoneNumber,
      "¿Querés personalizar otra hamburguesa?",
      [
        { id: "btn_custom_si", title: "✅ Sí, otra más" },
        { id: "btn_custom_no", title: "❌ No, continuar" },
      ],
      tenant,
    );
  } else {
    // Solo había una hamburguesa, ir a preguntar por extras
    await askExtras(phoneNumber, state, tenant);
  }
};

// ============================================================================
// FLUJO DE EXTRAS (PAPAS, BEBIDAS, ETC.)
// ============================================================================

/**
 * Pregunta si desea agregar extras al pedido
 */
const askExtras = async (
  phoneNumber: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  try {
    const extras = await listActiveExtras(state.tenantId);

    if (extras.length === 0) {
      // No hay extras disponibles, ir directo al tipo de entrega
      await askOrderType(phoneNumber, state, tenant);
      return;
    }

    setConversationState(phoneNumber, {
      ...state,
      step: "askingExtras",
      availableExtras: extras,
    });

    // Mostrar resumen del carrito
    await sendMessage(
      phoneNumber,
      formatCart(state.cart, 0, state.generalExtras),
      tenant,
    );

    await sendInteractiveButtons(
      phoneNumber,
      "🍟 ¿Querés agregar algo más a tu pedido?\n_(Papas, bebidas, aros de cebolla, etc.)_",
      [
        { id: "btn_extras_si", title: "✅ Sí, ver extras" },
        { id: "btn_extras_no", title: "❌ No, continuar" },
      ],
      tenant,
    );
  } catch (error) {
    logger.error("Error al obtener extras", error);
    // Si hay error, continuar sin extras
    await askOrderType(phoneNumber, state, tenant);
  }
};

/**
 * Maneja la respuesta de si quiere agregar extras
 */
const handleExtrasQuestion = async (
  phoneNumber: string,
  text: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  const normalized = text.trim().toLowerCase();

  if (
    normalized === "btn_extras_si" ||
    normalized === "si" ||
    normalized === "sí" ||
    normalized.includes("ver extras")
  ) {
    await showExtrasSelection(phoneNumber, state, tenant);
  } else if (
    normalized === "btn_extras_no" ||
    normalized === "no" ||
    normalized.includes("continuar")
  ) {
    await askOrderType(phoneNumber, state, tenant);
  } else {
    await sendInteractiveButtons(
      phoneNumber,
      "Por favor, seleccioná una opción:",
      [
        { id: "btn_extras_si", title: "✅ Sí, ver extras" },
        { id: "btn_extras_no", title: "❌ No, continuar" },
      ],
      tenant,
    );
  }
};

/**
 * Muestra la lista de extras disponibles
 */
const showExtrasSelection = async (
  phoneNumber: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  const extras = state.availableExtras || [];

  if (extras.length === 0) {
    await askOrderType(phoneNumber, state, tenant);
    return;
  }

  setConversationState(phoneNumber, {
    ...state,
    step: "selectingExtras",
  });

  const extrasList = extras.map(
    (extra, index) =>
      `*${index + 1}.* ${extra.name} - ${formatPrice(extra.price)}`,
  );

  await sendMessage(
    phoneNumber,
    `🍟 *Extras disponibles:*\n\n${extrasList.join("\n")}\n\n` +
      `Escribí el *número* del extra que querés agregar.\n` +
      `Escribí *listo* cuando termines.`,
    tenant,
  );
};

/**
 * Maneja la selección de extras
 */
const handleExtrasSelection = async (
  phoneNumber: string,
  text: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  const normalized = text.trim().toLowerCase();

  if (
    normalized === "listo" ||
    normalized === "continuar" ||
    normalized === "0"
  ) {
    await askOrderType(phoneNumber, state, tenant);
    return;
  }

  const extras = state.availableExtras || [];
  const index = parseInt(text.trim(), 10) - 1;

  if (isNaN(index) || index < 0 || index >= extras.length) {
    await sendMessage(
      phoneNumber,
      `Por favor, escribí un número válido entre 1 y ${extras.length}, o *listo* para continuar.`,
      tenant,
    );
    return;
  }

  const selectedExtra = extras[index];

  // Verificar si ya existe en generalExtras
  const updatedExtras = [...state.generalExtras];
  const existingIndex = updatedExtras.findIndex(
    (e) => e.extra.id === selectedExtra.id,
  );

  if (existingIndex >= 0) {
    // Incrementar cantidad
    updatedExtras[existingIndex].quantity += 1;
  } else {
    // Agregar nuevo
    updatedExtras.push({ extra: selectedExtra, quantity: 1 });
  }

  setConversationState(phoneNumber, {
    ...state,
    generalExtras: updatedExtras,
  });

  await sendMessage(
    phoneNumber,
    `✅ Agregaste *${selectedExtra.name}* (+${formatPrice(selectedExtra.price)})\n\n` +
      `Escribí otro número para más extras o *listo* para continuar.`,
    tenant,
  );
};

// ============================================================================
// FLUJO DE TIPO DE ENTREGA
// ============================================================================

const askOrderType = async (
  phoneNumber: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  const hasDelivery = tenant.hasDelivery !== false;
  const hasPickup = tenant.hasPickup !== false;

  if (hasDelivery && hasPickup) {
    setConversationState(phoneNumber, {
      ...state,
      step: "selectingOrderType",
    });

    await sendInteractiveButtons(
      phoneNumber,
      "¿Cómo querés recibir tu pedido?",
      [
        { id: "btn_delivery", title: "🚗 Delivery" },
        { id: "btn_pickup", title: "🏪 Retiro en local" },
      ],
      tenant,
    );
  } else if (hasDelivery) {
    await handleDeliveryFlow(phoneNumber, state, tenant);
  } else {
    // Solo pickup
    await askPaymentMethod(
      phoneNumber,
      { ...state, orderType: "pickup" },
      tenant,
    );
  }
};

const handleOrderTypeSelection = async (
  phoneNumber: string,
  text: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  const normalized = text.trim().toLowerCase();

  if (
    normalized === "btn_delivery" ||
    normalized === "1" ||
    normalized.includes("delivery")
  ) {
    await handleDeliveryFlow(phoneNumber, state, tenant);
  } else if (
    normalized === "btn_pickup" ||
    normalized === "2" ||
    normalized.includes("retiro") ||
    normalized.includes("local")
  ) {
    await askPaymentMethod(
      phoneNumber,
      { ...state, orderType: "pickup" },
      tenant,
    );
  } else {
    await sendInteractiveButtons(
      phoneNumber,
      "Por favor, seleccioná una opción:",
      [
        { id: "btn_delivery", title: "🚗 Delivery" },
        { id: "btn_pickup", title: "🏪 Retiro en local" },
      ],
      tenant,
    );
  }
};

// ============================================================================
// FLUJO DE DELIVERY
// ============================================================================

const handleDeliveryFlow = async (
  phoneNumber: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  try {
    const zones = await getActiveZonesWithFallback(state.tenantId);

    if (zones.length > 0) {
      setConversationState(phoneNumber, {
        ...state,
        step: "selectingDeliveryZone",
        orderType: "delivery",
      });

      const zonesList = zones.map(
        (zone, index) =>
          `*${index + 1}.* ${zone.name} - ${formatPrice(zone.price)}`,
      );

      await sendMessage(
        phoneNumber,
        `🚗 *Seleccioná tu zona de delivery:*\n\n${zonesList.join("\n")}\n\nEscribí el *número* de tu zona.`,
        tenant,
      );
    } else {
      // Sin zonas configuradas
      setConversationState(phoneNumber, {
        ...state,
        step: "awaitingAddress",
        orderType: "delivery",
      });

      await sendMessage(
        phoneNumber,
        "Por favor, escribí tu *dirección completa* para el envío.\n\n_(Calle, número, piso/depto, barrio)_",
        tenant,
      );
    }
  } catch (error) {
    logger.error("Error al obtener zonas de delivery", error);
    setConversationState(phoneNumber, {
      ...state,
      step: "awaitingAddress",
      orderType: "delivery",
    });

    await sendMessage(
      phoneNumber,
      "Por favor, escribí tu *dirección completa* para el envío.\n\n_(Calle, número, piso/depto, barrio)_",
      tenant,
    );
  }
};

const getActiveZonesWithFallback = async (
  tenantId: string,
): Promise<DeliveryZone[]> => {
  try {
    return await listActiveDeliveryZones(tenantId);
  } catch {
    const allZones = await listDeliveryZones(tenantId);
    return allZones.filter((z) => z.isActive !== false);
  }
};

const handleDeliveryZoneSelection = async (
  phoneNumber: string,
  text: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  const zoneIndex = parseInt(text.trim(), 10) - 1;

  try {
    const zones = await getActiveZonesWithFallback(state.tenantId);

    if (isNaN(zoneIndex) || zoneIndex < 0 || zoneIndex >= zones.length) {
      await sendMessage(
        phoneNumber,
        `Por favor, escribí un número válido entre 1 y ${zones.length}.`,
        tenant,
      );
      return;
    }

    const selectedZone = zones[zoneIndex];

    setConversationState(phoneNumber, {
      ...state,
      step: "awaitingAddress",
      selectedZone,
    });

    await sendMessage(
      phoneNumber,
      `Zona: *${selectedZone.name}* (Envío: ${formatPrice(selectedZone.price)})\n\n` +
        `Por favor, escribí tu *dirección completa*.\n_(Calle, número, piso/depto)_`,
      tenant,
    );
  } catch (error) {
    logger.error("Error al seleccionar zona", error);
    await sendMessage(
      phoneNumber,
      "Hubo un error. Intenta nuevamente.",
      tenant,
    );
  }
};

const handleAddressInput = async (
  phoneNumber: string,
  text: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  const address = text.trim();

  if (address.length < 5) {
    await sendMessage(
      phoneNumber,
      "Por favor, escribí una dirección más completa.",
      tenant,
    );
    return;
  }

  setConversationState(phoneNumber, {
    ...state,
    step: "awaitingDeliveryNotes",
    deliveryAddress: address,
  });

  await sendMessage(
    phoneNumber,
    `📍 Dirección: *${address}*\n\n` +
      `Escribí una *referencia* para encontrarte más fácil.\n` +
      `_Ej: Casa con portón negro, al lado de la farmacia, etc._`,
    tenant,
  );
};

const handleDeliveryNotesInput = async (
  phoneNumber: string,
  text: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  const notes = text.trim();

  setConversationState(phoneNumber, {
    ...state,
    deliveryNotes: notes,
  });

  await askPaymentMethod(
    phoneNumber,
    { ...state, deliveryNotes: notes },
    tenant,
  );
};

// ============================================================================
// FLUJO DE PAGO
// ============================================================================

const askPaymentMethod = async (
  phoneNumber: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  setConversationState(phoneNumber, {
    ...state,
    step: "selectingPayment",
  });

  await sendInteractiveButtons(
    phoneNumber,
    "¿Cómo querés pagar?",
    [
      { id: "btn_efectivo", title: "💵 Efectivo" },
      { id: "btn_transferencia", title: "💳 Transferencia" },
    ],
    tenant,
  );
};

const handlePaymentSelection = async (
  phoneNumber: string,
  text: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  const normalized = text.trim().toLowerCase();

  let paymentMethod: "efectivo" | "transferencia";

  if (
    normalized === "btn_efectivo" ||
    normalized === "1" ||
    normalized.includes("efectivo")
  ) {
    paymentMethod = "efectivo";
  } else if (
    normalized === "btn_transferencia" ||
    normalized === "2" ||
    normalized.includes("transferencia")
  ) {
    paymentMethod = "transferencia";
  } else {
    await sendInteractiveButtons(
      phoneNumber,
      "Por favor, seleccioná un método de pago:",
      [
        { id: "btn_efectivo", title: "💵 Efectivo" },
        { id: "btn_transferencia", title: "💳 Transferencia" },
      ],
      tenant,
    );
    return;
  }

  await showOrderSummary(phoneNumber, { ...state, paymentMethod }, tenant);
};

// ============================================================================
// RESUMEN Y CONFIRMACIÓN
// ============================================================================

const showOrderSummary = async (
  phoneNumber: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  const deliveryCost = state.selectedZone?.price ?? 0;
  const paymentText =
    state.paymentMethod === "efectivo" ? "💵 Efectivo" : "💳 Transferencia";

  let orderTypeText = "🏪 Retiro en local";
  if (state.orderType === "delivery") {
    orderTypeText = `🚗 Delivery a: ${state.deliveryAddress}`;
    if (state.selectedZone) {
      orderTypeText += `\n📍 Zona: ${state.selectedZone.name}`;
    }
    if (state.deliveryNotes) {
      orderTypeText += `\n📝 Referencia: ${state.deliveryNotes}`;
    }
  }

  setConversationState(phoneNumber, {
    ...state,
    step: "confirmingOrder",
  });

  await sendMessage(
    phoneNumber,
    `📋 *Resumen de tu pedido*\n\n` +
      `${formatCart(state.cart, deliveryCost)}\n\n` +
      `${orderTypeText}\n` +
      `Pago: ${paymentText}`,
    tenant,
  );

  await sendInteractiveButtons(
    phoneNumber,
    "¿Confirmamos el pedido?",
    [
      { id: "btn_confirmar", title: "✅ Confirmar" },
      { id: "btn_cancelar", title: "❌ Cancelar" },
    ],
    tenant,
  );
};

const handleOrderConfirmation = async (
  phoneNumber: string,
  text: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  const normalized = text.trim().toLowerCase();

  if (normalized === "btn_cancelar" || normalized.includes("cancelar")) {
    resetConversation(phoneNumber);
    await sendMessage(
      phoneNumber,
      "Pedido cancelado. ¡Esperamos verte pronto! 🍔",
      tenant,
    );
    return;
  }

  if (normalized !== "btn_confirmar" && !normalized.includes("confirmar")) {
    await sendInteractiveButtons(
      phoneNumber,
      "Por favor, confirmá o cancelá el pedido:",
      [
        { id: "btn_confirmar", title: "✅ Confirmar" },
        { id: "btn_cancelar", title: "❌ Cancelar" },
      ],
      tenant,
    );
    return;
  }

  // Crear la orden
  try {
    const deliveryCost = state.selectedZone?.price ?? 0;

    const items: OrderItem[] = state.cart.map((cartItem) => {
      let unitPrice = cartItem.product.price;
      const customizationsTotal = cartItem.customizations
        .filter((c) => c.type === "agregar")
        .reduce((sum, c) => sum + c.extraPrice, 0);
      unitPrice += customizationsTotal;

      const itemTotal = unitPrice * cartItem.quantity;

      return {
        productId: cartItem.product.id,
        productName: cartItem.product.name,
        quantity: cartItem.quantity,
        unitPrice,
        customizations: cartItem.customizations,
        itemTotal,
      };
    });

    // Determinar si el pago es con Mercado Pago
    const useMercadoPago =
      state.paymentMethod === "transferencia" &&
      hasMercadoPagoConfigured(tenant);

    const orderInput: CreateOrderInput = {
      tenantId: state.tenantId,
      customerName: state.customerName || CUSTOMER_FALLBACK_NAME,
      customerPhone: phoneNumber,
      whatsappChatId: phoneNumber,
      items,
      orderType: state.orderType || "pickup",
      deliveryCost: state.orderType === "delivery" ? deliveryCost : 0,
      paymentMethod: state.paymentMethod || "efectivo",
    };

    // Agregar campos opcionales solo si tienen valor (Firestore no acepta undefined)
    if (state.paymentMethod === "transferencia") {
      orderInput.paymentStatus = "pendiente";
    }
    if (useMercadoPago) {
      orderInput.status = "pendiente_pago";
    }

    if (state.orderType === "delivery") {
      if (state.deliveryAddress)
        orderInput.deliveryAddress = state.deliveryAddress;
      if (state.selectedZone) {
        orderInput.deliveryZoneId = state.selectedZone.id;
        orderInput.deliveryZoneName = state.selectedZone.name;
      }
      if (state.deliveryNotes) orderInput.deliveryNotes = state.deliveryNotes;
    }

    const order = await createOrder(orderInput);
    resetConversation(phoneNumber);

    const estimatedTime =
      state.orderType === "delivery" ? "40-50 minutos" : "20-30 minutos";

    // Si es transferencia y hay MP configurado, generar link de pago
    if (
      state.paymentMethod === "transferencia" &&
      hasMercadoPagoConfigured(tenant)
    ) {
      try {
        const mpItems = state.cart.map((cartItem, index) => ({
          id: `item-${index}`,
          title: cartItem.product.name,
          quantity: cartItem.quantity,
          unit_price:
            cartItem.product.price +
            cartItem.customizations
              .filter((c) => c.type === "agregar")
              .reduce((sum, c) => sum + c.extraPrice, 0),
          currency_id: "ARS",
        }));

        // Agregar costo de delivery si aplica
        if (deliveryCost > 0) {
          mpItems.push({
            id: "delivery",
            title: "Costo de delivery",
            quantity: 1,
            unit_price: deliveryCost,
            currency_id: "ARS",
          });
        }

        const preference = await createPaymentPreference(
          tenant,
          order.id,
          mpItems,
          phoneNumber,
          state.customerName || CUSTOMER_FALLBACK_NAME,
        );

        await sendMessage(
          phoneNumber,
          `⏳ *Pedido pendiente de pago*\n\n` +
            `Número de pedido: *#${order.id.slice(-6).toUpperCase()}*\n\n` +
            `💳 *Para confirmar tu pedido, realizá el pago:*\n\n` +
            `👉 ${preference.initPoint}\n\n` +
            `⚠️ *Tu pedido NO será preparado hasta confirmar el pago.*\n\n` +
            `Te enviaremos un mensaje cuando recibamos la confirmación.\n\n` +
            `Tiempo estimado después del pago: ${estimatedTime}`,
          tenant,
        );
        return;
      } catch (mpError) {
        logger.error("Error al crear preferencia de Mercado Pago", mpError);
        // Si falla MP, mostrar datos de transferencia manual
        await sendMessage(
          phoneNumber,
          `✅ *¡Pedido confirmado!*\n\n` +
            `Número de pedido: *#${order.id.slice(-6).toUpperCase()}*\n\n` +
            `⚠️ No pudimos generar el link de pago automático.\n` +
            `Por favor, coordiná el pago con el local.\n\n` +
            `Tiempo estimado: ${estimatedTime}\n\n` +
            `¡Gracias por elegirnos! 🍔`,
          tenant,
        );
        return;
      }
    }

    // Pago en efectivo o sin MP configurado
    await sendMessage(
      phoneNumber,
      `✅ *¡Pedido confirmado!*\n\n` +
        `Número de pedido: *#${order.id.slice(-6).toUpperCase()}*\n\n` +
        `Tiempo estimado: ${estimatedTime}\n\n` +
        `Te avisaremos cuando tu pedido esté listo. ¡Gracias por elegirnos! 🍔`,
      tenant,
    );
  } catch (error) {
    logger.error("Error al crear el pedido", error);

    if (isHttpError(error)) {
      await sendMessage(
        phoneNumber,
        `No se pudo crear el pedido: ${error.message}`,
        tenant,
      );
    } else {
      await sendMessage(
        phoneNumber,
        "Hubo un problema al procesar tu pedido. Por favor, intenta nuevamente.",
        tenant,
      );
    }
    resetConversation(phoneNumber);
  }
};

// ============================================================================
// PUNTO DE ENTRADA PRINCIPAL - MENSAJES DE TEXTO
// ============================================================================

export const processIncomingMessage = async (
  messagePayload: {
    from: string;
    messageId: string;
    text: string;
    timestamp: string;
    contactName?: string;
  },
  tenant: Tenant,
): Promise<void> => {
  const { from: phoneNumber, text, contactName } = messagePayload;

  if (!text || text.trim().length === 0) {
    return;
  }

  const normalized = text.trim().toLowerCase();
  const state = getConversationState(phoneNumber, tenant.id);

  // Comando cancelar siempre funciona
  if (normalized === CANCEL_KEYWORD) {
    resetConversation(phoneNumber);
    await sendMessage(
      phoneNumber,
      "Pedido cancelado. ¡Esperamos verte pronto! 🍔",
      tenant,
    );
    return;
  }

  // Manejar según el paso actual
  switch (state.step) {
    case "idle":
      // Cualquier mensaje cuando está idle → enviar bienvenida
      await sendWelcomeMessage(phoneNumber, tenant, contactName);
      break;

    case "askingCustomization":
      await handleCustomizationQuestion(phoneNumber, text, state, tenant);
      break;

    case "selectingBurgerToCustomize":
      await handleBurgerSelection(phoneNumber, text, state, tenant);
      break;

    case "selectingCustomizationAction":
      await handleCustomizationAction(phoneNumber, text, state, tenant);
      break;

    case "selectingIngredientToAdd":
      await handleIngredientToAdd(phoneNumber, text, state, tenant);
      break;

    case "selectingIngredientToRemove":
      await handleIngredientToRemove(phoneNumber, text, state, tenant);
      break;

    case "askingExtras":
      await handleExtrasQuestion(phoneNumber, text, state, tenant);
      break;

    case "selectingExtras":
      await handleExtrasSelection(phoneNumber, text, state, tenant);
      break;

    case "selectingOrderType":
      await handleOrderTypeSelection(phoneNumber, text, state, tenant);
      break;

    case "selectingDeliveryZone":
      await handleDeliveryZoneSelection(phoneNumber, text, state, tenant);
      break;

    case "awaitingAddress":
      await handleAddressInput(phoneNumber, text, state, tenant);
      break;

    case "awaitingDeliveryNotes":
      await handleDeliveryNotesInput(phoneNumber, text, state, tenant);
      break;

    case "selectingPayment":
      await handlePaymentSelection(phoneNumber, text, state, tenant);
      break;

    case "confirmingOrder":
      await handleOrderConfirmation(phoneNumber, text, state, tenant);
      break;

    default:
      await sendWelcomeMessage(phoneNumber, tenant, contactName);
  }
};

// ============================================================================
// PUNTO DE ENTRADA - ÓRDENES DEL CATÁLOGO DE WHATSAPP
// ============================================================================

interface CatalogOrderItem {
  productRetailerId: string;
  quantity: number;
  itemPrice: string;
  currency: string;
}

/**
 * Procesa una orden del catálogo de WhatsApp
 */
export const processCatalogOrder = async (
  orderPayload: {
    from: string;
    messageId: string;
    timestamp: string;
    contactName?: string;
    catalogId: string;
    productItems: CatalogOrderItem[];
    text?: string;
  },
  tenant: Tenant,
): Promise<void> => {
  const { from: phoneNumber, productItems, contactName } = orderPayload;

  logger.info(
    `Procesando orden de catálogo de ${phoneNumber}: ${productItems.length} producto(s)`,
  );

  if (productItems.length === 0) {
    await sendMessage(
      phoneNumber,
      "No se encontraron productos en tu selección. Intenta nuevamente desde el catálogo.",
      tenant,
    );
    return;
  }

  try {
    const state = getConversationState(phoneNumber, tenant.id);
    const cart: CartItem[] = [];
    const productsNotFound: string[] = [];
    const productsAdded: { name: string; quantity: number }[] = [];

    // Procesar cada producto del catálogo
    for (const item of productItems) {
      try {
        const product = await getProductById(tenant.id, item.productRetailerId);

        if (!product.available) {
          productsNotFound.push(item.productRetailerId);
          continue;
        }

        cart.push({
          product,
          quantity: item.quantity,
          customizations: [],
          extras: [],
        });

        productsAdded.push({ name: product.name, quantity: item.quantity });
        logger.info(`Producto agregado: ${product.name} x${item.quantity}`);
      } catch {
        logger.warn(`Producto no encontrado: ${item.productRetailerId}`);
        productsNotFound.push(item.productRetailerId);
      }
    }

    if (productsAdded.length === 0) {
      await sendMessage(
        phoneNumber,
        "Lo sentimos, los productos seleccionados no están disponibles. 😔\n\n" +
          "Revisá el catálogo para ver las opciones disponibles.",
        tenant,
      );
      return;
    }

    // Construir mensaje de confirmación
    let confirmMessage = "🛒 *Recibimos tu pedido:*\n\n";
    for (const item of productsAdded) {
      confirmMessage += `• ${item.quantity}x ${item.name}\n`;
    }

    if (productsNotFound.length > 0) {
      confirmMessage += `\n⚠️ _${productsNotFound.length} producto(s) no estaban disponibles._\n`;
    }

    // Guardar estado con el carrito
    const newState: ConversationState = {
      ...state,
      cart,
      customerName: contactName || state.customerName,
    };

    setConversationState(phoneNumber, newState);

    await sendMessage(phoneNumber, confirmMessage, tenant);

    // Ir al flujo de personalización
    await askCustomization(phoneNumber, newState, tenant);
  } catch (error) {
    logger.error("Error procesando orden de catálogo", error);
    await sendMessage(
      phoneNumber,
      "Hubo un error al procesar tu selección. Por favor, intenta nuevamente.",
      tenant,
    );
  }
};
