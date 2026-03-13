import { z } from "zod";

/**
 * Esquemas de validación para extras
 */

export const createExtraSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100),
  price: z.number().min(0, "El precio debe ser mayor o igual a 0"),
  linkedProductId: z.string().optional(),
  stockConsumption: z.number().int().min(0).optional(),
});

export const updateExtraSchema = createExtraSchema.partial();

export const extraIdParamSchema = z.object({
  id: z.string().min(1, "Se requiere el id del extra"),
});

export type CreateExtraInput = z.infer<typeof createExtraSchema>;
export type UpdateExtraInput = z.infer<typeof updateExtraSchema>;
