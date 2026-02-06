import { NextFunction, Request, Response } from "express";
import env from "../config/env";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";
import { verifyAuthToken } from "../services/authService";

export type UserRole = "admin" | "user";

type ApiKeyEntry = {
  role: UserRole;
  value: string;
};

const apiKeys: ApiKeyEntry[] = [
  { role: "admin", value: env.adminApiKey },
  { role: "user", value: env.userApiKey },
];

const findRoleByKey = (apiKey: string | undefined): UserRole | undefined => {
  if (!apiKey) {
    return undefined;
  }

  const normalizedKey = apiKey.trim();
  const match = apiKeys.find(
    (entry) => entry.value && entry.value === normalizedKey
  );
  return match?.role;
};

/**
 * Middleware de autenticación que soporta:
 * 1. Firebase Auth (Bearer token) - PREFERIDO
 * 2. API Keys (x-api-key header o query) - LEGACY
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (req.method === "OPTIONS") {
    next();
    return;
  }

  try {
    // 1. Intentar autenticación con Firebase Auth (Bearer token)
    const authHeader = req.header("authorization") || req.header("Authorization");
    
    if (authHeader?.startsWith("Bearer ")) {
      const idToken = authHeader.substring(7);
      
      try {
        const userData = await verifyAuthToken(idToken);
        
        req.user = {
          uid: userData.uid,
          tenantId: userData.tenantId,
          role: userData.role as "owner" | "admin" | "employee",
        };
        
        next();
        return;
      } catch (error) {
        logger.warn(`Token de Firebase inválido: ${error}`);
        next(new HttpError(401, "Token inválido o expirado"));
        return;
      }
    }

    // 2. Fallback a autenticación legacy con API Keys
    const apiKeyHeader = req.header("x-api-key");
    const apiKeyQuery =
      typeof req.query.apiKey === "string" ? req.query.apiKey : undefined;
    const apiKeyCandidate = apiKeyHeader ?? apiKeyQuery;

    const role = findRoleByKey(apiKeyCandidate);

    if (!role) {
      logger.warn(
        `Intento de acceso no autorizado a ${req.method} ${req.originalUrl}`
      );
      next(new HttpError(401, "Requiere autenticación válida."));
      return;
    }

    // Mantener compatibilidad con código legacy
    req.userRole = role;
    
    next();
  } catch (error) {
    next(new HttpError(500, "Error en el proceso de autenticación"));
  }
};
