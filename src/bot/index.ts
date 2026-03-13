/**
 * Bot de Pedidos - WhatsApp Catalog Flow
 *
 * Arquitectura modular:
 * - stateMachine: Manejo de estados con persistencia en Firestore
 * - handlers: Procesamiento de mensajes entrantes
 * - flows: Lógica de cada paso de la conversación
 * - templates: Mensajes de texto separados del código
 * - utils: Formateadores y validadores
 * - constants: Configuración centralizada
 *
 * Flujo principal:
 * 1. Cliente saluda → Bot invita a usar el catálogo
 * 2. Cliente selecciona productos del catálogo
 * 3. Bot pregunta si desea personalizar
 * 4. Seleccionar tipo de entrega (delivery/pickup)
 * 5. Seleccionar método de pago
 * 6. Confirmar pedido
 */

import { handleTextMessage, handleCatalogOrder } from "./handlers";
import type {
  IncomingMessagePayload,
  CatalogOrderPayload,
} from "./types";
import type { Tenant } from "../models/tenant";

/**
 * Procesa un mensaje de texto entrante
 */
export const processIncomingMessage = async (
  messagePayload: IncomingMessagePayload,
  tenant: Tenant,
): Promise<void> => {
  await handleTextMessage(messagePayload, tenant);
};

/**
 * Procesa una orden del catálogo de WhatsApp
 */
export const processCatalogOrder = async (
  orderPayload: CatalogOrderPayload,
  tenant: Tenant,
): Promise<void> => {
  await handleCatalogOrder(orderPayload, tenant);
};

// Re-exportar tipos para uso externo
export type {
  IncomingMessagePayload,
  CatalogOrderPayload,
  CatalogOrderItem,
} from "./types";
