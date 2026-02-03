import type {
  QueryDocumentSnapshot,
  DocumentReference,
  Query,
} from "firebase-admin/firestore";
import { getFirestore } from "../config/firebase";
import {
  Order,
  CreateOrderInput,
  UpdateOrderInput,
  OrderStatus,
  OrderItem,
} from "../models/order";
import { bulkUpdateStock } from "./ingredientService";
import { getProductById } from "./productService";
import { HttpError } from "../utils/httpError";
import { listTenants } from "./tenantService";

const ORDERS_COLLECTION = "orders";

type OrderDocument = Omit<Order, "id">;

const getCollection = (tenantId: string) =>
  getFirestore().collection(`tenants/${tenantId}/${ORDERS_COLLECTION}`);

const getDocumentRef = (tenantId: string, id: string): DocumentReference => {
  if (!id) {
    throw new HttpError(400, "Se requiere un identificador de pedido válido.");
  }
  return getCollection(tenantId).doc(id);
};

const mapSnapshotToOrder = (doc: QueryDocumentSnapshot): Order => ({
  id: doc.id,
  ...(doc.data() as OrderDocument),
});

const calculateOrderTotals = (
  items: OrderItem[],
  deliveryCost: number = 0,
): { subtotal: number; total: number } => {
  const subtotal = items.reduce((sum, item) => sum + item.itemTotal, 0);
  const total = subtotal + deliveryCost;
  return { subtotal, total };
};

// Listar todos los orders de todos los tenants (para admin)
export const listAllOrders = async (): Promise<Order[]> => {
  const tenants = await listTenants();
  const allOrders: Order[] = [];

  for (const tenant of tenants) {
    const orders = await listOrders(tenant.id);
    allOrders.push(...orders);
  }

  // Ordenar por fecha de creación descendente
  return allOrders.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
};

// Listar todos los pedidos pendientes de todos los tenants (para admin)
export const listAllPendingOrders = async (): Promise<Order[]> => {
  const tenants = await listTenants();
  const allOrders: Order[] = [];

  for (const tenant of tenants) {
    const orders = await listPendingOrders(tenant.id);
    allOrders.push(...orders);
  }

  // Ordenar por fecha de creación ascendente (más antiguos primero)
  return allOrders.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
};

export const listOrders = async (tenantId: string): Promise<Order[]> => {
  const snapshot = await getCollection(tenantId)
    .orderBy("createdAt", "desc")
    .get();
  return snapshot.docs.map(mapSnapshotToOrder);
};

export const listOrdersByStatus = async (
  tenantId: string,
  status: OrderStatus,
): Promise<Order[]> => {
  const snapshot = await getCollection(tenantId)
    .where("status", "==", status)
    .orderBy("createdAt", "desc")
    .get();
  return snapshot.docs.map(mapSnapshotToOrder);
};

export const listOrdersByDate = async (
  tenantId: string,
  date: string,
): Promise<Order[]> => {
  const startOfDay = new Date(`${date}T00:00:00.000Z`).toISOString();
  const endOfDay = new Date(`${date}T23:59:59.999Z`).toISOString();

  const snapshot = await getCollection(tenantId)
    .where("createdAt", ">=", startOfDay)
    .where("createdAt", "<=", endOfDay)
    .orderBy("createdAt", "desc")
    .get();

  return snapshot.docs.map(mapSnapshotToOrder);
};

export const listPendingOrders = async (tenantId: string): Promise<Order[]> => {
  const statuses: OrderStatus[] = [
    "pendiente",
    "confirmado",
    "en_preparacion",
    "listo",
    "en_camino",
  ];

  const snapshot = await getCollection(tenantId)
    .where("status", "in", statuses)
    .orderBy("createdAt", "asc")
    .get();

  return snapshot.docs.map(mapSnapshotToOrder);
};

export const getOrderById = async (
  tenantId: string,
  id: string,
): Promise<Order> => {
  const docRef = getDocumentRef(tenantId, id);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new HttpError(404, "El pedido solicitado no existe.");
  }

  return {
    id: doc.id,
    ...(doc.data() as OrderDocument),
  };
};

export const createOrder = async (
  payload: CreateOrderInput,
): Promise<Order> => {
  if (!payload.customerName) {
    throw new HttpError(400, "El pedido debe tener un nombre de cliente.");
  }

  if (!payload.customerPhone) {
    throw new HttpError(400, "El pedido debe tener un teléfono de contacto.");
  }

  if (!payload.items || payload.items.length === 0) {
    throw new HttpError(400, "El pedido debe tener al menos un producto.");
  }

  if (payload.orderType === "delivery" && !payload.deliveryAddress) {
    throw new HttpError(
      400,
      "Los pedidos de delivery deben tener una dirección.",
    );
  }

  const { subtotal, total } = calculateOrderTotals(
    payload.items,
    payload.deliveryCost,
  );

  const now = new Date().toISOString();

  const document: OrderDocument = {
    ...payload,
    status: "pendiente",
    subtotal,
    total,
    createdAt: now,
    updatedAt: now,
  };

  const docRef = await getCollection(payload.tenantId).add(document);

  return {
    id: docRef.id,
    ...document,
  };
};

