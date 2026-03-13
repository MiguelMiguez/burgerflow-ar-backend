import dotenv from "dotenv";
import { logger } from "../utils/logger";

dotenv.config();

interface EnvConfig {
  port: number;
  firebaseProjectId: string;
  firebaseClientEmail: string;
  firebasePrivateKey: string;
  // Meta WhatsApp Business API
  metaVerifyToken: string;
  metaAppSecret: string;
  metaApiVersion: string;
  // API Keys (legacy - ser\u00e1n deprecadas)
  adminApiKey: string;
  userApiKey: string;
  // Mercado Pago OAuth (para la app, no para cada tenant)
  mercadoPagoAppId: string;
  mercadoPagoClientSecret: string;
  mercadoPagoRedirectUri: string;
  // Frontend URL (para redirecciones)
  frontendUrl: string;
  // Environment
  nodeEnv: "development" | "production" | "test";
}

const rawEnv = {
  PORT: process.env.PORT ?? "3000",
  NODE_ENV: process.env.NODE_ENV ?? "development",
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
  // Meta WhatsApp Business API
  META_VERIFY_TOKEN: process.env.META_VERIFY_TOKEN,
  META_APP_SECRET: process.env.META_APP_SECRET,
  META_API_VERSION: process.env.META_API_VERSION ?? "v21.0",
  // API Keys
  ADMIN_API_KEY: process.env.ADMIN_API_KEY,
  USER_API_KEY: process.env.USER_API_KEY,
  // Mercado Pago OAuth
  MERCADO_PAGO_APP_ID: process.env.MERCADO_PAGO_APP_ID,
  MERCADO_PAGO_CLIENT_SECRET: process.env.MERCADO_PAGO_CLIENT_SECRET,
  MERCADO_PAGO_REDIRECT_URI: process.env.MERCADO_PAGO_REDIRECT_URI,
  // Frontend URL
  FRONTEND_URL: process.env.FRONTEND_URL,
};

const sanitizeMultilineSecret = (value: string | undefined): string => {
  if (!value) {
    return "";
  }

  const trimmed = value.trim();
  const unquoted =
    trimmed.startsWith('"') && trimmed.endsWith('"')
      ? trimmed.slice(1, -1)
      : trimmed;

  return unquoted.replace(/\\n/g, "\n");
};

const env: EnvConfig = {
  port: Number.parseInt(rawEnv.PORT, 10) || 3000,
  nodeEnv: (rawEnv.NODE_ENV as EnvConfig["nodeEnv"]) || "development",
  firebaseProjectId: rawEnv.FIREBASE_PROJECT_ID ?? "",
  firebaseClientEmail: rawEnv.FIREBASE_CLIENT_EMAIL ?? "",
  firebasePrivateKey: sanitizeMultilineSecret(rawEnv.FIREBASE_PRIVATE_KEY),
  // Meta WhatsApp Business API
  metaVerifyToken: rawEnv.META_VERIFY_TOKEN?.trim() ?? "",
  metaAppSecret: rawEnv.META_APP_SECRET?.trim() ?? "",
  metaApiVersion: rawEnv.META_API_VERSION?.trim() ?? "v21.0",
  // API Keys (legacy)
  adminApiKey: rawEnv.ADMIN_API_KEY?.trim() ?? "",
  userApiKey: rawEnv.USER_API_KEY?.trim() ?? "",
  // Mercado Pago OAuth
  mercadoPagoAppId: rawEnv.MERCADO_PAGO_APP_ID?.trim() ?? "",
  mercadoPagoClientSecret: rawEnv.MERCADO_PAGO_CLIENT_SECRET?.trim() ?? "",
  mercadoPagoRedirectUri: rawEnv.MERCADO_PAGO_REDIRECT_URI?.trim() ?? "",
  // Frontend URL
  frontendUrl: rawEnv.FRONTEND_URL?.trim() ?? "http://localhost:5173",
};

const credentialKeys: Array<
  "firebaseProjectId" | "firebaseClientEmail" | "firebasePrivateKey"
> = ["firebaseProjectId", "firebaseClientEmail", "firebasePrivateKey"];

const credentialEnvMap: Record<(typeof credentialKeys)[number], string> = {
  firebaseProjectId: "FIREBASE_PROJECT_ID",
  firebaseClientEmail: "FIREBASE_CLIENT_EMAIL",
  firebasePrivateKey: "FIREBASE_PRIVATE_KEY",
};

const missingCredentialKeys = credentialKeys.filter((key) => env[key] === "");

const anyCredentialProvided = credentialKeys.some((key) => env[key] !== "");

const runningOnGcp = Boolean(
  process.env.FIREBASE_CONFIG ??
  process.env.GOOGLE_CLOUD_PROJECT ??
  process.env.GCLOUD_PROJECT ??
  process.env.K_SERVICE ??
  process.env.FUNCTIONS_EMULATOR,
);

/**
 * Validaci\u00f3n de variables cr\u00edticas.
 * En producci\u00f3n, el servidor NO debe arrancar sin estas configuraciones.
 */
const validateCriticalEnv = (): void => {
  const isProduction = env.nodeEnv === "production";
  const criticalErrors: string[] = [];

  // Firebase credentials son obligatorias siempre (excepto en GCP con ADC)
  if (!runningOnGcp && missingCredentialKeys.length > 0) {
    missingCredentialKeys.forEach((key) => {
      const envName = credentialEnvMap[key];
      if (isProduction) {
        criticalErrors.push(`${envName} es requerido en producci\u00f3n`);
      } else {
        logger.warn(`Variable de entorno faltante: ${envName}`);
      }
    });
  }

  // En producci\u00f3n, fallar si faltan variables cr\u00edticas
  if (isProduction && criticalErrors.length > 0) {
    logger.error("\\n\u274C ERRORES CR\u00cdTICOS DE CONFIGURACI\u00d3N:");
    criticalErrors.forEach((err) => logger.error(`   - ${err}`));
    logger.error("\\nEl servidor no puede arrancar sin estas variables.\\n");
    process.exit(1);
  }

  // Warnings para variables opcionales pero recomendadas
  if (!runningOnGcp && !anyCredentialProvided) {
    logger.warn(
      "No se detectaron credenciales de Firebase. Configura las variables FIREBASE_* o define GOOGLE_APPLICATION_CREDENTIALS.",
    );
  }
};

// Ejecutar validaci\u00f3n al cargar el m\u00f3dulo
validateCriticalEnv();

export default env;
