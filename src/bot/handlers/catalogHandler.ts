import { logger } from "../../utils/logger";
import { sendMessage } from "../../services/metaService";
import { getProductById } from "../../services/productService";
import { getStateMachine } from "../stateMachine";
import * as templates from "../templates";
import {
  checkActiveOrder,
  showActiveOrderMenu,
  askCustomization,
} from "../flows";
import type { CatalogOrderPayload, CartItem, FlowContext } from "../types";
import type { Tenant } from "../../models/tenant";

const stateMachine = getStateMachine();

/**
 * Procesa órdenes del catálogo de WhatsApp
 */
export const handleCatalogOrder = async (
  payload: CatalogOrderPayload,
  tenant: Tenant,
): Promise<void> => {
  const { from: phoneNumber, productItems, contactName } = payload;

  logger.info(
    `Procesando orden de catálogo de ${phoneNumber}: ${productItems.length} producto(s)`,
  );

  // Verificar si hay pedido activo
  const activeOrder = await checkActiveOrder(phoneNumber, tenant.id);

  if (activeOrder) {
    await sendMessage(
      phoneNumber,
      templates.getAlreadyHasActiveOrderMessage(),
      tenant,
    );
    await showActiveOrderMenu(phoneNumber, activeOrder, tenant);
    return;
  }

  if (productItems.length === 0) {
    await sendMessage(
      phoneNumber,
      "No se encontraron productos en tu selección. Intenta nuevamente desde el catálogo.",
      tenant,
    );
    return;
  }

  try {
    const cart: CartItem[] = [];
    const productsNotFound: string[] = [];
    const productsAdded: { name: string; quantity: number }[] = [];

    // Procesar cada producto del catálogo
    for (const item of productItems) {
      try {
        const product = await getProductById(tenant.id, item.productRetailerId);

        if (!product.available) {
          productsNotFound.push(item.productRetailerId);
          continue;
        }

        cart.push({
          product,
          quantity: item.quantity,
          customizations: [],
          extras: [],
        });

        productsAdded.push({ name: product.name, quantity: item.quantity });
        logger.info(`Producto agregado: ${product.name} x${item.quantity}`);
      } catch {
        logger.warn(`Producto no encontrado: ${item.productRetailerId}`);
        productsNotFound.push(item.productRetailerId);
      }
    }

    if (productsAdded.length === 0) {
      await sendMessage(
        phoneNumber,
        "Lo sentimos, los productos seleccionados no están disponibles. 😔\n\n" +
          "Revisá el catálogo para ver las opciones disponibles.",
        tenant,
      );
      return;
    }

    // Guardar estado con el carrito
    const state = await stateMachine.setState(phoneNumber, tenant.id, {
      cart,
      generalExtras: [],
      customerName: contactName,
    });

    // Notificar si hubo productos no disponibles
    if (productsNotFound.length > 0) {
      await sendMessage(
        phoneNumber,
        `⚠️ _${productsNotFound.length} producto(s) no estaban disponibles y fueron removidos._`,
        tenant,
      );
    }

    // Crear contexto y avanzar al flujo de personalización
    const ctx: FlowContext = {
      phoneNumber,
      text: "",
      tenant,
      state,
      contactName,
    };

    await askCustomization(ctx);
  } catch (error) {
    logger.error("Error procesando orden de catálogo", error);
    await sendMessage(
      phoneNumber,
      "Hubo un error al procesar tu selección. Por favor, intenta nuevamente.",
      tenant,
    );
  }
};
