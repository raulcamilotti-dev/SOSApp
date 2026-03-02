import React from "react";

export type UserRole = "admin" | "user" | "guest" | "User";

export interface User {
  id: string;
  cpf?: string;
  email?: string;
  role?: string;
  fullname?: string;
  tenant_id?: string;
  customer_id?: string;

  /**
   * Partner ID for operational relationships (N users : 1 partner within a tenant).
   * This is separate from role - role controls UI permissions, partner_id controls
   * data scope and operational relationships. Loaded from user_tenants.partner_id.
   */
  partner_id?: string;

  /** Server-set flag for Radul platform admins (B13 fix) */
  is_platform_admin?: boolean;

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
  /** Partner ID from user_tenants - links user to partner within this tenant */
  partner_id?: string;
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
