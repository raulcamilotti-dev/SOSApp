import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  AuthContextData,
  RegisterPayload,
  RegisterResponse,
  User,
} from "./auth.types";

type AuthProviderProps = {
  children: ReactNode;
};

const AUTH_USER_KEY = "@auth:user";

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  /* ======================================================
   * RESTAURA SESSÃO AO ABRIR O APP
   * ====================================================== */
  useEffect(() => {
    async function restoreSession() {
      try {
        const storedUser = await AsyncStorage.getItem(AUTH_USER_KEY);

        if (storedUser) {
          setUser(JSON.parse(storedUser));
        }
      } catch (err) {
        console.error("Erro ao restaurar sessão", err);
        await AsyncStorage.removeItem(AUTH_USER_KEY);
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    restoreSession();
  }, []);

  /* ======================================================
   * LOGIN
   * ====================================================== */
  async function login(cpf: string, password: string): Promise<User> {
    const res = await fetch("https://n8n.sosescritura.com.br/webhook/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cpf, password }),
    });

    if (!res.ok) {
      throw new Error("Erro ao fazer login");
    }

    const data = await res.json();

    // n8n retorna array
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("Usuário não encontrado");
    }

    const loggedUser: User = data[0];

    setUser(loggedUser);
    await AsyncStorage.setItem(
      AUTH_USER_KEY,
      JSON.stringify(loggedUser),
    );

    return loggedUser;
  }

  /* ======================================================
   * REGISTER
   * ====================================================== */
  async function register(
    payload: RegisterPayload,
  ): Promise<RegisterResponse> {
    setLoading(true);

    const res = await fetch(
      "https://n8n.sosescritura.com.br/webhook/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    const result = await res.json();

    if (!res.ok) {
      setLoading(false);
      throw new Error(result.message || "Erro no cadastro");
    }

    if (result.user) {
      setUser(result.user);
      await AsyncStorage.setItem(
        AUTH_USER_KEY,
        JSON.stringify(result.user),
      );
    }

    setLoading(false);
    return result;
  }

  /* ======================================================
   * LOGOUT
   * ====================================================== */
  async function logout() {
    setUser(null);
    await AsyncStorage.removeItem(AUTH_USER_KEY);
  }

  /* ======================================================
   * PROVIDER
   * ====================================================== */

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
