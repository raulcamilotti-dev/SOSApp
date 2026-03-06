import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import {
    getPermissionDisplayName,
    getPermissionDomains,
    PERMISSIONS,
    type CrudAction,
    type Permission,
} from "@/core/auth/permissions";
import { ProtectedRoute } from "@/core/auth/ProtectedRoute";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api, getApiErrorMessage } from "@/services/api";
import { formatCpf, validateCpf } from "@/services/brasil-api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import {
    createServiceProviderRole,
    type ServiceProviderInvite,
} from "@/services/service-providers";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

const BLOCKED_PERMISSIONS = new Set<Permission>([
  PERMISSIONS.ADMIN_FULL,
  PERMISSIONS.ROLE_MANAGE,
  PERMISSIONS.TENANT_MANAGE,
  PERMISSIONS.PERMISSION_MANAGE,
]);

const STEP_TITLES = [
  "Nome do serviço",
  "Permissões",
  "CPFs",
  "Confirmação",
] as const;

const CRUD_COLUMNS: { action: CrudAction; label: string }[] = [
  { action: "view", label: "Ver" },
  { action: "create", label: "Criar" },
  { action: "edit", label: "Editar" },
  { action: "delete", label: "Excluir" },
];

const normalizeCpf = (value: string) => String(value ?? "").replace(/\D/g, "");

const forbiddenRoleName = (roleName: string): boolean => {
  const normalized = String(roleName ?? "").toLowerCase();
  return ["admin", "administrador", "super"].some((token) =>
    normalized.includes(token),
  );
};

