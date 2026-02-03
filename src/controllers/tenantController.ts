import { NextFunction, Request, Response } from "express";
import {
  createTenant,
  deleteTenant,
  getTenantById,
  listTenants,
  updateTenant,
} from "../services/tenantService";
import { CreateTenantInput, UpdateTenantInput } from "../models/tenant";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";

export const handleListTenants = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenants = await listTenants();
    res.json(tenants);
  } catch (error) {
    next(error);
  }
};

export const handleGetTenant = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    if (!id) {
      throw new HttpError(400, "Se requiere el id del tenant.");
    }

    const tenant = await getTenantById(id);
    res.json(tenant);
  } catch (error) {
    next(error);
  }
};

export const handleCreateTenant = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const payload = req.body as CreateTenantInput;

    if (!payload.name) {
      throw new HttpError(400, "El tenant debe tener un nombre.");
    }

    const tenant = await createTenant(payload);
    logger.info(`Tenant creado: ${tenant.name} (${tenant.id})`);
    res.status(201).json(tenant);
  } catch (error) {
    next(error);
  }
};

export const handleUpdateTenant = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    if (!id) {
      throw new HttpError(400, "Se requiere el id del tenant.");
    }

    const payload = req.body as UpdateTenantInput;

    if (Object.keys(payload).length === 0) {
      throw new HttpError(
        400,
        "Se requiere al menos un campo para actualizar.",
      );
    }

    const tenant = await updateTenant(id, payload);
    logger.info(`Tenant actualizado: ${tenant.name} (${tenant.id})`);
    res.json(tenant);
  } catch (error) {
    next(error);
  }
};

export const handleDeleteTenant = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    if (!id) {
      throw new HttpError(400, "Se requiere el id del tenant a eliminar.");
    }

    await deleteTenant(id);
    logger.info(`Tenant desactivado (${id})`);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
