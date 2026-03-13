import { NextFunction, Request, Response } from "express";
import {
  createDelivery,
  deleteDelivery,
  hardDeleteDelivery,
  getDeliveryById,
  listActiveDeliveries,
  listDeliveries,
  toggleDeliveryStatus,
  updateDelivery,
} from "../services/deliveryService";
import { CreateDeliveryInput, UpdateDeliveryInput } from "../models/delivery";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";
import { getTenantIdFromRequest } from "../utils/tenantUtils";

export const handleListDeliveries = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantIdFromRequest(req);
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
    const tenantId = getTenantIdFromRequest(req);
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
    const tenantId = getTenantIdFromRequest(req);
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
    const tenantId = getTenantIdFromRequest(req);
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
    const tenantId = getTenantIdFromRequest(req);
    const { id } = req.params;
    const { permanent } = req.query;

    if (!id) {
      throw new HttpError(400, "Se requiere el id del delivery.");
    }

    if (permanent === "true") {
      await hardDeleteDelivery(tenantId, id);
      logger.info(`Delivery eliminado permanentemente (${id})`);
    } else {
      await deleteDelivery(tenantId, id);
      logger.info(`Delivery desactivado (${id})`);
    }
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
    const tenantId = getTenantIdFromRequest(req);
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
