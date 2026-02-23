import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";

import { api, N8N_API_KEY, setAuthToken } from "@/services/api";
import { autoLinkUserToCompanies } from "@/services/companies";
import { buildSearchParams, CRUD_ENDPOINT } from "@/services/crud";
import {
    autoLinkUserToTenant,
    resolveTenantFromContext,
} from "@/services/tenant-resolver";
import {
    getSelectedTenant,
    getTenantOptions,
    getToken,
    getUser,
    saveSelectedTenant,
    saveTenantOptions,
    saveToken,
    saveUser,
} from "./auth.storage";
import {
    AuthContextData,
    AuthProviderProps,
    LoginResponse,
    RegisterPayload,
    RegisterResponse,
    TenantOption,
    User,
} from "./auth.types";
import { buildTenantContextPayload } from "./tenant-context";
import { useAutoSyncPermissions } from "./useAutoSyncPermissions";

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

const normalizeList = (data: unknown): any[] => {
  const payload = data as any;
  const list = Array.isArray(data)
    ? data
    : (payload?.data ?? payload?.value ?? payload?.items ?? []);
  return Array.isArray(list) ? list : [];
};

/** Fire-and-forget: link user to any company_members matching their CPF */
const tryAutoLinkCompanies = (userId: string, cpf?: string) => {
  if (!userId || !cpf) return;
  autoLinkUserToCompanies(userId, cpf).catch(() => {
    /* silent — best effort */
  });
};

/**
 * Auto-resolve tenant from domain context and link user if applicable.
 * Called after login/register to auto-link users visiting tenant-specific domains.
 * - app.radul.com.br → no auto-link (user creates own tenant via onboarding)
 * - cartorio.radul.com.br → resolve slug "cartorio" → auto-link as client
 * - app.sosescritura.com.br → resolve custom_domain → auto-link as client
 */
