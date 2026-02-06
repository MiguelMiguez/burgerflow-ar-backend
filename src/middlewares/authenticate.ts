import { NextFunction, Request, Response } from "express";
import admin from "firebase-admin";
import env from "../config/env";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";

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
    (entry) => entry.value && entry.value === normalizedKey,
  );
  return match?.role;
};

const extractBearerToken = (authHeader: string | undefined): string | null => {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
};

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (req.method === "OPTIONS") {
    next();
    return;
  }

  // 1. Intentar autenticación con Firebase Token (preferido)
  const authHeader = req.header("Authorization");
  const bearerToken = extractBearerToken(authHeader);

  if (bearerToken) {
    try {
      const decodedToken = await admin.auth().verifyIdToken(bearerToken);
      req.userRole = "admin"; // Usuarios autenticados con Firebase tienen rol admin
      req.firebaseUid = decodedToken.uid;
      req.firebaseEmail = decodedToken.email;
      next();
      return;
    } catch (error) {
      logger.warn(
        `Token de Firebase inválido para ${req.method} ${req.originalUrl}: ${error instanceof Error ? error.message : "Error desconocido"}`,
      );
      // Continuar con fallback a API key
    }
  }

  // 2. Fallback a API Key (legacy)
  const apiKeyHeader = req.header("x-api-key");
  const apiKeyQuery =
    typeof req.query.apiKey === "string" ? req.query.apiKey : undefined;
  const apiKeyCandidate = apiKeyHeader ?? apiKeyQuery;

  const role = findRoleByKey(apiKeyCandidate);

  if (!role) {
    logger.warn(
      `Intento de acceso no autorizado a ${req.method} ${req.originalUrl}`,
    );
    next(new HttpError(401, "Requiere autenticación válida."));
    return;
  }

  req.userRole = role;
  next();
};
