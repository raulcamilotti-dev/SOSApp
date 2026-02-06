import {
	createContext,
	ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";

import { setAuthToken } from "@/services/api";
import { getToken, getUser, saveToken, saveUser } from "./auth.storage";
import {
	AuthContextData,
	LoginResponse,
	RegisterPayload,
	RegisterResponse,
	User,
} from "./auth.types";

type AuthProviderProps = {
  children: ReactNode;
};

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
        const [storedUser, storedToken] = await Promise.all([
          getUser(),
          getToken(),
        ]);

        if (storedUser) {
          setUser(storedUser);
        }

        if (storedToken) {
          setAuthToken(storedToken);
        }
      } catch (err) {
        console.error("Erro ao restaurar sessão", err);
        await saveUser(null);
        await saveToken(null);
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

    const data: LoginResponse | User[] | any = await res.json();

    const payload = Array.isArray(data) ? data[0] : data;
    const loggedUser: User | undefined = payload?.user ?? payload;
    const token: string | undefined = payload?.token;

    if (!loggedUser || !token) {
      throw new Error("Usuário ou token inválido");
    }

    setUser(loggedUser);
    await saveUser(loggedUser);
    await saveToken(token);
    setAuthToken(token);

    return loggedUser;
  }

  /* ======================================================
   * REGISTER
   * ====================================================== */
  async function register(payload: RegisterPayload): Promise<RegisterResponse> {
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
      if (res.status === 409) {
        throw new Error(
          result.message ||
            "CPF ou telefone já cadastrado. Verifique seus dados.",
        );
      }
      throw new Error(result.message || "Erro no cadastro");
    }

    if (result.user && result.token) {
      setUser(result.user);
      await saveUser(result.user);
      await saveToken(result.token);
      setAuthToken(result.token);
    }

    setLoading(false);
    return result;
  }

  /* ======================================================
   * LOGOUT
   * ====================================================== */
  async function logout() {
    setUser(null);
    await saveUser(null);
    await saveToken(null);
    setAuthToken(null);
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
