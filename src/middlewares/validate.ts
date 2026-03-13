import { NextFunction, Request, Response } from "express";
import { ZodSchema, ZodError } from "zod";
import { HttpError } from "../utils/httpError";

/**
 * Middleware gen\u00e9rico para validar el body de una petici\u00f3n con Zod
 */
export const validateBody = <T>(schema: ZodSchema<T>) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req.body);
      // Reemplazar el body con los datos validados y transformados
      req.body = parsed;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const messages = error.issues.map((e: { message: string }) => e.message).join(", ");
        next(new HttpError(400, messages));
        return;
      }
      next(error);
    }
  };
};

/**
 * Middleware gen\u00e9rico para validar los query params con Zod
 */
export const validateQuery = <T>(schema: ZodSchema<T>) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req.query);
      req.query = parsed as typeof req.query;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const messages = error.issues.map((e: { message: string }) => e.message).join(", ");
        next(new HttpError(400, messages));
        return;
      }
      next(error);
    }
  };
};

/**
 * Middleware gen\u00e9rico para validar los params de ruta con Zod
 */
export const validateParams = <T>(schema: ZodSchema<T>) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req.params);
      req.params = parsed as typeof req.params;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const messages = error.issues.map((e: { message: string }) => e.message).join(", ");
        next(new HttpError(400, messages));
        return;
      }
      next(error);
    }
  };
};
