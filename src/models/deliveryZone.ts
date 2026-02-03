export interface CreateDeliveryZoneInput {
  tenantId: string;
  name: string;
  minDistance: number;
  maxDistance: number;
  cost: number;
}

export interface UpdateDeliveryZoneInput {
  name?: string;
  minDistance?: number;
  maxDistance?: number;
  cost?: number;
  isActive?: boolean;
}

export interface DeliveryZone extends CreateDeliveryZoneInput {
  id: string;
  isActive: boolean;
  createdAt: string;
}
