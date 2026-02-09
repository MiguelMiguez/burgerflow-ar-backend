import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import {
  handleGetAuthUrl,
  handleOAuthCallback,
  handleDisconnect,
  handleGetStatus,
} from "../controllers/mercadoPagoController";

const router = Router();

/**
 * @swagger
 * /api/mercadopago/auth-url:
 *   get:
 *     summary: Obtiene la URL de autorización OAuth para Mercado Pago
 *     tags: [Mercado Pago]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: URL de autorización
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 authUrl:
 *                   type: string
 *                   description: URL para redirigir al usuario
 */
router.get("/auth-url", authenticate, handleGetAuthUrl);

/**
 * @swagger
 * /api/mercadopago/callback:
 *   get:
 *     summary: Callback de OAuth de Mercado Pago
 *     tags: [Mercado Pago]
 *     parameters:
 *       - in: query
 *         name: code
 *         schema:
 *           type: string
 *         description: Código de autorización
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *         description: Estado (tenantId)
 *     responses:
 *       302:
 *         description: Redirige al frontend
 */
router.get("/callback", handleOAuthCallback);

/**
 * @swagger
 * /api/mercadopago/status:
 *   get:
 *     summary: Verifica el estado de conexión de Mercado Pago
 *     tags: [Mercado Pago]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Estado de conexión
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 connected:
 *                   type: boolean
 *                 userId:
 *                   type: string
 *                   nullable: true
 */
router.get("/status", authenticate, handleGetStatus);

/**
 * @swagger
 * /api/mercadopago/disconnect:
 *   delete:
 *     summary: Desconecta Mercado Pago del tenant
 *     tags: [Mercado Pago]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Desconectado exitosamente
 */
router.delete("/disconnect", authenticate, handleDisconnect);

export default router;
