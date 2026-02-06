import "express";

declare module "express-serve-static-core" {
  interface Request {
    // Legacy API Key authentication (DEPRECADO)
    userRole?: "admin" | "user";
    
    // Nueva autenticación con Firebase Auth
    user?: {
      uid: string;
      email?: string;
      tenantId: string;
      role: "owner" | "admin" | "employee";
    };
  }
}
