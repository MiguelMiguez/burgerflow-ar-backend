export interface CreateTenantInput {
  name: string;
  ownerId: string; // Firebase Auth UID del dueño
  address?: string;
  phone?: string;
  logo?: string;
  whatsappNumber?: string;
  notificationPhone?: string; // Teléfono para notificaciones de pedidos nuevos
  hasPickup?: boolean; // Retiro en local activado/desactivado
  hasDelivery?: boolean; // Delivery activado/desactivado
  // Meta WhatsApp Business API credentials
  metaPhoneNumberId?: string;
  metaAccessToken?: string;
  // Meta WhatsApp Catalog
  metaCatalogId?: string; // ID del catálogo de WhatsApp Business
  // Mercado Pago OAuth credentials
  mercadoPagoAccessToken?: string; // Access token obtenido via OAuth
  mercadoPagoRefreshToken?: string; // Refresh token para renovar el access token
  mercadoPagoPublicKey?: string; // Public key para el frontend
  mercadoPagoUserId?: string; // ID del usuario de Mercado Pago
  mercadoPagoTokenExpiry?: string; // Fecha de expiración del token
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
  // Meta WhatsApp Catalog
  metaCatalogId?: string; // ID del catálogo de WhatsApp Business
  // Mercado Pago OAuth credentials
  mercadoPagoAccessToken?: string;
  mercadoPagoRefreshToken?: string;
  mercadoPagoPublicKey?: string;
  mercadoPagoUserId?: string;
  mercadoPagoTokenExpiry?: string;
}

export interface Tenant extends Omit<
  CreateTenantInput,
  "hasPickup" | "hasDelivery"
> {
  id: string;
  hasPickup: boolean;
  hasDelivery: boolean;
  isActive: boolean;
  createdAt: string;
}
