import { Router } from "express";
import authRoutes from "./authRoutes";
import tenantRoutes from "./tenantRoutes";
import productRoutes from "./productRoutes";
import ingredientRoutes from "./ingredientRoutes";
import orderRoutes from "./orderRoutes";
import deliveryRoutes from "./deliveryRoutes";
import deliveryZoneRoutes from "./deliveryZoneRoutes";
import cashRegisterRoutes from "./cashRegisterRoutes";
import extraRoutes from "./extraRoutes";
import serviceRoutes from "./serviceRoutes";
import bookingRoutes from "./bookingRoutes";
import { authenticate } from "../middlewares/authenticate";

const router = Router();

// Rutas de autenticación (público - sin middleware)
router.use("/auth", authRoutes);

// Todas las demás rutas requieren autenticación
router.use(authenticate);

// Rutas de administración de tenants (hamburgueserías)
router.use("/tenants", tenantRoutes);

// Rutas de servicios (para autenticación legacy - DEPRECADO, usar /auth)
router.use("/services", serviceRoutes);

// Rutas de reservas/turnos
router.use("/bookings", bookingRoutes);

// Rutas del menú (productos/hamburguesas)
router.use("/products", productRoutes);

// Rutas de ingredientes/stock
router.use("/ingredients", ingredientRoutes);

// Rutas de extras/adicionales
router.use("/extras", extraRoutes);

// Rutas de pedidos
router.use("/orders", orderRoutes);

// Rutas de deliverys (repartidores)
router.use("/deliveries", deliveryRoutes);

// Rutas de zonas de delivery
router.use("/delivery-zones", deliveryZoneRoutes);

// Rutas de caja y reportes
router.use("/cash-register", cashRegisterRoutes);

export default router;
