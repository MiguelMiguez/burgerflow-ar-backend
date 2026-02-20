import { Router } from "express";
import {
  handleCreateProduct,
  handleDeleteProduct,
  handleGetProduct,
  handleListProducts,
  handleSyncCatalog,
  handleToggleProductAvailability,
  handleUpdateProduct,
} from "../controllers/productController";
import { authorize } from "../middlewares/authorize";

const router = Router();

// Sincronizar productos con catálogo de WhatsApp (debe ir antes de /:id)
router.post("/sync-catalog", authorize("admin"), handleSyncCatalog);

// Listar productos (con filtros opcionales: ?available=true&category=simple)
router.get("/", authorize("admin", "user"), handleListProducts);

// Obtener producto por ID
router.get("/:id", authorize("admin", "user"), handleGetProduct);

// Crear producto
router.post("/", authorize("admin"), handleCreateProduct);

// Actualizar producto
router.put("/:id", authorize("admin"), handleUpdateProduct);

// Toggle disponibilidad
router.patch(
  "/:id/availability",
  authorize("admin"),
  handleToggleProductAvailability,
);

// Eliminar producto permanentemente
router.delete("/:id", authorize("admin"), handleDeleteProduct);

export default router;
