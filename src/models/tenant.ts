export interface CreateTenantInput {
  name: string;
  address?: string;
  phone?: string;
  logo?: string;
  whatsappNumber?: string;
}

export interface UpdateTenantInput {
  name?: string;
  address?: string;
  phone?: string;
  logo?: string;
  whatsappNumber?: string;
  isActive?: boolean;
}

export interface Tenant extends CreateTenantInput {
  id: string;
  isActive: boolean;
  createdAt: string;
}
