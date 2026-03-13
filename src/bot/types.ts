import type { Tenant } from "../models/tenant";
import type { Product } from "../models/product";
import type { DeliveryZone } from "../models/deliveryZone";
import type { Ingredient } from "../models/ingredient";
import type { Extra } from "../models/extra";
import type { Order } from "../models/order";

/**
 * Estados posibles de la conversación
 */
export type ConversationStep =
  | "idle"
  | "activeOrderMenu" // Menú para clientes con pedido activo
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

/**
 * Extra seleccionado con cantidad
 */
export interface SelectedExtra {
  extra: Extra;
  quantity: number;
}

/**
 * Item del carrito con producto y personalizaciones
 */
export interface CartItem {
  product: Product;
  quantity: number;
  customizations: OrderCustomization[];
  extras: SelectedExtra[];
}

/**
 * Personalización de un producto
 */
export interface OrderCustomization {
  ingredientId: string;
  ingredientName: string;
  type: "agregar" | "quitar";
  extraPrice: number;
}

/**
 * Estado completo de la conversación
 */
export interface ConversationState {
  step: ConversationStep;
  tenantId: string;
  cart: CartItem[];
  generalExtras: SelectedExtra[];
  currentBurgerIndex?: number;
  availableIngredients?: Ingredient[];
  ingredientExtrasMap?: { ingredient: Ingredient; extra: Extra }[];
  availableExtras?: Extra[];
  orderType?: "delivery" | "pickup";
  selectedZone?: DeliveryZone;
  deliveryAddress?: string;
  deliveryNotes?: string;
  paymentMethod?: "efectivo" | "transferencia";
  customerName?: string;
  activeOrder?: Order;
  lastUpdated?: number; // Timestamp para TTL
}

/**
 * Contexto de ejecución del flujo
 */
export interface FlowContext {
  phoneNumber: string;
  text: string;
  tenant: Tenant;
  state: ConversationState;
  contactName?: string;
}

/**
 * Resultado de un handler de flujo
 */
export interface FlowResult {
  nextState?: Partial<ConversationState>;
  handled: boolean;
}

/**
 * Handler de un paso del flujo
 */
export type FlowHandler = (ctx: FlowContext) => Promise<FlowResult>;

/**
 * Mapa de handlers por estado
 */
export type FlowHandlerMap = Partial<Record<ConversationStep, FlowHandler>>;

/**
 * Item de una orden del catálogo de WhatsApp
 */
export interface CatalogOrderItem {
  productRetailerId: string;
  quantity: number;
  itemPrice: string;
  currency: string;
}

/**
 * Payload de mensaje entrante
 */
export interface IncomingMessagePayload {
  from: string;
  messageId: string;
  text: string;
  timestamp: string;
  contactName?: string;
}

/**
 * Payload de orden del catálogo
 */
export interface CatalogOrderPayload {
  from: string;
  messageId: string;
  timestamp: string;
  contactName?: string;
  catalogId: string;
  productItems: CatalogOrderItem[];
  text?: string;
}
