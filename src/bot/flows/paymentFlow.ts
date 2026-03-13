import { logger } from "../../utils/logger";
import { sendMessage, sendInteractiveButtons } from "../../services/metaService";
import { createOrder } from "../../services/orderService";
import {
  createPaymentPreference,
  hasMercadoPagoConfigured,
} from "../../services/mercadoPagoService";
import { getStateMachine } from "../stateMachine";
import { BUTTON_IDS, CUSTOMER_FALLBACK_NAME } from "../constants";
import * as templates from "../templates";
import {
  isCashPaymentIntent,
  isTransferPaymentIntent,
  isConfirmIntent,
  isCancelConfirmIntent,
} from "../utils";
import { isHttpError } from "../../utils/httpError";
import type { FlowContext, FlowResult } from "../types";
import type { CreateOrderInput, OrderItem } from "../../models/order";

const stateMachine = getStateMachine();

/**
 * Pregunta el método de pago
 */
export const askPaymentMethod = async (ctx: FlowContext): Promise<void> => {
  const { phoneNumber, tenant, state } = ctx;

  await stateMachine.transitionTo(phoneNumber, tenant.id, "selectingPayment", {
    orderType: state.orderType,
  });

  await sendInteractiveButtons(
    phoneNumber,
    "¿Cómo querés pagar?",
    [
      { id: BUTTON_IDS.CASH, title: "💵 Efectivo" },
      { id: BUTTON_IDS.TRANSFER, title: "💳 Transferencia" },
    ],
    tenant,
  );
};

/**
 * Muestra el resumen del pedido
 */
const showOrderSummary = async (
  ctx: FlowContext,
  paymentMethod: "efectivo" | "transferencia",
): Promise<void> => {
  const { phoneNumber, tenant, state } = ctx;

  await stateMachine.transitionTo(phoneNumber, tenant.id, "confirmingOrder", {
    paymentMethod,
  });

  await sendMessage(
    phoneNumber,
    templates.getOrderSummaryMessage(
      state.cart,
      state.generalExtras,
      state.orderType || "pickup",
      paymentMethod,
      state.deliveryAddress,
      state.selectedZone,
      state.deliveryNotes,
    ),
    tenant,
  );

  await sendInteractiveButtons(
    phoneNumber,
    "¿Confirmamos el pedido?",
    [
      { id: BUTTON_IDS.CONFIRM, title: "✅ Confirmar" },
      { id: BUTTON_IDS.CANCEL, title: "❌ Cancelar" },
    ],
    tenant,
  );
};

/**
 * Crea el pedido y envía confirmación
 */
const createAndConfirmOrder = async (ctx: FlowContext): Promise<void> => {
  const { phoneNumber, tenant, state } = ctx;
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

  // Agregar campos opcionales
  if (state.paymentMethod === "transferencia") {
    orderInput.paymentStatus = "pendiente";
  }
  if (useMercadoPago) {
    orderInput.status = "pendiente_pago";
  }

  if (state.orderType === "delivery") {
    if (state.deliveryAddress) orderInput.deliveryAddress = state.deliveryAddress;
    if (state.selectedZone) {
      orderInput.deliveryZoneId = state.selectedZone.id;
      orderInput.deliveryZoneName = state.selectedZone.name;
    }
    if (state.deliveryNotes) orderInput.deliveryNotes = state.deliveryNotes;
  }

  const order = await createOrder(orderInput);
  await stateMachine.reset(phoneNumber, tenant.id);

  // Si es transferencia con MP, generar link de pago
  if (useMercadoPago) {
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
        templates.getOrderWithPaymentLinkMessage(
          order.id,
          preference.initPoint,
          state.orderType || "pickup",
        ),
        tenant,
      );
      return;
    } catch (mpError) {
      logger.error("Error al crear preferencia de Mercado Pago", mpError);
      await sendMessage(
        phoneNumber,
        templates.getPaymentLinkFailedMessage(
          order.id,
          state.orderType || "pickup",
          tenant.name,
        ),
        tenant,
      );
      return;
    }
  }

  // Pago en efectivo o sin MP
  await sendMessage(
    phoneNumber,
    templates.getOrderReceivedMessage(
      order.id,
      state.orderType || "pickup",
      tenant.name,
    ),
    tenant,
  );
};

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * Handler: Selección de método de pago
 */
export const handlePaymentSelection = async (
  ctx: FlowContext,
): Promise<FlowResult> => {
  const { phoneNumber, text, tenant } = ctx;

  if (isCashPaymentIntent(text)) {
    await showOrderSummary(ctx, "efectivo");
    return { handled: true };
  }

  if (isTransferPaymentIntent(text)) {
    await showOrderSummary(ctx, "transferencia");
    return { handled: true };
  }

  // Respuesta no reconocida
  await sendInteractiveButtons(
    phoneNumber,
    "Por favor, seleccioná un método de pago:",
    [
      { id: BUTTON_IDS.CASH, title: "💵 Efectivo" },
      { id: BUTTON_IDS.TRANSFER, title: "💳 Transferencia" },
    ],
    tenant,
  );

  return { handled: true };
};

/**
 * Handler: Confirmación del pedido
 */
export const handleOrderConfirmation = async (
  ctx: FlowContext,
): Promise<FlowResult> => {
  const { phoneNumber, text, tenant } = ctx;

  if (isCancelConfirmIntent(text)) {
    await stateMachine.reset(phoneNumber, tenant.id);
    await sendMessage(
      phoneNumber,
      templates.getCancellationMessage(tenant.name),
      tenant,
    );
    return { handled: true };
  }

  if (!isConfirmIntent(text)) {
    await sendInteractiveButtons(
      phoneNumber,
      "Por favor, confirmá o cancelá el pedido:",
      [
        { id: BUTTON_IDS.CONFIRM, title: "✅ Confirmar" },
        { id: BUTTON_IDS.CANCEL, title: "❌ Cancelar" },
      ],
      tenant,
    );
    return { handled: true };
  }

  try {
    await createAndConfirmOrder(ctx);
  } catch (error) {
    logger.error("Error al crear el pedido", error);

    const errorMessage = isHttpError(error) ? error.message : undefined;
    await sendMessage(
      phoneNumber,
      templates.getOrderCreationErrorMessage(errorMessage),
      tenant,
    );
    await stateMachine.reset(phoneNumber, tenant.id);
  }

  return { handled: true };
};
