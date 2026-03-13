import { NextFunction, Request, Response } from "express";
import admin from "firebase-admin";
import { getFirestore } from "../config/firebase";
import env from "../config/env";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";
import type { AuthenticatedUser } from "../types/express";

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

/**
 * Obtiene los datos del usuario desde Firestore.
 * IMPORTANTE: El tenantId SIEMPRE se obtiene de aquí, nunca de headers.
 */
const getUserFromFirestore = async (uid: string): Promise<AuthenticatedUser | null> => {
  try {
    const db = getFirestore();
    const userDoc = await db.collection("users").doc(uid).get();

    if (!userDoc.exists) {
      return null;
    }

    const userData = userDoc.data();
    if (!userData || !userData.tenantId) {
      return null;
    }

    return {
      uid,
      email: userData.email,
      tenantId: userData.tenantId,
      role: userData.role || "employee",
      displayName: userData.displayName,
    };
  } catch (error) {
    logger.error(`Error al obtener usuario de Firestore: ${error}`);
    return null;
  }
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
      
      // SEGURIDAD: Obtener tenantId desde Firestore, no desde headers
      const user = await getUserFromFirestore(decodedToken.uid);
      
      if (user) {
        req.user = user;
        // Mantener compatibilidad con código legacy
        req.userRole = "admin";
        req.firebaseUid = user.uid;
        req.firebaseEmail = user.email;
        next();
        return;
      }
      
      // Usuario autenticado en Firebase pero sin documento en Firestore
      // Esto puede pasar durante el registro (el usuario aún no tiene tenant)
      req.firebaseUid = decodedToken.uid;
      req.firebaseEmail = decodedToken.email;
      req.userRole = "admin";
      next();
      return;
    } catch (error) {
      logger.warn(
        `Token de Firebase inválido para ${req.method} ${req.originalUrl}: ${error instanceof Error ? error.message : "Error desconocido"}`,
      );
      // Continuar con fallback a API key
    }
  }

  // 2. Fallback a API Key (legacy - solo para compatibilidad)
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
