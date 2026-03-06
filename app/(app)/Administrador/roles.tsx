import { ThemedText } from "@/components/themed-text";
import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { ProtectedRoute } from "@/core/auth/ProtectedRoute";
import { RADUL_TENANT_IDS } from "@/core/auth/auth.utils";
import { PERMISSIONS } from "@/core/auth/permissions";
import { assignDefaultPermissionsToRole } from "@/core/auth/permissions.sync";
import { filterActive } from "@/core/utils/soft-delete";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api, getApiErrorMessage } from "@/services/api";
import { formatCpf, validateCpf } from "@/services/brasil-api";
import { buildSearchParams, CRUD_ENDPOINT } from "@/services/crud";
import { DEFAULT_ROLE_NAMES } from "@/services/onboarding";
import {
    addServiceProviderCPFs,
    listServiceProviderInvites,
    reactivateServiceProvider,
    removePendingInvite,
    revokeServiceProvider,
    type ServiceProviderInvite,
} from "@/services/service-providers";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    ScrollView,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

const log = __DEV__ ? console.log : () => {};
const logError = __DEV__ ? console.error : () => {};

type Row = Record<string, unknown>;
type InviteWithUser = ServiceProviderInvite & { linked_user_name?: string };

const normalizeList = (data: unknown): Row[] => {
  const list = Array.isArray(data) ? data : ((data as any)?.data ?? []);
  return Array.isArray(list) ? (list as Row[]) : [];
};

const isMissingInvitesTableError = (error: unknown): boolean => {
  const status = (error as any)?.response?.status;
  const message = getApiErrorMessage(error, "").toLowerCase();
  return (
    status === 400 &&
    message.includes("service_provider_invites") &&
    message.includes("does not exist")
  );
};

const normalizeCpf = (value: string) => String(value ?? "").replace(/\D/g, "");

