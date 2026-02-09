import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";

import { setAuthToken } from "@/services/api";
import { getToken, getUser, saveToken, saveUser } from "./auth.storage";
import {
    AuthContextData,
    AuthProviderProps,
    LoginResponse,
    RegisterPayload,
    RegisterResponse,
    User,
} from "./auth.types";

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  function normalizeUser(input: any): User | undefined {
    if (!input || typeof input !== "object") return undefined;
    const base = Array.isArray(input) ? input[0] : input;
    const raw = base.user ?? base.json ?? base.data?.[0] ?? base.data ?? base;

    const normalized: User = {
      id: raw.user_id ?? raw.userId ?? raw.id,
      fullname: raw.fullname ?? raw.full_name ?? raw.name ?? raw.nome,
      name: raw.name ?? raw.nome,
      email: raw.email,
      cpf: raw.cpf,
      phone: raw.phone ?? raw.telefone ?? raw.phone_number,
      telefone: raw.telefone,
      role: raw.role ?? raw.user_role ?? raw.perfil ?? raw.type,
    };

    return { ...raw, ...normalized } as User;
  }

  function extractAuthPayload(data: any) {
    const payload = Array.isArray(data) ? data[0] : data;
    const userPayload = normalizeUser(payload);
    const tokenPayload =
      payload?.token ??
      payload?.json?.token ??
      payload?.data?.[0]?.token ??
      payload?.data?.token ??
      (userPayload as any)?.token;
    return { userPayload, tokenPayload };
  }

  const checkAndMergeUserData = useCallback(
    async (currentUser: User): Promise<User> => {
      try {
        const res = await fetch(
          "https://n8n.sosescritura.com.br/webhook/user_update_check",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id: currentUser.id,
              email: currentUser.email,
              google_sub: (currentUser as any).google_sub,
            }),
          },
        );

        if (!res.ok) {
          setUser(currentUser);
          await saveUser(currentUser);
          return currentUser;
        }

        const data = await res.json();
        const checkedUser = normalizeUser(data);

        if (!checkedUser) {
          setUser(currentUser);
          await saveUser(currentUser);
          return currentUser;
        }

        const mergedUser = { ...currentUser, ...checkedUser } as User;
        setUser(mergedUser);
        await saveUser(mergedUser);
        return mergedUser;
      } catch (err) {
        console.error("Erro ao verificar dados do usuário", err);
        setUser(currentUser);
        await saveUser(currentUser);
        return currentUser;
      }
    },
    [],
  );

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
          await checkAndMergeUserData(storedUser);
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
  }, [checkAndMergeUserData]);

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

    const { userPayload, tokenPayload } = extractAuthPayload(data);
    const loggedUser: User | undefined = userPayload;
    const token: string | undefined = tokenPayload;

    if (!loggedUser || !token) {
      throw new Error("Usuário ou token inválido");
    }

    await saveToken(token);
    setAuthToken(token);

    const mergedUser = await checkAndMergeUserData(loggedUser);
    return mergedUser;
  }

  /* ======================================================
   * GOOGLE LOGIN
   * ====================================================== */
  async function googleLogin(idToken: string): Promise<User> {
    const res = await fetch(
      "https://n8n.sosescritura.com.br/webhook/google_login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: idToken }),
      },
    );

    if (!res.ok) {
      throw new Error("Erro ao fazer login com Google");
    }

    const data: LoginResponse | User[] | any = await res.json();

    const { userPayload, tokenPayload } = extractAuthPayload(data);
    const loggedUser: User | undefined = userPayload;
    const token: string | undefined = tokenPayload;

    if (!loggedUser || !token) {
      throw new Error("Usuário ou token inválido");
    }

    await saveToken(token);
    setAuthToken(token);

    const mergedUser = await checkAndMergeUserData(loggedUser);
    return mergedUser;
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
   * UPDATE USER (LOCAL)
   * ====================================================== */
  async function updateUser(patch: Partial<User>): Promise<User> {
    const currentUser = user ?? (await getUser());

    if (!currentUser) {
      throw new Error("Usuário não encontrado");
    }

    const nextUser = { ...currentUser, ...patch } as User;
    setUser(nextUser);
    await saveUser(nextUser);
    return nextUser;
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
        googleLogin,
        register,
        updateUser,
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
