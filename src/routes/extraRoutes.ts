import { Router } from "express";
import {
  create,
  getAll,
  getById,
  update,
  remove,
} from "../controllers/extraController";
import { authenticate } from "../middlewares/authenticate";

const router = Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

/**
 * @swagger
 * /extras:
 *   post:
 *     summary: Crea un nuevo extra/adicional
 *     tags: [Extras]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - price
 *             properties:
 *               name:
 *                 type: string
 *               price:
 *                 type: number
 *               linkedProductId:
 *                 type: string
 *               stockConsumption:
 *                 type: number
 *     responses:
 *       201:
 *         description: Extra creado exitosamente
 */
router.post("/", create);

/**
 * @swagger
 * /extras:
 *   get:
 *     summary: Obtiene todos los extras del tenant
 *     tags: [Extras]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: activeOnly
 *         schema:
 *           type: boolean
 *         description: Si es true, solo devuelve extras activos
 *     responses:
 *       200:
 *         description: Lista de extras
 */
router.get("/", getAll);

/**
 * @swagger
 * /extras/{id}:
 *   get:
 *     summary: Obtiene un extra por ID
 *     tags: [Extras]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Datos del extra
 */
router.get("/:id", getById);

/**
 * @swagger
 * /extras/{id}:
 *   put:
 *     summary: Actualiza un extra
 *     tags: [Extras]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Extra actualizado
 */
router.put("/:id", update);

/**
 * @swagger
 * /extras/{id}:
 *   delete:
 *     summary: Desactiva un extra
 *     tags: [Extras]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Extra desactivado
 */
router.delete("/:id", remove);

export default router;
