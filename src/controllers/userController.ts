import { Request, Response, NextFunction } from "express";
import { updateUserProfile, getUserByUid } from "../services/authService";
import { logger } from "../utils/logger";

/**
 * GET /users/me - Obtiene el perfil del usuario autenticado
 */
export const getMe = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.uid) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    logger.info(`📖 Obteniendo perfil para UID: ${req.user.uid}`);

    // Obtener los datos completos del usuario de Firestore (incluye meta)
    const user = await getUserByUid(req.user.uid);
    
    res.status(200).json(user);
  } catch (error) {
    logger.error("Error al obtener perfil del usuario:", error);
    next(error);
  }
};

/**
 * PATCH /users/me - Actualiza el perfil del usuario autenticado
 */
export const updateMe = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const { meta } = req.body;
    const uid = req.user.uid;

    logger.info(`📝 Actualizando perfil para UID: ${uid}`);

    const updatedUser = await updateUserProfile(uid, {
      meta: meta
        ? {
            phoneNumberId: meta.phoneNumberId || undefined,
            accessToken: meta.accessToken || undefined,
          }
        : undefined,
    });

    logger.info(`✅ Perfil actualizado: ${uid}`);

    res.status(200).json({
      message: "Perfil actualizado exitosamente",
      data: updatedUser,
    });
  } catch (error) {
    logger.error("Error al actualizar perfil del usuario:", error);
    next(error);
  }
};
