import { z } from "zod";

/**
 * Esquemas de validaci\u00f3n para autenticaci\u00f3n
 */

export const registerSchema = z.object({
  email: z.string().email("El email no es v\u00e1lido"),
  password: z
    .string()
    .min(6, "La contrase\u00f1a debe tener al menos 6 caracteres"),
  displayName: z.string().optional(),
  tenantName: z.string().min(1, "El nombre del negocio es requerido").max(100),
});

export const loginSchema = z.object({
  email: z.string().email("El email no es v\u00e1lido"),
  password: z.string().min(1, "La contrase\u00f1a es requerida"),
});

export const googleSignInSchema = z.object({
  uid: z.string().min(1, "uid es requerido"),
  email: z.string().email("El email no es v\u00e1lido"),
  displayName: z.string().optional(),
  tenantName: z.string().min(1).max(100).optional(),
});

export const verifyTokenSchema = z.object({
  idToken: z.string().min(1, "ID token es requerido"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type GoogleSignInInput = z.infer<typeof googleSignInSchema>;
export type VerifyTokenInput = z.infer<typeof verifyTokenSchema>;
