import path from "node:path";
import qrcode from "qrcode-terminal";
import { Client, LocalAuth, Message } from "whatsapp-web.js";
import env from "../config/env";
import { createOrder, getOrderById } from "../services/orderService";
import {
  listAvailableProducts,
  getProductById,
} from "../services/productService";
import { calculateDeliveryCost } from "../services/deliveryZoneService";
import type { Product } from "../models/product";
import type {
  Order,
  OrderItem,
  OrderCustomization,
  CreateOrderInput,
} from "../models/order";
import { isHttpError } from "../utils/httpError";
import { logger } from "../utils/logger";

// TODO: Configurar tenantId dinámicamente basado en el número de WhatsApp del negocio
const DEFAULT_TENANT_ID = "default";

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

let client: Client | null = null;

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

const conversations = new Map<string, ConversationState>();

const getConversationState = (chatId: string): ConversationState => {
  return (
    conversations.get(chatId) ?? {
      step: "idle",
      tenantId: DEFAULT_TENANT_ID,
      cart: [],
    }
  );
};

const setConversationState = (
  chatId: string,
  state: ConversationState,
): void => {
  conversations.set(chatId, state);
};

const resetConversation = (chatId: string): void => {
  conversations.delete(chatId);
};

const CANCEL_KEYWORD = "cancelar";
const CUSTOMER_FALLBACK_NAME = "Cliente WhatsApp";

const sanitizePhoneNumber = (from: string, rawNumber?: string): string => {
  if (rawNumber && rawNumber.trim().length > 0) {
    return rawNumber.startsWith("+") ? rawNumber : `+${rawNumber}`;
  }
  return from.replace(/@.+$/, "");
};

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

const startOrderFlow = async (message: Message): Promise<void> => {
  try {
    const state = getConversationState(message.from);
    const products = await listAvailableProducts(state.tenantId);

    if (products.length === 0) {
      await message.reply(
        "Lo sentimos, no hay productos disponibles en este momento. Intenta más tarde.",
      );
      return;
    }

    setConversationState(message.from, {
      ...state,
      step: "selectingProduct",
      cart: state.cart || [],
    });

    await message.reply(formatProducts(products));
    await message.reply(
      "Escribe el *número* del producto que deseas agregar.\nEscribe *cancelar* para salir.",
    );
  } catch (error) {
    logger.error("Error al iniciar el flujo de pedido", error);
    await message.reply(
      "No pudimos cargar el menú en este momento. Intenta más tarde.",
    );
  }
};

const handleProductSelection = async (
  message: Message,
  state: ConversationState,
): Promise<void> => {
  const text = message.body.trim();
  const productIndex = parseInt(text, 10) - 1;

  try {
    const products = await listAvailableProducts(state.tenantId);

    if (
      isNaN(productIndex) ||
      productIndex < 0 ||
      productIndex >= products.length
    ) {
      await message.reply(
        `Por favor, escribe un número válido entre 1 y ${products.length}.`,
      );
      return;
    }

    const selectedProduct = products[productIndex];

    setConversationState(message.from, {
      ...state,
      step: "selectingQuantity",
      currentProduct: selectedProduct,
    });

    await message.reply(
      `Seleccionaste *${selectedProduct.name}* (${formatPrice(selectedProduct.price)})\n\n¿Cuántas unidades deseas?`,
    );
  } catch (error) {
    logger.error("Error al seleccionar producto", error);
    await message.reply("Hubo un error. Intenta nuevamente.");
  }
};