export default function TerceirizacaoScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const bgColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");
  const inputBg = useThemeColor({}, "input");

  const [step, setStep] = useState(0);
  const [roleName, setRoleName] = useState("");
  const [selectedPermissionCodes, setSelectedPermissionCodes] = useState<
    Permission[]
  >([]);
  const [permissionSearch, setPermissionSearch] = useState("");
  const [cpfInput, setCpfInput] = useState("");
  const [cpfs, setCpfs] = useState<string[]>([]);
  const [permissionCodeToId, setPermissionCodeToId] = useState<
    Record<string, string>
  >({});
  const [loadingPermissions, setLoadingPermissions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createdRoleId, setCreatedRoleId] = useState<string | null>(null);
  const [createdInvites, setCreatedInvites] = useState<ServiceProviderInvite[]>(
    [],
  );

  const allDomains = useMemo(() => getPermissionDomains(), []);

  const filteredDomains = useMemo(() => {
    const query = permissionSearch.trim().toLowerCase();
    const filtered = allDomains
      .map((domain) => {
        const nextCrud: Partial<Record<CrudAction, Permission>> = {};
        for (const action of CRUD_COLUMNS) {
          const code = domain.crud[action.action];
          if (!code) continue;
          if (BLOCKED_PERMISSIONS.has(code)) continue;
          nextCrud[action.action] = code;
        }

        const nextSpecial = domain.special.filter(
          (s) => !BLOCKED_PERMISSIONS.has(s.permission),
        );

        return {
          ...domain,
          crud: nextCrud,
          special: nextSpecial,
        };
      })
      .filter(
        (domain) =>
          Object.keys(domain.crud).length > 0 || domain.special.length > 0,
      );

    if (!query) return filtered;

    return filtered.filter((domain) => {
      if (domain.label.toLowerCase().includes(query)) return true;
      if (domain.key.toLowerCase().includes(query)) return true;

      const hasCrudMatch = Object.values(domain.crud)
        .filter(Boolean)
        .some((code) =>
          getPermissionDisplayName(code as Permission)
            .toLowerCase()
            .includes(query),
        );

      if (hasCrudMatch) return true;

      return domain.special.some((special) =>
        special.label.toLowerCase().includes(query),
      );
    });
  }, [allDomains, permissionSearch]);

  useEffect(() => {
    const loadPermissions = async () => {
      try {
        setLoadingPermissions(true);
        const res = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "permissions",
        });

        const map: Record<string, string> = {};
        for (const row of normalizeCrudList<{ id: string; code: string }>(
          res.data,
        )) {
          if (!row?.id || !row?.code) continue;
          map[row.code] = row.id;
        }
        setPermissionCodeToId(map);
      } catch {
        setPermissionCodeToId({});
      } finally {
        setLoadingPermissions(false);
      }
    };

    loadPermissions();
  }, []);

  const togglePermission = (permission: Permission) => {
    if (BLOCKED_PERMISSIONS.has(permission)) return;
    setSelectedPermissionCodes((prev) =>
      prev.includes(permission)
        ? prev.filter((code) => code !== permission)
        : [...prev, permission],
    );
  };

  const applyPreset = (preset: "read" | "basic") => {
    const collected = new Set<Permission>();
    for (const domain of filteredDomains) {
      const viewCode = domain.crud.view;
      if (viewCode && !BLOCKED_PERMISSIONS.has(viewCode)) {
        collected.add(viewCode);
      }

      if (preset === "basic") {
        const createCode = domain.crud.create;
        const editCode = domain.crud.edit;
        if (createCode && !BLOCKED_PERMISSIONS.has(createCode)) {
          collected.add(createCode);
        }
        if (editCode && !BLOCKED_PERMISSIONS.has(editCode)) {
          collected.add(editCode);
        }
      }
    }

    setSelectedPermissionCodes(Array.from(collected));
  };

  const addCpf = () => {
    const digits = normalizeCpf(cpfInput);
    if (!validateCpf(digits)) {
      Alert.alert("CPF inválido", "Informe um CPF válido para continuar.");
      return;
    }
    if (cpfs.includes(digits)) {
      Alert.alert("CPF duplicado", "Este CPF já foi adicionado.");
      return;
    }
    setCpfs((prev) => [...prev, digits]);
    setCpfInput("");
  };

  const removeCpf = (cpf: string) => {
    setCpfs((prev) => prev.filter((item) => item !== cpf));
  };

  const goNext = async () => {
    if (step === 0) {
      const normalized = roleName.trim();
      if (!normalized) {
        Alert.alert("Nome obrigatório", "Informe o nome do serviço.");
        return;
      }
      if (forbiddenRoleName(normalized)) {
        Alert.alert(
          "Nome inválido",
          'Não use termos como "admin", "administrador" ou "super".',
        );
        return;
      }
      if (user?.tenant_id) {
        try {
          const res = await api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "roles",
            ...buildSearchParams([
              { field: "tenant_id", value: String(user.tenant_id) },
              { field: "deleted_at", value: "", operator: "is_null" },
            ]),
          });

          const duplicate = normalizeCrudList<{ name?: string }>(res.data).some(
            (row) =>
              String(row.name ?? "")
                .toLowerCase()
                .trim() === normalized.toLowerCase(),
          );
          if (duplicate) {
            Alert.alert(
              "Nome já existe",
              "Já existe uma role com este nome no tenant.",
            );
            return;
          }
        } catch {
          Alert.alert(
            "Validação",
            "Não foi possível validar nome duplicado agora. Tente novamente.",
          );
          return;
        }
      }
    }

    if (step === 1) {
      if (selectedPermissionCodes.length === 0) {
        Alert.alert(
          "Permissões",
          "Selecione ao menos uma permissão para continuar.",
        );
        return;
      }
    }

    if (step === 2) {
      if (cpfs.length === 0) {
        Alert.alert("CPFs", "Adicione ao menos um CPF para continuar.");
        return;
      }
    }

    setStep((prev) => Math.min(prev + 1, 3));
  };

  const goBack = () => setStep((prev) => Math.max(prev - 1, 0));

  const confirmCreate = async () => {
    if (!user?.tenant_id || !user?.id) {
      Alert.alert("Sessão", "Tenant ou usuário não identificado.");
      return;
    }

    const permissionIds = selectedPermissionCodes
      .filter((code) => !BLOCKED_PERMISSIONS.has(code))
      .map((code) => permissionCodeToId[code])
      .filter(Boolean);

    if (permissionIds.length === 0) {
      Alert.alert(
        "Permissões",
        "Nenhuma permissão válida selecionada. Revise a etapa de permissões.",
      );
      return;
    }

    try {
      setSaving(true);
      const result = await createServiceProviderRole({
        tenantId: String(user.tenant_id),
        roleName: roleName.trim(),
        permissionIds,
        cpfs,
        invitedBy: String(user.id),
      });

      setCreatedRoleId(result.roleId);
      setCreatedInvites(result.invites ?? []);

      Alert.alert(
        "Terceirização criada",
        "Role de serviço e vínculos de CPF criados com sucesso.",
        [
          {
            text: "Ver papéis",
            onPress: () =>
              router.push({
                pathname: "/Administrador/roles" as any,
              }),
          },
          {
            text: "Ficar aqui",
            style: "cancel",
          },
        ],
      );
    } catch (error) {
      Alert.alert(
        "Falha ao criar",
        getApiErrorMessage(error, "Não foi possível concluir a terceirização."),
      );
    } finally {
      setSaving(false);
    }
  };

  const renderStepContent = () => {
    if (step === 0) {
      return (
        <View style={{ gap: 10 }}>
          <ThemedText style={{ color: mutedColor, fontSize: 13 }}>
            Defina o nome do serviço terceirizado. Exemplo: Contabilidade,
            Jurídico Externo, TI Externa.
          </ThemedText>
          <TextInput
            value={roleName}
            onChangeText={setRoleName}
            placeholder="Ex: Contabilidade"
            placeholderTextColor={mutedColor}
            style={{
              borderWidth: 1,
              borderColor,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              backgroundColor: inputBg,
              color: textColor,
            }}
          />
        </View>
      );
    }

    if (step === 1) {
      return (
        <View style={{ gap: 12 }}>
          <ThemedText style={{ color: mutedColor, fontSize: 13 }}>
            Selecione exatamente as permissões operacionais que esse serviço
            pode usar.
          </ThemedText>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              onPress={() => applyPreset("read")}
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <ThemedText style={{ color: tintColor, fontSize: 12 }}>
                Somente leitura
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => applyPreset("basic")}
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <ThemedText style={{ color: tintColor, fontSize: 12 }}>
                Operador básico
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setSelectedPermissionCodes([])}
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <ThemedText style={{ color: tintColor, fontSize: 12 }}>
                Limpar
              </ThemedText>
            </TouchableOpacity>
          </View>

          <TextInput
            value={permissionSearch}
            onChangeText={setPermissionSearch}
            placeholder="Buscar domínio/permissão"
            placeholderTextColor={mutedColor}
            style={{
              borderWidth: 1,
              borderColor,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              backgroundColor: inputBg,
              color: textColor,
            }}
          />

          {loadingPermissions ? (
            <ActivityIndicator color={tintColor} />
          ) : (
            <View style={{ gap: 10 }}>
              {filteredDomains.map((domain) => (
                <View
                  key={domain.key}
                  style={{
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 12,
                    backgroundColor: cardColor,
                    padding: 10,
                    gap: 8,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <ThemedText style={{ color: textColor, fontWeight: "700" }}>
                      {domain.label}
                    </ThemedText>
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor,
                        borderRadius: 999,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        backgroundColor: `${tintColor}14`,
                      }}
                    >
                      <ThemedText
                        style={{
                          color: tintColor,
                          fontSize: 10,
                          fontWeight: "700",
                          textTransform: "uppercase",
                        }}
                      >
                        {domain.category}
                      </ThemedText>
                    </View>
                  </View>

                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                  >
                    {CRUD_COLUMNS.map((column) => {
                      const code = domain.crud[column.action];
                      if (!code) return null;
                      const selected = selectedPermissionCodes.includes(code);

                      return (
                        <TouchableOpacity
                          key={`${domain.key}-${column.action}`}
                          onPress={() => togglePermission(code)}
                          style={{
                            borderWidth: 1,
                            borderColor: selected ? tintColor : borderColor,
                            backgroundColor: selected
                              ? `${tintColor}22`
                              : cardColor,
                            borderRadius: 999,
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                          }}
                        >
                          <ThemedText
                            style={{
                              color: selected ? tintColor : textColor,
                              fontSize: 12,
                              fontWeight: "600",
                            }}
                          >
                            {column.label}
                          </ThemedText>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {domain.special.length > 0 && (
                    <View
                      style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                    >
                      {domain.special.map((special) => {
                        const selected = selectedPermissionCodes.includes(
                          special.permission,
                        );
                        return (
                          <TouchableOpacity
                            key={`${domain.key}-${special.permission}`}
                            onPress={() => togglePermission(special.permission)}
                            style={{
                              borderWidth: 1,
                              borderColor: selected ? tintColor : borderColor,
                              backgroundColor: selected
                                ? `${tintColor}22`
                                : cardColor,
                              borderRadius: 999,
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                            }}
                          >
                            <ThemedText
                              style={{
                                color: selected ? tintColor : textColor,
                                fontSize: 12,
                                fontWeight: "600",
                              }}
                            >
                              {special.label}
                            </ThemedText>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      );
    }

    if (step === 2) {
      return (
        <View style={{ gap: 12 }}>
          <ThemedText style={{ color: mutedColor, fontSize: 13 }}>
            Adicione os CPFs dos profissionais externos. O vínculo será feito
            por CPF após login/registro.
          </ThemedText>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              value={formatCpf(normalizeCpf(cpfInput))}
              onChangeText={setCpfInput}
              keyboardType="number-pad"
              placeholder="000.000.000-00"
              placeholderTextColor={mutedColor}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                backgroundColor: inputBg,
                color: textColor,
              }}
            />
            <TouchableOpacity
              onPress={addCpf}
              style={{
                backgroundColor: tintColor,
                borderRadius: 10,
                paddingHorizontal: 14,
                justifyContent: "center",
              }}
            >
              <ThemedText style={{ color: bgColor, fontWeight: "700" }}>
                Adicionar
              </ThemedText>
            </TouchableOpacity>
          </View>

          <View style={{ gap: 8 }}>
            {cpfs.length === 0 ? (
              <ThemedText style={{ color: mutedColor, fontSize: 13 }}>
                Nenhum CPF adicionado.
              </ThemedText>
            ) : (
              cpfs.map((cpf) => (
                <View
                  key={cpf}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    backgroundColor: cardColor,
                  }}
                >
                  <View>
                    <ThemedText style={{ color: textColor, fontWeight: "600" }}>
                      {formatCpf(cpf)}
                    </ThemedText>
                    <ThemedText style={{ color: mutedColor, fontSize: 12 }}>
                      Pendente até primeiro login
                    </ThemedText>
                  </View>
                  <TouchableOpacity onPress={() => removeCpf(cpf)}>
                    <ThemedText style={{ color: "#dc2626", fontWeight: "700" }}>
                      Remover
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        </View>
      );
    }

    const permissionCount = selectedPermissionCodes.length;
    const linkedCount = createdInvites.filter(
      (invite) => invite.status === "linked",
    ).length;
    const pendingCount = createdInvites.filter(
      (invite) => invite.status === "pending",
    ).length;

    return (
      <View style={{ gap: 12 }}>
        <View
          style={{
            borderWidth: 1,
            borderColor,
            borderRadius: 12,
            backgroundColor: cardColor,
            padding: 12,
            gap: 8,
          }}
        >
          <ThemedText style={{ color: textColor, fontWeight: "700" }}>
            Resumo
          </ThemedText>
          <ThemedText style={{ color: textColor }}>
            Serviço: {roleName.trim()}
          </ThemedText>
          <ThemedText style={{ color: textColor }}>
            Permissões selecionadas: {permissionCount}
          </ThemedText>
          <ThemedText style={{ color: textColor }}>
            CPFs: {cpfs.length}
          </ThemedText>
          {createdRoleId ? (
            <>
              <ThemedText style={{ color: textColor }}>
                Role criada: {createdRoleId}
              </ThemedText>
              <ThemedText style={{ color: textColor }}>
                Convites: {createdInvites.length} ({linkedCount} vinculados,{" "}
                {pendingCount} pendentes)
              </ThemedText>
            </>
          ) : null}
        </View>

        <View style={{ gap: 8 }}>
          {cpfs.map((cpf) => (
            <View
              key={`summary-${cpf}`}
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 10,
                backgroundColor: cardColor,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <ThemedText style={{ color: textColor, fontWeight: "600" }}>
                {formatCpf(cpf)}
              </ThemedText>
            </View>
          ))}
        </View>

        <TouchableOpacity
          onPress={confirmCreate}
          disabled={saving}
          style={{
            backgroundColor: saving ? mutedColor : tintColor,
            borderRadius: 10,
            paddingVertical: 12,
            alignItems: "center",
          }}
        >
          {saving ? (
            <ActivityIndicator color={bgColor} />
          ) : (
            <ThemedText style={{ color: bgColor, fontWeight: "700" }}>
              Confirmar e criar
            </ThemedText>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <ProtectedRoute requiredPermission={PERMISSIONS.ROLE_MANAGE}>
      <ThemedView style={{ flex: 1, backgroundColor: bgColor }}>
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: 28,
            gap: 14,
          }}
        >
          <View style={{ gap: 4 }}>
            <ThemedText
              style={{ fontSize: 24, fontWeight: "800", color: textColor }}
            >
              Terceirização de serviço
            </ThemedText>
            <ThemedText style={{ color: mutedColor }}>
              Configure acesso de serviços externos (ex.: contabilidade) sem
              usar o modelo de partners.
            </ThemedText>
          </View>

          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {STEP_TITLES.map((title, index) => {
              const active = index === step;
              const done = index < step;
              return (
                <View
                  key={title}
                  style={{
                    borderWidth: 1,
                    borderColor: active ? tintColor : borderColor,
                    backgroundColor: active
                      ? `${tintColor}22`
                      : done
                        ? `${tintColor}14`
                        : cardColor,
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                  }}
                >
                  <ThemedText
                    style={{
                      color: active || done ? tintColor : mutedColor,
                      fontSize: 12,
                      fontWeight: "700",
                    }}
                  >
                    {index + 1}. {title}
                  </ThemedText>
                </View>
              );
            })}
          </View>

          <View
            style={{
              borderWidth: 1,
              borderColor,
              borderRadius: 14,
              backgroundColor: cardColor,
              padding: 14,
              gap: 14,
            }}
          >
            {renderStepContent()}

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <TouchableOpacity
                onPress={goBack}
                disabled={step === 0 || saving}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 10,
                  paddingVertical: 11,
                  alignItems: "center",
                  opacity: step === 0 || saving ? 0.5 : 1,
                }}
              >
                <ThemedText style={{ color: textColor, fontWeight: "700" }}>
                  Voltar
                </ThemedText>
              </TouchableOpacity>

              {step < 3 ? (
                <TouchableOpacity
                  onPress={goNext}
                  disabled={saving}
                  style={{
                    flex: 1,
                    backgroundColor: tintColor,
                    borderRadius: 10,
                    paddingVertical: 11,
                    alignItems: "center",
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  <ThemedText style={{ color: bgColor, fontWeight: "700" }}>
                    Próximo
                  </ThemedText>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() =>
                    router.push({ pathname: "/Administrador/roles" as any })
                  }
                  style={{
                    flex: 1,
                    backgroundColor: tintColor,
                    borderRadius: 10,
                    paddingVertical: 11,
                    alignItems: "center",
                  }}
                >
                  <ThemedText style={{ color: bgColor, fontWeight: "700" }}>
                    Ir para papéis
                  </ThemedText>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </ScrollView>
      </ThemedView>
    </ProtectedRoute>
  );
}
