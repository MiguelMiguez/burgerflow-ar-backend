import { NextFunction, Request, Response } from "express";
import {
  closeCashRegister,
  generateSalesReport,
  getCashRegisterByDate,
  getCashRegisterById,
  getDailySummary,
  listCashRegisters,
} from "../services/cashRegisterService";
import { ReportPeriod } from "../models/cashRegister";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";

const getTenantId = (req: Request): string => {
  const tenantId = req.params.tenantId || req.headers["x-tenant-id"];
  if (!tenantId || typeof tenantId !== "string") {
    throw new HttpError(400, "Se requiere el identificador del tenant.");
  }
  return tenantId;
};

export const handleListCashRegisters = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const registers = await listCashRegisters(tenantId);
    res.json(registers);
  } catch (error) {
    next(error);
  }
};

export const handleGetCashRegister = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    if (!id) {
      throw new HttpError(400, "Se requiere el id del cierre de caja.");
    }

    const register = await getCashRegisterById(tenantId, id);
    res.json(register);
  } catch (error) {
    next(error);
  }
};

export const handleGetCashRegisterByDate = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { date } = req.params;

    if (!date) {
      throw new HttpError(400, "Se requiere la fecha del cierre de caja.");
    }

    const register = await getCashRegisterByDate(tenantId, date);

    if (!register) {
      res.status(404).json({ error: "No hay cierre de caja para esa fecha." });
      return;
    }

    res.json(register);
  } catch (error) {
    next(error);
  }
};

export const handleGetDailySummary = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { date } = req.query;

    const targetDate =
      typeof date === "string" ? date : new Date().toISOString().split("T")[0];

    const summary = await getDailySummary(tenantId, targetDate);
    res.json({ date: targetDate, ...summary });
  } catch (error) {
    next(error);
  }
};

export const handleCloseCashRegister = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { date, closedBy, notes } = req.body;

    if (!date) {
      throw new HttpError(400, "Se requiere la fecha del cierre.");
    }

    if (!closedBy) {
      throw new HttpError(400, "Se requiere quién realiza el cierre.");
    }

    const register = await closeCashRegister(tenantId, date, closedBy, notes);
    logger.info(`Cierre de caja realizado: ${date} por ${closedBy}`);
    res.status(201).json(register);
  } catch (error) {
    next(error);
  }
};

export const handleGenerateSalesReport = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { period, date } = req.query;

    if (!period || typeof period !== "string") {
      throw new HttpError(
        400,
        "Se requiere el período del reporte (daily, weekly, monthly).",
      );
    }

    const validPeriods: ReportPeriod[] = ["daily", "weekly", "monthly"];
    if (!validPeriods.includes(period as ReportPeriod)) {
      throw new HttpError(
        400,
        `Período inválido. Debe ser: ${validPeriods.join(", ")}`,
      );
    }

    const referenceDate =
      typeof date === "string" ? date : new Date().toISOString().split("T")[0];

    const report = await generateSalesReport(
      tenantId,
      period as ReportPeriod,
      referenceDate,
    );
    res.json(report);
  } catch (error) {
    next(error);
  }
};