const handleQuantitySelection = async (
  message: Message,
  state: ConversationState,
): Promise<void> => {
  const text = message.body.trim();
  const quantity = parseInt(text, 10);

  if (isNaN(quantity) || quantity < 1 || quantity > 10) {
    await message.reply("Por favor, escribe una cantidad válida (1-10).");
    return;
  }

  if (!state.currentProduct) {
    await message.reply(
      "Error interno. Por favor, comienza de nuevo con *pedir*.",
    );
    resetConversation(message.from);
    return;
  }

  // Agregar al carrito
  const cartItem: CartItem = {
    product: state.currentProduct,
    quantity,
    customizations: [],
  };

  const updatedCart = [...state.cart, cartItem];

  setConversationState(message.from, {
    ...state,
    step: "askingCustomization",
    cart: updatedCart,
    currentQuantity: quantity,
  });

  await message.reply(
    `Agregaste ${quantity}x *${state.currentProduct.name}* al carrito.\n\n¿Deseas personalizar este producto? (quitar/agregar ingredientes)\n\nResponde *si* o *no*.`,
  );
};

const handleCustomizationQuestion = async (
  message: Message,
  state: ConversationState,
): Promise<void> => {
  const text = message.body.trim().toLowerCase();

  if (text === "si" || text === "sí") {
    if (!state.currentProduct) {
      await askForMoreProducts(message, state);
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
      await message.reply(
        "Este producto no tiene opciones de personalización disponibles.",
      );
      await askForMoreProducts(message, state);
      return;
    }

    setConversationState(message.from, {
      ...state,
      step: "selectingCustomization",
    });

    await message.reply(
      `Opciones de personalización:\n\n${ingredients.join("\n")}\n\nEscribe el número de la opción o *listo* para continuar.`,
    );
  } else {
    await askForMoreProducts(message, state);
  }
};

