export type UserRole = 'client' | 'operator' | 'admin';

export type AuthUser = {
  id: string;
  cpf: string;
  role: UserRole;
  app_id: string;
};