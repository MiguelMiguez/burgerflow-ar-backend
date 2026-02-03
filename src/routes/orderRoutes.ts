import { Router } from "express";
import {
  handleCancelOrder,
  handleConfirmOrder,
  handleCreateOrder,
  handleGetOrder,
  handleListOrders,
  handleUpdateOrder,
  handleUpdateOrderStatus,
} from "../controllers/orderController";
import { authorize } from "../middlewares/authorize";

const router = Router();

// Listar pedidos (con filtros: ?status=pendiente&date=2026-02-03&pending=true)
router.get("/", authorize("admin", "user"), handleListOrders);

// Obtener pedido por ID
router.get("/:id", authorize("admin", "user"), handleGetOrder);

// Crear pedido
router.post("/", authorize("admin", "user"), handleCreateOrder);

// Actualizar pedido
router.put("/:id", authorize("admin"), handleUpdateOrder);

// Confirmar pedido (descuenta stock)
router.post("/:id/confirm", authorize("admin"), handleConfirmOrder);

// Cancelar pedido
router.post("/:id/cancel", authorize("admin"), handleCancelOrder);

// Actualizar estado del pedido
router.patch("/:id/status", authorize("admin"), handleUpdateOrderStatus);

export default router;
