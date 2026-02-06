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
      logger.info(`🔍 Intentando verificar token Firebase: ${idToken.substring(0, 20)}...`);
      
      try {
        const userData = await verifyAuthToken(idToken);
        logger.info(`✅ Token verificado para usuario: ${userData.uid} (tenant: ${userData.tenantId})`);
        
        // ASIGNAR req.user PARA QUE ESTÉ DISPONIBLE EN LOS CONTROLADORES
        req.user = {
          uid: userData.uid,
          tenantId: userData.tenantId,
          role: userData.role as "owner" | "admin" | "employee",
        };
        
        logger.info(`✅ req.user asignado correctamente. Continuando...`);
        next();
        return;
      } catch (error) {
        logger.error(`❌ Error al verificar token Firebase:`, error);
        next(new HttpError(401, "Token inválido o expirado"));
        return;
      }
    }

    // 2. Fallback a autenticación legacy con API Keys
    logger.info(`⚠️ No se encontró Bearer token, intentando API Key...`);
    const apiKeyHeader = req.header("x-api-key");
    const apiKeyQuery =
      typeof req.query.apiKey === "string" ? req.query.apiKey : undefined;
    const apiKeyCandidate = apiKeyHeader ?? apiKeyQuery;

    const role = findRoleByKey(apiKeyCandidate);

    if (!role) {
      logger.warn(
        `❌ Intento de acceso no autorizado a ${req.method} ${req.originalUrl} - sin token Firebase ni API key válida`
      );
      next(new HttpError(401, "Requiere autenticación válida."));
      return;
    }

    // Mantener compatibilidad con código legacy
    req.userRole = role;
    logger.info(`✅ API Key válida detectada con role: ${role}`);
    
    next();
  } catch (error) {
    next(new HttpError(500, "Error en el proceso de autenticación"));
  }
};
