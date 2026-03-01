import { ThemedText } from "@/components/themed-text";
import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { ProtectedRoute } from "@/core/auth/ProtectedRoute";
import { PERMISSIONS } from "@/core/auth/permissions";
import { filterActive } from "@/core/utils/soft-delete";
import { useSafeTenantId } from "@/hooks/use-safe-tenant-id";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api, getApiErrorMessage } from "@/services/api";
import { buildSearchParams, CRUD_ENDPOINT } from "@/services/crud";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type User = Record<string, unknown>;

const listUsers = async (): Promise<User[]> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "users",
    ...buildSearchParams([], { sortColumn: "fullname" }),
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as User[]) : []);
};

const listUserTenants = async (): Promise<User[]> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "user_tenants",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as User[]) : []);
};

const createUser = async (payload: Partial<User>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "users",
    payload,
  });
  return response.data;
};

const updateUser = async (
  payload: Partial<User> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) {
    throw new Error("Id obrigatorio para atualizar");
  }
  const response = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "users",
    payload,
  });
  return response.data;
};

const deleteUser = async (
  payload: Partial<User> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) {
    throw new Error("Id obrigatorio para deletar");
  }
  const response = await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "users",
    payload: {
      id: payload.id,
    },
  });
  return response.data;
};

export default function UsersManagementScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ tenantId?: string; roleId?: string }>();
  const urlTenantParam = Array.isArray(params.tenantId)
    ? params.tenantId[0]
    : params.tenantId;
  const { tenantId: safeTenantId } = useSafeTenantId(urlTenantParam);
  const roleIdParam = Array.isArray(params.roleId)
    ? params.roleId[0]
    : params.roleId;
  const tintColor = useThemeColor({}, "tint");
  const borderColor = useThemeColor({}, "border");
  const cardColor = useThemeColor({}, "card");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const inputBg = useThemeColor({}, "input");

  // Admin set-password modal state
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordUserId, setPasswordUserId] = useState<string | null>(null);
  const [passwordUserName, setPasswordUserName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const openPasswordModal = useCallback((userId: string, userName: string) => {
    setPasswordUserId(userId);
    setPasswordUserName(userName);
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError(null);
    setPasswordSuccess(false);
    setPasswordModalOpen(true);
  }, []);

  const handleSetPassword = useCallback(async () => {
    if (!passwordUserId) return;
    const trimmed = newPassword.trim();
    if (!trimmed) {
      setPasswordError("Informe a nova senha.");
      return;
    }
    if (trimmed.length < 6) {
      setPasswordError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (trimmed !== confirmPassword.trim()) {
      setPasswordError("As senhas não conferem.");
      return;
    }
    setPasswordSaving(true);
    setPasswordError(null);
    try {
      // Use dedicated /auth/set-password endpoint that hashes with bcrypt
      await api.post("/auth/set-password", {
        user_id: passwordUserId,
        password: trimmed,
      });
      setPasswordSuccess(true);
      setNewPassword("");
      setConfirmPassword("");
      // Auto-close after 1.5s
      setTimeout(() => {
        setPasswordModalOpen(false);
        setPasswordSuccess(false);
      }, 1500);
    } catch (err) {
      setPasswordError(getApiErrorMessage(err, "Falha ao definir senha."));
    } finally {
      setPasswordSaving(false);
    }
  }, [passwordUserId, newPassword, confirmPassword]);

  const loadFilteredUsers = useMemo(() => {
    return async (): Promise<User[]> => {
      const [rows, userTenants] = await Promise.all([
        listUsers(),
        safeTenantId || roleIdParam ? listUserTenants() : Promise.resolve([]),
      ]);

      const tenantsByUser = new Map<string, Set<string>>();
      const rolesByUser = new Map<string, Set<string>>();

      for (const link of userTenants) {
        const linkUserId = String(link.user_id ?? "");
        if (!linkUserId) continue;

        const linkTenantId = String(link.tenant_id ?? "");
        if (linkTenantId) {
          if (!tenantsByUser.has(linkUserId)) {
            tenantsByUser.set(linkUserId, new Set<string>());
          }
          tenantsByUser.get(linkUserId)?.add(linkTenantId);
        }

        const linkRoleId = String(link.role_id ?? "");
        if (linkRoleId) {
          if (!rolesByUser.has(linkUserId)) {
            rolesByUser.set(linkUserId, new Set<string>());
          }
          rolesByUser.get(linkUserId)?.add(linkRoleId);
        }
      }

      return rows.filter((item) => {
        const userId = String(item.id ?? "");

        if (safeTenantId) {
          const directTenantId = String(item.tenant_id ?? "");
          const linkedTenants = tenantsByUser.get(userId);
          const hasTenantLink = Boolean(linkedTenants?.has(safeTenantId));
          if (directTenantId !== safeTenantId && !hasTenantLink) {
            return false;
          }
        }

        if (roleIdParam) {
          const directRoleId = String(item.role_id ?? "");
          const linkedRoles = rolesByUser.get(userId);
          const hasRoleLink = Boolean(linkedRoles?.has(roleIdParam));
          if (directRoleId !== roleIdParam && !hasRoleLink) return false;
        }

        return true;
      });
    };
  }, [roleIdParam, safeTenantId]);

  const createWithContext = useMemo(() => {
    return async (payload: Partial<User>): Promise<unknown> => {
      const effectiveTenantId = safeTenantId ?? payload.tenant_id;
      const effectiveRoleId = roleIdParam ?? payload.role_id;
      const email = String(payload.email ?? "")
        .trim()
        .toLowerCase();

      // Check if a user with this email already exists (global unique constraint)
      if (email) {
        const existingRes = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "users",
          ...buildSearchParams([{ field: "email", value: email }]),
        });
        const existingList = Array.isArray(existingRes.data)
          ? existingRes.data
          : (existingRes.data?.data ?? []);
        const existingUser = Array.isArray(existingList)
          ? existingList.find(
              (u: any) =>
                String(u?.email ?? "")
                  .trim()
                  .toLowerCase() === email,
            )
          : null;

        if (existingUser) {
          const existingUserId = String(existingUser.id ?? "");

          // Link existing user to the current tenant via user_tenants
          if (effectiveTenantId && existingUserId) {
            // Check if link already exists
            const linkRes = await api.post(CRUD_ENDPOINT, {
              action: "list",
              table: "user_tenants",
              ...buildSearchParams([
                { field: "user_id", value: existingUserId },
                { field: "tenant_id", value: String(effectiveTenantId) },
              ]),
            });
            const linkList = Array.isArray(linkRes.data)
              ? linkRes.data
              : (linkRes.data?.data ?? []);
            const alreadyLinked =
              Array.isArray(linkList) && linkList.length > 0;

            if (!alreadyLinked) {
              await api.post(CRUD_ENDPOINT, {
                action: "create",
                table: "user_tenants",
                payload: {
                  user_id: existingUserId,
                  tenant_id: String(effectiveTenantId),
                  role_id: effectiveRoleId
                    ? String(effectiveRoleId)
                    : undefined,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
              });
            }
          }

          // Update user fields if needed (tenant_id, role_id, name, etc.)
          const updatePayload: Record<string, unknown> = {
            id: existingUserId,
            updated_at: new Date().toISOString(),
          };
          if (effectiveTenantId) updatePayload.tenant_id = effectiveTenantId;
          if (effectiveRoleId) updatePayload.role_id = effectiveRoleId;
          if (payload.fullname) updatePayload.fullname = payload.fullname;
          if (payload.cpf) updatePayload.cpf = payload.cpf;
          if (payload.phone) updatePayload.phone = payload.phone;

          await api.post(CRUD_ENDPOINT, {
            action: "update",
            table: "users",
            payload: updatePayload,
          });

          return [existingUser];
        }
      }

      // No existing user — create normally
      return createUser({
        ...payload,
        tenant_id: effectiveTenantId,
        role_id: effectiveRoleId,
      });
    };
  }, [roleIdParam, safeTenantId]);

  const updateWithContext = useMemo(() => {
    return async (
      payload: Partial<User> & { id?: string | null },
    ): Promise<unknown> => {
      return updateUser({
        ...payload,
        tenant_id: safeTenantId ?? payload.tenant_id,
        role_id: roleIdParam ?? payload.role_id,
      });
    };
  }, [roleIdParam, safeTenantId]);

  const fields: CrudFieldConfig<User>[] = [
    { key: "id", label: "Id", placeholder: "Id", visibleInForm: false },
    {
      key: "email",
      label: "E-mail",
      placeholder: "exemplo@email.com",
      required: true,
      visibleInList: true,
    },
    {
      key: "fullname",
      label: "Nome",
      placeholder: "Nome completo",
      required: true,
      visibleInList: true,
    },
    {
      key: "cpf",
      label: "CPF",
      placeholder: "000.000.000-00",
      visibleInList: true,
    },
    {
      key: "phone",
      label: "Telefone",
      placeholder: "(11) 99999-9999",
      visibleInList: true,
    },
    {
      key: "role_id",
      label: "Papel",
      placeholder: "Selecione uma role",
      type: "reference",
      referenceTable: "roles",
      referenceLabelField: "name",
      referenceSearchField: "name",
      referenceIdField: "id",
      visibleInList: true,
      visibleInForm: !roleIdParam,
      referenceFilter: (item) => {
        // Filter roles by the tenant context (safeTenantId or form's tenant_id)
        const targetTenantId = safeTenantId;
        if (!targetTenantId) return true; // No tenant context — show all
        return String(item.tenant_id ?? "") === targetTenantId;
      },
    },
    {
      key: "tenant_id",
      label: "Tenant",
      placeholder: "Tenant",
      type: "reference",
      referenceTable: "tenants",
      referenceLabelField: "company_name",
      referenceSearchField: "company_name",
      referenceIdField: "id",
      visibleInForm: !safeTenantId,
    },
    {
      key: "can_view_all_partners",
      label: "Ver todos os parceiros",
      type: "boolean",
      visibleInList: false,
      visibleInForm: true,
      section: "Permissões",
    },
    {
      key: "created_at",
      label: "Criado em",
      placeholder: "Created At",
      visibleInForm: false,
    },
  ];

  return (
    <ProtectedRoute requiredPermission={PERMISSIONS.USER_MANAGE}>
      <CrudScreen<User>
        title="Usuários"
        subtitle="Gestão de usuários do sistema e vinculação a tenants"
        searchPlaceholder="Buscar por nome, e-mail ou CPF"
        searchFields={["fullname", "email", "cpf"]}
        fields={fields}
        loadItems={loadFilteredUsers}
        createItem={createWithContext}
        updateItem={updateWithContext}
        deleteItem={deleteUser}
        getDetails={(item) => [
          { label: "Nome", value: String(item.fullname ?? "-") },
          { label: "E-mail", value: String(item.email ?? "-") },
          { label: "Tenant", value: String(item.tenant_id ?? "-") },
          { label: "Role", value: String(item.role_id ?? "-") },
        ]}
        renderItemActions={(item) => {
          const userId = String(item.id ?? "");
          if (!userId) return null;

          return (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/Administrador/user_tenants" as any,
                    params: {
                      userId,
                    },
                  })
                }
                style={{
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <ThemedText
                  style={{ color: tintColor, fontWeight: "700", fontSize: 12 }}
                >
                  Vínculos tenant/role
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/Administrador/LogsAgendamentos" as any,
                    params: { performedBy: userId },
                  })
                }
                style={{
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <ThemedText
                  style={{ color: tintColor, fontWeight: "700", fontSize: 12 }}
                >
                  Logs de agenda
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/Administrador/LogsAvaliacoes" as any,
                    params: { performedBy: userId },
                  })
                }
                style={{
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <ThemedText
                  style={{ color: tintColor, fontWeight: "700", fontSize: 12 }}
                >
                  Logs de avaliações
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/Administrador/auth_codes" as any,
                    params: { userId },
                  })
                }
                style={{
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <ThemedText
                  style={{ color: tintColor, fontWeight: "700", fontSize: 12 }}
                >
                  Auth codes
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/Administrador/auth_tokens" as any,
                    params: { userId },
                  })
                }
                style={{
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <ThemedText
                  style={{ color: tintColor, fontWeight: "700", fontSize: 12 }}
                >
                  Auth tokens
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/Administrador/customers" as any,
                    params: {
                      userId,
                      tenantId: String(item.tenant_id ?? ""),
                    },
                  })
                }
                style={{
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <ThemedText
                  style={{ color: tintColor, fontWeight: "700", fontSize: 12 }}
                >
                  Customers
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/Administrador/customer-properties" as any,
                    params: {
                      userId,
                      tenantId: String(item.tenant_id ?? ""),
                    },
                  })
                }
                style={{
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <ThemedText
                  style={{ color: tintColor, fontWeight: "700", fontSize: 12 }}
                >
                  Imóveis
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  openPasswordModal(
                    userId,
                    String(item.fullname ?? item.email ?? "Usuário"),
                  )
                }
                style={{
                  borderWidth: 1,
                  borderColor: "#f59e0b",
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  backgroundColor: "#f59e0b15",
                }}
              >
                <ThemedText
                  style={{
                    color: "#f59e0b",
                    fontWeight: "700",
                    fontSize: 12,
                  }}
                >
                  Definir Senha
                </ThemedText>
              </TouchableOpacity>
            </View>
          );
        }}
        getId={(item) => String(item.id ?? "")}
        getTitle={(item) => String(item.fullname ?? item.email ?? "Usuário")}
      />

      {/* Admin Set Password Modal */}
      <Modal
        transparent
        visible={passwordModalOpen}
        animationType="fade"
        onRequestClose={() => setPasswordModalOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <View
            style={{
              backgroundColor: cardColor,
              borderRadius: 12,
              padding: 20,
              maxWidth: 420,
              alignSelf: "center",
              width: "100%",
            }}
          >
            <ThemedText
              style={{ fontSize: 16, fontWeight: "700", color: textColor }}
            >
              Definir Senha
            </ThemedText>
            <ThemedText
              style={{ fontSize: 13, color: mutedColor, marginTop: 4 }}
            >
              {passwordUserName}
            </ThemedText>

            {passwordSuccess ? (
              <View
                style={{
                  marginTop: 16,
                  padding: 16,
                  backgroundColor: "#16a34a15",
                  borderRadius: 8,
                  alignItems: "center",
                }}
              >
                <ThemedText
                  style={{
                    color: "#16a34a",
                    fontWeight: "700",
                    fontSize: 14,
                  }}
                >
                  Senha definida com sucesso!
                </ThemedText>
              </View>
            ) : (
              <>
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Nova senha (mín. 6 caracteres)"
                  placeholderTextColor={mutedColor}
                  secureTextEntry
                  style={{
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    backgroundColor: inputBg,
                    color: textColor,
                    marginTop: 16,
                  }}
                />

                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirmar senha"
                  placeholderTextColor={mutedColor}
                  secureTextEntry
                  style={{
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    backgroundColor: inputBg,
                    color: textColor,
                    marginTop: 10,
                  }}
                />

                {passwordError ? (
                  <ThemedText
                    style={{ color: "#ef4444", fontSize: 13, marginTop: 8 }}
                  >
                    {passwordError}
                  </ThemedText>
                ) : null}

                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    marginTop: 16,
                    justifyContent: "flex-end",
                  }}
                >
                  <TouchableOpacity
                    onPress={() => setPasswordModalOpen(false)}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor,
                    }}
                  >
                    <ThemedText style={{ color: textColor, fontWeight: "600" }}>
                      Cancelar
                    </ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSetPassword}
                    disabled={passwordSaving}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      borderRadius: 6,
                      backgroundColor: passwordSaving ? mutedColor : "#f59e0b",
                    }}
                  >
                    {passwordSaving ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <ThemedText style={{ color: "#fff", fontWeight: "700" }}>
                        Salvar Senha
                      </ThemedText>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ProtectedRoute>
  );
}
