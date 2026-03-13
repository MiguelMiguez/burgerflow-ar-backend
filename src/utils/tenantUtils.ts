import { Request } from "express";
import { HttpError } from "./httpError";

/**
 * Obtiene el tenantId de manera SEGURA desde el usuario autenticado.
 *
 * IMPORTANTE: El tenantId NUNCA debe obtenerse de headers (x-tenant-id).
 * Esto previene ataques de inyección multi-tenant donde un usuario
 * malicioso podría acceder a datos de otros tenants.
 *
 * @throws HttpError 401 si el usuario no está autenticado
 * @throws HttpError 403 si el usuario no tiene un tenant asignado
 */
export const getTenantIdFromRequest = (req: Request): string => {
  // SEGURIDAD: Solo obtener tenantId del usuario autenticado
  if (!req.user) {
    throw new HttpError(401, "Requiere autenticación válida.");
  }

  if (!req.user.tenantId) {
    throw new HttpError(403, "El usuario no tiene un tenant asignado.");
  }

  return req.user.tenantId;
};

/**
 * Obtiene el tenantId de manera segura, pero permite null para rutas públicas.
 * Útil para webhooks o endpoints que pueden funcionar sin tenant.
 */
export const getOptionalTenantId = (req: Request): string | null => {
  return req.user?.tenantId ?? null;
};

/**
 * Verifica que el usuario autenticado tenga acceso al tenant especificado.
 * Útil para validar parámetros de ruta que incluyen tenantId.
 */
export const verifyTenantAccess = (
  req: Request,
  requestedTenantId: string,
): void => {
  const userTenantId = getTenantIdFromRequest(req);

  if (userTenantId !== requestedTenantId) {
    throw new HttpError(403, "No tienes acceso a este recurso.");
  }
};