export const updateOrder = async (
  tenantId: string,
  id: string,
  payload: UpdateOrderInput,
): Promise<Order> => {
  const docRef = getDocumentRef(tenantId, id);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new HttpError(404, "El pedido solicitado no existe.");
  }

  const currentData = doc.data() as OrderDocument;

  // Validar transiciones de estado
  if (payload.status) {
    validateStatusTransition(currentData.status, payload.status);
  }

  const updateData: Partial<OrderDocument> = {
    ...payload,
    updatedAt: new Date().toISOString(),
  };

  // Recalcular total si cambia el costo de envío
  if (payload.deliveryCost !== undefined) {
    const { subtotal, total } = calculateOrderTotals(
      currentData.items,
      payload.deliveryCost,
    );
    updateData.subtotal = subtotal;
    updateData.total = total;
  }

  await docRef.update(updateData);
  const updatedDoc = await docRef.get();

  return {
    id: updatedDoc.id,
    ...(updatedDoc.data() as OrderDocument),
  };
};

export const confirmOrder = async (
  tenantId: string,
  id: string,
): Promise<Order> => {
  const order = await getOrderById(tenantId, id);

  if (order.status !== "pendiente") {
    throw new HttpError(400, "Solo se pueden confirmar pedidos pendientes.");
  }

  // Descontar stock de ingredientes
  const stockUpdates: Array<{ ingredientId: string; quantity: number }> = [];

  for (const item of order.items) {
    const product = await getProductById(tenantId, item.productId);

    for (const ingredient of product.ingredients) {
      const existingUpdate = stockUpdates.find(
        (u) => u.ingredientId === ingredient.ingredientId,
      );

      const totalQuantity = ingredient.quantity * item.quantity;

      if (existingUpdate) {
        existingUpdate.quantity += totalQuantity;
      } else {
        stockUpdates.push({
          ingredientId: ingredient.ingredientId,
          quantity: totalQuantity,
        });
      }
    }

    // Procesar personalizaciones (extras agregan más ingredientes)
    for (const customization of item.customizations) {
      if (customization.type === "agregar") {
        const existingUpdate = stockUpdates.find(
          (u) => u.ingredientId === customization.ingredientId,
        );

        if (existingUpdate) {
          existingUpdate.quantity += item.quantity;
        } else {
          stockUpdates.push({
            ingredientId: customization.ingredientId,
            quantity: item.quantity,
          });
        }
      }
    }
  }

  // Actualizar stock
  await bulkUpdateStock(tenantId, stockUpdates, "salida", `Pedido #${id}`, id);

  // Actualizar estado del pedido
  return updateOrder(tenantId, id, { status: "confirmado" });
};

export const cancelOrder = async (
  tenantId: string,
  id: string,
): Promise<Order> => {
  const order = await getOrderById(tenantId, id);

  const cancellableStatuses: OrderStatus[] = ["pendiente", "confirmado"];
  if (!cancellableStatuses.includes(order.status)) {
    throw new HttpError(
      400,
      "Solo se pueden cancelar pedidos pendientes o confirmados.",
    );
  }

  // TODO: Si el pedido ya estaba confirmado, devolver stock

  return updateOrder(tenantId, id, { status: "cancelado" });
};

const validateStatusTransition = (
  currentStatus: OrderStatus,
  newStatus: OrderStatus,
): void => {
  const validTransitions: Record<OrderStatus, OrderStatus[]> = {
    pendiente: ["confirmado", "cancelado"],
    confirmado: ["en_preparacion", "cancelado"],
    en_preparacion: ["listo"],
    listo: ["en_camino", "entregado"],
    en_camino: ["entregado"],
    entregado: [],
    cancelado: [],
  };

  if (!validTransitions[currentStatus].includes(newStatus)) {
    throw new HttpError(
      400,
      `No se puede cambiar el estado de "${currentStatus}" a "${newStatus}".`,
    );
  }
};

export const getOrderStats = async (
  tenantId: string,
  startDate: string,
  endDate: string,
): Promise<{
  totalOrders: number;
  totalSales: number;
  totalCash: number;
  totalTransfer: number;
  totalDeliveryCost: number;
  cancelledOrders: number;
}> => {
  const startISO = new Date(`${startDate}T00:00:00.000Z`).toISOString();
  const endISO = new Date(`${endDate}T23:59:59.999Z`).toISOString();

  const snapshot = await getCollection(tenantId)
    .where("createdAt", ">=", startISO)
    .where("createdAt", "<=", endISO)
    .get();

  const orders = snapshot.docs.map(mapSnapshotToOrder);

  const completedOrders = orders.filter((o) => o.status === "entregado");
  const cancelledOrders = orders.filter((o) => o.status === "cancelado");

  const totalSales = completedOrders.reduce((sum, o) => sum + o.total, 0);
  const totalCash = completedOrders
    .filter((o) => o.paymentMethod === "efectivo")
    .reduce((sum, o) => sum + o.total, 0);
  const totalTransfer = completedOrders
    .filter((o) => o.paymentMethod === "transferencia")
    .reduce((sum, o) => sum + o.total, 0);
  const totalDeliveryCost = completedOrders.reduce(
    (sum, o) => sum + (o.deliveryCost || 0),
    0,
  );

  return {
    totalOrders: completedOrders.length,
    totalSales,
    totalCash,
    totalTransfer,
    totalDeliveryCost,
    cancelledOrders: cancelledOrders.length,
  };
};
