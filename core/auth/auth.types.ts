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
  login: (cpf: string, password: string) => Promise<User>;
  googleLogin: (idToken: string) => Promise<User>;
  register: (data: RegisterPayload) => Promise<RegisterResponse>;
  updateUser: (patch: Partial<User>) => Promise<User>;
  logout: () => Promise<void>;
}
export interface AuthGateProps {
  children: React.ReactNode;
}
