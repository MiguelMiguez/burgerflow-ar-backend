export interface CreateTenantInput {
  name: string;
  address?: string;
  phone?: string;
  logo?: string;
  whatsappNumber?: string;
  notificationPhone?: string; // Teléfono para notificaciones de pedidos nuevos
  hasPickup?: boolean;
  hasDelivery?: boolean;
  // Meta WhatsApp Business API credentials
  metaPhoneNumberId?: string;
  metaAccessToken?: string;
}

export interface UpdateTenantInput {
  name?: string;
  address?: string;
  phone?: string;
  logo?: string;
  whatsappNumber?: string;
  notificationPhone?: string;
  hasPickup?: boolean;
  hasDelivery?: boolean;
  isActive?: boolean;
  // Meta WhatsApp Business API credentials
  metaPhoneNumberId?: string;
  metaAccessToken?: string;
}

export interface Tenant extends CreateTenantInput {
  id: string;
  isActive: boolean;
  createdAt: string;
}
