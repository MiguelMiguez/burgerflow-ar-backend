import type {
  QueryDocumentSnapshot,
  DocumentReference,
} from "firebase-admin/firestore";
import { getFirestore } from "../config/firebase";
import {
  CashRegister,
  CreateCashRegisterInput,
  CashRegisterSummary,
  SalesReport,
  ReportPeriod,
} from "../models/cashRegister";
import { getOrderStats, getPendingOrdersByDate } from "./orderService";
import { HttpError } from "../utils/httpError";

const CASH_REGISTERS_COLLECTION = "cashRegisters";

type CashRegisterDocument = Omit<CashRegister, "id">;

const getCollection = (tenantId: string) =>
  getFirestore().collection(`tenants/${tenantId}/${CASH_REGISTERS_COLLECTION}`);

const getDocumentRef = (tenantId: string, id: string): DocumentReference => {
  if (!id) {
    throw new HttpError(400, "Se requiere un identificador de caja válido.");
  }
  return getCollection(tenantId).doc(id);
};

const mapSnapshotToCashRegister = (
  doc: QueryDocumentSnapshot,
): CashRegister => ({
  id: doc.id,
  ...(doc.data() as CashRegisterDocument),
});

export const listCashRegisters = async (
  tenantId: string,
): Promise<CashRegister[]> => {
  const snapshot = await getCollection(tenantId).orderBy("date", "desc").get();
  return snapshot.docs.map(mapSnapshotToCashRegister);
};

export const getCashRegisterByDate = async (
  tenantId: string,
  date: string,
): Promise<CashRegister | null> => {
  const snapshot = await getCollection(tenantId)
    .where("date", "==", date)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  return mapSnapshotToCashRegister(snapshot.docs[0]);
};

export const getCashRegisterById = async (
  tenantId: string,
  id: string,
): Promise<CashRegister> => {
  const docRef = getDocumentRef(tenantId, id);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new HttpError(404, "El cierre de caja solicitado no existe.");
  }

  return {
    id: doc.id,
    ...(doc.data() as CashRegisterDocument),
  };
};

export const closeCashRegister = async (
  tenantId: string,
  date: string,
  closedBy: string,
  notes?: string,
): Promise<CashRegister> => {
  // Verificar si ya existe un cierre para esa fecha
  const existingClose = await getCashRegisterByDate(tenantId, date);
  if (existingClose) {
    throw new HttpError(400, `Ya existe un cierre de caja para el ${date}.`);
  }

  // Verificar si hay pedidos pendientes (no entregados ni cancelados)
  const pendingOrders = await getPendingOrdersByDate(tenantId, date);
  if (pendingOrders.length > 0) {
    const pendingCount = pendingOrders.length;
    const orderIds = pendingOrders.slice(0, 5).map(o => `#${o.id.slice(-6).toUpperCase()}`).join(", ");
    const moreText = pendingCount > 5 ? ` y ${pendingCount - 5} más` : "";
    throw new HttpError(
      400,
      `No se puede cerrar la caja. Hay ${pendingCount} pedido(s) sin entregar o cancelar: ${orderIds}${moreText}.`
    );
  }

  // Obtener estadísticas del día
  const stats = await getOrderStats(tenantId, date, date);

  const summary: CashRegisterSummary = {
    cashTotal: stats.totalCash,
    transferTotal: stats.totalTransfer,
    deliveryCostTotal: stats.totalDeliveryCost,
    subtotal: stats.totalSales - stats.totalDeliveryCost,
    grandTotal: stats.totalSales,
    orderCount: stats.totalOrders,
    cancelledCount: stats.cancelledOrders,
  };

  const now = new Date().toISOString();

  const document: CashRegisterDocument = {
    tenantId,
    date,
    summary,
    closedBy,
    notes,
    closedAt: now,
    createdAt: now,
  };

  const docRef = await getCollection(tenantId).add(document);

  return {
    id: docRef.id,
    ...document,
  };
};

export const getDailySummary = async (
  tenantId: string,
  date: string,
): Promise<CashRegisterSummary> => {
  const stats = await getOrderStats(tenantId, date, date);

  return {
    cashTotal: stats.totalCash,
    transferTotal: stats.totalTransfer,
    deliveryCostTotal: stats.totalDeliveryCost,
    subtotal: stats.totalSales - stats.totalDeliveryCost,
    grandTotal: stats.totalSales,
    orderCount: stats.totalOrders,
    cancelledCount: stats.cancelledOrders,
  };
};

const getDateRange = (
  period: ReportPeriod,
  referenceDate: string,
): { startDate: string; endDate: string } => {
  const date = new Date(referenceDate);

  switch (period) {
    case "daily":
      return {
        startDate: referenceDate,
        endDate: referenceDate,
      };

    case "weekly": {
      const dayOfWeek = date.getDay();
      const startOfWeek = new Date(date);
      startOfWeek.setDate(date.getDate() - dayOfWeek);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);

      return {
        startDate: startOfWeek.toISOString().split("T")[0],
        endDate: endOfWeek.toISOString().split("T")[0],
      };
    }

    case "monthly": {
      const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
      const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);

      return {
        startDate: startOfMonth.toISOString().split("T")[0],
        endDate: endOfMonth.toISOString().split("T")[0],
      };
    }
  }
};

export const generateSalesReport = async (
  tenantId: string,
  period: ReportPeriod,
  referenceDate: string,
): Promise<SalesReport> => {
  const { startDate, endDate } = getDateRange(period, referenceDate);
  const stats = await getOrderStats(tenantId, startDate, endDate);

  const averageOrderValue =
    stats.totalOrders > 0 ? stats.totalSales / stats.totalOrders : 0;

  // TODO: Implementar top products cuando tengamos los datos necesarios
  const topProducts: SalesReport["topProducts"] = [];

  return {
    period,
    startDate,
    endDate,
    totalSales: stats.totalSales,
    totalOrders: stats.totalOrders,
    totalCash: stats.totalCash,
    totalTransfer: stats.totalTransfer,
    totalDeliveryCost: stats.totalDeliveryCost,
    averageOrderValue,
    topProducts,
  };
};
