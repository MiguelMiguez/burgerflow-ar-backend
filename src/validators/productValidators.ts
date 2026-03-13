import { z } from "zod";

/**
 * Esquemas de validación para productos
 */

const productCategorySchema = z.enum([
  "hamburguesa",
  "papas",
  "bebida",
  "postre",
  "combo",
  "otro",
]);

export const createProductSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100),
  description: z.string().max(500).optional(),
  price: z.number().min(0, "El precio debe ser mayor o igual a 0"),
  image: z.string().url().optional().or(z.literal("")),
  category: productCategorySchema.optional(),
  ingredients: z.array(z.string()).optional(),
  compatibleExtras: z.array(z.string()).optional(),
  stock: z.number().int().min(0).optional(),
  unit: z.string().optional(),
  available: z.boolean().optional(),
});

export const updateProductSchema = createProductSchema.partial();

export const productIdParamSchema = z.object({
  id: z.string().min(1, "Se requiere el id del producto"),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
