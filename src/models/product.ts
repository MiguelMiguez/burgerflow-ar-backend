export type ProductCategory =
  | "simple"
  | "doble"
  | "triple"
  | "especial"
  | "vegetariana"
  | "combo";

export type ProductUnit = "unidades" | "kg" | "litros";

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
  compatibleExtras?: string[]; // IDs de extras compatibles con este producto
  stock?: number; // Stock del producto finalizado (unidades disponibles)
  unit?: ProductUnit; // Tipo de medida del stock
  available?: boolean;
  metaCatalogItemId?: string; // ID del producto en el catálogo de WhatsApp
}

export interface UpdateProductInput {
  name?: string;
  description?: string;
  price?: number;
  image?: string;
  category?: ProductCategory;
  ingredients?: ProductIngredient[];
  compatibleExtras?: string[]; // IDs de extras compatibles con este producto
  stock?: number;
  unit?: ProductUnit;
  available?: boolean;
  metaCatalogItemId?: string; // ID del producto en el catálogo de WhatsApp
}

export interface Product extends Omit<
  CreateProductInput,
  "available" | "stock" | "unit"
> {
  id: string;
  stock: number;
  unit: ProductUnit;
  available: boolean;
  compatibleExtras: string[]; // IDs de extras compatibles
  metaCatalogItemId?: string; // ID del producto en el catálogo de WhatsApp
  createdAt: string;
}
