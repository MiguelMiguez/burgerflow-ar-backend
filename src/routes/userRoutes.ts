import { Router } from "express";
import {
  handleGetCurrentUser,
  handleUpdateCurrentUser,
} from "../controllers/userController";
import { authorize } from "../middlewares/authorize";

const router = Router();

// Obtener datos del usuario actual
router.get("/me", authorize("admin", "user"), handleGetCurrentUser);

// Actualizar datos del usuario actual
router.patch("/me", authorize("admin", "user"), handleUpdateCurrentUser);

export default router;
