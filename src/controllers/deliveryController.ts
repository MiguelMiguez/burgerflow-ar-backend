import { NextFunction, Request, Response } from "express";
import {
  createDelivery,
  deleteDelivery,
  getDeliveryById,
  listActiveDeliveries,
  listDeliveries,
  toggleDeliveryStatus,
  updateDelivery,
} from "../services/deliveryService";
import { CreateDeliveryInput, UpdateDeliveryInput } from "../models/delivery";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";

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

export const handleListDeliveries = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { active } = req.query;

    const deliveries =
      active === "true"
        ? await listActiveDeliveries(tenantId)
        : await listDeliveries(tenantId);

    res.json(deliveries);
  } catch (error) {
    next(error);
  }
};

export const handleGetDelivery = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    if (!id) {
      throw new HttpError(400, "Se requiere el id del delivery.");
    }

    const delivery = await getDeliveryById(tenantId, id);
    res.json(delivery);
  } catch (error) {
    next(error);
  }
};

export const handleCreateDelivery = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const payload: CreateDeliveryInput = {
      ...req.body,
      tenantId,
    };

    if (!payload.name) {
      throw new HttpError(400, "El delivery debe tener un nombre.");
    }

    if (!payload.phone) {
      throw new HttpError(400, "El delivery debe tener un teléfono.");
    }

    const delivery = await createDelivery(payload);
    logger.info(`Delivery creado: ${delivery.name} (${delivery.id})`);
    res.status(201).json(delivery);
  } catch (error) {
    next(error);
  }
};

export const handleUpdateDelivery = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    if (!id) {
      throw new HttpError(400, "Se requiere el id del delivery.");
    }

    const payload = req.body as UpdateDeliveryInput;

    if (Object.keys(payload).length === 0) {
      throw new HttpError(
        400,
        "Se requiere al menos un campo para actualizar.",
      );
    }

    const delivery = await updateDelivery(tenantId, id, payload);
    logger.info(`Delivery actualizado: ${delivery.name} (${delivery.id})`);
    res.json(delivery);
  } catch (error) {
    next(error);
  }
};

export const handleDeleteDelivery = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    if (!id) {
      throw new HttpError(400, "Se requiere el id del delivery.");
    }

    await deleteDelivery(tenantId, id);
    logger.info(`Delivery desactivado (${id})`);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const handleToggleDeliveryStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    if (!id) {
      throw new HttpError(400, "Se requiere el id del delivery.");
    }

    const delivery = await toggleDeliveryStatus(tenantId, id);
    logger.info(
      `Delivery ${delivery.isActive ? "activado" : "desactivado"}: ${delivery.name}`,
    );
    res.json(delivery);
  } catch (error) {
    next(error);
  }
};
