export type IngredientUnit = "gramos" | "unidades" | "ml" | "kg" | "litros";

export interface CreateIngredientInput {
  tenantId: string;
  name: string;
  unit: IngredientUnit;
  stock: number;
  minStock: number;
  costPerUnit: number;
}

export interface UpdateIngredientInput {
  name?: string;
  unit?: IngredientUnit;
  stock?: number;
  minStock?: number;
  costPerUnit?: number;
}

export interface Ingredient extends CreateIngredientInput {
  id: string;
  createdAt: string;
}

export interface StockMovement {
  id: string;
  tenantId: string;
  ingredientId: string;
  type: "entrada" | "salida" | "ajuste";
  quantity: number;
  reason: string;
  orderId?: string;
  createdAt: string;
}
