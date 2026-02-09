import cors, { type CorsOptions } from "cors";
import express, { type Request, type Response } from "express";
import swaggerUi from "swagger-ui-express";
import routes from "./routes";
import webhookRoutes from "./routes/webhookRoutes";
import mercadoPagoRoutes from "./routes/mercadoPagoRoutes";
import { handlePaymentWebhook } from "./controllers/mercadoPagoController";
import { errorHandler } from "./middlewares/errorHandler";
import { logger } from "./utils/logger";
import swaggerDocument from "./config/swagger";
import { authenticate } from "./middlewares/authenticate";

// Extender el tipo Request de Express con nuestros campos custom
declare global {
  namespace Express {
    interface Request {
      user?: {
        uid: string;
        tenantId: string;
        role: "owner" | "admin" | "employee";
      };
      userRole?: "admin" | "user"; // DEPRECATED: Legacy API Key authentication
    }
  }
}

const app = express();

const corsOptions: CorsOptions = {
  origin: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key", "x-tenant-id"],
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());

app.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocument, {
    explorer: true,
    swaggerOptions: {
      persistAuthorization: true,
    },
  }),
);
app.get("/docs.json", (_req: Request, res: Response) => {
  res.json(swaggerDocument);
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.get("/", (_req: Request, res: Response) => {
  res.json({
    message: "BurgerFlow API - Sistema de Pedidos de Hamburguesas",
    docs: "/docs",
    health: "/health",
  });
});

// IMPORTANTE: Rutas del webhook de Meta ANTES del middleware authenticate
// El webhook de Meta NO debe requerir autenticación JWT
// La validación se hace mediante el verify_token y opcionalmente la firma
app.use("/api/webhook", webhookRoutes);

// Webhook de Mercado Pago - Sin autenticación JWT
// Mercado Pago envía notificaciones de pago a esta ruta
app.post("/api/webhooks/mercadopago", handlePaymentWebhook);

// Rutas de Mercado Pago OAuth
app.use("/api/mercadopago", mercadoPagoRoutes);

// Rutas de la API
// Nota: La autenticación se aplica a nivel de ruta individual, no globalmente
// Las rutas públicas (register, login, google-signin) NO requieren autenticación
app.use("/api", routes);

app.use((req: Request, res: Response) => {
  logger.warn(`Ruta no encontrada: ${req.method} ${req.path}`);
  res.status(404).json({ error: "Ruta no encontrada" });
});

app.use(errorHandler);

export default app;
