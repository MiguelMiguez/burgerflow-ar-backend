import { NextFunction, Request, Response } from "express";
import {
  calculateDeliveryCost,
  createDeliveryZone,
  deleteDeliveryZone,
  getDeliveryZoneById,
  listActiveDeliveryZones,
  listDeliveryZones,
  updateDeliveryZone,
} from "../services/deliveryZoneService";
import {
  CreateDeliveryZoneInput,
  UpdateDeliveryZoneInput,
} from "../models/deliveryZone";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";
import { getTenantIdFromRequest } from "../utils/tenantUtils";

export const handleListDeliveryZones = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { active } = req.query;

    const zones =
      active === "true"
        ? await listActiveDeliveryZones(tenantId)
        : await listDeliveryZones(tenantId);

    res.json(zones);
  } catch (error) {
    next(error);
  }
};

export const handleGetDeliveryZone = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { id } = req.params;

    if (!id) {
      throw new HttpError(400, "Se requiere el id de la zona.");
    }

    const zone = await getDeliveryZoneById(tenantId, id);
    res.json(zone);
  } catch (error) {
    next(error);
  }
};

export const handleCalculateDeliveryCost = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { zoneId } = req.query;

    if (!zoneId || typeof zoneId !== "string") {
      throw new HttpError(400, "Se requiere el id de la zona.");
    }

    const price = await calculateDeliveryCost(tenantId, zoneId);
    res.json({ zoneId, price });
  } catch (error) {
    next(error);
  }
};

export const handleCreateDeliveryZone = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const payload: CreateDeliveryZoneInput = {
      ...req.body,
      tenantId,
    };

    if (!payload.name) {
      throw new HttpError(400, "La zona debe tener un nombre.");
    }

    if (payload.price === undefined || payload.price < 0) {
      throw new HttpError(400, "El precio debe ser un número válido.");
    }

    const zone = await createDeliveryZone(payload);
    logger.info(`Zona de delivery creada: ${zone.name} (${zone.id})`);
    res.status(201).json(zone);
  } catch (error) {
    next(error);
  }
};

export const handleUpdateDeliveryZone = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { id } = req.params;

    if (!id) {
      throw new HttpError(400, "Se requiere el id de la zona.");
    }

    const payload = req.body as UpdateDeliveryZoneInput;

    if (Object.keys(payload).length === 0) {
      throw new HttpError(
        400,
        "Se requiere al menos un campo para actualizar.",
      );
    }

    const zone = await updateDeliveryZone(tenantId, id, payload);
    logger.info(`Zona de delivery actualizada: ${zone.name} (${zone.id})`);
    res.json(zone);
  } catch (error) {
    next(error);
  }
};

export const handleDeleteDeliveryZone = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { id } = req.params;

    if (!id) {
      throw new HttpError(400, "Se requiere el id de la zona.");
    }

    await deleteDeliveryZone(tenantId, id);
    logger.info(`Zona de delivery eliminada (${id})`);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
