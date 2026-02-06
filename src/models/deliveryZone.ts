export interface CreateDeliveryZoneInput {
  tenantId: string;
  name: string;
  price: number;
}

export interface UpdateDeliveryZoneInput {
  name?: string;
  price?: number;
  isActive?: boolean;
}

export interface DeliveryZone extends CreateDeliveryZoneInput {
  id: string;
  isActive: boolean;
  createdAt: string;
}
