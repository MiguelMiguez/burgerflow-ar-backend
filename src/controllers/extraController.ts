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
import { getTenantIdFromRequest } from "../utils/tenantUtils";
import { logger } from "../utils/logger";

export const handleListExtras = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantIdFromRequest(req);
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
    const tenantId = getTenantIdFromRequest(req);
    const { id } = req.params;

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
    const tenantId = getTenantIdFromRequest(req);
    const payload: CreateExtraInput = {
      ...req.body,
      tenantId,
    };

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
    const tenantId = getTenantIdFromRequest(req);
    const { id } = req.params;
    const payload: UpdateExtraInput = req.body;

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
    const tenantId = getTenantIdFromRequest(req);
    const { id } = req.params;

    await deleteExtra(tenantId, id);
    logger.info(`Extra eliminado: ${id}`);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