const handleCustomizationSelection = async (
  message: Message,
  state: ConversationState,
): Promise<void> => {
  const text = message.body.trim().toLowerCase();

  if (text === "listo") {
    await askForMoreProducts(message, state);
    return;
  }

  const optionIndex = parseInt(text, 10) - 1;

  if (!state.currentProduct) {
    await askForMoreProducts(message, state);
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
    await message.reply(
      `Escribe un número válido (1-${availableCustomizations.length}) o *listo* para continuar.`,
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

  // Agregar customización al último item del carrito
  const updatedCart = [...state.cart];
  const lastItem = updatedCart[updatedCart.length - 1];
  if (lastItem) {
    lastItem.customizations.push(customization);
  }

  setConversationState(message.from, {
    ...state,
    cart: updatedCart,
  });

  const action = customization.type === "agregar" ? "Agregaste" : "Quitaste";
  await message.reply(
    `${action} *${customization.ingredientName}*.\n\nEscribe otro número para más cambios o *listo* para continuar.`,
  );
};

const askForMoreProducts = async (
  message: Message,
  state: ConversationState,
): Promise<void> => {
  setConversationState(message.from, {
    ...state,
    step: "askingMoreProducts",
    currentProduct: undefined,
    currentQuantity: undefined,
  });

  await message.reply(formatCart(state.cart));
  await message.reply(
    "¿Deseas agregar otro producto?\n\nResponde *si* para agregar más o *no* para continuar con el pedido.",
  );
};

const handleMoreProductsQuestion = async (
  message: Message,
  state: ConversationState,
): Promise<void> => {
  const text = message.body.trim().toLowerCase();

  if (text === "si" || text === "sí") {
    await startOrderFlow(message);
  } else {
    setConversationState(message.from, {
      ...state,
      step: "selectingOrderType",
    });

    await message.reply(
      "¿Cómo deseas recibir tu pedido?\n\n*1.* Delivery (envío a domicilio)\n*2.* Retiro en local",
    );
  }
};

const handleOrderTypeSelection = async (
  message: Message,
  state: ConversationState,
): Promise<void> => {
  const text = message.body.trim().toLowerCase();

  if (text === "1" || text.includes("delivery") || text.includes("envio")) {
    setConversationState(message.from, {
      ...state,
      step: "awaitingAddress",
      orderType: "delivery",
    });

    await message.reply(
      "Por favor, escribe tu *dirección completa* para el envío.\n\n_(Calle, número, piso/depto, barrio/localidad)_",
    );
  } else if (
    text === "2" ||
    text.includes("retiro") ||
    text.includes("local")
  ) {
    setConversationState(message.from, {
      ...state,
      step: "selectingPayment",
      orderType: "pickup",
    });

    await message.reply(
      "Perfecto, retiro en local.\n\n¿Cómo deseas pagar?\n\n*1.* Efectivo\n*2.* Transferencia",
    );
  } else {
    await message.reply(
      "Por favor, escribe *1* para delivery o *2* para retiro en local.",
    );
  }
};

const handleAddressInput = async (
  message: Message,
  state: ConversationState,
): Promise<void> => {
  const address = message.body.trim();

  if (address.length < 10) {
    await message.reply(
      "Por favor, escribe una dirección más completa para poder enviarte el pedido.",
    );
    return;
  }

  // TODO: Calcular costo de envío basado en la distancia
  // Por ahora usamos un valor fijo de ejemplo
  const deliveryCost = 500; // Valor placeholder

  setConversationState(message.from, {
    ...state,
    step: "selectingPayment",
    deliveryAddress: address,
  });

  await message.reply(
    `Dirección registrada: *${address}*\nCosto de envío: ${formatPrice(deliveryCost)}\n\n¿Cómo deseas pagar?\n\n*1.* Efectivo\n*2.* Transferencia`,
  );
};

const handlePaymentSelection = async (
  message: Message,
  state: ConversationState,
): Promise<void> => {
  const text = message.body.trim().toLowerCase();

  let paymentMethod: "efectivo" | "transferencia";

  if (text === "1" || text.includes("efectivo")) {
    paymentMethod = "efectivo";
  } else if (text === "2" || text.includes("transferencia")) {
    paymentMethod = "transferencia";
  } else {
    await message.reply(
      "Por favor, escribe *1* para efectivo o *2* para transferencia.",
    );
    return;
  }

  // Obtener nombre del cliente
  let customerName = CUSTOMER_FALLBACK_NAME;
  try {
    const contact = await message.getContact();
    if (contact.pushname?.trim()) {
      customerName = contact.pushname.trim();
    } else if (contact.name?.trim()) {
      customerName = contact.name.trim();
    }
  } catch (error) {
    logger.debug("No se pudo obtener el contacto de WhatsApp");
  }

  setConversationState(message.from, {
    ...state,
    step: "confirmingOrder",
    paymentMethod,
    customerName,
  });

  // Calcular totales
  const subtotal = state.cart.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0,
  );
  const deliveryCost = state.orderType === "delivery" ? 500 : 0; // Placeholder
  const total = subtotal + deliveryCost;

  const paymentText =
    paymentMethod === "efectivo" ? "💵 Efectivo" : "💳 Transferencia";
  const orderTypeText =
    state.orderType === "delivery"
      ? `🚗 Delivery a: ${state.deliveryAddress}`
      : "🏪 Retiro en local";

  await message.reply(
    `📋 *Resumen de tu pedido*\n\n` +
      `${formatCart(state.cart)}\n\n` +
      `${orderTypeText}\n` +
      `${state.orderType === "delivery" ? `Envío: ${formatPrice(deliveryCost)}\n` : ""}` +
      `Pago: ${paymentText}\n\n` +
      `*TOTAL: ${formatPrice(total)}*\n\n` +
      `¿Confirmamos el pedido?\n\nResponde *confirmar* o *cancelar*.`,
  );
};

const handleOrderConfirmation = async (
  message: Message,
  state: ConversationState,
): Promise<void> => {
  const text = message.body.trim().toLowerCase();

  if (text === "cancelar") {
    resetConversation(message.from);
    await message.reply("Pedido cancelado. ¡Esperamos verte pronto! 🍔");
    return;
  }

  if (text !== "confirmar") {
    await message.reply(
      "Escribe *confirmar* para realizar el pedido o *cancelar* para cancelar.",
    );
    return;
  }

  try {
    const customerPhone = sanitizePhoneNumber(message.from);

    // Construir items del pedido
    const items: OrderItem[] = state.cart.map((cartItem) => {
      const extrasTotal = cartItem.customizations
        .filter((c) => c.type === "agregar")
        .reduce((sum, c) => sum + c.extraPrice, 0);

      const unitPrice = cartItem.product.price + extrasTotal;
      const itemTotal = unitPrice * cartItem.quantity;

      return {
        productId: cartItem.product.id,
        productName: cartItem.product.name,
        quantity: cartItem.quantity,
        unitPrice,
        customizations: cartItem.customizations,
        itemTotal,
        notes: cartItem.notes,
      };
    });

    const deliveryCost = state.orderType === "delivery" ? 500 : 0; // Placeholder

    const orderInput: CreateOrderInput = {
      tenantId: state.tenantId,
      customerName: state.customerName || CUSTOMER_FALLBACK_NAME,
      customerPhone,
      items,
      orderType: state.orderType || "pickup",
      deliveryAddress: state.deliveryAddress,
      deliveryCost: state.orderType === "delivery" ? deliveryCost : undefined,
      paymentMethod: state.paymentMethod || "efectivo",
    };

    const order = await createOrder(orderInput);

    resetConversation(message.from);

    const estimatedTime =
      state.orderType === "delivery" ? "40-50 minutos" : "20-30 minutos";

    await message.reply(
      `✅ *¡Pedido confirmado!*\n\n` +
        `Número de pedido: *#${order.id.slice(-6).toUpperCase()}*\n\n` +
        `Tiempo estimado: ${estimatedTime}\n\n` +
        `Te avisaremos cuando tu pedido esté listo. ¡Gracias por elegirnos! 🍔`,
    );
  } catch (error) {
    logger.error("Error al crear el pedido", error);

    if (isHttpError(error)) {
      await message.reply(`No se pudo crear el pedido: ${error.message}`);
    } else {
      await message.reply(
        "Hubo un problema al procesar tu pedido. Por favor, intenta nuevamente.",
      );
    }

    resetConversation(message.from);
  }
};

const handleIncomingMessage = async (message: Message): Promise<void> => {
  if (message.fromMe) return;
  if (message.from === "status@broadcast") return;
  if (message.from.endsWith("@g.us")) return;

  const text = message.body.trim();
  if (text.length === 0) return;

  const normalized = text.toLowerCase();
  const chatId = message.from;

  // Cancelar en cualquier momento
  if (normalized === CANCEL_KEYWORD) {
    resetConversation(chatId);
    await message.reply(
      "Pedido cancelado. Escribe *pedir* para comenzar uno nuevo.",
    );
    return;
  }

  const state = getConversationState(chatId);

  // Manejar estados de conversación
  switch (state.step) {
    case "selectingProduct":
      await handleProductSelection(message, state);
      return;

    case "selectingQuantity":
      await handleQuantitySelection(message, state);
      return;

    case "askingCustomization":
      await handleCustomizationQuestion(message, state);
      return;

    case "selectingCustomization":
      await handleCustomizationSelection(message, state);
      return;

    case "askingMoreProducts":
      await handleMoreProductsQuestion(message, state);
      return;

    case "selectingOrderType":
      await handleOrderTypeSelection(message, state);
      return;

    case "awaitingAddress":
      await handleAddressInput(message, state);
      return;

    case "selectingPayment":
      await handlePaymentSelection(message, state);
      return;

    case "confirmingOrder":
      await handleOrderConfirmation(message, state);
      return;
  }

  // Comandos en estado idle
  logger.info(`Mensaje entrante de ${message.from}: ${text}`);

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
    await message.reply(
      "¡Hola! 🍔 Bienvenido a *BurgerFlow*\n\n" +
        "Escribe *hamburguesas* para ver nuestro menú o *pedir* para hacer tu pedido.",
    );
    return;
  }

  if (["menu", "help", "ayuda", "opciones"].includes(normalized)) {
    await message.reply(HELP_MESSAGE);
    return;
  }

  if (["hamburguesas", "menu", "carta", "productos"].includes(normalized)) {
    try {
      const products = await listAvailableProducts(state.tenantId);
      await message.reply(formatProducts(products));
    } catch (error) {
      logger.error("Error al obtener productos", error);
      await message.reply("No pudimos cargar el menú. Intenta más tarde.");
    }
    return;
  }

  if (["pedir", "ordenar", "quiero", "pedido"].includes(normalized)) {
    await startOrderFlow(message);
    return;
  }

  // Si el usuario escribe un número y hay productos, podría querer pedir
  const maybeProductNumber = parseInt(normalized, 10);
  if (!isNaN(maybeProductNumber) && maybeProductNumber > 0) {
    await startOrderFlow(message);
    // Simular que el usuario escribió el número después de ver el menú
    const newState = getConversationState(chatId);
    await handleProductSelection(message, newState);
    return;
  }

  await message.reply(
    "No entendí tu mensaje. 🤔\n\n" +
      "Escribe *menu* para ver las opciones o *pedir* para hacer un pedido.",
  );
};

