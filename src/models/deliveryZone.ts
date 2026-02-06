export interface CreateDeliveryZoneInput {
  tenantId: string;
  name: string; // ej: "Burzaco", "Centro", "Zona Norte"
  price: number; // Costo fijo de envío a esta zona
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
