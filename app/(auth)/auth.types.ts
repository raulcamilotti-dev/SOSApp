export type User = {
  id: string;
  nome: string;
  cpf: string;
  email: string;
  telefone: string;
};

export type RegisterPayload = {
  nome: string;
  cpf: string;
  email: string;
  telefone: string;
  password: string;
};

export type AuthContextData = {
  user: User | null;
  loading: boolean;
  login: (cpf: string, password: string) => Promise<void>;
  register: (data: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
};
export type AuthProviderProps = {
  children: React.ReactNode;
};  