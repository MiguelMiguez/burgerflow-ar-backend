import { logger } from "../utils/logger";
import { sendMessage } from "../services/metaService";
import { createOrder } from "../services/orderService";
import {
  listAvailableProducts,
  getProductById,
} from "../services/productService";
import { listActiveDeliveryZones, listDeliveryZones } from "../services/deliveryZoneService";
import { listActiveExtras } from "../services/extraService";
import { getIngredientById } from "../services/ingredientService";
import type { Tenant } from "../models/tenant";
import type { Product } from "../models/product";
import type { DeliveryZone } from "../models/deliveryZone";
import type { Extra } from "../models/extra";
import type {
  OrderItem,
  OrderCustomization,
  OrderExtra,
  CreateOrderInput,
} from "../models/order";
import { isHttpError } from "../utils/httpError";

/**
 * Bot de Pedidos de Hamburguesas para Meta WhatsApp Business API
 * Incluye:
 * - Selección de extras para productos
 * - Selección de zona de delivery con costos
 * - Referencias obligatorias para delivery
 * - Verificación de stock en tiempo real
 */

const HELP_MESSAGE = [
  "🍔 *BurgerFlow* - Sistema de Pedidos",
  "",
  "Comandos disponibles:",
  "• *menu* - Ver esta ayuda",
  "• *hamburguesas* - Ver el menú disponible",
  "• *pedir* - Iniciar un nuevo pedido",
  "• *cancelar* - Cancelar el pedido actual",
  "",
  "También puedes escribirnos libremente y te ayudaremos con tu pedido.",
].join("\n");

type ConversationStep =
  | "idle"
  | "selectingProduct"
  | "selectingQuantity"
  | "selectingExtras"
  | "askingCustomization"
  | "selectingCustomizationType"
  | "selectingCustomization"
  | "askingMoreProducts"
  | "selectingOrderType"
  | "selectingDeliveryZone"
  | "awaitingAddress"
  | "awaitingDeliveryNotes"
  | "selectingPayment"
  | "confirmingOrder";

interface SelectedExtra {
  extra: Extra;
  quantity: number;
}

interface CartItem {
  product: Product;
  quantity: number;
  customizations: OrderCustomization[];
  extras: SelectedExtra[];
  notes?: string;
}

interface ConversationState {
  step: ConversationStep;
  tenantId: string;
  cart: CartItem[];
  currentProduct?: Product;
  currentQuantity?: number;
  availableExtras?: Extra[];
  customizationType?: "agregar" | "quitar";
  orderType?: "delivery" | "pickup";
  selectedZone?: DeliveryZone;
  deliveryAddress?: string;
  deliveryNotes?: string;
  paymentMethod?: "efectivo" | "transferencia";
  customerName?: string;
}

// Almacenar conversaciones en memoria (por número de teléfono)
const conversations = new Map<string, ConversationState>();

