export interface CreateDeliveryInput {
  tenantId: string;
  name: string;
  phone: string;
}

export interface UpdateDeliveryInput {
  name?: string;
  phone?: string;
  isActive?: boolean;
}

export interface Delivery extends CreateDeliveryInput {
  id: string;
  isActive: boolean;
  createdAt: string;
}
