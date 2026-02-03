import { Router } from "express";
import {
  handleCreateDelivery,
  handleDeleteDelivery,
  handleGetDelivery,
  handleListDeliveries,
  handleToggleDeliveryStatus,
  handleUpdateDelivery,
} from "../controllers/deliveryController";
import { authorize } from "../middlewares/authorize";

const router = Router();

// Listar deliverys (con filtro: ?active=true)
router.get("/", authorize("admin", "user"), handleListDeliveries);

// Obtener delivery por ID
router.get("/:id", authorize("admin", "user"), handleGetDelivery);

// Crear delivery
router.post("/", authorize("admin"), handleCreateDelivery);

// Actualizar delivery
router.put("/:id", authorize("admin"), handleUpdateDelivery);

// Toggle estado activo/inactivo
router.patch("/:id/status", authorize("admin"), handleToggleDeliveryStatus);

// Eliminar delivery (soft delete)
router.delete("/:id", authorize("admin"), handleDeleteDelivery);

export default router;
