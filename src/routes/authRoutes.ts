import { Router } from "express";
import {
  register,
  login,
  getMe,
  getUsersFromTenant,
  verifyToken,
  handleGoogleSignIn,
} from "../controllers/authController";
import { authenticate } from "../middlewares/authenticate";

const router = Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Registra un nuevo usuario y crea su tenant
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - tenantName
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               displayName:
 *                 type: string
 *               tenantName:
 *                 type: string
 *     responses:
 *       201:
 *         description: Usuario registrado exitosamente
 */
router.post("/register", register);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Genera custom token para autenticación
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Autenticación exitosa
 */
router.post("/login", login);

/**
 * @swagger
 * /auth/verify:
 *   post:
 *     summary: Verifica un Firebase ID token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - idToken
 *             properties:
 *               idToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token válido
 */
router.post("/verify", verifyToken);

/**
 * @swagger
 * /auth/google-signin:
 *   post:
 *     summary: Maneja inicio de sesión con Google
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - uid
 *               - email
 *             properties:
 *               uid:
 *                 type: string
 *                 description: Firebase UID del usuario de Google
 *               email:
 *                 type: string
 *               displayName:
 *                 type: string
 *               tenantName:
 *                 type: string
 *                 description: Requerido solo para usuarios nuevos
 *     responses:
 *       200:
 *         description: Usuario autenticado exitosamente
 *       400:
 *         description: tenantName requerido para usuarios nuevos
 */
router.post("/google-signin", handleGoogleSignIn);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Obtiene los datos del usuario autenticado
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Datos del usuario
 */
router.get("/me", authenticate, getMe);

/**
 * @swagger
 * /auth/users:
 *   get:
 *     summary: Obtiene todos los usuarios del tenant
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de usuarios del tenant
 */
router.get("/users", authenticate, getUsersFromTenant);

export default router;
