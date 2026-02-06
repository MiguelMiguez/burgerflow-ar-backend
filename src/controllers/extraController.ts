import { NextFunction, Request, Response } from "express";
import {
  createExtra,
  deleteExtra,
  getExtraById,
  listActiveExtras,
  listExtras,
  updateExtra,
} from "../services/extraService";
import { CreateExtraInput, UpdateExtraInput } from "../models/extra";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";

const getTenantId = (req: Request): string => {
  const tenantId = req.params.tenantId || req.headers["x-tenant-id"];
  if (!tenantId || typeof tenantId !== "string") {
    throw new HttpError(400, "Se requiere el identificador del tenant.");
  }
  return tenantId;
};

export const handleListExtras = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { activeOnly } = req.query;

    const extras =
      activeOnly === "true"
        ? await listActiveExtras(tenantId)
        : await listExtras(tenantId);

    res.json({ data: extras });
  } catch (error) {
    next(error);
  }
};

export const handleGetExtra = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    if (!id) {
      throw new HttpError(400, "Se requiere el id del extra.");
    }

    const extra = await getExtraById(tenantId, id);
    res.json({ data: extra });
  } catch (error) {
    next(error);
  }
};

export const handleCreateExtra = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const payload: CreateExtraInput = {
      ...req.body,
      tenantId,
    };

    if (!payload.name) {
      throw new HttpError(400, "El extra debe tener un nombre.");
    }

    if (payload.price === undefined || payload.price < 0) {
      throw new HttpError(400, "El extra debe tener un precio válido.");
    }

    const extra = await createExtra(payload);
    logger.info(`Extra creado: ${extra.name} (${extra.id})`);
    res.status(201).json({ data: extra });
  } catch (error) {
    next(error);
  }
};

export const handleUpdateExtra = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const payload: UpdateExtraInput = req.body;

    if (!id) {
      throw new HttpError(400, "Se requiere el id del extra.");
    }

    const extra = await updateExtra(tenantId, id, payload);
    logger.info(`Extra actualizado: ${extra.name} (${extra.id})`);
    res.json({ data: extra });
  } catch (error) {
    next(error);
  }
};

export const handleDeleteExtra = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    if (!id) {
      throw new HttpError(400, "Se requiere el id del extra.");
    }

    await deleteExtra(tenantId, id);
    logger.info(`Extra eliminado: ${id}`);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
