import type { FlowHandlerMap } from "../types";

// Re-exportar flujos y funciones
export * from "./welcomeFlow";
export * from "./activeOrderFlow";
export * from "./customizationFlow";
export * from "./deliveryFlow";
export * from "./paymentFlow";

// Importaciones para el mapa de handlers
import { handleActiveOrderMenu } from "./activeOrderFlow";
import {
  handleCustomizationQuestion,
  handleBurgerSelection,
  handleCustomizationAction,
  handleIngredientToAdd,
  handleIngredientToRemove,
} from "./customizationFlow";
import {
  handleOrderTypeSelection,
  handleDeliveryZoneSelection,
  handleAddressInput,
  handleDeliveryNotesInput,
} from "./deliveryFlow";
import {
  handlePaymentSelection,
  handleOrderConfirmation,
} from "./paymentFlow";

/**
 * Mapa de handlers por estado de conversación
 * Centraliza el enrutamiento de mensajes según el paso actual
 */
export const flowHandlers: FlowHandlerMap = {
  activeOrderMenu: handleActiveOrderMenu,
  askingCustomization: handleCustomizationQuestion,
  selectingBurgerToCustomize: handleBurgerSelection,
  selectingCustomizationAction: handleCustomizationAction,
  selectingIngredientToAdd: handleIngredientToAdd,
  selectingIngredientToRemove: handleIngredientToRemove,
  selectingOrderType: handleOrderTypeSelection,
  selectingDeliveryZone: handleDeliveryZoneSelection,
  awaitingAddress: handleAddressInput,
  awaitingDeliveryNotes: handleDeliveryNotesInput,
  selectingPayment: handlePaymentSelection,
  confirmingOrder: handleOrderConfirmation,
};
