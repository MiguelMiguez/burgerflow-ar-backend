import { Router } from "express";
import {
  handleCreateDeliveryZone,
  handleDeleteDeliveryZone,
  handleGetDeliveryZone,
  handleListDeliveryZones,
  handleUpdateDeliveryZone,
} from "../controllers/deliveryZoneController";
import { authorize } from "../middlewares/authorize";

const router = Router();

// Listar zonas de delivery (con filtro: ?active=true)
router.get("/", authorize("admin", "user"), handleListDeliveryZones);

// Obtener zona por ID
router.get("/:id", authorize("admin", "user"), handleGetDeliveryZone);

// Crear zona de delivery
router.post("/", authorize("admin"), handleCreateDeliveryZone);

// Actualizar zona
router.put("/:id", authorize("admin"), handleUpdateDeliveryZone);

// Eliminar zona (soft delete)
router.delete("/:id", authorize("admin"), handleDeleteDeliveryZone);

export default router;
