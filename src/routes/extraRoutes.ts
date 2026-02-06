import { Router } from "express";
import {
  handleCreateExtra,
  handleDeleteExtra,
  handleGetExtra,
  handleListExtras,
  handleUpdateExtra,
} from "../controllers/extraController";
import { authorize } from "../middlewares/authorize";

const router = Router();

// Listar extras (?activeOnly=true para solo activos)
router.get("/", authorize("admin", "user"), handleListExtras);

// Obtener extra por ID
router.get("/:id", authorize("admin", "user"), handleGetExtra);

// Crear extra
router.post("/", authorize("admin"), handleCreateExtra);

// Actualizar extra
router.put("/:id", authorize("admin"), handleUpdateExtra);

// Eliminar extra
router.delete("/:id", authorize("admin"), handleDeleteExtra);

export default router;
