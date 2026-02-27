import React from "react";

export type UserRole = "admin" | "user" | "guest" | "User";

export interface User {
  id: string;
  cpf?: string;
  email?: string;
  role?: string;
  fullname?: string;
  tenant_id?: string;

  // opcionais (não obrigar agora)
  name?: string;
  phone?: string;
  telefone?: string;
}

export type TenantOption = {
  id: string;
  company_name?: string;
  slug?: string;
  role_id?: string;
  role_name?: string;
};

export type RegisterPayload = {
  name: string;
  cpf: string;
  email: string;
  phone: string;
  password: string;
};

export type AuthProviderProps = {
  children: React.ReactNode;
};

export type RegisterResponse = {
  message?: string;
  token?: string;
  user?: User;
};

export type LoginResponse = {
  token: string;
  user: User;
};
export interface AuthContextData {
  user: User | null;
  loading: boolean;
  tenantLoading: boolean;
  availableTenants: TenantOption[];
  requiresTenantSelection: boolean;
  login: (cpf: string, password: string) => Promise<User>;
  googleLogin: (idToken: string) => Promise<User>;
  govBrLogin: (code: string, codeVerifier?: string) => Promise<User>;
  register: (data: RegisterPayload) => Promise<RegisterResponse>;
  updateUser: (patch: Partial<User>) => Promise<User>;
  selectTenant: (tenantId: string) => Promise<User>;
  refreshAvailableTenants: () => Promise<void>;
  logout: () => Promise<void>;
}
export interface AuthGateProps {
  children: React.ReactNode;
}
