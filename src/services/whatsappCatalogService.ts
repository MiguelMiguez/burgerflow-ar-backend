import axios, { AxiosError } from "axios";
import env from "../config/env";
import { logger } from "../utils/logger";
import type { Tenant } from "../models/tenant";
import type { Product } from "../models/product";

/**
 * Servicio para interactuar con el Catálogo de WhatsApp Business (Meta Graph API)
 * Documentación: https://developers.facebook.com/docs/marketing-api/catalog
 *
 * Este servicio permite sincronizar productos del sistema con el catálogo
 * de WhatsApp Business, permitiendo a los clientes navegar y ordenar
 * directamente desde el catálogo de WhatsApp.
 */

interface MetaErrorResponse {
  error?: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

interface CatalogProductPayload {
  retailer_id: string; // ID único del producto en tu sistema
  name: string;
  description?: string;
  price: number; // Precio en centavos
  currency: string;
  availability: "in stock" | "out of stock";
  url?: string; // URL del producto (opcional)
  image_url?: string; // URL de la imagen del producto
  category?: string;
}

interface CatalogProductResponse {
  id: string; // ID del producto en el catálogo de Meta
  retailer_id: string;
}

interface CatalogProductBatchResponse {
  handles: string[];
}

/**
 * Valida que el tenant tenga las credenciales necesarias para usar el catálogo
 */
const validateCatalogCredentials = (tenant: Tenant): void => {
  if (!tenant.metaCatalogId) {
    throw new Error(
      `El tenant ${tenant.id} (${tenant.name}) no tiene configurado metaCatalogId`,
    );
  }

  if (!tenant.metaAccessToken) {
    throw new Error(
      `El tenant ${tenant.id} (${tenant.name}) no tiene configurado metaAccessToken`,
    );
  }
};

/**
 * Construye la URL base para la Graph API de Meta (catálogo)
 */
const getCatalogApiUrl = (catalogId: string, endpoint: string = ""): string => {
  return `https://graph.facebook.com/${env.metaApiVersion}/${catalogId}${endpoint}`;
};

/**
 * Maneja errores de axios para operaciones de catálogo
 */
const handleCatalogApiError = (error: unknown, context: string): never => {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<MetaErrorResponse>;

    if (axiosError.response) {
      const status = axiosError.response.status;
      const metaError = axiosError.response.data?.error;

      if (metaError) {
        const errorMsg = `Meta Catalog API Error (${status}): ${metaError.message} [${metaError.type}]`;
        logger.error(errorMsg, {
          code: metaError.code,
          subcode: metaError.error_subcode,
          traceId: metaError.fbtrace_id,
        });
        throw new Error(errorMsg);
      }

      logger.error(
        `Meta Catalog API HTTP Error (${status}): ${axiosError.message}`,
        axiosError,
      );
      throw new Error(
        `Error de comunicación con WhatsApp Catalog API (${status}): ${axiosError.message}`,
      );
    }

    if (axiosError.request) {
      logger.error(
        `Meta Catalog API Request Error: ${axiosError.message}`,
        axiosError,
      );
      throw new Error(
        `No se pudo conectar con WhatsApp Catalog API: ${axiosError.message}`,
      );
    }

    logger.error(
      `Meta Catalog API Config Error: ${axiosError.message}`,
      axiosError,
    );
    throw new Error(`Error de configuración: ${axiosError.message}`);
  }

  logger.error(`${context}: Error desconocido`, error);
  throw new Error(`Error inesperado en ${context}`);
};

/**
 * Convierte un producto del sistema al formato requerido por el catálogo de WhatsApp
 */
const productToCatalogPayload = (product: Product): CatalogProductPayload => {
  // WhatsApp requiere el precio en centavos (multiplicar por 100)
  const priceInCents = Math.round(product.price * 100);

  return {
    retailer_id: product.id,
    name: product.name.substring(0, 200), // WhatsApp limita a 200 caracteres
    description:
      product.description?.substring(0, 9999) ||
      `${product.name} - ${product.category}`,
    price: priceInCents,
    currency: "ARS", // Peso argentino
    availability: product.available ? "in stock" : "out of stock",
    image_url: product.image || undefined,
    category: product.category,
  };
};

/**
 * Agrega un producto al catálogo de WhatsApp Business
 *
 * @param product - Producto a agregar
 * @param tenant - Tenant con credenciales de Meta
 * @returns ID del producto en el catálogo de Meta
 */
