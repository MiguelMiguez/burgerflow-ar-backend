import { Request, Response, NextFunction } from "express";
import {
  createExtra,
  getExtrasByTenant,
  getExtraById,
  updateExtra,
  deleteExtra,
  getActiveExtrasByTenant,
} from "../services/extraService";
import { CreateExtraInput, UpdateExtraInput } from "../models/extra";

/**
 * POST /extras
 * Crea un nuevo extra/adicional
 */
export const create = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const input: CreateExtraInput = {
      ...req.body,
      tenantId: req.user!.tenantId,
    };

    // Validaciones
    if (!input.name || input.price === undefined) {
      res.status(400).json({
        error: "Nombre y precio son requeridos",
      });
      return;
    }

    if (input.stockConsumption === undefined) {
      input.stockConsumption = 0;
    }

    const extra = await createExtra(input);

    res.status(201).json({
      message: "Extra creado exitosamente",
      data: extra,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /extras
 * Obtiene todos los extras del tenant
 */
export const getAll = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const activeOnly = req.query.activeOnly === "true";

    const extras = activeOnly
      ? await getActiveExtrasByTenant(tenantId)
      : await getExtrasByTenant(tenantId);

    res.status(200).json({
      data: extras,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /extras/:id
 * Obtiene un extra por ID
 */
export const getById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const extra = await getExtraById(id, tenantId);

    res.status(200).json({
      data: extra,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /extras/:id
 * Actualiza un extra
 */
export const update = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;
    const input: UpdateExtraInput = req.body;

    const extra = await updateExtra(id, tenantId, input);

    res.status(200).json({
      message: "Extra actualizado exitosamente",
      data: extra,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /extras/:id
 * Desactiva un extra
 */
export const remove = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    await deleteExtra(id, tenantId);

    res.status(200).json({
      message: "Extra desactivado exitosamente",
    });
  } catch (error) {
    next(error);
  }
};
