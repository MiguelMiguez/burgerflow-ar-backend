import { logger } from "../../utils/logger";
import { getStateMachine } from "../stateMachine";
import { CANCEL_KEYWORD } from "../constants";
import { isCancelCommand } from "../utils";
import {
  flowHandlers,
  sendWelcomeMessage,
  sendCancellationMessage,
  checkActiveOrder,
  showActiveOrderMenu,
} from "../flows";
import type { IncomingMessagePayload, FlowContext } from "../types";
import type { Tenant } from "../../models/tenant";

const stateMachine = getStateMachine();

/**
 * Procesa mensajes de texto entrantes
 */
export const handleTextMessage = async (
  payload: IncomingMessagePayload,
  tenant: Tenant,
): Promise<void> => {
  const { from: phoneNumber, text, contactName } = payload;

  // Ignorar mensajes vacíos
  if (!text || text.trim().length === 0) {
    return;
  }

  // Comando cancelar siempre funciona
  if (isCancelCommand(text) || text.trim().toLowerCase() === CANCEL_KEYWORD) {
    await stateMachine.reset(phoneNumber, tenant.id);
    await sendCancellationMessage(phoneNumber, tenant);
    return;
  }

  // Obtener estado actual
  const state = await stateMachine.getState(phoneNumber, tenant.id);

  // Crear contexto de flujo
  const ctx: FlowContext = {
    phoneNumber,
    text,
    tenant,
    state,
    contactName,
  };

  // Si hay un handler para el paso actual, usarlo
  const handler = flowHandlers[state.step];

  if (handler) {
    try {
      await handler(ctx);
      return;
    } catch (error) {
      logger.error(`Error en handler ${state.step}`, error);
      // No resetear - dejar que el usuario reintente
    }
  }

  // Estado idle o sin handler -> verificar pedido activo o enviar bienvenida
  const activeOrder = await checkActiveOrder(phoneNumber, tenant.id);

  if (activeOrder) {
    await showActiveOrderMenu(phoneNumber, activeOrder, tenant);
  } else {
    await sendWelcomeMessage(phoneNumber, tenant, contactName);
  }
};