export const addProductToCatalog = async (
  product: Product,
  tenant: Tenant,
): Promise<string | null> => {
  try {
    validateCatalogCredentials(tenant);

    const catalogPayload = productToCatalogPayload(product);
    const url = getCatalogApiUrl(tenant.metaCatalogId!, "/products");

    logger.info(
      `Agregando producto "${product.name}" (${product.id}) al catálogo de WhatsApp (tenant: ${tenant.name})`,
    );

    const response = await axios.post<CatalogProductResponse>(
      url,
      {
        requests: [
          {
            method: "CREATE",
            retailer_id: catalogPayload.retailer_id,
            data: catalogPayload,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${tenant.metaAccessToken}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      },
    );

    const catalogItemId = response.data.id;

    logger.info(
      `Producto "${product.name}" agregado al catálogo. Meta ID: ${catalogItemId}`,
    );

    return catalogItemId;
  } catch (error) {
    // No fallar la operación principal si falla la sincronización con el catálogo
    logger.error(
      `Error al agregar producto "${product.name}" al catálogo de WhatsApp`,
      error,
    );
    return null;
  }
};

/**
 * Actualiza un producto en el catálogo de WhatsApp Business
 *
 * @param product - Producto actualizado
 * @param tenant - Tenant con credenciales de Meta
 * @returns true si la actualización fue exitosa
 */
export const updateProductInCatalog = async (
  product: Product,
  tenant: Tenant,
): Promise<boolean> => {
  try {
    validateCatalogCredentials(tenant);

    const catalogPayload = productToCatalogPayload(product);
    const url = getCatalogApiUrl(tenant.metaCatalogId!, "/products");

    logger.info(
      `Actualizando producto "${product.name}" (${product.id}) en el catálogo de WhatsApp (tenant: ${tenant.name})`,
    );

    await axios.post(
      url,
      {
        requests: [
          {
            method: "UPDATE",
            retailer_id: catalogPayload.retailer_id,
            data: catalogPayload,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${tenant.metaAccessToken}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      },
    );

    logger.info(`Producto "${product.name}" actualizado en el catálogo`);
    return true;
  } catch (error) {
    logger.error(
      `Error al actualizar producto "${product.name}" en el catálogo de WhatsApp`,
      error,
    );
    return false;
  }
};

/**
 * Elimina un producto del catálogo de WhatsApp Business
 *
 * @param productId - ID del producto en el sistema (retailer_id)
 * @param tenant - Tenant con credenciales de Meta
 * @returns true si la eliminación fue exitosa
 */
export const removeProductFromCatalog = async (
  productId: string,
  tenant: Tenant,
): Promise<boolean> => {
  try {
    validateCatalogCredentials(tenant);

    const url = getCatalogApiUrl(tenant.metaCatalogId!, "/products");

    logger.info(
      `Eliminando producto ${productId} del catálogo de WhatsApp (tenant: ${tenant.name})`,
    );

    await axios.post(
      url,
      {
        requests: [
          {
            method: "DELETE",
            retailer_id: productId,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${tenant.metaAccessToken}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      },
    );

    logger.info(`Producto ${productId} eliminado del catálogo`);
    return true;
  } catch (error) {
    logger.error(
      `Error al eliminar producto ${productId} del catálogo de WhatsApp`,
      error,
    );
    return false;
  }
};

/**
 * Sincroniza múltiples productos con el catálogo de WhatsApp Business
 * Útil para sincronización inicial o bulk updates
 *
 * @param products - Array de productos a sincronizar
 * @param tenant - Tenant con credenciales de Meta
 * @returns Número de productos sincronizados exitosamente
 */
export const syncProductsToCatalog = async (
  products: Product[],
  tenant: Tenant,
): Promise<number> => {
  try {
    validateCatalogCredentials(tenant);

    if (products.length === 0) {
      logger.info("No hay productos para sincronizar con el catálogo");
      return 0;
    }

    const url = getCatalogApiUrl(tenant.metaCatalogId!, "/batch");

    logger.info(
      `Sincronizando ${products.length} productos con el catálogo de WhatsApp (tenant: ${tenant.name})`,
    );

    // WhatsApp permite hasta 10,000 productos por batch
    // Dividimos en chunks de 1000 para evitar timeouts
    const chunkSize = 1000;
    let successCount = 0;

    for (let i = 0; i < products.length; i += chunkSize) {
      const chunk = products.slice(i, i + chunkSize);
      const requests = chunk.map((product) => {
        const payload = productToCatalogPayload(product);
        return {
          method: "UPDATE", // UPDATE crea si no existe (upsert)
          retailer_id: payload.retailer_id,
          data: payload,
        };
      });

      try {
        await axios.post<CatalogProductBatchResponse>(
          url,
          { requests },
          {
            headers: {
              Authorization: `Bearer ${tenant.metaAccessToken}`,
              "Content-Type": "application/json",
            },
            timeout: 60000, // 60 segundos para batch operations
          },
        );
        successCount += chunk.length;
        logger.info(
          `Chunk ${Math.floor(i / chunkSize) + 1} sincronizado (${chunk.length} productos)`,
        );
      } catch (chunkError) {
        logger.error(
          `Error al sincronizar chunk ${Math.floor(i / chunkSize) + 1}`,
          chunkError,
        );
      }
    }

    logger.info(
      `Sincronización completada: ${successCount}/${products.length} productos`,
    );

    return successCount;
  } catch (error) {
    logger.error("Error en la sincronización bulk con el catálogo", error);
    return 0;
  }
};

/**
 * Verifica si el tenant tiene configurado el catálogo de WhatsApp
 */
export const hasCatalogConfigured = (tenant: Tenant): boolean => {
  return !!(tenant.metaCatalogId && tenant.metaAccessToken);
};

/**
 * Actualiza la disponibilidad de un producto en el catálogo
 * Útil para cuando cambia solo el stock o disponibilidad
 *
 * @param productId - ID del producto
 * @param available - Si el producto está disponible o no
 * @param tenant - Tenant con credenciales de Meta
 */
export const updateProductAvailabilityInCatalog = async (
  productId: string,
  available: boolean,
  tenant: Tenant,
): Promise<boolean> => {
  try {
    validateCatalogCredentials(tenant);

    const url = getCatalogApiUrl(tenant.metaCatalogId!, "/products");

    logger.info(
      `Actualizando disponibilidad del producto ${productId} a "${available ? "in stock" : "out of stock"}" (tenant: ${tenant.name})`,
    );

    await axios.post(
      url,
      {
        requests: [
          {
            method: "UPDATE",
            retailer_id: productId,
            data: {
              availability: available ? "in stock" : "out of stock",
            },
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${tenant.metaAccessToken}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      },
    );

    logger.info(
      `Disponibilidad del producto ${productId} actualizada en el catálogo`,
    );
    return true;
  } catch (error) {
    logger.error(
      `Error al actualizar disponibilidad del producto ${productId} en el catálogo`,
      error,
    );
    return false;
  }
};
