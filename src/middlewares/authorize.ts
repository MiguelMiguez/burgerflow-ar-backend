import { NextFunction, Request, Response } from "express";
import type { UserRole } from "./authenticate";
import { HttpError } from "../utils/httpError";

export const authorize = (...allowedRoles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // Verificar si tiene autenticación (Firebase o Legacy API Key)
    const hasFirebaseAuth = !!req.user;
    const hasApiKeyAuth = !!req.userRole;
    
    if (!hasFirebaseAuth && !hasApiKeyAuth) {
      next(new HttpError(401, "Requiere autenticación válida."));
      return;
    }

    // Obtener el role del usuario
    const userRole = req.user?.role || req.userRole;

    // Los "owner" siempre tienen acceso (son administradores de su tenant)
    if (userRole === "owner") {
      next();
      return;
    }

    if (!userRole || !allowedRoles.includes(userRole as UserRole)) {
      next(
        new HttpError(
          403,
          "Permisos insuficientes para la operación solicitada."
        )
      );
      return;
    }

    next();
  };
};
