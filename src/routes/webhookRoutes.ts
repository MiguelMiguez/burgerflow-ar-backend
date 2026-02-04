import { Router } from "express";
import {
  verifyWebhook,
  receiveWebhook,
  validateWebhookSignature,
} from "../controllers/webhookController";

const router = Router();

/**
 * GET /api/webhook
 * Endpoint para verificación inicial del webhook por Meta
 * Meta envía una petición GET con hub.mode, hub.verify_token y hub.challenge
 */
router.get("/", verifyWebhook);

/**
 * POST /api/webhook
 * Endpoint para recibir mensajes entrantes y actualizaciones de estado
 * Meta envía payloads con los mensajes recibidos
 *
 * IMPORTANTE: Este endpoint debe ser PÚBLICO (sin autenticación JWT)
 * La validación se hace mediante la firma del webhook (opcional)
 */
router.post(
  "/",
  validateWebhookSignature, // Middleware opcional de validación de firma
  receiveWebhook,
);

export default router;
