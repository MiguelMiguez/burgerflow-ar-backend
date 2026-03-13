import { NextFunction, Request, Response } from "express";
import {
  cancelOrder,
  confirmOrder,
  createOrder,
  getOrderById,
  listOrders,
  listAllOrders,
  listOrdersByDate,
  listOrdersByStatus,
  listPendingOrders,
  listAllPendingOrders,
  updateOrder,
} from "../services/orderService";
import {
  CreateOrderInput,
  UpdateOrderInput,
  OrderStatus,
} from "../models/order";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";
import { getTenantIdFromRequest, getOptionalTenantId } from "../utils/tenantUtils";

export const handleListOrders = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // SEGURIDAD: El tenantId se obtiene del usuario autenticado
    const tenantId = getOptionalTenantId(req);
    const { status, date, pending } = req.query;

    // Solo usuarios owner/admin pueden ver todos los pedidos sin tenant específico
    const isAdminWithoutTenant = !tenantId && req.user?.role === "owner";

    let orders;

    // Si no hay tenant y es admin/owner, listar de todos los tenants
    if (!tenantId && isAdminWithoutTenant) {
      if (pending === "true") {
        orders = await listAllPendingOrders();
      } else {
        orders = await listAllOrders();
      }
    } else if (tenantId) {
      if (pending === "true") {
        orders = await listPendingOrders(tenantId);
      } else if (status && typeof status === "string") {
        orders = await listOrdersByStatus(tenantId, status as OrderStatus);
      } else if (date && typeof date === "string") {
        orders = await listOrdersByDate(tenantId, date);
      } else {
        orders = await listOrders(tenantId);
      }
    } else {
      throw new HttpError(401, "Requiere autenticación válida.");
    }

    res.json(orders);
  } catch (error) {
    next(error);
  }
};

export const handleGetOrder = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { id } = req.params;

    const order = await getOrderById(tenantId, id);
    res.json(order);
  } catch (error) {
    next(error);
  }
};

export const handleCreateOrder = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const payload: CreateOrderInput = {
      ...req.body,
      tenantId,
    };

    const order = await createOrder(payload);
    logger.info(`Pedido creado: #${order.id} para ${order.customerName}`);
    res.status(201).json(order);
  } catch (error) {
    next(error);
  }
};

export const handleUpdateOrder = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { id } = req.params;

    if (!id) {
      throw new HttpError(400, "Se requiere el id del pedido.");
    }

    const payload = req.body as UpdateOrderInput;

    if (Object.keys(payload).length === 0) {
      throw new HttpError(
        400,
        "Se requiere al menos un campo para actualizar.",
      );
    }

    const order = await updateOrder(tenantId, id, payload);
    logger.info(`Pedido actualizado: #${order.id}`);
    res.json(order);
  } catch (error) {
    next(error);
  }
};

export const handleConfirmOrder = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { id } = req.params;

    if (!id) {
      throw new HttpError(400, "Se requiere el id del pedido.");
    }

    const order = await confirmOrder(tenantId, id);
    logger.info(`Pedido confirmado: #${order.id}`);
    res.json(order);
  } catch (error) {
    next(error);
  }
};

export const handleCancelOrder = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { id } = req.params;

    if (!id) {
      throw new HttpError(400, "Se requiere el id del pedido.");
    }

    const order = await cancelOrder(tenantId, id);
    logger.info(`Pedido cancelado: #${order.id}`);
    res.json(order);
  } catch (error) {
    next(error);
  }
};

export const handleUpdateOrderStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { id } = req.params;
    const { status, deliveryId, deliveryCost } = req.body;

    if (!id) {
      throw new HttpError(400, "Se requiere el id del pedido.");
    }

    if (!status) {
      throw new HttpError(400, "Se requiere el nuevo estado del pedido.");
    }

    const validStatuses: OrderStatus[] = [
      "pendiente_pago",
      "pendiente",
      "confirmado",
      "en_preparacion",
      "listo",
      "en_camino",
      "entregado",
      "cancelado",
    ];

    if (!validStatuses.includes(status)) {
      throw new HttpError(
        400,
        `Estado inválido. Debe ser uno de: ${validStatuses.join(", ")}`,
      );
    }

    // Construir payload de actualización
    const updatePayload: {
      status: OrderStatus;
      deliveryId?: string;
      deliveryCost?: number;
    } = { status };
    if (deliveryId) {
      updatePayload.deliveryId = deliveryId;
      logger.info(`Pedido #${id} asignado a repartidor: ${deliveryId}`);
    }
    if (deliveryCost !== undefined && deliveryCost >= 0) {
      updatePayload.deliveryCost = deliveryCost;
      logger.info(`Pedido #${id} costo de envío: ${deliveryCost}`);
    }

    const order = await updateOrder(tenantId, id, updatePayload);
    logger.info(`Pedido #${order.id} cambió a estado: ${status}`);
    res.json(order);
  } catch (error) {
    next(error);
  }
};

export const handleGetDeliverySettlements = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { date, deliveryId } = req.query;

    if (!date || typeof date !== "string") {
      throw new HttpError(400, "Se requiere una fecha (formato YYYY-MM-DD).");
    }

    if (deliveryId && typeof deliveryId === "string") {
      // Rendición de un repartidor específico
      const { getDeliverySettlement } =
        await import("../services/orderService");
      const settlement = await getDeliverySettlement(
        tenantId,
        deliveryId,
        date,
      );
      res.json(settlement);
    } else {
      // Rendiciones de todos los repartidores
      const { getAllDeliverySettlements } =
        await import("../services/orderService");
      const settlements = await getAllDeliverySettlements(tenantId, date);
      res.json(settlements);
    }
  } catch (error) {
    next(error);
  }
};
