export interface CreateExtraInput {
  tenantId: string;
  name: string;
  price: number;
  linkedProductId?: string; // ID del ingredient para descontar stock
  stockConsumption: number; // Cantidad a descontar del stock
}

export interface UpdateExtraInput {
  name?: string;
  price?: number;
  linkedProductId?: string;
  stockConsumption?: number;
  isActive?: boolean;
}

export interface Extra extends CreateExtraInput {
  id: string;
  isActive: boolean;
  createdAt: string;
}
