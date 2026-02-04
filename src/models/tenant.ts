export interface CreateTenantInput {
  name: string;
  address?: string;
  phone?: string;
  logo?: string;
  whatsappNumber?: string;
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
