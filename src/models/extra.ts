export interface Extra {
  id: string;
  tenantId: string;
  name: string;
  price: number;
  linkedProductId?: string;
  stockConsumption: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExtraInput {
  tenantId: string;
  name: string;
  price: number;
  linkedProductId?: string;
  stockConsumption?: number;
}

export interface UpdateExtraInput {
  name?: string;
  price?: number;
  linkedProductId?: string;
  stockConsumption?: number;
  isActive?: boolean;
}
