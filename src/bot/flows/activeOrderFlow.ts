import { logger } from "../../utils/logger";
import {
  sendMessage,
  sendInteractiveButtons,
} from "../../services/metaService";
import { getActiveOrdersByPhone } from "../../services/orderService";
import {
  sendOrderIssueNotification,
  sendContactRequestNotification,
} from "../../services/notificationService";
import { getStateMachine } from "../stateMachine";
import { BUTTON_IDS, INTENT_PATTERNS } from "../constants";
import * as templates from "../templates";
import { normalizeText, isGreeting } from "../utils";
import type { FlowContext, FlowResult } from "../types";
import type { Tenant } from "../../models/tenant";
import type { Order } from "../../models/order";

const stateMachine = getStateMachine();

/**
 * Verifica si hay un pedido activo para el cliente
 */
export const checkActiveOrder = async (
  phoneNumber: string,
  tenantId: string,
): Promise<Order | null> => {
  try {
    logger.debug(`Verificando pedidos activos para ${phoneNumber}`);
    const activeOrders = await getActiveOrdersByPhone(tenantId, phoneNumber);

    if (activeOrders.length > 0) {
      logger.info(
        `Cliente ${phoneNumber} tiene pedido activo: ${activeOrders[0].id} (${activeOrders[0].status})`,
      );
      return activeOrders[0];
    }

    logger.debug(`No hay pedidos activos para ${phoneNumber}`);
    return null;
  } catch (error) {
    logger.error(
      `Error al verificar pedidos activos para ${phoneNumber}:`,
      error,
    );
    return null;
  }
};

/**
 * Muestra el menú de opciones para clientes con pedido activo
 */
export const showActiveOrderMenu = async (
  phoneNumber: string,
  order: Order,
  tenant: Tenant,
): Promise<void> => {
  await stateMachine.transitionTo(phoneNumber, tenant.id, "activeOrderMenu", {
    activeOrder: order,
  });

  await sendMessage(
    phoneNumber,
    templates.getActiveOrderInfoMessage(order),
    tenant,
  );

  await sendInteractiveButtons(
    phoneNumber,
    "Seleccioná una opción:",
    [
      { id: BUTTON_IDS.ORDER_STATUS, title: "📋 Ver estado" },
      { id: BUTTON_IDS.ORDER_ISSUE, title: "⚠️ Tengo un problema" },
      { id: BUTTON_IDS.CONTACT_RESTAURANT, title: "📞 Contactar" },
    ],
    tenant,
  );
};

/**
 * Muestra el estado detallado del pedido
 */
const showOrderStatus = async (
  phoneNumber: string,
  order: Order,
  tenant: Tenant,
): Promise<void> => {
  await sendMessage(
    phoneNumber,
    templates.getOrderStatusMessage(order),
    tenant,
  );

  await sendInteractiveButtons(
    phoneNumber,
    "¿Necesitás algo más?",
    [
      { id: BUTTON_IDS.ORDER_ISSUE, title: "⚠️ Tengo un problema" },
      { id: BUTTON_IDS.CONTACT_RESTAURANT, title: "📞 Contactar" },
      { id: BUTTON_IDS.OK, title: "✅ Todo bien" },
    ],
    tenant,
  );
};

/**
 * Reporta un problema con el pedido
 */
const handleOrderIssue = async (
  phoneNumber: string,
  order: Order,
  tenant: Tenant,
): Promise<void> => {
  await sendOrderIssueNotification(order, phoneNumber);
  await sendMessage(
    phoneNumber,
    templates.getOrderIssueReportedMessage(order.id),
    tenant,
  );
  await stateMachine.reset(phoneNumber, tenant.id);
};

/**
 * Solicita contacto con el restaurante
 */
const handleContactRequest = async (
  phoneNumber: string,
  order: Order,
  tenant: Tenant,
): Promise<void> => {
  await sendContactRequestNotification(order, phoneNumber);
  await sendMessage(
    phoneNumber,
    templates.getContactRequestSentMessage(order.id),
    tenant,
  );
  await stateMachine.reset(phoneNumber, tenant.id);
};

/**
 * Handler del menú de pedido activo
 */
export const handleActiveOrderMenu = async (
  ctx: FlowContext,
): Promise<FlowResult> => {
  const { phoneNumber, text, tenant, state } = ctx;
  const normalized = normalizeText(text);
  const order = state.activeOrder;

  if (!order) {
    await stateMachine.reset(phoneNumber, tenant.id);
    return { handled: true };
  }

  // Detectar saludos
  if (isGreeting(text)) {
    await sendMessage(
      phoneNumber,
      templates.getGreetingWithActiveOrderMessage(order),
      tenant,
    );
    await sendInteractiveButtons(
      phoneNumber,
      "Seleccioná una opción:",
      [
        { id: BUTTON_IDS.ORDER_STATUS, title: "📋 Ver estado" },
        { id: BUTTON_IDS.ORDER_ISSUE, title: "⚠️ Tengo un problema" },
        {
          id: BUTTON_IDS.CONTACT_RESTAURANT,
          title: "📞 Contactar",
        },
      ],
      tenant,
    );
    return { handled: true };
  }

  // Ver estado
  if (
    normalized === BUTTON_IDS.ORDER_STATUS ||
    normalized === "1" ||
    INTENT_PATTERNS.status.test(normalized)
  ) {
    await showOrderStatus(phoneNumber, order, tenant);
    return { handled: true };
  }

  // Reportar problema
  if (
    normalized === BUTTON_IDS.ORDER_ISSUE ||
    normalized === "2" ||
    INTENT_PATTERNS.problem.test(normalized)
  ) {
    await handleOrderIssue(phoneNumber, order, tenant);
    return { handled: true };
  }

  // Contactar restaurante
  if (
    normalized === BUTTON_IDS.CONTACT_RESTAURANT ||
    normalized === "3" ||
    INTENT_PATTERNS.contact.test(normalized)
  ) {
    await handleContactRequest(phoneNumber, order, tenant);
    return { handled: true };
  }

  // Todo bien / Gracias
  if (normalized === BUTTON_IDS.OK || INTENT_PATTERNS.thanks.test(normalized)) {
    await sendMessage(phoneNumber, templates.getFarewellMessage(), tenant);
    await stateMachine.reset(phoneNumber, tenant.id);
    return { handled: true };
  }

  // Respuesta no reconocida
  await sendMessage(
    phoneNumber,
    templates.getUnrecognizedWithActiveOrderMessage(order.id),
    tenant,
  );
  await sendInteractiveButtons(
    phoneNumber,
    "Seleccioná una opción:",
    [
      { id: BUTTON_IDS.ORDER_STATUS, title: "📋 Ver estado" },
      { id: BUTTON_IDS.ORDER_ISSUE, title: "⚠️ Tengo un problema" },
      { id: BUTTON_IDS.CONTACT_RESTAURANT, title: "📞 Contactar" },
    ],
    tenant,
  );

  return { handled: true };
};