const tryAutoResolveTenant = async (
  userId: string,
  tenantContext: import("./tenant-context").TenantContextPayload,
): Promise<string | null> => {
  try {
    // Skip if this is the platform root (app.radul.com.br)
    if (tenantContext.is_platform_root) return null;

    // Skip if no hostname context (native app without tenant slug)
    if (!tenantContext.hostname && !tenantContext.tenant_slug) return null;

    const result = await resolveTenantFromContext(tenantContext);

    if (!result.resolved || !result.tenant?.id) return null;

    const { linked } = await autoLinkUserToTenant(
      userId,
      result.tenant.id,
      result.tenant.default_client_role ?? "client",
    );

    // Return tenant ID whether newly linked or already existed
    return result.tenant.id;
  } catch {
    // Best-effort — don't break auth flow
    return null;
  }
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [availableTenants, setAvailableTenants] = useState<TenantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenantLoading, setTenantLoading] = useState(false);

  // Auto-sincronizar permissões quando o app iniciar
  useAutoSyncPermissions(!loading && !!user);

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
      tenant_id: raw.tenant_id ?? raw.tenantId,
    };

    return { ...raw, ...normalized } as User;
  }

  const applyTenantToUser = useCallback(
    async (baseUser: User, tenantId: string) => {
      const nextUser = { ...baseUser, tenant_id: tenantId } as User;
      setUser(nextUser);
      await saveUser(nextUser);
      if (nextUser.id) {
        await saveSelectedTenant(nextUser.id, tenantId);
      }
      return nextUser;
    },
    [],
  );

  const loadAvailableTenants = useCallback(
    async (
      baseUser: User,
    ): Promise<{ options: TenantOption[]; userWithTenant: User }> => {
      if (!baseUser?.id) {
        setAvailableTenants([]);
        return { options: [], userWithTenant: baseUser };
      }

      setTenantLoading(true);
      try {
        const [userTenantsRes, tenantsRes] = await Promise.all([
          api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "user_tenants",
            ...buildSearchParams([
              { field: "user_id", value: String(baseUser.id) },
            ]),
          }),
          api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "tenants",
          }),
        ]);

        const userTenants = normalizeList(userTenantsRes.data).filter(
          (row: any) =>
            String(row?.user_id ?? row?.id_user ?? "") === String(baseUser.id),
        );
        const tenants = normalizeList(tenantsRes.data);
        const tenantsById = new Map(
          tenants.map((tenant: any) => [String(tenant?.id ?? ""), tenant]),
        );

        const options = Array.from(
          new Map(
            userTenants
              .map((row: any) => {
                const id = String(
                  row?.tenant_id ?? row?.id_tenant ?? "",
                ).trim();
                if (!id) return null;

                const tenant = tenantsById.get(id);
                return [
                  id,
                  {
                    id,
                    company_name:
                      String(
                        tenant?.company_name ??
                          tenant?.name ??
                          tenant?.empresa ??
                          "",
                      ).trim() || undefined,
                    role_id:
                      String(row?.role_id ?? row?.id_role ?? "").trim() ||
                      undefined,
                  } satisfies TenantOption,
                ] as const;
              })
              .filter(Boolean) as (readonly [string, TenantOption])[],
          ).values(),
        );

        // Build set of tenant IDs the user actually has access to
        const freshTenantIds = new Set(options.map((o) => String(o.id)));

        const cachedOptions = await getTenantOptions();
        const mergedOptionsMap = new Map<string, TenantOption>();

        // Only keep cached entries that exist in the user's current user_tenants
        for (const option of cachedOptions) {
          if (!option?.id) continue;
          const key = String(option.id);
          if (freshTenantIds.has(key)) {
            mergedOptionsMap.set(key, option);
          }
        }

        for (const option of options) {
          if (!option?.id) continue;
          const key = String(option.id);
          const cached = mergedOptionsMap.get(key);
          mergedOptionsMap.set(key, {
            ...cached,
            ...option,
            id: key,
          });
        }

        const mergedOptions = Array.from(mergedOptionsMap.values());

        setAvailableTenants(mergedOptions);
        await saveTenantOptions(mergedOptions);

        const hasCurrentTenant = mergedOptions.some(
          (option) => String(option.id) === String(baseUser.tenant_id ?? ""),
        );

        if (hasCurrentTenant) {
          if (baseUser.id) {
            await saveSelectedTenant(baseUser.id, String(baseUser.tenant_id));
          }
          return { options: mergedOptions, userWithTenant: baseUser };
        }

        const storedTenantId = baseUser.id
          ? await getSelectedTenant(baseUser.id)
          : null;
        const hasStoredTenant = mergedOptions.some(
          (option) => String(option.id) === String(storedTenantId ?? ""),
        );

        if (hasStoredTenant && storedTenantId) {
          const userWithTenant = await applyTenantToUser(
            baseUser,
            storedTenantId,
          );
          return { options: mergedOptions, userWithTenant };
        }

        if (mergedOptions.length !== 1) {
          return { options: mergedOptions, userWithTenant: baseUser };
        }

        const autoSelectedTenantId = mergedOptions[0].id;
        const userWithTenant = await applyTenantToUser(
          baseUser,
          autoSelectedTenantId,
        );
        return { options: mergedOptions, userWithTenant };
      } catch (err) {
        console.error("Erro ao carregar tenants do usuário", err);
        const cachedOptions = await getTenantOptions();
        setAvailableTenants(cachedOptions);
        return { options: cachedOptions, userWithTenant: baseUser };
      } finally {
        setTenantLoading(false);
      }
    },
    [applyTenantToUser],
  );

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
        const res = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "users",
          ...buildSearchParams([
            { field: "id", value: String(currentUser.id) },
          ]),
        });

        const list = normalizeList(res.data);
        const checkedUser = normalizeUser(list.length > 0 ? list[0] : null);

        if (!checkedUser) {
          setUser(currentUser);
          await saveUser(currentUser);
          return currentUser;
        }

        // Merge but never overwrite non-empty values with empty/null
        // This prevents checkAndMergeUserData from wiping CPF/phone
        // collected during registration when the check endpoint returns blanks.
        const mergedUser: Record<string, unknown> = { ...currentUser };
        for (const [key, val] of Object.entries(checkedUser)) {
          const incoming =
            val === null || val === undefined ? "" : String(val).trim();
          const existing =
            mergedUser[key] === null || mergedUser[key] === undefined
              ? ""
              : String(mergedUser[key]).trim();
          if (incoming || !existing) {
            mergedUser[key] = val;
          }
        }
        // tenant_id: explicit fallback
        mergedUser.tenant_id = checkedUser.tenant_id ?? currentUser.tenant_id;
        const finalUser = mergedUser as unknown as User;
        setUser(finalUser);
        await saveUser(finalUser);
        return finalUser;
      } catch (err) {
        console.error("Erro ao verificar dados do usuário", err);
        setUser(currentUser);
        await saveUser(currentUser);
        return currentUser;
      }
    },
    [],
  );

  const selectTenant = useCallback(
    async (tenantId: string): Promise<User> => {
      const normalizedTenantId = String(tenantId ?? "").trim();
      if (!normalizedTenantId) {
        throw new Error("Tenant inválido");
      }

      const currentUser = user ?? (await getUser());
      if (!currentUser) {
        throw new Error("Usuário não encontrado");
      }

      const exists = availableTenants.some(
        (tenant) => String(tenant.id) === normalizedTenantId,
      );

      if (availableTenants.length > 0 && !exists) {
        const cachedOptions = await getTenantOptions();
        const existsInCache = cachedOptions.some(
          (tenant) => String(tenant.id) === normalizedTenantId,
        );
        if (!existsInCache) {
          throw new Error("Tenant não permitido para este usuário");
        }

        setAvailableTenants(cachedOptions);
      }

      return applyTenantToUser(currentUser, normalizedTenantId);
    },
    [applyTenantToUser, availableTenants, user],
  );

  const refreshAvailableTenants = useCallback(async (): Promise<void> => {
    const currentUser = user ?? (await getUser());
    if (!currentUser) return;
    await loadAvailableTenants(currentUser);
  }, [loadAvailableTenants, user]);

  const requiresTenantSelection = useMemo(() => {
    if (!user) return false;
    if (tenantLoading) return false;
    if (String(user.tenant_id ?? "").trim()) return false;
    return availableTenants.length > 1;
  }, [availableTenants.length, tenantLoading, user]);

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
          const cachedOptions = await getTenantOptions();
          if (cachedOptions.length > 0) {
            setAvailableTenants(cachedOptions);
          }
          const mergedUser = await checkAndMergeUserData(storedUser);
          await loadAvailableTenants(mergedUser);
        } else {
          setAvailableTenants([]);
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
  }, [checkAndMergeUserData, loadAvailableTenants]);

  /* ======================================================
   * LOGIN
   * ====================================================== */
  async function login(cpf: string, password: string): Promise<User> {
    const tenantContext = buildTenantContextPayload();
    const res = await fetch("https://n8n.sosescritura.com.br/webhook/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": N8N_API_KEY },
      body: JSON.stringify({
        cpf,
        password,
        tenant_slug: tenantContext.tenant_slug,
        tenant_subdomain: tenantContext.tenant_subdomain,
        tenant_hint: tenantContext.tenant_hint,
        app_slug: tenantContext.app_slug,
        host: tenantContext.host,
        hostname: tenantContext.hostname,
        pathname: tenantContext.pathname,
        partner_id: tenantContext.partner_id,
        referral_code: tenantContext.referral_code,
        utm_source: tenantContext.utm_source,
        utm_campaign: tenantContext.utm_campaign,
        tenant_context: tenantContext,
      }),
    });

    if (!res.ok) {
      let errorMessage = "Erro ao fazer login";
      try {
        const errData = await res.json();
        if (errData?.message) errorMessage = errData.message;
      } catch {
        // empty body — use default error
      }
      throw new Error(errorMessage);
    }

    let data: LoginResponse | User[] | any;
    try {
      data = await res.json();
    } catch {
      throw new Error("Resposta inválida do servidor");
    }

    const { userPayload, tokenPayload } = extractAuthPayload(data);
    const loggedUser: User | undefined = userPayload;
    const token: string | undefined = tokenPayload;

    if (!loggedUser || !token) {
      throw new Error("Usuário ou token inválido");
    }

    await saveToken(token);
    setAuthToken(token);

    const mergedUser = await checkAndMergeUserData(loggedUser);

    // Auto-resolve tenant from domain context (e.g. cartorio.radul.com.br)
    if (!mergedUser.tenant_id && mergedUser.id) {
      const resolvedTenantId = await tryAutoResolveTenant(
        String(mergedUser.id),
        tenantContext,
      );
      if (resolvedTenantId) mergedUser.tenant_id = resolvedTenantId;
    }

    const { userWithTenant } = await loadAvailableTenants(mergedUser);
    tryAutoLinkCompanies(String(userWithTenant.id), userWithTenant.cpf);
    return userWithTenant;
  }

  /* ======================================================
   * GOOGLE LOGIN
   * ====================================================== */
  async function googleLogin(idToken: string): Promise<User> {
    const tenantContext = buildTenantContextPayload();
    const res = await fetch(
      "https://n8n.sosescritura.com.br/webhook/google_login",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": N8N_API_KEY,
        },
        body: JSON.stringify({
          id_token: idToken,
          tenant_slug: tenantContext.tenant_slug,
          tenant_subdomain: tenantContext.tenant_subdomain,
          tenant_hint: tenantContext.tenant_hint,
          app_slug: tenantContext.app_slug,
          host: tenantContext.host,
          hostname: tenantContext.hostname,
          pathname: tenantContext.pathname,
          partner_id: tenantContext.partner_id,
          referral_code: tenantContext.referral_code,
          utm_source: tenantContext.utm_source,
          utm_campaign: tenantContext.utm_campaign,
          tenant_context: tenantContext,
        }),
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

    // Auto-resolve tenant from domain context (e.g. tenant subdomain or custom domain)
    if (!mergedUser.tenant_id && mergedUser.id) {
      const resolvedTenantId = await tryAutoResolveTenant(
        String(mergedUser.id),
        tenantContext,
      );
      if (resolvedTenantId) mergedUser.tenant_id = resolvedTenantId;
    }

    const { userWithTenant } = await loadAvailableTenants(mergedUser);
    tryAutoLinkCompanies(String(userWithTenant.id), userWithTenant.cpf);
    return userWithTenant;
  }

  /* ======================================================
   * GOV.BR LOGIN
   * ====================================================== */
  async function govBrLogin(
    code: string,
    codeVerifier?: string,
  ): Promise<User> {
    const { completeGovBrAuth, loginViaGovBrBackend } =
      await import("@/services/gov-br");

    // 1. Exchange code for tokens + fetch user info from Gov.br
    const authResult = await completeGovBrAuth(code, codeVerifier);

    // 2. Send to our backend (N8N) to create/login user
    const backendResult = await loginViaGovBrBackend(authResult);

    const { userPayload, tokenPayload } = extractAuthPayload(backendResult);
    const loggedUser: User | undefined = userPayload;
    const token: string | undefined = tokenPayload;

    if (!loggedUser || !token) {
      throw new Error("Usuário ou token inválido (Gov.br)");
    }

    await saveToken(token);
    setAuthToken(token);

    const mergedUser = await checkAndMergeUserData(loggedUser);

    // Auto-resolve tenant from domain context (Gov.br login)
    const govBrTenantContext = buildTenantContextPayload();
    if (!mergedUser.tenant_id && mergedUser.id) {
      const resolvedTenantId = await tryAutoResolveTenant(
        String(mergedUser.id),
        govBrTenantContext,
      );
      if (resolvedTenantId) mergedUser.tenant_id = resolvedTenantId;
    }

    const { userWithTenant } = await loadAvailableTenants(mergedUser);
    tryAutoLinkCompanies(String(userWithTenant.id), userWithTenant.cpf);
    return userWithTenant;
  }

  /* ======================================================
   * REGISTER
   * ====================================================== */
  async function register(payload: RegisterPayload): Promise<RegisterResponse> {
    setLoading(true);
    const tenantContext = buildTenantContextPayload();

    const res = await fetch(
      "https://n8n.sosescritura.com.br/webhook/register",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": N8N_API_KEY,
        },
        body: JSON.stringify({
          ...payload,
          tenant_slug: tenantContext.tenant_slug,
          tenant_subdomain: tenantContext.tenant_subdomain,
          tenant_hint: tenantContext.tenant_hint,
          app_slug: tenantContext.app_slug,
          host: tenantContext.host,
          hostname: tenantContext.hostname,
          pathname: tenantContext.pathname,
          partner_id: tenantContext.partner_id,
          referral_code: tenantContext.referral_code,
          utm_source: tenantContext.utm_source,
          utm_campaign: tenantContext.utm_campaign,
          tenant_context: tenantContext,
        }),
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
      await saveToken(result.token);
      setAuthToken(result.token);

      const normalizedRegisteredUser =
        normalizeUser(result.user) ?? (result.user as User);

      // Preserve registration payload fields that the server response may omit
      if (payload.cpf && !normalizedRegisteredUser.cpf)
        normalizedRegisteredUser.cpf = payload.cpf;
      if (payload.phone && !normalizedRegisteredUser.phone)
        normalizedRegisteredUser.phone = payload.phone;
      if (payload.name && !normalizedRegisteredUser.name)
        normalizedRegisteredUser.name = payload.name;
      if (payload.name && !normalizedRegisteredUser.fullname)
        normalizedRegisteredUser.fullname = payload.name;

      const mergedUser = await checkAndMergeUserData(normalizedRegisteredUser);

      // Auto-resolve tenant from domain context (register flow)
      if (!mergedUser.tenant_id && mergedUser.id) {
        const resolvedTenantId = await tryAutoResolveTenant(
          String(mergedUser.id),
          tenantContext,
        );
        if (resolvedTenantId) mergedUser.tenant_id = resolvedTenantId;
      }

      const { userWithTenant } = await loadAvailableTenants(mergedUser);

      tryAutoLinkCompanies(String(userWithTenant.id), userWithTenant.cpf);
      result.user = userWithTenant;
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
    const currentUser = user ?? (await getUser());
    setUser(null);
    setAvailableTenants([]);
    if (currentUser?.id) {
      await saveSelectedTenant(currentUser.id, null);
    }
    await saveUser(null);
    await saveTenantOptions([]);
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
        tenantLoading,
        availableTenants,
        requiresTenantSelection,
        login,
        googleLogin,
        govBrLogin,
        register,
        updateUser,
        selectTenant,
        refreshAvailableTenants,
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
