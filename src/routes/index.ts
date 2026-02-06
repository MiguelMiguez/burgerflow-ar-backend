import { Router } from "express";
import tenantRoutes from "./tenantRoutes";
import productRoutes from "./productRoutes";
import ingredientRoutes from "./ingredientRoutes";
import orderRoutes from "./orderRoutes";
import deliveryRoutes from "./deliveryRoutes";
import deliveryZoneRoutes from "./deliveryZoneRoutes";
import cashRegisterRoutes from "./cashRegisterRoutes";
import serviceRoutes from "./serviceRoutes";
import bookingRoutes from "./bookingRoutes";
import extraRoutes from "./extraRoutes";
import userRoutes from "./userRoutes";

const router = Router();

// Rutas de administración de tenants (hamburgueserías)
router.use("/tenants", tenantRoutes);

// Rutas de servicios (para autenticación)
router.use("/services", serviceRoutes);

// Rutas de reservas/turnos
router.use("/bookings", bookingRoutes);

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

// Rutas de extras
router.use("/extras", extraRoutes);

// Rutas de usuarios
router.use("/users", userRoutes);

export default router;
