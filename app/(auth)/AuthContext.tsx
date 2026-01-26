import { createContext, useEffect, useState, ReactNode } from "react";
import { AuthContextData, RegisterPayload, User } from "./auth.types";
import { getToken, saveToken, removeToken } from "./auth.storage";

const API_URL = "https://sos-escrituras-api-portal.meujsu.easypanel.host";

export const AuthContext = createContext<AuthContextData>(
  {} as AuthContextData
);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSession() {
      const token = await getToken();
      if (token) {
        // backend ainda não tem /me → depois evoluímos
        setUser({} as User);
      }
      setLoading(false);
    }
    loadSession();
  }, []);

  async function login(cpf: string, password: string) {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cpf, password }),
    });

    if (!res.ok) throw new Error("CPF ou senha inválidos");

    const data = await res.json();
    await saveToken(data.token);
    setUser(data.user);
  }

  async function register(data: RegisterPayload) {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || "Erro ao cadastrar");
    }

    // login automático
    await login(data.cpf, data.password);
  }

  async function logout() {
    await removeToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}