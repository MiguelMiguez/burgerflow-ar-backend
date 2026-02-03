import { NextFunction, Request, Response } from "express";
import {
  createIngredient,
  deleteIngredient,
  getIngredientById,
  getLowStockIngredients,
  listIngredients,
  updateIngredient,
  updateStock,
} from "../services/ingredientService";
import {
  CreateIngredientInput,
  UpdateIngredientInput,
} from "../models/ingredient";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";

const getTenantId = (req: Request): string => {
  const tenantId = req.params.tenantId || req.headers["x-tenant-id"];
  if (!tenantId || typeof tenantId !== "string") {
    throw new HttpError(400, "Se requiere el identificador del tenant.");
  }
  return tenantId;
};

export const handleListIngredients = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const ingredients = await listIngredients(tenantId);
    res.json(ingredients);
  } catch (error) {
    next(error);
  }
};

export const handleGetIngredient = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    if (!id) {
      throw new HttpError(400, "Se requiere el id del ingrediente.");
    }

    const ingredient = await getIngredientById(tenantId, id);
    res.json(ingredient);
  } catch (error) {
    next(error);
  }
};

export const handleCreateIngredient = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const payload: CreateIngredientInput = {
      ...req.body,
      tenantId,
    };

    if (!payload.name) {
      throw new HttpError(400, "El ingrediente debe tener un nombre.");
    }

    if (!payload.unit) {
      throw new HttpError(400, "El ingrediente debe tener una unidad.");
    }

    if (payload.stock === undefined || payload.stock < 0) {
      throw new HttpError(400, "El stock debe ser un número válido.");
    }

    const ingredient = await createIngredient(payload);
    logger.info(`Ingrediente creado: ${ingredient.name} (${ingredient.id})`);
    res.status(201).json(ingredient);
  } catch (error) {
    next(error);
  }
};

export const handleUpdateIngredient = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    if (!id) {
      throw new HttpError(400, "Se requiere el id del ingrediente.");
    }

    const payload = req.body as UpdateIngredientInput;

    if (Object.keys(payload).length === 0) {
      throw new HttpError(
        400,
        "Se requiere al menos un campo para actualizar.",
      );
    }

    const ingredient = await updateIngredient(tenantId, id, payload);
    logger.info(
      `Ingrediente actualizado: ${ingredient.name} (${ingredient.id})`,
    );
    res.json(ingredient);
  } catch (error) {
    next(error);
  }
};

export const handleDeleteIngredient = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    if (!id) {
      throw new HttpError(400, "Se requiere el id del ingrediente.");
    }

    await deleteIngredient(tenantId, id);
    logger.info(`Ingrediente eliminado (${id})`);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const handleUpdateStock = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    logger.info(`Actualizando stock - Tenant: ${tenantId}, ID: ${id}, Body: ${JSON.stringify(req.body)}`);

    if (!id) {
      throw new HttpError(400, "Se requiere el id del ingrediente.");
    }

    const { quantity, type, reason } = req.body;

    if (quantity === undefined || typeof quantity !== "number") {
      throw new HttpError(400, "Se requiere una cantidad válida.");
    }

    if (!type || !["entrada", "salida", "ajuste"].includes(type)) {
      throw new HttpError(400, "El tipo debe ser: entrada, salida o ajuste.");
    }

    if (!reason) {
      throw new HttpError(400, "Se requiere una razón para el movimiento.");
    }

    const ingredient = await updateStock(tenantId, id, quantity, type, reason);
    logger.info(`Stock actualizado: ${ingredient.name} (${type}: ${quantity})`);
    res.json(ingredient);
  } catch (error) {
    logger.error(`Error al actualizar stock:`, error);
    next(error);
  }
};

export const handleGetLowStock = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const ingredients = await getLowStockIngredients(tenantId);
    res.json(ingredients);
  } catch (error) {
    next(error);
  }
};
