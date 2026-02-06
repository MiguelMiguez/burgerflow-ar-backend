import { Router } from "express";
import { getMe, updateMe } from "../controllers/userController";

const router = Router();

/**
 * @swagger
 * /users/me:
 *   get:
 *     summary: Obtiene el perfil del usuario autenticado
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil del usuario
 */
router.get("/me", getMe);

/**
 * @swagger
 * /users/me:
 *   patch:
 *     summary: Actualiza el perfil del usuario autenticado
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               meta:
 *                 type: object
 *                 properties:
 *                   phoneNumberId:
 *                     type: string
 *                   accessToken:
 *                     type: string
 *     responses:
 *       200:
 *         description: Perfil actualizado exitosamente
 */
router.patch("/me", updateMe);

export default router;
