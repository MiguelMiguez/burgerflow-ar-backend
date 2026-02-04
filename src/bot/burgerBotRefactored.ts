import { logger } from "../utils/logger";
import { sendMessage } from "../services/metaService";
import { createOrder } from "../services/orderService";
import {
  listAvailableProducts,
  getProductById,
} from "../services/productService";
import type { Tenant } from "../models/tenant";
import type { Product } from "../models/product";
import type {
  OrderItem,
  OrderCustomization,
  CreateOrderInput,
} from "../models/order";
import { isHttpError } from "../utils/httpError";

/**
 * Bot de Pedidos de Hamburguesas refactorizado para Meta WhatsApp Business API
 * Este bot permite a los clientes:
 * - Ver el menú de productos
 * - Agregar productos al carrito
 * - Personalizar ingredientes
 * - Seleccionar delivery o retiro
 * - Confirmar pedidos
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
  | "askingCustomization"
  | "selectingCustomization"
  | "askingMoreProducts"
  | "selectingOrderType"
  | "awaitingAddress"
  | "selectingPayment"
  | "confirmingOrder";

interface CartItem {
  product: Product;
  quantity: number;
  customizations: OrderCustomization[];
  notes?: string;
}

interface ConversationState {
  step: ConversationStep;
  tenantId: string;
  cart: CartItem[];
  currentProduct?: Product;
  currentQuantity?: number;
  orderType?: "delivery" | "pickup";
  deliveryAddress?: string;
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

const formatCart = (cart: CartItem[]): string => {
  if (cart.length === 0) {
    return "Tu carrito está vacío.";
  }

  let total = 0;
  const items = cart.map((item, index) => {
    const itemTotal = item.product.price * item.quantity;
    total += itemTotal;

    let customizationText = "";
    if (item.customizations.length > 0) {
      const mods = item.customizations.map(
        (c) => `${c.type === "agregar" ? "+" : "-"} ${c.ingredientName}`,
      );
      customizationText = `\n   _${mods.join(", ")}_`;
    }

    return `${index + 1}. ${item.quantity}x ${item.product.name} - ${formatPrice(itemTotal)}${customizationText}`;
  });

  return `🛒 *Tu Pedido*\n\n${items.join("\n")}\n\n*Total: ${formatPrice(total)}*`;
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

  const cartItem: CartItem = {
    product: state.currentProduct,
    quantity,
    customizations: [],
  };

  const updatedCart = [...state.cart, cartItem];

  setConversationState(phoneNumber, {
    ...state,
    step: "askingCustomization",
    cart: updatedCart,
    currentQuantity: quantity,
  });

  await sendMessage(
    phoneNumber,
    `Agregaste ${quantity}x *${state.currentProduct.name}* al carrito.\n\n¿Deseas personalizar este producto? (quitar/agregar ingredientes)\n\nResponde *si* o *no*.`,
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

  if (normalized === "si" || normalized === "sí") {
    if (!state.currentProduct) {
      await askForMoreProducts(phoneNumber, state, tenant);
      return;
    }

    const ingredients = state.currentProduct.ingredients
      .filter((ing) => ing.isRemovable || ing.isExtra)
      .map((ing, index) => {
        const type = ing.isExtra ? "(extra)" : "(quitar)";
        const price =
          ing.extraPrice > 0 ? ` +${formatPrice(ing.extraPrice)}` : "";
        return `${index + 1}. ${ing.ingredientName} ${type}${price}`;
      });

    if (ingredients.length === 0) {
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
      step: "selectingCustomization",
    });

    await sendMessage(
      phoneNumber,
      `Opciones de personalización:\n\n${ingredients.join("\n")}\n\nEscribe el número de la opción o *listo* para continuar.`,
      tenant,
    );
  } else {
    await askForMoreProducts(phoneNumber, state, tenant);
  }
};

const handleCustomizationSelection = async (
  phoneNumber: string,
  text: string,
  state: ConversationState,
  tenant: Tenant,
): Promise<void> => {
  const normalized = text.trim().toLowerCase();

  if (normalized === "listo") {
    await askForMoreProducts(phoneNumber, state, tenant);
    return;
  }

  const optionIndex = parseInt(text, 10) - 1;

  if (!state.currentProduct) {
    await askForMoreProducts(phoneNumber, state, tenant);
    return;
  }

  const availableCustomizations = state.currentProduct.ingredients.filter(
    (ing) => ing.isRemovable || ing.isExtra,
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
    type: selectedIngredient.isExtra ? "agregar" : "quitar",
    extraPrice: selectedIngredient.extraPrice || 0,
  };

  const updatedCart = [...state.cart];
  const lastItem = updatedCart[updatedCart.length - 1];
  if (lastItem) {
    lastItem.customizations.push(customization);
  }

  setConversationState(phoneNumber, {
    ...state,
    cart: updatedCart,
  });

  const action = customization.type === "agregar" ? "Agregaste" : "Quitaste";
  await sendMessage(
    phoneNumber,
    `${action} *${customization.ingredientName}*.\n\nEscribe otro número para más cambios o *listo* para continuar.`,
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
    setConversationState(phoneNumber, {
      ...state,
      step: "selectingOrderType",
    });

    await sendMessage(
      phoneNumber,
      "¿Cómo deseas recibir tu pedido?\n\n*1.* Delivery (envío a domicilio)\n*2.* Retiro en local",
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
    setConversationState(phoneNumber, {
      ...state,
      step: "awaitingAddress",
      orderType: "delivery",
    });

    await sendMessage(
      phoneNumber,
      "Por favor, escribe tu *dirección completa* para el envío.\n\n_(Calle, número, piso/depto, barrio/localidad)_",
      tenant,
    );
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

  const deliveryCost = 500; // Placeholder - TODO: calcular según zona

  setConversationState(phoneNumber, {
    ...state,
    step: "selectingPayment",
    deliveryAddress: address,
  });

  await sendMessage(
    phoneNumber,
    `Dirección registrada: *${address}*\nCosto de envío: ${formatPrice(deliveryCost)}\n\n¿Cómo deseas pagar?\n\n*1.* Efectivo\n*2.* Transferencia`,
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

  setConversationState(phoneNumber, {
    ...state,
    step: "confirmingOrder",
    paymentMethod,
    customerName: customerName || CUSTOMER_FALLBACK_NAME,
  });

  const subtotal = state.cart.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0,
  );
  const deliveryCost = state.orderType === "delivery" ? 500 : 0;
  const total = subtotal + deliveryCost;

  const paymentText =
    paymentMethod === "efectivo" ? "💵 Efectivo" : "💳 Transferencia";
  const orderTypeText =
    state.orderType === "delivery"
      ? `🚗 Delivery a: ${state.deliveryAddress}`
      : "🏪 Retiro en local";

  await sendMessage(
    phoneNumber,
    `📋 *Resumen de tu pedido*\n\n` +
      `${formatCart(state.cart)}\n\n` +
      `${orderTypeText}\n` +
      `${state.orderType === "delivery" ? `Envío: ${formatPrice(deliveryCost)}\n` : ""}` +
      `Pago: ${paymentText}\n\n` +
      `*TOTAL: ${formatPrice(total)}*\n\n` +
      `¿Confirmamos el pedido?\n\nResponde *confirmar* o *cancelar*.`,
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

  try {
    const items: OrderItem[] = state.cart.map((cartItem) => {
      const extrasTotal = cartItem.customizations
        .filter((c) => c.type === "agregar")
        .reduce((sum, c) => sum + c.extraPrice, 0);

      const unitPrice = cartItem.product.price + extrasTotal;
      const itemTotal = unitPrice * cartItem.quantity;

      const item: OrderItem = {
        productId: cartItem.product.id,
        productName: cartItem.product.name,
        quantity: cartItem.quantity,
        unitPrice,
        customizations: cartItem.customizations,
        itemTotal,
      };

      if (cartItem.notes) {
        item.notes = cartItem.notes;
      }

      return item;
    });

    const deliveryCost = state.orderType === "delivery" ? 500 : 0;

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

    if (state.orderType === "delivery" && state.deliveryAddress) {
      orderInput.deliveryAddress = state.deliveryAddress;
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
    logger.error("Error al crear el pedido");

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
 * Esta función es llamada por el webhookController cuando llega un mensaje
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

  // Cancelar en cualquier momento
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

  // Manejar estados de conversación
  switch (state.step) {
    case "selectingProduct":
      await handleProductSelection(phoneNumber, text, state, tenant);
      return;

    case "selectingQuantity":
      await handleQuantitySelection(phoneNumber, text, state, tenant);
      return;

    case "askingCustomization":
      await handleCustomizationQuestion(phoneNumber, text, state, tenant);
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

    case "awaitingAddress":
      await handleAddressInput(phoneNumber, text, state, tenant);
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

  // Comandos en estado idle
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

  // Si el usuario escribe un número, podría querer pedir
  const maybeProductNumber = parseInt(normalized, 10);
  if (!isNaN(maybeProductNumber) && maybeProductNumber > 0) {
    await startOrderFlow(phoneNumber, tenant);
    // Simular que el usuario escribió el número después de ver el menú
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
