import cors, { type CorsOptions } from "cors";
import express, { type Request, type Response } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import routes from "./routes";
import webhookRoutes from "./routes/webhookRoutes";
import mercadoPagoRoutes from "./routes/mercadoPagoRoutes";
import { handlePaymentWebhook, validateMercadoPagoWebhook } from "./controllers/mercadoPagoController";
import { errorHandler } from "./middlewares/errorHandler";
import { logger } from "./utils/logger";
import swaggerDocument from "./config/swagger";
import { authenticate } from "./middlewares/authenticate";
import env from "./config/env";

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

// Trust proxy - Required for Render/Heroku/etc. to correctly identify client IPs
// This enables express-rate-limit to work properly behind reverse proxies
app.set("trust proxy", 1);

// ==================== SECURITY MIDDLEWARE ====================

// Helmet: Secure HTTP headers (XSS protection, clickjacking prevention, etc.)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Required for Swagger UI
      scriptSrc: ["'self'", "'unsafe-inline'"], // Required for Swagger UI
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allows Swagger UI to work
}));

// Rate Limiting: Prevent brute force and DoS attacks
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: "Demasiadas solicitudes, intenta de nuevo más tarde" },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 auth requests per minute
  message: { error: "Demasiados intentos de autenticación, intenta de nuevo más tarde" },
  standardHeaders: true,
  legacyHeaders: false,
});

// CORS: Restrict to allowed origins
const allowedOrigins = [
  env.frontendUrl,
  "http://localhost:5173", // Development
  "http://localhost:3000", // Development
].filter(Boolean);

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, Postman, or server-to-server)
    if (!origin) {
      callback(null, true);
      return;
    }
    
    if (allowedOrigins.includes(origin) || env.nodeEnv === "development") {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());

// Apply general rate limiting to all routes
app.use(generalLimiter);

// Apply stricter rate limiting to auth routes
app.use("/api/auth", authLimiter);

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
// Incluye validación de firma para seguridad
app.post("/api/webhooks/mercadopago", validateMercadoPagoWebhook, handlePaymentWebhook);

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
