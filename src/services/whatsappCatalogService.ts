import axios, { AxiosError } from "axios";
import env from "../config/env";
import { logger } from "../utils/logger";
import type { Tenant } from "../models/tenant";
import type { Product } from "../models/product";

/**
 * Servicio para interactuar con el Catálogo de WhatsApp Business (Meta Commerce API)
 * Documentación: https://developers.facebook.com/docs/commerce-platform/catalog/batch-api
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

/**
 * Formato de producto para la Commerce API de Meta
 * Documentación: https://developers.facebook.com/docs/commerce-platform/catalog/fields
 */
interface CatalogProductData {
  id: string; // retailer_id - ID único del producto en tu sistema
  title: string;
  description: string;
  availability: "in stock" | "out of stock";
  condition: "new" | "refurbished" | "used";
  price: string; // Formato: "1500 ARS" (valor + espacio + moneda ISO)
  link: string; // URL del producto (requerido)
  image_link: string; // URL de la imagen del producto (requerido)
  brand?: string;
}

interface CatalogBatchRequest {
  method: "CREATE" | "UPDATE" | "DELETE";
  data: CatalogProductData | { id: string };
}

interface CatalogBatchPayload {
  item_type: "PRODUCT_ITEM";
  requests: CatalogBatchRequest[];
}

interface CatalogBatchResponse {
  handles?: string[];
  validation_status?: Array<{
    retailer_id: string;
    errors?: Array<{ message: string }>;
  }>;
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
 * Construye la URL para el endpoint items_batch de la Commerce API
 */
const getCatalogBatchUrl = (catalogId: string): string => {
  return `https://graph.facebook.com/${env.metaApiVersion}/${catalogId}/items_batch`;
};

/**
 * Convierte un producto del sistema al formato requerido por la Commerce API de Meta
 */
const productToCatalogData = (product: Product, tenant: Tenant): CatalogProductData => {
  // La Commerce API requiere el precio en formato "VALOR MONEDA" (ej: "1500 ARS")
  const priceFormatted = `${Math.round(product.price)} ARS`;

  // URL del producto - usar la URL del local o una URL genérica
  const productUrl = tenant.address 
    ? `https://maps.google.com/?q=${encodeURIComponent(tenant.address)}`
    : `https://wa.me/${tenant.whatsappNumber || tenant.phone || ""}`;

  // URL de la imagen - si no hay, usar una imagen placeholder
  const imageUrl = product.image || "https://placehold.co/600x400/f97316/white?text=Hamburguesa";

  return {
    id: product.id,
    title: product.name.substring(0, 200), // Meta limita a 200 caracteres
    description: product.description?.substring(0, 9999) || `${product.name} - ${product.category}`,
    availability: product.available ? "in stock" : "out of stock",
    condition: "new",
    price: priceFormatted,
    link: productUrl,
    image_link: imageUrl,
    brand: tenant.name,
  };
};

/**
 * Ejecuta una operación batch en el catálogo de Meta
 */
const executeCatalogBatch = async (
  tenant: Tenant,
  requests: CatalogBatchRequest[],
  context: string,
): Promise<boolean> => {
  try {
    validateCatalogCredentials(tenant);

    const url = getCatalogBatchUrl(tenant.metaCatalogId!);
    const payload: CatalogBatchPayload = {
      item_type: "PRODUCT_ITEM",
      requests,
    };

    logger.info(`${context} - Enviando batch de ${requests.length} producto(s) al catálogo`);
    logger.debug(`Payload: ${JSON.stringify(payload, null, 2)}`);

    const response = await axios.post<CatalogBatchResponse>(url, payload, {
      headers: {
        Authorization: `Bearer ${tenant.metaAccessToken}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });

    logger.info(`${context} - Batch ejecutado exitosamente`);
    logger.debug(`Response: ${JSON.stringify(response.data)}`);

    // Verificar si hay errores de validación
    if (response.data.validation_status) {
      const errors = response.data.validation_status.filter(
        (item) => item.errors && item.errors.length > 0,
      );
      if (errors.length > 0) {
        logger.warn(`${context} - Algunos productos tuvieron errores de validación:`, errors);
      }
    }

    return true;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<MetaErrorResponse>;
      const status = axiosError.response?.status;
      const metaError = axiosError.response?.data?.error;
      const responseData = axiosError.response?.data;

      logger.error(`${context} - Error ${status}:`, {
        message: metaError?.message || axiosError.message,
        type: metaError?.type,
        code: metaError?.code,
        responseData: JSON.stringify(responseData),
      });
    } else {
      logger.error(`${context} - Error desconocido:`, error);
    }
    return false;
  }
};

/**
 * Agrega un producto al catálogo de WhatsApp Business
 *
 * @param product - Producto a agregar
 * @param tenant - Tenant con credenciales de Meta
 * @returns true si se agregó exitosamente
 */
export const addProductToCatalog = async (
  product: Product,
  tenant: Tenant,
): Promise<string | null> => {
  try {
    const catalogData = productToCatalogData(product, tenant);

    const success = await executeCatalogBatch(
      tenant,
      [
        {
          method: "CREATE",
          data: catalogData,
        },
      ],
      `Agregar producto "${product.name}" (${product.id})`,
    );

    return success ? product.id : null;
  } catch (error) {
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
    const catalogData = productToCatalogData(product, tenant);

    return await executeCatalogBatch(
      tenant,
      [
        {
          method: "UPDATE",
          data: catalogData,
        },
      ],
      `Actualizar producto "${product.name}" (${product.id})`,
    );
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
    return await executeCatalogBatch(
      tenant,
      [
        {
          method: "DELETE",
          data: { id: productId },
        },
      ],
      `Eliminar producto ${productId}`,
    );
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

    logger.info(
      `Sincronizando ${products.length} productos con el catálogo de WhatsApp (tenant: ${tenant.name})`,
    );

    // Meta permite hasta 5,000 items por batch request
    // Dividimos en chunks de 500 para ser conservadores
    const chunkSize = 500;
    let successCount = 0;

    for (let i = 0; i < products.length; i += chunkSize) {
      const chunk = products.slice(i, i + chunkSize);
      const requests: CatalogBatchRequest[] = chunk.map((product) => ({
        method: "UPDATE" as const, // UPDATE hace upsert (crea si no existe)
        data: productToCatalogData(product, tenant),
      }));

      const success = await executeCatalogBatch(
        tenant,
        requests,
        `Sync chunk ${Math.floor(i / chunkSize) + 1}`,
      );

      if (success) {
        successCount += chunk.length;
        logger.info(
          `Chunk ${Math.floor(i / chunkSize) + 1} sincronizado (${chunk.length} productos)`,
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

    logger.info(
      `Actualizando disponibilidad del producto ${productId} a "${available ? "in stock" : "out of stock"}" (tenant: ${tenant.name})`,
    );

    // Para actualizar solo la disponibilidad, aún necesitamos enviar los campos requeridos
    // Por eso hacemos un UPDATE parcial
    return await executeCatalogBatch(
      tenant,
      [
        {
          method: "UPDATE",
          data: {
            id: productId,
            availability: available ? "in stock" : "out of stock",
          } as CatalogProductData,
        },
      ],
      `Actualizar disponibilidad ${productId}`,
    );
  } catch (error) {
    logger.error(
      `Error al actualizar disponibilidad del producto ${productId} en el catálogo`,
      error,
    );
    return false;
  }
};
