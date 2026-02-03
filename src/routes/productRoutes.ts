import { Router } from "express";
import {
  handleCreateProduct,
  handleDeleteProduct,
  handleGetProduct,
  handleListProducts,
  handleToggleProductAvailability,
  handleUpdateProduct,
} from "../controllers/productController";
import { authorize } from "../middlewares/authorize";

const router = Router();

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

// Eliminar producto (soft delete)
router.delete("/:id", authorize("admin"), handleDeleteProduct);

export default router;
