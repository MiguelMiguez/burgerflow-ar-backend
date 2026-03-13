import "express";

/**
 * Información del usuario autenticado con Firebase.
 * El tenantId SIEMPRE proviene de Firestore, nunca de un header.
 */
export interface AuthenticatedUser {
  uid: string;
  email: string;
  tenantId: string;
  role: "owner" | "admin" | "employee";
  displayName?: string;
}

declare module "express-serve-static-core" {
  interface Request {
    /**
     * Usuario autenticado con Firebase.
     * Solo disponible después del middleware authenticate.
     * El tenantId es obtenido de Firestore para garantizar seguridad.
     */
    user?: AuthenticatedUser;
    /**
     * @deprecated Usar req.user en su lugar. Solo para compatibilidad con API Keys legacy.
     */
    userRole?: "admin" | "user";
    /**
     * @deprecated Usar req.user.uid en su lugar.
     */
    firebaseUid?: string;
    /**
     * @deprecated Usar req.user.email en su lugar.
     */
    firebaseEmail?: string;
  }
}
