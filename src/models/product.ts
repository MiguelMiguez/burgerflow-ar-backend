export type ProductCategory =
  | "simple"
  | "doble"
  | "triple"
  | "especial"
  | "vegetariana"
  | "combo";

export interface ProductIngredient {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  isRemovable: boolean;
  isExtra: boolean;
  extraPrice: number;
}

export interface CreateProductInput {
  tenantId: string;
  name: string;
  description?: string;
  price: number;
  image?: string;
  category: ProductCategory;
  ingredients: ProductIngredient[];
  available?: boolean;
}

export interface UpdateProductInput {
  name?: string;
  description?: string;
  price?: number;
  image?: string;
  category?: ProductCategory;
  ingredients?: ProductIngredient[];
  available?: boolean;
}

export interface Product extends Omit<CreateProductInput, "available"> {
  id: string;
  available: boolean;
  createdAt: string;
}
