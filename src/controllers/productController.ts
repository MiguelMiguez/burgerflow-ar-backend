import { NextFunction, Request, Response } from "express";
import {
  createProduct,
  deleteProduct,
  getProductById,
  listAvailableProducts,
  listProducts,
  listProductsByCategory,
  toggleProductAvailability,
  updateProduct,
} from "../services/productService";
import {
  CreateProductInput,
  UpdateProductInput,
  ProductCategory,
} from "../models/product";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";
import { getTenantById } from "../services/tenantService";
import {
  syncProductsToCatalog,
  hasCatalogConfigured,
} from "../services/whatsappCatalogService";

const getTenantId = (req: Request): string => {
  // Priorizar tenantId del usuario autenticado con Firebase
  if (req.user?.tenantId) {
    return req.user.tenantId;
  }

  // Fallback: buscar en params o headers (legacy)
  const tenantId = req.params.tenantId || req.headers["x-tenant-id"];
  if (!tenantId || typeof tenantId !== "string") {
    throw new HttpError(400, "Se requiere el identificador del tenant.");
  }
  return tenantId;
};

const sanitizeProductPayload = (
  payload: Partial<CreateProductInput>,
): Partial<CreateProductInput> => {
  const normalized: Partial<CreateProductInput> = {};

  if (payload.name !== undefined) {
    const name = payload.name.trim();
    if (name.length === 0) {
      throw new HttpError(400, "El producto debe incluir un nombre.");
    }
    normalized.name = name;
  }

  if (payload.description !== undefined) {
    normalized.description = payload.description.trim();
  }

  if (payload.price !== undefined) {
    const price = Number(payload.price);
    if (!Number.isFinite(price) || price < 0) {
      throw new HttpError(
        400,
        "El precio debe ser un número mayor o igual a 0.",
      );
    }
    normalized.price = Number(price.toFixed(2));
  }

  if (payload.image !== undefined) {
    normalized.image = payload.image;
  }

  if (payload.category !== undefined) {
    normalized.category = payload.category;
  }

  if (payload.ingredients !== undefined) {
    normalized.ingredients = payload.ingredients;
  }

  if (payload.compatibleExtras !== undefined) {
    normalized.compatibleExtras = payload.compatibleExtras;
  }

  if (payload.stock !== undefined) {
    const stock = Number(payload.stock);
    if (!Number.isFinite(stock) || stock < 0) {
      throw new HttpError(
        400,
        "El stock debe ser un número mayor o igual a 0.",
      );
    }
    normalized.stock = stock;
  }

  if (payload.unit !== undefined) {
    normalized.unit = payload.unit;
  }

  if (payload.available !== undefined) {
    normalized.available = payload.available;
  }

  return normalized;
};

export const handleListProducts = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { available, category } = req.query;

    let products;

    if (category && typeof category === "string") {
      products = await listProductsByCategory(
        tenantId,
        category as ProductCategory,
      );
    } else if (available === "true") {
      products = await listAvailableProducts(tenantId);
    } else {
      products = await listProducts(tenantId);
    }

    res.json(products);
  } catch (error) {
    next(error);
  }
};

export const handleGetProduct = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    if (!id) {
      throw new HttpError(400, "Se requiere el id del producto.");
    }

    const product = await getProductById(tenantId, id);
    res.json(product);
  } catch (error) {
    next(error);
  }
};

export const handleCreateProduct = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const sanitized = sanitizeProductPayload(req.body);

    if (!sanitized.name) {
      throw new HttpError(400, "El producto debe incluir un nombre.");
    }

    if (sanitized.price === undefined) {
      throw new HttpError(400, "El producto debe incluir un precio.");
    }

    if (!sanitized.category) {
      throw new HttpError(400, "El producto debe incluir una categoría.");
    }

    const payload: CreateProductInput = {
      ...(sanitized as CreateProductInput),
      tenantId,
      ingredients: sanitized.ingredients || [],
    };

    const product = await createProduct(payload);
    logger.info(`Producto creado: ${product.name} (${product.id})`);
    res.status(201).json(product);
  } catch (error) {
    next(error);
  }
};

export const handleUpdateProduct = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    if (!id) {
      throw new HttpError(400, "Se requiere el id del producto.");
    }

    logger.info(
      `Actualizando producto ${id}, payload: compatibleExtras=${JSON.stringify(req.body.compatibleExtras)}, fields=${Object.keys(req.body).join(",")}`,
    );

    const sanitized = sanitizeProductPayload(req.body);

    logger.info(
      `Payload sanitizado: compatibleExtras=${JSON.stringify(sanitized.compatibleExtras)}, fields=${Object.keys(sanitized).join(",")}`,
    );

    if (Object.keys(sanitized).length === 0) {
      throw new HttpError(
        400,
        "Se requiere al menos un campo para actualizar.",
      );
    }

    const product = await updateProduct(
      tenantId,
      id,
      sanitized as UpdateProductInput,
    );
    logger.info(`Producto actualizado: ${product.name} (${product.id})`);
    res.json(product);
  } catch (error) {
    next(error);
  }
};

export const handleDeleteProduct = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    if (!id) {
      throw new HttpError(400, "Se requiere el id del producto.");
    }

    await deleteProduct(tenantId, id);
    logger.info(`Producto desactivado (${id})`);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const handleToggleProductAvailability = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    if (!id) {
      throw new HttpError(400, "Se requiere el id del producto.");
    }

    const product = await toggleProductAvailability(tenantId, id);
    logger.info(
      `Producto ${product.available ? "activado" : "desactivado"}: ${product.name}`,
    );
    res.json(product);
  } catch (error) {
    next(error);
  }
};

/**
 * Sincroniza todos los productos del tenant con el catálogo de WhatsApp
 * POST /products/sync-catalog
 */
export const handleSyncCatalog = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantId(req);

    // Verificar que el tenant tenga configurado el catálogo
    const tenant = await getTenantById(tenantId);
    if (!hasCatalogConfigured(tenant)) {
      throw new HttpError(
        400,
        "El tenant no tiene configurado el catálogo de WhatsApp. Configure metaCatalogId y metaAccessToken.",
      );
    }

    // Obtener todos los productos disponibles
    const products = await listAvailableProducts(tenantId);

    if (products.length === 0) {
      res.json({
        message: "No hay productos disponibles para sincronizar.",
        synced: 0,
        total: 0,
      });
      return;
    }

    // Sincronizar con el catálogo
    const syncedCount = await syncProductsToCatalog(products, tenant);

    logger.info(
      `Catálogo sincronizado para tenant ${tenantId}: ${syncedCount}/${products.length} productos`,
    );

    res.json({
      message: "Sincronización completada.",
      synced: syncedCount,
      total: products.length,
    });
  } catch (error) {
    next(error);
  }
};
