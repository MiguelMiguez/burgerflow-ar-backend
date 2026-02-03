import { Router } from "express";
import {
  handleCloseCashRegister,
  handleGenerateSalesReport,
  handleGetCashRegister,
  handleGetCashRegisterByDate,
  handleGetDailySummary,
  handleListCashRegisters,
} from "../controllers/cashRegisterController";
import { authorize } from "../middlewares/authorize";

const router = Router();

// Listar cierres de caja
router.get("/", authorize("admin"), handleListCashRegisters);

// Obtener resumen del día (sin cerrar) - ?date=2026-02-03
router.get("/summary", authorize("admin"), handleGetDailySummary);

// Generar reporte de ventas - ?period=daily|weekly|monthly&date=2026-02-03
router.get("/report", authorize("admin"), handleGenerateSalesReport);

// Obtener cierre por fecha (date en formato YYYY-MM-DD)
router.get("/date/:date", authorize("admin"), handleGetCashRegisterByDate);

// Obtener cierre por ID
router.get("/:id", authorize("admin"), handleGetCashRegister);

// Realizar cierre de caja
router.post("/close", authorize("admin"), handleCloseCashRegister);

export default router;
