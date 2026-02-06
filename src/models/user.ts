export interface CreateUserInput {
  email: string;
  password: string;
  displayName?: string;
  tenantName: string; // Nombre del negocio/tenant que se creará
}

export interface User {
  uid: string; // Firebase Auth UID
  email: string;
  displayName?: string;
  tenantId: string; // Referencia al tenant asociado
  role: "owner" | "admin" | "employee";
  isActive: boolean;
  createdAt: string;
}

export interface UpdateUserInput {
  displayName?: string;
  role?: "owner" | "admin" | "employee";
  isActive?: boolean;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResponse {
  uid: string;
  email: string;
  displayName?: string;
  tenantId: string;
  role: "owner" | "admin" | "employee";
  customToken: string; // Token para autenticación en frontend
}
