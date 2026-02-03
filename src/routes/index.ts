import { Router } from "express";
import tenantRoutes from "./tenantRoutes";
import productRoutes from "./productRoutes";
import ingredientRoutes from "./ingredientRoutes";
import orderRoutes from "./orderRoutes";
import deliveryRoutes from "./deliveryRoutes";
import deliveryZoneRoutes from "./deliveryZoneRoutes";
import cashRegisterRoutes from "./cashRegisterRoutes";

const router = Router();

// Rutas de administración de tenants (hamburgueserías)
router.use("/tenants", tenantRoutes);

// Rutas del menú (productos/hamburguesas)
router.use("/products", productRoutes);

// Rutas de ingredientes/stock
router.use("/ingredients", ingredientRoutes);

// Rutas de pedidos
router.use("/orders", orderRoutes);

// Rutas de deliverys (repartidores)
router.use("/deliveries", deliveryRoutes);

// Rutas de zonas de delivery
router.use("/delivery-zones", deliveryZoneRoutes);

// Rutas de caja y reportes
router.use("/cash-register", cashRegisterRoutes);

export default router;
