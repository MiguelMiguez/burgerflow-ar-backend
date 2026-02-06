import { Request, Response, NextFunction } from "express";
import {
  registerUser,
  loginUser,
  getUserByUid,
  getUsersByTenant,
  verifyAuthToken,
  googleSignIn,
} from "../services/authService";
import { CreateUserInput, LoginInput } from "../models/user";
import { logger } from "../utils/logger";

/**
 * POST /auth/register
 * Registra un nuevo usuario y crea automáticamente su tenant
 */
export const register = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const input: CreateUserInput = req.body;

    // Validaciones básicas
    if (!input.email || !input.password || !input.tenantName) {
      res.status(400).json({
        error: "Email, password y nombre del tenant son requeridos",
      });
      return;
    }

    if (input.password.length < 6) {
      res.status(400).json({
        error: "La contraseña debe tener al menos 6 caracteres",
      });
      return;
    }

    const result = await registerUser(input);

    res.status(201).json({
      message: "Usuario registrado exitosamente",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /auth/login
 * Autentica a un usuario (genera custom token)
 * Nota: El login real se debe hacer desde el frontend con signInWithEmailAndPassword
 */
export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const input: LoginInput = req.body;

    if (!input.email || !input.password) {
      res.status(400).json({
        error: "Email y password son requeridos",
      });
      return;
    }

    const result = await loginUser(input);

    res.status(200).json({
      message: "Autenticación exitosa",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /auth/me
 * Obtiene los datos del usuario autenticado
 */
export const getMe = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.uid) {
      res.status(401).json({ error: "No autenticado" });
      return;
    }

    const user = await getUserByUid(req.user.uid);

    res.status(200).json({
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /auth/users
 * Obtiene todos los usuarios del tenant (solo para owners/admins)
 */
export const getUsersFromTenant = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.tenantId) {
      res.status(401).json({ error: "No autenticado" });
      return;
    }

    const users = await getUsersByTenant(req.user.tenantId);

    res.status(200).json({
      data: users,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /auth/verify
 * Verifica un Firebase ID token y devuelve datos del usuario
 */
export const verifyToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      res.status(400).json({ error: "ID token es requerido" });
      return;
    }

    const result = await verifyAuthToken(idToken);

    res.status(200).json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /auth/google-signin
 * Maneja el inicio de sesión con Google
 * Si es un usuario nuevo, requiere tenantName
 */
export const handleGoogleSignIn = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { uid, email, displayName, tenantName } = req.body;

    if (!uid || !email) {
      res.status(400).json({
        error: "uid y email son requeridos",
      });
      return;
    }

    logger.info(`🔍 Google Sign-In request: uid=${uid}, email=${email}, has tenantName=${!!tenantName}`);

    const result = await googleSignIn({
      uid,
      email,
      displayName,
      tenantName,
    });

    logger.info(`✅ Google Sign-In exitoso para ${email}`);

    res.status(200).json({
      message: "Autenticación con Google exitosa",
      data: result,
    });
  } catch (error) {
    logger.error(`❌ Error en Google Sign-In:`, error);
    next(error);
  }
};
