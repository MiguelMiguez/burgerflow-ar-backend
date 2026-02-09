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

const getTenantId = (req: Request): string | null => {
  // Priorizar tenantId del usuario autenticado con Firebase
  if (req.user?.tenantId) {
    return req.user.tenantId;
  }
  
  // Fallback: buscar en params o headers (legacy)
  const tenantId = req.params.tenantId || req.headers["x-tenant-id"];
  if (!tenantId || typeof tenantId !== "string") {
    return null;
  }
  return tenantId;
};

const requireTenantId = (req: Request): string => {
  const tenantId = getTenantId(req);
  if (!tenantId) {
    throw new HttpError(400, "Se requiere el identificador del tenant.");
  }
  return tenantId;
};

export const handleListOrders = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { status, date, pending } = req.query;
    
    // Verificar si el usuario es admin (solo si no hay tenantId, en cuyo caso el usuario debe ser admin)
    const isAdmin = !tenantId && req.user?.role === "admin";

    let orders;

    // Si no hay tenant y es admin, listar de todos los tenants
    if (!tenantId && isAdmin) {
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
      throw new HttpError(400, "Se requiere el identificador del tenant.");
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
    const tenantId = requireTenantId(req);
    const { id } = req.params;

    if (!id) {
      throw new HttpError(400, "Se requiere el id del pedido.");
    }

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
    const tenantId = requireTenantId(req);
    const payload: CreateOrderInput = {
      ...req.body,
      tenantId,
    };

    if (!payload.customerName) {
      throw new HttpError(400, "El pedido debe tener un nombre de cliente.");
    }

    if (!payload.customerPhone) {
      throw new HttpError(400, "El pedido debe tener un teléfono de contacto.");
    }

    if (!payload.items || payload.items.length === 0) {
      throw new HttpError(400, "El pedido debe tener al menos un producto.");
    }

    if (!payload.orderType) {
      throw new HttpError(
        400,
        "El pedido debe especificar el tipo (delivery/pickup).",
      );
    }

    if (!payload.paymentMethod) {
      throw new HttpError(400, "El pedido debe especificar el método de pago.");
    }

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
    const tenantId = requireTenantId(req);
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
    const tenantId = requireTenantId(req);
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
    const tenantId = requireTenantId(req);
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
    const tenantId = requireTenantId(req);
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
    const tenantId = requireTenantId(req);
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
