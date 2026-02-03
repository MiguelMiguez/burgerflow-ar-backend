import { Router } from "express";
import {
  handleCreateIngredient,
  handleDeleteIngredient,
  handleGetIngredient,
  handleGetLowStock,
  handleListIngredients,
  handleUpdateIngredient,
  handleUpdateStock,
} from "../controllers/ingredientController";
import { authorize } from "../middlewares/authorize";

const router = Router();

// Listar ingredientes
router.get("/", authorize("admin", "user"), handleListIngredients);

// Obtener ingredientes con stock bajo
router.get("/low-stock", authorize("admin", "user"), handleGetLowStock);

// Obtener ingrediente por ID
router.get("/:id", authorize("admin", "user"), handleGetIngredient);

// Crear ingrediente
router.post("/", authorize("admin"), handleCreateIngredient);

// Actualizar ingrediente
router.put("/:id", authorize("admin"), handleUpdateIngredient);

// Actualizar stock
router.patch("/:id/stock", authorize("admin"), handleUpdateStock);

// Eliminar ingrediente
router.delete("/:id", authorize("admin"), handleDeleteIngredient);

export default router;
