import { logger } from "../../utils/logger";
import { sendMessage, sendInteractiveButtons } from "../../services/metaService";
import {
  listActiveDeliveryZones,
  listDeliveryZones,
} from "../../services/deliveryZoneService";
import { getStateMachine } from "../stateMachine";
import { BUTTON_IDS } from "../constants";
import * as templates from "../templates";
import {
  isDeliveryIntent,
  isPickupIntent,
  isValidAddress,
  parseSelectionNumber,
} from "../utils";
import { askPaymentMethod } from "./paymentFlow";
import type { FlowContext, FlowResult } from "../types";
import type { DeliveryZone } from "../../models/deliveryZone";

const stateMachine = getStateMachine();

/**
 * Obtiene zonas activas con fallback
 */
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

/**
 * Inicia el flujo de tipo de entrega
 */
export const askOrderType = async (ctx: FlowContext): Promise<void> => {
  const { phoneNumber, tenant, state } = ctx;

  const hasDelivery =
    tenant.hasDelivery === true || tenant.hasDelivery === undefined;
  const hasPickup = tenant.hasPickup === true || tenant.hasPickup === undefined;

  // Si ninguna opción está disponible
  if (!hasDelivery && !hasPickup) {
    await sendMessage(
      phoneNumber,
      templates.getNoDeliveryOptionsMessage(),
      tenant,
    );
    await stateMachine.reset(phoneNumber, tenant.id);
    return;
  }

  if (hasDelivery && hasPickup) {
    await stateMachine.transitionTo(
      phoneNumber,
      tenant.id,
      "selectingOrderType",
    );

    await sendInteractiveButtons(
      phoneNumber,
      "¿Cómo querés recibir tu pedido?",
      [
        { id: BUTTON_IDS.DELIVERY, title: "🚗 Delivery" },
        { id: BUTTON_IDS.PICKUP, title: "🏪 Retiro en local" },
      ],
      tenant,
    );
  } else if (hasDelivery) {
    await sendMessage(phoneNumber, templates.getOnlyDeliveryMessage(), tenant);
    await handleDeliveryFlow(ctx);
  } else {
    await sendMessage(phoneNumber, templates.getOnlyPickupMessage(), tenant);
    await askPaymentMethod({
      ...ctx,
      state: { ...state, orderType: "pickup" },
    });
  }
};

/**
 * Inicia el flujo de delivery
 */
const handleDeliveryFlow = async (ctx: FlowContext): Promise<void> => {
  const { phoneNumber, tenant, state } = ctx;

  try {
    const zones = await getActiveZonesWithFallback(state.tenantId);

    if (zones.length > 0) {
      await stateMachine.transitionTo(
        phoneNumber,
        tenant.id,
        "selectingDeliveryZone",
        { orderType: "delivery" },
      );

      await sendMessage(
        phoneNumber,
        templates.getDeliveryZoneSelectionMessage(zones),
        tenant,
      );
    } else {
      await stateMachine.transitionTo(
        phoneNumber,
        tenant.id,
        "awaitingAddress",
        { orderType: "delivery" },
      );

      await sendMessage(
        phoneNumber,
        templates.getAddressRequestNoZonesMessage(),
        tenant,
      );
    }
  } catch (error) {
    logger.error("Error al obtener zonas de delivery", error);
    await stateMachine.transitionTo(
      phoneNumber,
      tenant.id,
      "awaitingAddress",
      { orderType: "delivery" },
    );

    await sendMessage(
      phoneNumber,
      templates.getAddressRequestNoZonesMessage(),
      tenant,
    );
  }
};

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * Handler: Selección de tipo de entrega
 */
export const handleOrderTypeSelection = async (
  ctx: FlowContext,
): Promise<FlowResult> => {
  const { phoneNumber, text, tenant, state } = ctx;

  if (isDeliveryIntent(text)) {
    await handleDeliveryFlow(ctx);
    return { handled: true };
  }

  if (isPickupIntent(text)) {
    await askPaymentMethod({
      ...ctx,
      state: { ...state, orderType: "pickup" },
    });
    return { handled: true };
  }

  // Respuesta no reconocida
  await sendInteractiveButtons(
    phoneNumber,
    "Por favor, seleccioná una opción:",
    [
      { id: BUTTON_IDS.DELIVERY, title: "🚗 Delivery" },
      { id: BUTTON_IDS.PICKUP, title: "🏪 Retiro en local" },
    ],
    tenant,
  );

  return { handled: true };
};

/**
 * Handler: Selección de zona de delivery
 */
export const handleDeliveryZoneSelection = async (
  ctx: FlowContext,
): Promise<FlowResult> => {
  const { phoneNumber, text, tenant, state } = ctx;

  try {
    const zones = await getActiveZonesWithFallback(state.tenantId);
    const index = parseSelectionNumber(text);

    if (index < 0 || index >= zones.length) {
      await sendMessage(
        phoneNumber,
        templates.getInvalidZoneSelectionMessage(zones.length),
        tenant,
      );
      return { handled: true };
    }

    const selectedZone = zones[index];

    await stateMachine.transitionTo(phoneNumber, tenant.id, "awaitingAddress", {
      selectedZone,
    });

    await sendMessage(
      phoneNumber,
      templates.getAddressRequestMessage(selectedZone.name),
      tenant,
    );
  } catch (error) {
    logger.error("Error al seleccionar zona", error);
    await sendMessage(
      phoneNumber,
      templates.getDeliveryZoneErrorMessage(),
      tenant,
    );
  }

  return { handled: true };
};

/**
 * Handler: Input de dirección
 */
export const handleAddressInput = async (
  ctx: FlowContext,
): Promise<FlowResult> => {
  const { phoneNumber, text, tenant, state } = ctx;
  const address = text.trim();

  if (!isValidAddress(address)) {
    await sendMessage(
      phoneNumber,
      templates.getInvalidAddressMessage(),
      tenant,
    );
    return { handled: true };
  }

  await stateMachine.transitionTo(
    phoneNumber,
    tenant.id,
    "awaitingDeliveryNotes",
    { deliveryAddress: address },
  );

  await sendMessage(
    phoneNumber,
    templates.getDeliveryNotesRequestMessage(address),
    tenant,
  );

  return { handled: true };
};

/**
 * Handler: Input de notas de entrega
 */
export const handleDeliveryNotesInput = async (
  ctx: FlowContext,
): Promise<FlowResult> => {
  const { phoneNumber, text, tenant, state } = ctx;
  const notes = text.trim();

  await stateMachine.setState(phoneNumber, tenant.id, { deliveryNotes: notes });

  await askPaymentMethod({
    ...ctx,
    state: { ...state, deliveryNotes: notes },
  });

  return { handled: true };
};