const listRows = async (tenantId?: string): Promise<Row[]> => {
  const [
    rolesResponse,
    rolePermissionsResponse,
    permissionsResponse,
    providerInvitesResponse,
  ] = await Promise.all([
    api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "roles",
      ...(tenantId
        ? buildSearchParams([{ field: "tenant_id", value: tenantId }])
        : {}),
    }),
    api.post(CRUD_ENDPOINT, { action: "list", table: "role_permissions" }),
    api.post(CRUD_ENDPOINT, { action: "list", table: "permissions" }),
    api
      .post(CRUD_ENDPOINT, {
        action: "list",
        table: "service_provider_invites",
        ...(tenantId
          ? buildSearchParams(
              [
                { field: "tenant_id", value: tenantId },
                { field: "deleted_at", value: "", operator: "is_null" },
              ],
              { combineType: "AND" },
            )
          : buildSearchParams([
              { field: "deleted_at", value: "", operator: "is_null" },
            ])),
      })
      .catch((error) => {
        if (isMissingInvitesTableError(error)) {
          if (__DEV__) {
            console.warn(
              "[Roles] Tabela service_provider_invites ausente; exibindo roles sem estatísticas de prestadores.",
            );
          }
          return { data: [] as Row[] };
        }
        throw error;
      }),
  ]);

  const roles = filterActive(normalizeList(rolesResponse.data));
  const rolePermissions = filterActive(
    normalizeList(rolePermissionsResponse.data),
  );
  const permissions = filterActive(normalizeList(permissionsResponse.data));
  const providerInvites = filterActive(
    normalizeList(providerInvitesResponse.data),
  );

  const permissionById = new Map<string, Row>();
  for (const permission of permissions) {
    const id = String(permission.id ?? "");
    if (!id) continue;
    permissionById.set(id, permission);
  }

  const permissionIdsByRole = new Map<string, string[]>();
  for (const rp of rolePermissions) {
    const roleId = String(rp.role_id ?? "");
    const permissionId = String(rp.permission_id ?? "");
    if (!roleId || !permissionId) continue;
    const list = permissionIdsByRole.get(roleId) ?? [];
    list.push(permissionId);
    permissionIdsByRole.set(roleId, list);
  }

  const providerStatsByRole = new Map<
    string,
    { total: number; pending: number; linked: number; revoked: number }
  >();

  for (const invite of providerInvites) {
    const roleId = String(invite.role_id ?? "");
    if (!roleId) continue;

    const status = String(invite.status ?? "pending").toLowerCase();
    const prev = providerStatsByRole.get(roleId) ?? {
      total: 0,
      pending: 0,
      linked: 0,
      revoked: 0,
    };

    prev.total += 1;
    if (status === "pending") prev.pending += 1;
    else if (status === "linked") prev.linked += 1;
    else if (status === "revoked") prev.revoked += 1;

    providerStatsByRole.set(roleId, prev);
  }

  return roles.map((role) => {
    const roleId = String(role.id ?? "");
    const permissionIds = permissionIdsByRole.get(roleId) ?? [];
    const preview = permissionIds
      .slice(0, 5)
      .map((permissionId) => {
        const permission = permissionById.get(permissionId);
        return String(
          permission?.code ?? permission?.display_name ?? permissionId,
        );
      })
      .join(", ");

    const providerStats = providerStatsByRole.get(roleId) ?? {
      total: 0,
      pending: 0,
      linked: 0,
      revoked: 0,
    };

    return {
      ...role,
      role_permissions_count: permissionIds.length,
      role_permissions_preview: preview || "Sem permissões vinculadas",
      service_provider_count: providerStats.total,
      service_provider_pending_count: providerStats.pending,
      service_provider_linked_count: providerStats.linked,
      service_provider_revoked_count: providerStats.revoked,
    };
  });
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "roles",
    payload,
  });

  const createdData = response.data;
  const roleList = Array.isArray(createdData)
    ? createdData
    : (createdData?.data ?? []);
  const createdRole = Array.isArray(roleList) ? roleList[0] : createdData;

  if (createdRole?.id && payload.name) {
    try {
      await assignDefaultPermissionsToRole(
        String(createdRole.id),
        String(payload.name),
      );
      log(`[Roles] Auto-atribuídas permissões padrão ao role: ${payload.name}`);
    } catch (err) {
      logError("[Roles] Falha ao auto-atribuir permissões:", err);
    }
  }

  return response.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) {
    throw new Error("Id obrigatorio para atualizar");
  }
  const response = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "roles",
    payload,
  });
  return response.data;
};

const deleteRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) {
    throw new Error("Id obrigatorio para deletar");
  }
  const response = await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "roles",
    payload: {
      id: payload.id,
    },
  });
  return response.data;
};

