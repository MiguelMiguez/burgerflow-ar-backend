import type { CartItem, SelectedExtra } from "../types";

/**
 * Formatea un precio en pesos argentinos
 */
export const formatPrice = (price: number): string => {
  return `$${price.toLocaleString("es-AR", { minimumFractionDigits: 0 })}`;
};

/**
 * Calcula el total de un item del carrito incluyendo customizaciones y extras
 */
export const calculateItemTotal = (item: CartItem): number => {
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

  return itemTotal;
};

/**
 * Calcula el subtotal del carrito
 */
export const calculateCartSubtotal = (
  cart: CartItem[],
  generalExtras: SelectedExtra[] = [],
): number => {
  const itemsTotal = cart.reduce(
    (sum, item) => sum + calculateItemTotal(item),
    0,
  );
  const extrasTotal = generalExtras.reduce(
    (sum, e) => sum + e.extra.price * e.quantity,
    0,
  );
  return itemsTotal + extrasTotal;
};

/**
 * Formatea el carrito para mostrar al usuario
 */
export const formatCart = (
  cart: CartItem[],
  deliveryCost: number = 0,
  extrasList?: SelectedExtra[],
): string => {
  if (cart.length === 0 && (!extrasList || extrasList.length === 0)) {
    return "Tu carrito está vacío.";
  }

  let subtotal = 0;
  const items: string[] = [];

  // Formatear items del carrito
  cart.forEach((item, index) => {
    const itemTotal = calculateItemTotal(item);
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

    items.push(
      `${index + 1}. ${item.quantity}x ${item.product.name} - ${formatPrice(itemTotal)}${details}`,
    );
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

/**
 * Formatea una lista de opciones numeradas
 */
export const formatNumberedList = (
  items: { text: string; detail?: string }[],
): string => {
  return items
    .map((item, index) => {
      const detail = item.detail ? ` - ${item.detail}` : "";
      return `*${index + 1}.* ${item.text}${detail}`;
    })
    .join("\n");
};

/**
 * Trunca un ID para mostrar al usuario
 */
export const formatOrderId = (orderId: string): string => {
  return orderId.slice(-6).toUpperCase();
};