const getConversationState = (
  phoneNumber: string,
  tenantId: string,
): ConversationState => {
  return (
    conversations.get(phoneNumber) ?? {
      step: "idle",
      tenantId,
      cart: [],
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

const CANCEL_KEYWORD = "cancelar";
const CUSTOMER_FALLBACK_NAME = "Cliente WhatsApp";

const formatPrice = (price: number): string => {
  return `$${price.toLocaleString("es-AR", { minimumFractionDigits: 0 })}`;
};

const formatProducts = (products: Product[]): string => {
  if (products.length === 0) {
    return "No hay productos disponibles en este momento.";
  }

  const items = products.map((product, index) => {
    const description = product.description
      ? `\n   ${product.description}`
      : "";
    return `*${index + 1}.* ${product.name} - ${formatPrice(product.price)}${description}`;
  });

  return `🍔 *Nuestro Menú*\n\n${items.join("\n\n")}\n\nEscribe el *número* del producto que deseas o *pedir* para comenzar.`;
};

const formatCart = (cart: CartItem[], deliveryCost: number = 0): string => {
  if (cart.length === 0) {
    return "Tu carrito está vacío.";
  }

  let subtotal = 0;
  const items = cart.map((item, index) => {
    let itemTotal = item.product.price * item.quantity;

    // Sumar extras
    const extrasTotal = item.extras.reduce(
      (sum, e) => sum + e.extra.price * e.quantity * item.quantity,
      0,
    );
    itemTotal += extrasTotal;

    // Sumar customizaciones con precio extra
    const customizationsTotal = item.customizations
      .filter((c) => c.type === "agregar")
      .reduce((sum, c) => sum + c.extraPrice * item.quantity, 0);
    itemTotal += customizationsTotal;

    subtotal += itemTotal;

    let details = "";
    if (item.customizations.length > 0) {
      const mods = item.customizations.map(
        (c) => `${c.type === "agregar" ? "+" : "-"} ${c.ingredientName}`,
      );
      details += `\n   _${mods.join(", ")}_`;
    }
    if (item.extras.length > 0) {
      const extrasList = item.extras.map(
        (e) => `+ ${e.quantity}x ${e.extra.name}`,
      );
      details += `\n   _${extrasList.join(", ")}_`;
    }

    return `${index + 1}. ${item.quantity}x ${item.product.name} - ${formatPrice(itemTotal)}${details}`;
  });

  const total = subtotal + deliveryCost;
  let result = `🛒 *Tu Pedido*\n\n${items.join("\n")}\n\n*Subtotal: ${formatPrice(subtotal)}*`;
  if (deliveryCost > 0) {
    result += `\n*Envío: ${formatPrice(deliveryCost)}*\n*Total: ${formatPrice(total)}*`;
  }
  return result;
};

const startOrderFlow = async (
  phoneNumber: string,
  tenant: Tenant,
): Promise<void> => {
  try {
    const state = getConversationState(phoneNumber, tenant.id);
    const products = await listAvailableProducts(tenant.id);

    if (products.length === 0) {
      await sendMessage(
        phoneNumber,
        "Lo sentimos, no hay productos disponibles en este momento. Intenta más tarde.",
        tenant,
      );
      return;
    }

    setConversationState(phoneNumber, {
      ...state,
      step: "selectingProduct",
      cart: state.cart || [],
    });

    await sendMessage(phoneNumber, formatProducts(products), tenant);
    await sendMessage(
      phoneNumber,
      "Escribe el *número* del producto que deseas agregar.\nEscribe *cancelar* para salir.",
      tenant,
    );
  } catch (error) {
    logger.error("Error al iniciar el flujo de pedido", error);
    await sendMessage(
      phoneNumber,
      "No pudimos cargar el menú en este momento. Intenta más tarde.",
      tenant,
    );
  }
};

const handleProductSelection = async (
  phoneNumber: string,
  text: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  const productIndex = parseInt(text, 10) - 1;

  try {
    const products = await listAvailableProducts(state.tenantId);

    if (
      isNaN(productIndex) ||
      productIndex < 0 ||
      productIndex >= products.length
    ) {
      await sendMessage(
        phoneNumber,
        `Por favor, escribe un número válido entre 1 y ${products.length}.`,
        tenant,
      );
      return;
    }

    const selectedProduct = products[productIndex];

    setConversationState(phoneNumber, {
      ...state,
      step: "selectingQuantity",
      currentProduct: selectedProduct,
    });

    await sendMessage(
      phoneNumber,
      `Seleccionaste *${selectedProduct.name}* (${formatPrice(selectedProduct.price)})\n\n¿Cuántas unidades deseas?`,
      tenant,
    );
  } catch (error) {
    logger.error("Error al seleccionar producto", error);
    await sendMessage(
      phoneNumber,
      "Hubo un error. Intenta nuevamente.",
      tenant,
    );
  }
};

const handleQuantitySelection = async (
  phoneNumber: string,
  text: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  const quantity = parseInt(text, 10);

  if (isNaN(quantity) || quantity < 1 || quantity > 10) {
    await sendMessage(
      phoneNumber,
      "Por favor, escribe una cantidad válida (1-10).",
      tenant,
    );
    return;
  }

  if (!state.currentProduct) {
    await sendMessage(
      phoneNumber,
      "Error interno. Por favor, comienza de nuevo con *pedir*.",
      tenant,
    );
    resetConversation(phoneNumber);
    return;
  }

  // Crear item del carrito
  const cartItem: CartItem = {
    product: state.currentProduct,
    quantity,
    customizations: [],
    extras: [],
  };

  const updatedCart = [...state.cart, cartItem];

  // Verificar si hay extras disponibles
  try {
    const extras = await listActiveExtras(state.tenantId);

    if (extras.length > 0) {
      // Hay extras, preguntar si quiere agregar
      setConversationState(phoneNumber, {
        ...state,
        step: "selectingExtras",
        cart: updatedCart,
        currentQuantity: quantity,
        availableExtras: extras,
      });

      const extrasList = extras.map(
        (extra, index) =>
          `*${index + 1}.* ${extra.name} - ${formatPrice(extra.price)}`,
      );

      await sendMessage(
        phoneNumber,
        `Agregaste ${quantity}x *${state.currentProduct.name}* al carrito.\n\n` +
          `🍟 *¿Deseas agregar extras?*\n\n${extrasList.join("\n")}\n\n` +
          `Escribe el *número* del extra o *no* para continuar sin extras.`,
        tenant,
      );
    } else {
      // No hay extras, ir a personalización
      setConversationState(phoneNumber, {
        ...state,
        step: "askingCustomization",
        cart: updatedCart,
        currentQuantity: quantity,
      });

      await sendMessage(
        phoneNumber,
        `Agregaste ${quantity}x *${state.currentProduct.name}* al carrito.\n\n¿Deseas agregar o quitar algo?\n\n*1.* Sí\n*2.* No`,
        tenant,
      );
    }
  } catch (error) {
    logger.error("Error al obtener extras", error);
    // Continuar sin extras
    setConversationState(phoneNumber, {
      ...state,
      step: "askingCustomization",
      cart: updatedCart,
      currentQuantity: quantity,
    });

    await sendMessage(
      phoneNumber,
      `Agregaste ${quantity}x *${state.currentProduct.name}* al carrito.\n\n¿Deseas agregar o quitar algo?\n\n*1.* Sí\n*2.* No`,
      tenant,
    );
  }
};

const handleExtrasSelection = async (
  phoneNumber: string,
  text: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  const normalized = text.trim().toLowerCase();

  // Si dice "no" o "listo", continuar al siguiente paso
  if (normalized === "no" || normalized === "listo") {
    setConversationState(phoneNumber, {
      ...state,
      step: "askingCustomization",
      availableExtras: undefined,
    });

    await sendMessage(
      phoneNumber,
      `¿Deseas agregar o quitar algo del producto?\n\n*1.* Sí\n*2.* No`,
      tenant,
    );
    return;
  }

  const extraIndex = parseInt(text, 10) - 1;
  const extras = state.availableExtras || [];

  if (isNaN(extraIndex) || extraIndex < 0 || extraIndex >= extras.length) {
    await sendMessage(
      phoneNumber,
      `Escribe un número válido (1-${extras.length}), *no* para continuar sin extras, o *listo* si terminaste.`,
      tenant,
    );
    return;
  }

  const selectedExtra = extras[extraIndex];

  // Agregar extra al último item del carrito
  const updatedCart = [...state.cart];
  const lastItem = updatedCart[updatedCart.length - 1];
  if (lastItem) {
    const existingExtra = lastItem.extras.find(
      (e) => e.extra.id === selectedExtra.id,
    );
    if (existingExtra) {
      existingExtra.quantity += 1;
    } else {
      lastItem.extras.push({ extra: selectedExtra, quantity: 1 });
    }
  }

  setConversationState(phoneNumber, {
    ...state,
    cart: updatedCart,
  });

  await sendMessage(
    phoneNumber,
    `✅ Agregaste *${selectedExtra.name}* (+${formatPrice(selectedExtra.price)})\n\n` +
      `Escribe otro número para más extras o *listo* para continuar.`,
    tenant,
  );
};

const handleCustomizationQuestion = async (
  phoneNumber: string,
  text: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  const normalized = text.trim().toLowerCase();

  if (normalized === "si" || normalized === "sí" || normalized === "1") {
    if (!state.currentProduct) {
      await askForMoreProducts(phoneNumber, state, tenant);
      return;
    }

    // Verificar si hay opciones de personalización disponibles
    const removableIngredients = state.currentProduct.ingredients.filter(
      (ing) => ing.isRemovable,
    );
    const extraIngredients = state.currentProduct.ingredients.filter(
      (ing) => ing.isExtra,
    );

    if (removableIngredients.length === 0 && extraIngredients.length === 0) {
      await sendMessage(
        phoneNumber,
        "Este producto no tiene opciones de personalización disponibles.",
        tenant,
      );
      await askForMoreProducts(phoneNumber, state, tenant);
      return;
    }

    setConversationState(phoneNumber, {
      ...state,
      step: "selectingCustomizationType",
    });

    await sendMessage(
      phoneNumber,
      `¿Qué deseas hacer?\n\n*1.* ➕ Agregar ingredientes\n*2.* ➖ Quitar ingredientes\n\nEscribe el *número* de la opción.`,
      tenant,
    );
  } else if (normalized === "no" || normalized === "2") {
    await askForMoreProducts(phoneNumber, state, tenant);
  } else {
    await sendMessage(
      phoneNumber,
      "Por favor, responde *1* (Sí) o *2* (No).",
      tenant,
    );
  }
};

const handleCustomizationTypeSelection = async (
  phoneNumber: string,
  text: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  const normalized = text.trim().toLowerCase();

  // Opción para continuar sin personalización
  if (normalized === "3" || normalized === "continuar" || normalized === "listo") {
    await askForMoreProducts(phoneNumber, state, tenant);
    return;
  }

  if (!state.currentProduct) {
    await askForMoreProducts(phoneNumber, state, tenant);
    return;
  }

  let customizationType: "agregar" | "quitar";
  let ingredients: { ingredientId: string; ingredientName: string; extraPrice: number }[];

  if (normalized === "1" || normalized.includes("agregar")) {
    customizationType = "agregar";
    ingredients = state.currentProduct.ingredients
      .filter((ing) => ing.isExtra)
      .map((ing) => ({
        ingredientId: ing.ingredientId,
        ingredientName: ing.ingredientName,
        extraPrice: ing.extraPrice || 0,
      }));
  } else if (normalized === "2" || normalized.includes("quitar")) {
    customizationType = "quitar";
    ingredients = state.currentProduct.ingredients
      .filter((ing) => ing.isRemovable)
      .map((ing) => ({
        ingredientId: ing.ingredientId,
        ingredientName: ing.ingredientName,
        extraPrice: 0,
      }));
  } else {
    await sendMessage(
      phoneNumber,
      "Por favor, escribe *1* para agregar, *2* para quitar o *3* para continuar.",
      tenant,
    );
    return;
  }

  if (ingredients.length === 0) {
    await sendMessage(
      phoneNumber,
      `No hay opciones disponibles para ${customizationType}. ¿Deseas hacer otra cosa?\n\n*1.* ➕ Agregar ingredientes\n*2.* ➖ Quitar ingredientes\n*3.* Continuar sin cambios`,
      tenant,
    );
    return;
  }

  setConversationState(phoneNumber, {
    ...state,
    step: "selectingCustomization",
    customizationType,
  });

  const ingredientsList = ingredients.map((ing, index) => {
    const price = ing.extraPrice > 0 ? ` (+${formatPrice(ing.extraPrice)})` : "";
    return `*${index + 1}.* ${ing.ingredientName}${price}`;
  });

  const actionText = customizationType === "agregar" ? "agregar" : "quitar";
  await sendMessage(
    phoneNumber,
    `Ingredientes disponibles para ${actionText}:\n\n${ingredientsList.join("\n")}\n\nEscribe el *número* del ingrediente o *listo* para continuar.`,
    tenant,
  );
};

const handleCustomizationSelection = async (
  phoneNumber: string,
  text: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  const normalized = text.trim().toLowerCase();

  if (normalized === "listo" || normalized === "continuar") {
    // Preguntar si quiere hacer más personalizaciones
    setConversationState(phoneNumber, {
      ...state,
      step: "selectingCustomizationType",
      customizationType: undefined,
    });

    await sendMessage(
      phoneNumber,
      `¿Deseas hacer otra personalización?\n\n*1.* ➕ Agregar ingredientes\n*2.* ➖ Quitar ingredientes\n*3.* Continuar con el pedido`,
      tenant,
    );
    return;
  }

  // Opción 3 desde el menú de tipo de personalización
  if (normalized === "3") {
    await askForMoreProducts(phoneNumber, state, tenant);
    return;
  }

  const optionIndex = parseInt(text, 10) - 1;

  if (!state.currentProduct) {
    await askForMoreProducts(phoneNumber, state, tenant);
    return;
  }

  // Filtrar según el tipo de personalización seleccionado
  const customizationType = state.customizationType || "quitar";
  const availableCustomizations = state.currentProduct.ingredients.filter(
    (ing) => customizationType === "agregar" ? ing.isExtra : ing.isRemovable,
  );

  if (
    isNaN(optionIndex) ||
    optionIndex < 0 ||
    optionIndex >= availableCustomizations.length
  ) {
    await sendMessage(
      phoneNumber,
      `Escribe un número válido (1-${availableCustomizations.length}) o *listo* para continuar.`,
      tenant,
    );
    return;
  }

  const selectedIngredient = availableCustomizations[optionIndex];
  const customization: OrderCustomization = {
    ingredientId: selectedIngredient.ingredientId,
    ingredientName: selectedIngredient.ingredientName,
    type: customizationType,
    extraPrice: customizationType === "agregar" ? (selectedIngredient.extraPrice || 0) : 0,
  };

  const updatedCart = [...state.cart];
  const lastItem = updatedCart[updatedCart.length - 1];
  if (lastItem) {
    // Verificar que no se agregue la misma personalización dos veces
    const alreadyExists = lastItem.customizations.some(
      (c) => c.ingredientId === customization.ingredientId && c.type === customization.type,
    );
    if (!alreadyExists) {
      lastItem.customizations.push(customization);
    }
  }

  setConversationState(phoneNumber, {
    ...state,
    cart: updatedCart,
  });

  const action = customization.type === "agregar" ? "✅ Agregaste" : "❌ Quitaste";
  const priceInfo = customization.extraPrice > 0 ? ` (+${formatPrice(customization.extraPrice)})` : "";
  await sendMessage(
    phoneNumber,
    `${action} *${customization.ingredientName}*${priceInfo}\n\nEscribe otro número para más cambios o *listo* para continuar.`,
    tenant,
  );
};

const askForMoreProducts = async (
  phoneNumber: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  setConversationState(phoneNumber, {
    ...state,
    step: "askingMoreProducts",
    currentProduct: undefined,
    currentQuantity: undefined,
    availableExtras: undefined,
  });

  await sendMessage(phoneNumber, formatCart(state.cart), tenant);
  await sendMessage(
    phoneNumber,
    "¿Deseas agregar otro producto?\n\nResponde *si* para agregar más o *no* para continuar con el pedido.",
    tenant,
  );
};

const handleMoreProductsQuestion = async (
  phoneNumber: string,
  text: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  const normalized = text.trim().toLowerCase();

  if (normalized === "si" || normalized === "sí") {
    await startOrderFlow(phoneNumber, tenant);
  } else {
    // Verificar si el tenant tiene delivery y/o pickup habilitados
    const hasDelivery = tenant.hasDelivery !== false;
    const hasPickup = tenant.hasPickup !== false;

    if (hasDelivery && hasPickup) {
      setConversationState(phoneNumber, {
        ...state,
        step: "selectingOrderType",
      });

      await sendMessage(
        phoneNumber,
        "¿Cómo deseas recibir tu pedido?\n\n*1.* 🚗 Delivery (envío a domicilio)\n*2.* 🏪 Retiro en local",
        tenant,
      );
    } else if (hasDelivery) {
      await handleDeliveryFlow(phoneNumber, state, tenant);
    } else {
      setConversationState(phoneNumber, {
        ...state,
        step: "selectingPayment",
        orderType: "pickup",
      });

      await sendMessage(
        phoneNumber,
        "Perfecto, retiro en local.\n\n¿Cómo deseas pagar?\n\n*1.* Efectivo\n*2.* Transferencia",
        tenant,
      );
    }
  }
};

const handleDeliveryFlow = async (
  phoneNumber: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  try {
    const zones = await listActiveDeliveryZones(state.tenantId);
    logger.info(`Zonas de delivery encontradas para ${tenant.name}: ${zones.length}`);

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
        `🚗 *Seleccioná tu zona de delivery:*\n\n${zonesList.join("\n")}\n\nEscribe el *número* de tu zona.`,
        tenant,
      );
    } else {
      // No hay zonas configuradas - usar envío gratuito o continuar sin costo
      logger.warn(`No hay zonas de delivery para tenant ${tenant.name}, continuando sin costo de envío`);
      setConversationState(phoneNumber, {
        ...state,
        step: "awaitingAddress",
        orderType: "delivery",
        selectedZone: undefined, // Sin zona = sin costo de envío
      });

      await sendMessage(
        phoneNumber,
        "Por favor, escribe tu *dirección completa* para el envío.\n\n_(Calle, número, piso/depto, barrio/localidad)_",
        tenant,
      );
    }
  } catch (error) {
    logger.error(`Error al obtener zonas de delivery para ${tenant.name}:`, error);
    
    // Si hay error de índice, informar al usuario y reintentar sin filtrar
    try {
      // Intentar obtener todas las zonas sin filtrar por isActive
      const allZones = await listDeliveryZones(state.tenantId);
      const activeZones = allZones.filter(z => z.isActive !== false);
      
      if (activeZones.length > 0) {
        setConversationState(phoneNumber, {
          ...state,
          step: "selectingDeliveryZone",
          orderType: "delivery",
        });

        const zonesList = activeZones.map(
          (zone, index) =>
            `*${index + 1}.* ${zone.name} - ${formatPrice(zone.price)}`,
        );

        await sendMessage(
          phoneNumber,
          `🚗 *Seleccioná tu zona de delivery:*\n\n${zonesList.join("\n")}\n\nEscribe el *número* de tu zona.`,
          tenant,
        );
        return;
      }
    } catch (fallbackError) {
      logger.error("Error en fallback de zonas:", fallbackError);
    }

    // Si todo falló, continuar sin zona
    setConversationState(phoneNumber, {
      ...state,
      step: "awaitingAddress",
      orderType: "delivery",
      selectedZone: undefined,
    });

    await sendMessage(
      phoneNumber,
      "Por favor, escribe tu *dirección completa* para el envío.\n\n_(Calle, número, piso/depto, barrio/localidad)_",
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
    normalized === "1" ||
    normalized.includes("delivery") ||
    normalized.includes("envio")
  ) {
    await handleDeliveryFlow(phoneNumber, state, tenant);
  } else if (
    normalized === "2" ||
    normalized.includes("retiro") ||
    normalized.includes("local")
  ) {
    setConversationState(phoneNumber, {
      ...state,
      step: "selectingPayment",
      orderType: "pickup",
    });

    await sendMessage(
      phoneNumber,
      "Perfecto, retiro en local.\n\n¿Cómo deseas pagar?\n\n*1.* Efectivo\n*2.* Transferencia",
      tenant,
    );
  } else {
    await sendMessage(
      phoneNumber,
      "Por favor, escribe *1* para delivery o *2* para retiro en local.",
      tenant,
    );
  }
};

const handleDeliveryZoneSelection = async (
  phoneNumber: string,
  text: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  const zoneIndex = parseInt(text, 10) - 1;

  try {
    const zones = await listActiveDeliveryZones(state.tenantId);

    if (isNaN(zoneIndex) || zoneIndex < 0 || zoneIndex >= zones.length) {
      await sendMessage(
        phoneNumber,
        `Por favor, escribe un número válido entre 1 y ${zones.length}.`,
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
      `Zona seleccionada: *${selectedZone.name}* (Envío: ${formatPrice(selectedZone.price)})\n\nPor favor, escribe tu *dirección completa*.\n\n_(Calle, número, piso/depto)_`,
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

  if (address.length < 10) {
    await sendMessage(
      phoneNumber,
      "Por favor, escribe una dirección más completa para poder enviarte el pedido.",
      tenant,
    );
    return;
  }

  // Pedir referencias obligatorias
  setConversationState(phoneNumber, {
    ...state,
    step: "awaitingDeliveryNotes",
    deliveryAddress: address,
  });

  await sendMessage(
    phoneNumber,
    `📍 Dirección registrada: *${address}*\n\n` +
      `Por favor, escribe una *referencia* para encontrar tu ubicación más fácil.\n\n` +
      `_Ejemplo: Casa con portón negro, al lado de la farmacia, timbre no funciona, etc._`,
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

  if (notes.length < 5) {
    await sendMessage(
      phoneNumber,
      "Por favor, escribe una referencia más detallada para ayudar al repartidor.",
      tenant,
    );
    return;
  }

  const deliveryCost = state.selectedZone?.price ?? 0;

  setConversationState(phoneNumber, {
    ...state,
    step: "selectingPayment",
    deliveryNotes: notes,
  });

  await sendMessage(
    phoneNumber,
    `✅ Referencia guardada: _${notes}_\n\n` +
      `Costo de envío: ${formatPrice(deliveryCost)}\n\n` +
      `¿Cómo deseas pagar?\n\n*1.* 💵 Efectivo\n*2.* 💳 Transferencia`,
    tenant,
  );
};

const handlePaymentSelection = async (
  phoneNumber: string,
  text: string,
  state: ConversationState,
  tenant: Tenant,
  customerName?: string,
): Promise<void> => {
  const normalized = text.trim().toLowerCase();

  let paymentMethod: "efectivo" | "transferencia";

  if (normalized === "1" || normalized.includes("efectivo")) {
    paymentMethod = "efectivo";
  } else if (normalized === "2" || normalized.includes("transferencia")) {
    paymentMethod = "transferencia";
  } else {
    await sendMessage(
      phoneNumber,
      "Por favor, escribe *1* para efectivo o *2* para transferencia.",
      tenant,
    );
    return;
  }

  // Verificar stock antes de mostrar resumen
  const stockCheck = await verifyStock(state, tenant);
  if (!stockCheck.ok) {
    await sendMessage(
      phoneNumber,
      `⚠️ *Lo sentimos*, no hay suficiente stock:\n\n${stockCheck.message}\n\n` +
        `Por favor, modifica tu pedido. Escribe *pedir* para comenzar de nuevo.`,
      tenant,
    );
    resetConversation(phoneNumber);
    return;
  }

  setConversationState(phoneNumber, {
    ...state,
    step: "confirmingOrder",
    paymentMethod,
    customerName: customerName || CUSTOMER_FALLBACK_NAME,
  });

  const subtotal = calculateSubtotal(state.cart);
  const deliveryCost =
    state.orderType === "delivery" ? (state.selectedZone?.price ?? 0) : 0;
  const total = subtotal + deliveryCost;

  const paymentText =
    paymentMethod === "efectivo" ? "💵 Efectivo" : "💳 Transferencia";

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

  await sendMessage(
    phoneNumber,
    `📋 *Resumen de tu pedido*\n\n` +
      `${formatCart(state.cart, deliveryCost)}\n\n` +
      `${orderTypeText}\n` +
      `Pago: ${paymentText}\n\n` +
      `*TOTAL: ${formatPrice(total)}*\n\n` +
      `¿Confirmamos el pedido?\n\nResponde *confirmar* o *cancelar*.`,
    tenant,
  );
};

const calculateSubtotal = (cart: CartItem[]): number => {
  return cart.reduce((sum, item) => {
    let itemTotal = item.product.price * item.quantity;

    const extrasTotal = item.extras.reduce(
      (eSum, e) => eSum + e.extra.price * e.quantity * item.quantity,
      0,
    );
    itemTotal += extrasTotal;

    const customizationsTotal = item.customizations
      .filter((c) => c.type === "agregar")
      .reduce((cSum, c) => cSum + c.extraPrice * item.quantity, 0);
    itemTotal += customizationsTotal;

    return sum + itemTotal;
  }, 0);
};

interface StockCheckResult {
  ok: boolean;
  message: string;
}

const verifyStock = async (
  state: ConversationState,
  _tenant: Tenant,
): Promise<StockCheckResult> => {
  try {
    const productService = await import("../services/productService");
    const ingredientService = await import("../services/ingredientService");

    const issues: string[] = [];

    for (const item of state.cart) {
      const product = await productService.getProductById(
        state.tenantId,
        item.product.id,
      );

      for (const productIng of product.ingredients) {
        try {
          const ingredient = await ingredientService.getIngredientById(
            state.tenantId,
            productIng.ingredientId,
          );

          const requiredQty = productIng.quantity * item.quantity;

          if (ingredient.stock < requiredQty) {
            issues.push(
              `- ${product.name}: falta ${productIng.ingredientName} (${ingredient.stock} disponibles, necesitamos ${requiredQty})`,
            );
          }
        } catch {
          // Ingrediente no encontrado, continuar
        }
      }

      // Verificar stock de extras si tienen linkedProductId
      for (const extraItem of item.extras) {
        if (extraItem.extra.linkedProductId) {
          try {
            const linkedIngredient = await ingredientService.getIngredientById(
              state.tenantId,
              extraItem.extra.linkedProductId,
            );

            const requiredQty =
              extraItem.extra.stockConsumption *
              extraItem.quantity *
              item.quantity;

            if (linkedIngredient.stock < requiredQty) {
              issues.push(
                `- Extra ${extraItem.extra.name}: stock insuficiente (${linkedIngredient.stock} disponibles)`,
              );
            }
          } catch {
            // Ingrediente vinculado no encontrado, continuar
          }
        }
      }
    }

    if (issues.length > 0) {
      return {
        ok: false,
        message: issues.join("\n"),
      };
    }

    return { ok: true, message: "" };
  } catch (error) {
    logger.error("Error al verificar stock", error);
    return { ok: true, message: "" };
  }
};

const handleOrderConfirmation = async (
  phoneNumber: string,
  text: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  const normalized = text.trim().toLowerCase();

  if (normalized === "cancelar") {
    resetConversation(phoneNumber);
    await sendMessage(
      phoneNumber,
      "Pedido cancelado. ¡Esperamos verte pronto! 🍔",
      tenant,
    );
    return;
  }

  if (normalized !== "confirmar") {
    await sendMessage(
      phoneNumber,
      "Escribe *confirmar* para realizar el pedido o *cancelar* para cancelar.",
      tenant,
    );
    return;
  }

  // Verificar stock una vez más antes de confirmar
  const stockCheck = await verifyStock(state, tenant);
  if (!stockCheck.ok) {
    await sendMessage(
      phoneNumber,
      `⚠️ *Lo sentimos*, el stock cambió mientras procesábamos tu pedido:\n\n${stockCheck.message}\n\n` +
        `Por favor, intenta de nuevo. Escribe *pedir* para comenzar.`,
      tenant,
    );
    resetConversation(phoneNumber);
    return;
  }

  try {
    const items: OrderItem[] = state.cart.map((cartItem) => {
      let unitPrice = cartItem.product.price;

      const extrasTotal = cartItem.extras.reduce(
        (sum, e) => sum + e.extra.price * e.quantity,
        0,
      );
      unitPrice += extrasTotal;

      const customizationsTotal = cartItem.customizations
        .filter((c) => c.type === "agregar")
        .reduce((sum, c) => sum + c.extraPrice, 0);
      unitPrice += customizationsTotal;

      const itemTotal = unitPrice * cartItem.quantity;

      const orderExtras: OrderExtra[] = cartItem.extras.map((e) => ({
        extraId: e.extra.id,
        extraName: e.extra.name,
        quantity: e.quantity,
        unitPrice: e.extra.price,
        totalPrice: e.extra.price * e.quantity,
      }));

      const item: OrderItem = {
        productId: cartItem.product.id,
        productName: cartItem.product.name,
        quantity: cartItem.quantity,
        unitPrice,
        customizations: cartItem.customizations,
        extras: orderExtras.length > 0 ? orderExtras : undefined,
        itemTotal,
      };

      if (cartItem.notes) {
        item.notes = cartItem.notes;
      }

      return item;
    });

    const deliveryCost =
      state.orderType === "delivery" ? (state.selectedZone?.price ?? 0) : 0;

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

    if (state.orderType === "delivery") {
      if (state.deliveryAddress) {
        orderInput.deliveryAddress = state.deliveryAddress;
      }
      if (state.selectedZone) {
        orderInput.deliveryZoneId = state.selectedZone.id;
        orderInput.deliveryZoneName = state.selectedZone.name;
      }
      if (state.deliveryNotes) {
        orderInput.deliveryNotes = state.deliveryNotes;
      }
    }

    const order = await createOrder(orderInput);

    resetConversation(phoneNumber);

    const estimatedTime =
      state.orderType === "delivery" ? "40-50 minutos" : "20-30 minutos";

    await sendMessage(
      phoneNumber,
      `✅ *¡Pedido confirmado!*\n\n` +
        `Número de pedido: *#${order.id.slice(-6).toUpperCase()}*\n\n` +
        `Tiempo estimado: ${estimatedTime}\n\n` +
        `Te avisaremos cuando tu pedido esté listo. ¡Gracias por elegirnos! 🍔`,
      tenant,
    );
  } catch (error) {
    logger.error("Error al crear el pedido", {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      orderInput: {
        tenantId: state.tenantId,
        customerName: state.customerName,
        orderType: state.orderType,
        deliveryAddress: state.deliveryAddress,
        itemsCount: state.cart.length,
      },
    });

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

/**
 * Punto de entrada principal del bot
 */
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

  if (normalized === CANCEL_KEYWORD) {
    resetConversation(phoneNumber);
    await sendMessage(
      phoneNumber,
      "Pedido cancelado. Escribe *pedir* para comenzar uno nuevo.",
      tenant,
    );
    return;
  }

  const state = getConversationState(phoneNumber, tenant.id);

  switch (state.step) {
    case "selectingProduct":
      await handleProductSelection(phoneNumber, text, state, tenant);
      return;

    case "selectingQuantity":
      await handleQuantitySelection(phoneNumber, text, state, tenant);
      return;

    case "selectingExtras":
      await handleExtrasSelection(phoneNumber, text, state, tenant);
      return;

    case "askingCustomization":
      await handleCustomizationQuestion(phoneNumber, text, state, tenant);
      return;

    case "selectingCustomizationType":
      await handleCustomizationTypeSelection(phoneNumber, text, state, tenant);
      return;

    case "selectingCustomization":
      await handleCustomizationSelection(phoneNumber, text, state, tenant);
      return;

    case "askingMoreProducts":
      await handleMoreProductsQuestion(phoneNumber, text, state, tenant);
      return;

    case "selectingOrderType":
      await handleOrderTypeSelection(phoneNumber, text, state, tenant);
      return;

    case "selectingDeliveryZone":
      await handleDeliveryZoneSelection(phoneNumber, text, state, tenant);
      return;

    case "awaitingAddress":
      await handleAddressInput(phoneNumber, text, state, tenant);
      return;

    case "awaitingDeliveryNotes":
      await handleDeliveryNotesInput(phoneNumber, text, state, tenant);
      return;

    case "selectingPayment":
      await handlePaymentSelection(
        phoneNumber,
        text,
        state,
        tenant,
        contactName,
      );
      return;

    case "confirmingOrder":
      await handleOrderConfirmation(phoneNumber, text, state, tenant);
      return;
  }

  logger.info(`Mensaje entrante de ${phoneNumber} (${tenant.name}): ${text}`);

  const greetings = [
    "hola",
    "hello",
    "buenas",
    "buenos",
    "buen dia",
    "buenas tardes",
    "buenas noches",
  ];
  if (greetings.some((term) => normalized.startsWith(term))) {
    await sendMessage(
      phoneNumber,
      "¡Hola! 🍔 Bienvenido a *BurgerFlow*\n\n" +
        "Escribe *hamburguesas* para ver nuestro menú o *pedir* para hacer tu pedido.",
      tenant,
    );
    return;
  }

  if (["menu", "help", "ayuda", "opciones"].includes(normalized)) {
    await sendMessage(phoneNumber, HELP_MESSAGE, tenant);
    return;
  }

  if (["hamburguesas", "menu", "carta", "productos"].includes(normalized)) {
    try {
      const products = await listAvailableProducts(state.tenantId);
      await sendMessage(phoneNumber, formatProducts(products), tenant);
    } catch (error) {
      logger.error("Error al obtener productos");
      await sendMessage(
        phoneNumber,
        "No pudimos cargar el menú. Intenta más tarde.",
        tenant,
      );
    }
    return;
  }

  if (["pedir", "ordenar", "quiero", "pedido"].includes(normalized)) {
    await startOrderFlow(phoneNumber, tenant);
    return;
  }

  const maybeProductNumber = parseInt(normalized, 10);
  if (!isNaN(maybeProductNumber) && maybeProductNumber > 0) {
    await startOrderFlow(phoneNumber, tenant);
    const newState = getConversationState(phoneNumber, tenant.id);
    await handleProductSelection(phoneNumber, text, newState, tenant);
    return;
  }

  await sendMessage(
    phoneNumber,
    "No entendí tu mensaje. 🤔\n\n" +
      "Escribe *menu* para ver las opciones o *pedir* para hacer un pedido.",
    tenant,
  );
};