export default function RolesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ tenantId?: string }>();

  const tenantIdParam =
    (Array.isArray(params.tenantId) ? params.tenantId[0] : params.tenantId) ||
    user?.tenant_id;

  const tintColor = useThemeColor({}, "tint");
  const borderColor = useThemeColor({}, "border");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const cardColor = useThemeColor({}, "card");
  const inputBg = useThemeColor({}, "input");
  const bgColor = useThemeColor({}, "background");

  const [providerRole, setProviderRole] = useState<Row | null>(null);
  const [providerInvites, setProviderInvites] = useState<InviteWithUser[]>([]);
  const [providerLoading, setProviderLoading] = useState(false);
  const [providerSaving, setProviderSaving] = useState(false);
  const [providerCpfInput, setProviderCpfInput] = useState("");
  const [showOnlyServiceProviders, setShowOnlyServiceProviders] =
    useState(false);

  const isRadulTenant = useMemo(
    () => !!tenantIdParam && RADUL_TENANT_IDS.has(tenantIdParam),
    [tenantIdParam],
  );

  const roleNameCache = useMemo(() => new Map<string, string>(), []);

  const loadFilteredRows = useMemo(() => {
    return async (): Promise<Row[]> => {
      const rows = await listRows(tenantIdParam);
      roleNameCache.clear();
      for (const r of rows) {
        roleNameCache.set(String(r.id ?? ""), String(r.name ?? ""));
      }
      return rows.filter((item) => {
        if (tenantIdParam && String(item.tenant_id ?? "") !== tenantIdParam) {
          return false;
        }

        if (showOnlyServiceProviders && item.is_service_provider !== true) {
          return false;
        }

        const roleName = String(item.name ?? "")
          .toLowerCase()
          .trim();
        if (roleName === "super admin" && !isRadulTenant) {
          return false;
        }
        return true;
      });
    };
  }, [tenantIdParam, isRadulTenant, roleNameCache, showOnlyServiceProviders]);

  const createWithContext = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> => {
      return createRow({
        ...payload,
        tenant_id: tenantIdParam ?? payload.tenant_id,
      });
    };
  }, [tenantIdParam]);

  const updateWithContext = useMemo(() => {
    return async (
      payload: Partial<Row> & { id?: string | null },
    ): Promise<unknown> => {
      return updateRow({
        ...payload,
        tenant_id: tenantIdParam ?? payload.tenant_id,
      });
    };
  }, [tenantIdParam]);

  const guardedDeleteRow = useCallback(
    async (
      payload: Partial<Row> & { id?: string | null },
    ): Promise<unknown> => {
      const roleId = String(payload.id ?? "");
      const roleName = roleNameCache.get(roleId) ?? "";
      if (DEFAULT_ROLE_NAMES.has(roleName.toLowerCase().trim())) {
        Alert.alert(
          "Role padrão",
          `O role "${roleName}" é um role padrão do sistema e não pode ser excluído.`,
        );
        return Promise.resolve();
      }
      return deleteRow(payload);
    },
    [roleNameCache],
  );

  const loadRoleProviders = useCallback(
    async (role: Row) => {
      const roleId = String(role.id ?? "");
      const tenantId = String(role.tenant_id ?? tenantIdParam ?? "");
      if (!roleId || !tenantId) {
        setProviderInvites([]);
        return;
      }

      setProviderLoading(true);
      try {
        const invites = await listServiceProviderInvites({ roleId, tenantId });
        const linkedUserIds = Array.from(
          new Set(
            invites
              .map((invite) => String(invite.linked_user_id ?? "").trim())
              .filter(Boolean),
          ),
        );

        const userNameById = new Map<string, string>();
        if (linkedUserIds.length > 0) {
          const usersRes = await api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "users",
            ...buildSearchParams([
              {
                field: "id",
                value: linkedUserIds.join(","),
                operator: "in",
              },
            ]),
          });

          for (const row of normalizeList(usersRes.data)) {
            const id = String(row.id ?? "");
            if (!id) continue;
            const name = String(
              row.fullname ?? row.name ?? row.email ?? row.cpf ?? "",
            ).trim();
            userNameById.set(id, name || "Usuário");
          }
        }

        const merged: InviteWithUser[] = invites.map((invite) => {
          const linkedUserId = String(invite.linked_user_id ?? "").trim();
          return {
            ...invite,
            linked_user_name: linkedUserId
              ? (userNameById.get(linkedUserId) ?? "Usuário")
              : undefined,
          };
        });

        setProviderInvites(merged);
      } catch (error) {
        Alert.alert(
          "Prestadores",
          getApiErrorMessage(error, "Falha ao carregar prestadores da role."),
        );
        setProviderInvites([]);
      } finally {
        setProviderLoading(false);
      }
    },
    [tenantIdParam],
  );

  const openProvidersModal = useCallback(
    async (role: Row) => {
      setProviderRole(role);
      setProviderCpfInput("");
      await loadRoleProviders(role);
    },
    [loadRoleProviders],
  );

  const closeProvidersModal = useCallback(() => {
    setProviderRole(null);
    setProviderInvites([]);
    setProviderCpfInput("");
  }, []);

  const handleAddProviderCpf = useCallback(async () => {
    if (!providerRole || !user?.id) return;

    const digits = normalizeCpf(providerCpfInput);
    if (!validateCpf(digits)) {
      Alert.alert("CPF inválido", "Informe um CPF válido.");
      return;
    }

    const roleId = String(providerRole.id ?? "");
    const tenantId = String(providerRole.tenant_id ?? tenantIdParam ?? "");
    if (!roleId || !tenantId) {
      Alert.alert("Prestadores", "Role inválida para vincular CPF.");
      return;
    }

    setProviderSaving(true);
    try {
      await addServiceProviderCPFs({
        roleId,
        tenantId,
        cpfs: [digits],
        invitedBy: String(user.id),
      });

      setProviderCpfInput("");
      await loadRoleProviders(providerRole);
    } catch (error) {
      Alert.alert(
        "Prestadores",
        getApiErrorMessage(error, "Falha ao adicionar CPF nesta role."),
      );
    } finally {
      setProviderSaving(false);
    }
  }, [
    providerRole,
    user?.id,
    providerCpfInput,
    tenantIdParam,
    loadRoleProviders,
  ]);

  const handleProviderAction = useCallback(
    async (
      invite: InviteWithUser,
      action: "revoke" | "reactivate" | "remove",
    ) => {
      const tenantId = String(providerRole?.tenant_id ?? tenantIdParam ?? "");
      if (!tenantId) {
        Alert.alert("Prestadores", "Tenant não identificado para ação.");
        return;
      }

      setProviderSaving(true);
      try {
        if (action === "revoke") {
          await revokeServiceProvider({ inviteId: invite.id, tenantId });
        } else if (action === "reactivate") {
          await reactivateServiceProvider({ inviteId: invite.id, tenantId });
        } else {
          await removePendingInvite(invite.id);
        }

        if (providerRole) {
          await loadRoleProviders(providerRole);
        }
      } catch (error) {
        Alert.alert(
          "Prestadores",
          getApiErrorMessage(error, "Falha ao executar ação no prestador."),
        );
      } finally {
        setProviderSaving(false);
      }
    },
    [providerRole, tenantIdParam, loadRoleProviders],
  );

  const fields: CrudFieldConfig<Row>[] = [
    { key: "id", label: "Id", placeholder: "Id", visibleInForm: false },
    {
      key: "tenant_id",
      label: "Tenant Id",
      placeholder: "Tenant Id",
      type: "reference",
      referenceTable: "tenants",
      referenceLabelField: "company_name",
      referenceSearchField: "company_name",
      referenceIdField: "id",
      resolveReferenceLabelInList: true,
      visibleInList: true,
      visibleInForm: !tenantIdParam,
    },
    {
      key: "name",
      label: "Name",
      placeholder: "Name",
      required: true,
      visibleInList: true,
    },
    {
      key: "is_service_provider",
      label: "Serviço Terceirizado",
      type: "boolean",
      visibleInList: true,
      visibleInForm: true,
    },
    {
      key: "created_at",
      label: "Created At",
      placeholder: "Created At",
      visibleInForm: false,
    },
  ];

  return (
    <ProtectedRoute requiredPermission={PERMISSIONS.ROLE_MANAGE}>
      <View style={{ flex: 1 }}>
        <CrudScreen<Row>
          tableName="roles"
          title="Roles"
          subtitle={
            showOnlyServiceProviders
              ? "Gestao de roles · exibindo apenas terceirizadas"
              : "Gestao de roles"
          }
          searchPlaceholder="Buscar por role"
          searchFields={["name"]}
          fields={fields}
          loadItems={loadFilteredRows}
          createItem={createWithContext}
          updateItem={updateWithContext}
          deleteItem={guardedDeleteRow}
          headerActions={
            <>
              <TouchableOpacity
                onPress={() => setShowOnlyServiceProviders((prev) => !prev)}
                style={{
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  backgroundColor: showOnlyServiceProviders
                    ? `${tintColor}18`
                    : cardColor,
                }}
              >
                <ThemedText
                  style={{
                    color: tintColor,
                    fontWeight: "700",
                    fontSize: 12,
                  }}
                >
                  {showOnlyServiceProviders
                    ? "Mostrar todas"
                    : "Só terceirizadas"}
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  router.push("/Administrador/terceirizacao" as any)
                }
                style={{
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  backgroundColor: `${tintColor}18`,
                }}
              >
                <ThemedText
                  style={{
                    color: tintColor,
                    fontWeight: "700",
                    fontSize: 12,
                  }}
                >
                  Iniciar terceirização
                </ThemedText>
              </TouchableOpacity>
            </>
          }
          getDetails={(item) => [
            { label: "Tenant", value: String(item.tenant_id ?? "-") },
            { label: "Nome", value: String(item.name ?? "-") },
            {
              label: "Tipo",
              value:
                item.is_service_provider === true
                  ? "Serviço Terceirizado"
                  : "Role padrão",
            },
            {
              label: "Permissões vinculadas",
              value: String(
                item.role_permissions_preview ?? "Sem permissões vinculadas",
              ),
            },
          ]}
          renderItemActions={(item) => {
            const roleId = String(item.id ?? "");
            const tenantId = String(item.tenant_id ?? "");
            const count = Number(item.role_permissions_count ?? 0);
            const isServiceProvider = item.is_service_provider === true;
            const providersCount = Number(item.service_provider_count ?? 0);
            const pendingCount = Number(
              item.service_provider_pending_count ?? 0,
            );

            return (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {isServiceProvider ? (
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor,
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      backgroundColor: `${tintColor}15`,
                    }}
                  >
                    <ThemedText
                      style={{
                        color: tintColor,
                        fontWeight: "700",
                        fontSize: 12,
                      }}
                    >
                      Serviço terceirizado
                    </ThemedText>
                  </View>
                ) : null}

                <TouchableOpacity
                  onPress={() =>
                    router.push({
                      pathname: "/Administrador/role_permissions" as any,
                      params: { roleId, tenantId },
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
                    style={{
                      color: tintColor,
                      fontWeight: "700",
                      fontSize: 12,
                    }}
                  >
                    Permissões ({Number.isFinite(count) ? count : 0})
                  </ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() =>
                    router.push({
                      pathname: "/Administrador/role_permissions_matrix" as any,
                      params: { roleId },
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
                    style={{
                      color: tintColor,
                      fontWeight: "700",
                      fontSize: 12,
                    }}
                  >
                    Abrir matriz
                  </ThemedText>
                </TouchableOpacity>

                {isServiceProvider ? (
                  <TouchableOpacity
                    onPress={() => openProvidersModal(item)}
                    style={{
                      borderWidth: 1,
                      borderColor,
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                    }}
                  >
                    <ThemedText
                      style={{
                        color: tintColor,
                        fontWeight: "700",
                        fontSize: 12,
                      }}
                    >
                      Prestadores (
                      {Number.isFinite(providersCount) ? providersCount : 0}
                      {Number.isFinite(pendingCount) && pendingCount > 0
                        ? ` · ${pendingCount} pend.`
                        : ""}
                      )
                    </ThemedText>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          }}
          getId={(item) => String(item.id ?? "")}
          getTitle={(item) => String(item.name ?? "Role")}
        />

        <Modal
          transparent
          visible={!!providerRole}
          animationType="slide"
          onRequestClose={closeProvidersModal}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.45)",
              justifyContent: "center",
              padding: 16,
            }}
          >
            <View
              style={{
                backgroundColor: cardColor,
                borderRadius: 14,
                borderWidth: 1,
                borderColor,
                maxHeight: "88%",
                padding: 14,
                gap: 10,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <View style={{ flex: 1, marginRight: 10 }}>
                  <ThemedText
                    style={{
                      color: textColor,
                      fontSize: 18,
                      fontWeight: "700",
                    }}
                  >
                    Prestadores por CPF
                  </ThemedText>
                  <ThemedText style={{ color: mutedColor, fontSize: 12 }}>
                    Role: {String(providerRole?.name ?? "-")}
                  </ThemedText>
                </View>
                <TouchableOpacity onPress={closeProvidersModal}>
                  <ThemedText style={{ color: tintColor, fontWeight: "700" }}>
                    Fechar
                  </ThemedText>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  value={formatCpf(normalizeCpf(providerCpfInput))}
                  onChangeText={setProviderCpfInput}
                  keyboardType="number-pad"
                  placeholder="000.000.000-00"
                  placeholderTextColor={mutedColor}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 10,
                    backgroundColor: inputBg,
                    color: textColor,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                  }}
                />
                <TouchableOpacity
                  onPress={handleAddProviderCpf}
                  disabled={providerSaving}
                  style={{
                    backgroundColor: providerSaving ? mutedColor : tintColor,
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    justifyContent: "center",
                  }}
                >
                  {providerSaving ? (
                    <ActivityIndicator color={bgColor} />
                  ) : (
                    <ThemedText style={{ color: bgColor, fontWeight: "700" }}>
                      + CPF
                    </ThemedText>
                  )}
                </TouchableOpacity>
              </View>

              {providerLoading ? (
                <ActivityIndicator color={tintColor} />
              ) : (
                <ScrollView style={{ maxHeight: 420 }}>
                  {providerInvites.length === 0 ? (
                    <ThemedText style={{ color: mutedColor, fontSize: 13 }}>
                      Nenhum prestador vinculado a esta role.
                    </ThemedText>
                  ) : (
                    providerInvites.map((invite) => {
                      const status = String(invite.status ?? "pending");
                      const statusLabel =
                        status === "linked"
                          ? "Ativo"
                          : status === "revoked"
                            ? "Revogado"
                            : "Pendente";

                      return (
                        <View
                          key={invite.id}
                          style={{
                            borderWidth: 1,
                            borderColor,
                            borderRadius: 10,
                            backgroundColor: cardColor,
                            padding: 10,
                            gap: 6,
                            marginBottom: 8,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <ThemedText
                                style={{ color: textColor, fontWeight: "700" }}
                              >
                                {formatCpf(String(invite.cpf ?? ""))}
                              </ThemedText>
                              <ThemedText
                                style={{ color: mutedColor, fontSize: 12 }}
                              >
                                Status: {statusLabel}
                                {invite.linked_user_name
                                  ? ` · ${invite.linked_user_name}`
                                  : ""}
                              </ThemedText>
                            </View>

                            <View style={{ flexDirection: "row", gap: 8 }}>
                              {status === "linked" ? (
                                <TouchableOpacity
                                  disabled={providerSaving}
                                  onPress={() =>
                                    handleProviderAction(invite, "revoke")
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
                                    style={{
                                      color: "#dc2626",
                                      fontSize: 12,
                                      fontWeight: "700",
                                    }}
                                  >
                                    Revogar
                                  </ThemedText>
                                </TouchableOpacity>
                              ) : null}

                              {status === "revoked" ? (
                                <TouchableOpacity
                                  disabled={providerSaving}
                                  onPress={() =>
                                    handleProviderAction(invite, "reactivate")
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
                                    style={{
                                      color: tintColor,
                                      fontSize: 12,
                                      fontWeight: "700",
                                    }}
                                  >
                                    Reativar
                                  </ThemedText>
                                </TouchableOpacity>
                              ) : null}

                              {status === "pending" ? (
                                <TouchableOpacity
                                  disabled={providerSaving}
                                  onPress={() =>
                                    handleProviderAction(invite, "remove")
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
                                    style={{
                                      color: "#dc2626",
                                      fontSize: 12,
                                      fontWeight: "700",
                                    }}
                                  >
                                    Remover
                                  </ThemedText>
                                </TouchableOpacity>
                              ) : null}
                            </View>
                          </View>
                        </View>
                      );
                    })
                  )}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>
      </View>
    </ProtectedRoute>
  );
}
