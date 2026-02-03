import { Router } from "express";
import {
  handleCalculateDeliveryCost,
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

// Calcular costo de envío por distancia (?distance=5.5)
router.get(
  "/calculate",
  authorize("admin", "user"),
  handleCalculateDeliveryCost,
);

// Obtener zona por ID
router.get("/:id", authorize("admin", "user"), handleGetDeliveryZone);

// Crear zona de delivery
router.post("/", authorize("admin"), handleCreateDeliveryZone);

// Actualizar zona
router.put("/:id", authorize("admin"), handleUpdateDeliveryZone);

// Eliminar zona (soft delete)
router.delete("/:id", authorize("admin"), handleDeleteDeliveryZone);

export default router;