const resolveSessionPath = (): string => {
  const customPath = env.whatsappSessionPath;
  if (customPath && customPath.trim().length > 0) {
    return path.resolve(customPath);
  }
  return path.join(process.cwd(), ".wwebjs_auth");
};

export const startWhatsappBot = (): Client => {
  if (client) {
    return client;
  }

  const sessionPath = resolveSessionPath();

  const puppeteerArgs: string[] = [];
  if (process.platform !== "win32") {
    puppeteerArgs.push("--no-sandbox", "--disable-setuid-sandbox");
  }

  const puppeteerOptions = {
    headless: env.whatsappHeadless,
    args: puppeteerArgs,
    executablePath: env.whatsappBrowserPath,
  };

  logger.info(
    `Configuración WhatsApp: headless=${puppeteerOptions.headless}, sessionPath=${sessionPath}`,
  );

  client = new Client({
    authStrategy: new LocalAuth({
      dataPath: sessionPath,
    }),
    puppeteer: puppeteerOptions,
    webVersionCache: {
      type: "remote",
      remotePath:
        "https://raw.githubusercontent.com/guigo613/alternative-wa-version/main/html/2.2412.54.html",
    },
  });

  client.on("qr", (qr: string) => {
    logger.info("Escanea el código QR para vincular el bot de WhatsApp.");
    qrcode.generate(qr, { small: true });
  });

  client.on("ready", () => {
    logger.info("Bot de WhatsApp listo para recibir pedidos. 🍔");
  });

  client.on("authenticated", () => {
    logger.info("Autenticación de WhatsApp completada.");
  });

  client.on("auth_failure", (msg: string) => {
    logger.error("Falló la autenticación con WhatsApp", msg);
  });

  client.on("disconnected", (reason: string) => {
    logger.warn(
      `Bot de WhatsApp desconectado (${reason}). Intentando reconexión...`,
    );
    client?.initialize().catch((error: unknown) => {
      logger.error("No se pudo reiniciar el bot de WhatsApp", error);
    });
  });

  client.on("error", (error: unknown) => {
    logger.error("Error del cliente de WhatsApp", error);
  });

  client.on("message", (message: Message) => {
    void handleIncomingMessage(message);
  });

  client
    .initialize()
    .then(() => logger.info("Cliente de WhatsApp inicializado."))
    .catch((error: unknown) => {
      logger.error("No se pudo inicializar el cliente de WhatsApp", error);
    });

  return client;
};

export const getWhatsappClient = (): Client | null => client;
