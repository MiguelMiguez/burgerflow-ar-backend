import { Router } from "express";
import {
  handleCreateTenant,
  handleDeleteTenant,
  handleGetTenant,
  handleListTenants,
  handleUpdateTenant,
} from "../controllers/tenantController";
import { authorize } from "../middlewares/authorize";

const router = Router();

// Solo admin puede gestionar tenants
router.get("/", authorize("admin"), handleListTenants);
router.get("/:id", authorize("admin"), handleGetTenant);
router.post("/", authorize("admin"), handleCreateTenant);
router.put("/:id", authorize("admin"), handleUpdateTenant);
router.delete("/:id", authorize("admin"), handleDeleteTenant);

export default router;
