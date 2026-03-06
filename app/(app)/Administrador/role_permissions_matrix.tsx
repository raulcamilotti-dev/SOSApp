/**
 * Matriz de Permissões CRUD por Role.
 *
 * Linhas = domínios de permissão (ex: Clientes, Documentos, Projetos…)
 * Colunas = ações CRUD: Visualizar | Incluir | Editar | Excluir
 *
 * Ações especiais (manage, dashboard, etc.) ficam numa seção separada abaixo da grid CRUD.
 */
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import {
  type CrudAction,
  getPermissionDomains,
  type Permission,
  type PermissionDomain,
  PERMISSIONS,
} from "@/core/auth/permissions";
import { ProtectedRoute } from "@/core/auth/ProtectedRoute";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api, getApiErrorMessage } from "@/services/api";
import {
  API_DINAMICO,
  buildSearchParams,
  CRUD_ENDPOINT,
} from "@/services/crud";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

/* ═══════════════════════════════════════════════════════
 * TYPES
 * ═══════════════════════════════════════════════════════ */

type Role = { id: string; name: string; description?: string };
type DbPermission = { id: string; code: string };
type RolePermission = { role_id: string; permission_id: string };

/* ═══════════════════════════════════════════════════════
 * HELPERS
 * ═══════════════════════════════════════════════════════ */

const normalizeList = <T,>(data: unknown): T[] => {
  const body = data as any;
  const list = Array.isArray(data) ? data : (body?.data ?? []);
  return Array.isArray(list) ? (list as T[]) : [];
};

const makeKey = (roleId: string, permId: string) => `${roleId}::${permId}`;

/** CRUD column definitions */
const CRUD_COLUMNS: { action: CrudAction; label: string; icon: string }[] = [
  { action: "view", label: "Ver", icon: "eye-outline" },
  { action: "create", label: "Inc", icon: "add-circle-outline" },
  { action: "edit", label: "Edit", icon: "create-outline" },
  { action: "delete", label: "Exc", icon: "trash-outline" },
];

/* ═══════════════════════════════════════════════════════
 * COMPONENT
 * ═══════════════════════════════════════════════════════ */

function RolePermissionsMatrixScreen() {
  const { user } = useAuth();
  const isFocused = useIsFocused();
  const params = useLocalSearchParams<{
    roleId?: string;
    permissionId?: string;
  }>();

  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const bgColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");
  const inputBg = useThemeColor({}, "input");
  const { width } = useWindowDimensions();
  const isCompact = width < 480;

  /* ── State ── */
  const [roles, setRoles] = useState<Role[]>([]);
  const [dbPermissions, setDbPermissions] = useState<DbPermission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(),
  );

  /* ── Derived ── */

  // Map permission code → DB row id
  const codeToDbId = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of dbPermissions) map.set(p.code, p.id);
    return map;
  }, [dbPermissions]);

  // Set of "roleId::permissionId" for fast lookup
  const assignedSet = useMemo(() => {
    const s = new Set<string>();
    for (const rp of rolePermissions)
      s.add(makeKey(rp.role_id, rp.permission_id));
    return s;
  }, [rolePermissions]);

  // Domain list from centralized helper
  const allDomains = useMemo(() => getPermissionDomains(), []);

  // Filtered by search
  const filteredDomains = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allDomains;
    return allDomains.filter(
      (d) =>
        d.label.toLowerCase().includes(q) ||
        d.key.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q),
    );
  }, [allDomains, search]);

  // Group by category
  const groupedByCategory = useMemo(() => {
    const map = new Map<string, PermissionDomain[]>();
    for (const d of filteredDomains) {
      const cat = d.category;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(d);
    }
    return map;
  }, [filteredDomains]);

  // Stats
  const stats = useMemo(() => {
    if (!selectedRoleId) return { assigned: 0, total: 0 };
    const total = dbPermissions.length;
    const assigned = rolePermissions.filter(
      (rp) => rp.role_id === selectedRoleId,
    ).length;
    return { assigned, total };
  }, [selectedRoleId, dbPermissions.length, rolePermissions]);

  /* ── Data Loading ── */

  const load = useCallback(async () => {
    if (!user?.tenant_id) return;
    setLoading(true);
    try {
      const [rolesRes, permsRes, rpRes] = await Promise.all([
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "roles",
          ...buildSearchParams(
            [{ field: "tenant_id", value: user.tenant_id }],
            { sortColumn: "name ASC" },
          ),
        }),
        api.post(CRUD_ENDPOINT, { action: "list", table: "permissions" }),
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "role_permissions",
          ...(params.roleId
            ? buildSearchParams([{ field: "role_id", value: params.roleId }])
            : {}),
        }),
      ]);

      const r = normalizeList<Role>(rolesRes.data);
      const p = normalizeList<DbPermission>(permsRes.data);
      const rp = normalizeList<RolePermission>(rpRes.data);

      setRoles(r);
      setDbPermissions(p);
      setRolePermissions(rp);

      if (!selectedRoleId && r.length) {
        setSelectedRoleId(params.roleId || r[0].id);
      }
    } catch (err) {
      Alert.alert("Erro", getApiErrorMessage(err, "Falha ao carregar dados"));
    } finally {
      setLoading(false);
    }
  }, [user?.tenant_id, params.roleId, selectedRoleId]);

  useEffect(() => {
    if (isFocused) load();
  }, [isFocused, load]);

  /* ── Toggle a single permission ── */

  const toggle = useCallback(
    async (permCode: Permission) => {
      if (!selectedRoleId) return;
      const dbId = codeToDbId.get(permCode);
      if (!dbId) return;

      const key = makeKey(selectedRoleId, dbId);
      const isOn = assignedSet.has(key);

      setToggling(key);
      try {
        if (isOn) {
          // Remove
          await api.post(API_DINAMICO, {
            sql: `DELETE FROM role_permissions WHERE role_id = '${selectedRoleId}' AND permission_id = '${dbId}'`,
          });
          setRolePermissions((prev) =>
            prev.filter(
              (rp) =>
                !(rp.role_id === selectedRoleId && rp.permission_id === dbId),
            ),
          );
        } else {
          // Add
          await api.post(CRUD_ENDPOINT, {
            action: "create",
            table: "role_permissions",
            payload: { role_id: selectedRoleId, permission_id: dbId },
          });
          setRolePermissions((prev) => [
            ...prev,
            { role_id: selectedRoleId, permission_id: dbId },
          ]);
        }
      } catch (err) {
        Alert.alert("Erro", getApiErrorMessage(err, "Falha ao atualizar"));
      } finally {
        setToggling(null);
      }
    },
    [selectedRoleId, codeToDbId, assignedSet],
  );

  /* ── Toggle all CRUD for a domain row ── */

  const toggleRow = useCallback(
    async (domain: PermissionDomain) => {
      if (!selectedRoleId) return;
      const crudCodes = Object.values(domain.crud).filter(
        Boolean,
      ) as Permission[];
      const allOn = crudCodes.every((code) => {
        const dbId = codeToDbId.get(code);
        return dbId ? assignedSet.has(makeKey(selectedRoleId, dbId)) : false;
      });
      for (const code of crudCodes) {
        const dbId = codeToDbId.get(code);
        if (!dbId) continue;
        const isOn = assignedSet.has(makeKey(selectedRoleId, dbId));
        if (allOn && isOn) {
          await toggle(code);
        } else if (!allOn && !isOn) {
          await toggle(code);
        }
      }
    },
    [selectedRoleId, codeToDbId, assignedSet, toggle],
  );

  /* ── Toggle entire column ── */

  const toggleColumn = useCallback(
    async (action: CrudAction) => {
      if (!selectedRoleId) return;
      const codes: Permission[] = [];
      for (const d of filteredDomains) {
        const code = d.crud[action];
        if (code) codes.push(code);
      }
      const allOn = codes.every((code) => {
        const dbId = codeToDbId.get(code);
        return dbId ? assignedSet.has(makeKey(selectedRoleId, dbId)) : false;
      });
      for (const code of codes) {
        const dbId = codeToDbId.get(code);
        if (!dbId) continue;
        const isOn = assignedSet.has(makeKey(selectedRoleId, dbId));
        if (allOn && isOn) await toggle(code);
        else if (!allOn && !isOn) await toggle(code);
      }
    },
    [selectedRoleId, filteredDomains, codeToDbId, assignedSet, toggle],
  );

  /* ── Category collapse ── */

  const toggleCategory = (cat: string) =>
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });

  /* ── Check helper ── */

  const isAssigned = useCallback(
    (permCode: Permission): boolean => {
      if (!selectedRoleId) return false;
      const dbId = codeToDbId.get(permCode);
      if (!dbId) return false;
      return assignedSet.has(makeKey(selectedRoleId, dbId));
    },
    [selectedRoleId, codeToDbId, assignedSet],
  );

  const isTogglingPerm = useCallback(
    (permCode: Permission): boolean => {
      if (!selectedRoleId || !toggling) return false;
      const dbId = codeToDbId.get(permCode);
      if (!dbId) return false;
      return toggling === makeKey(selectedRoleId, dbId);
    },
    [selectedRoleId, toggling, codeToDbId],
  );

  /* ═══════════════════════════════════════════════════════
   * RENDER
   * ═══════════════════════════════════════════════════════ */

  if (loading) {
    return (
      <ThemedView
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: bgColor,
        }}
      >
        <ActivityIndicator size="large" color={tintColor} />
        <ThemedText style={{ marginTop: 12, color: mutedColor }}>
          Carregando permissões...
        </ThemedText>
      </ThemedView>
    );
  }

  const selectedRole = roles.find((r) => r.id === selectedRoleId);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: bgColor }}
      contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
    >
      {/* ── Header ── */}
      <ThemedText
        style={{ fontSize: 22, fontWeight: "bold", color: textColor }}
      >
        Matriz de Permissões
      </ThemedText>
      <ThemedText
        style={{
          fontSize: 13,
          color: mutedColor,
          marginTop: 4,
          marginBottom: 16,
        }}
      >
        Gerencie as permissões CRUD de cada role
      </ThemedText>

      {/* ── Role Selector ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 16 }}
        contentContainerStyle={{ gap: 8 }}
      >
        {roles.map((role) => {
          const sel = role.id === selectedRoleId;
          return (
            <TouchableOpacity
              key={role.id}
              onPress={() => setSelectedRoleId(role.id)}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: sel ? tintColor : cardColor,
                borderWidth: 1,
                borderColor: sel ? tintColor : borderColor,
              }}
            >
              <ThemedText
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: sel ? "#fff" : textColor,
                }}
              >
                {role.name}
              </ThemedText>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Stats ── */}
      {selectedRole && (
        <View
          style={{
            flexDirection: "row",
            gap: 12,
            marginBottom: 12,
            alignItems: "center",
          }}
        >
          <View
            style={{
              backgroundColor: tintColor + "18",
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 12,
            }}
          >
            <ThemedText
              style={{ fontSize: 12, fontWeight: "700", color: tintColor }}
            >
              {stats.assigned} / {stats.total}
            </ThemedText>
          </View>
          <ThemedText style={{ fontSize: 12, color: mutedColor }}>
            permissões atribuídas a{" "}
            <ThemedText style={{ fontWeight: "700", color: textColor }}>
              {selectedRole.name}
            </ThemedText>
          </ThemedText>
        </View>
      )}

      {/* ── Search ── */}
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Filtrar domínios..."
        placeholderTextColor={mutedColor}
        style={{
          borderWidth: 1,
          borderColor,
          borderRadius: 10,
          paddingHorizontal: 14,
          paddingVertical: 10,
          backgroundColor: inputBg,
          color: textColor,
          fontSize: 14,
          marginBottom: 16,
        }}
      />

      {/* ── CRUD Column Headers ── */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 8,
          paddingVertical: 8,
          borderBottomWidth: 1,
          borderBottomColor: borderColor,
          backgroundColor: cardColor,
          borderTopLeftRadius: 10,
          borderTopRightRadius: 10,
        }}
      >
        {/* Domain label column */}
        <View style={{ flex: 1, minWidth: isCompact ? 100 : 160 }}>
          <ThemedText
            style={{
              fontSize: 11,
              fontWeight: "700",
              color: mutedColor,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Domínio
          </ThemedText>
        </View>

        {/* CRUD column headers (tappable to toggle all) */}
        {CRUD_COLUMNS.map((col) => (
          <TouchableOpacity
            key={col.action}
            onPress={() => toggleColumn(col.action)}
            style={{
              width: isCompact ? 44 : 56,
              alignItems: "center",
              paddingVertical: 2,
            }}
          >
            <Ionicons
              name={col.icon as any}
              size={14}
              color={mutedColor}
              style={{ marginBottom: 2 }}
            />
            <ThemedText
              style={{
                fontSize: 10,
                fontWeight: "700",
                color: mutedColor,
                textTransform: "uppercase",
              }}
            >
              {col.label}
            </ThemedText>
          </TouchableOpacity>
        ))}

        {/* Row toggle column */}
        <View style={{ width: isCompact ? 36 : 44, alignItems: "center" }}>
          <ThemedText
            style={{
              fontSize: 10,
              fontWeight: "700",
              color: mutedColor,
              textTransform: "uppercase",
            }}
          >
            Todos
          </ThemedText>
        </View>
      </View>

      {/* ── Grid Body ── */}
      {Array.from(groupedByCategory.entries()).map(([category, domains]) => {
        const collapsed = collapsedCategories.has(category);

        return (
          <View key={category}>
            {/* Category header */}
            <TouchableOpacity
              onPress={() => toggleCategory(category)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 8,
                paddingVertical: 10,
                backgroundColor: cardColor,
                borderBottomWidth: 1,
                borderBottomColor: borderColor,
                gap: 6,
              }}
            >
              <Ionicons
                name={collapsed ? "chevron-forward" : "chevron-down"}
                size={14}
                color={mutedColor}
              />
              <ThemedText
                style={{ fontSize: 13, fontWeight: "700", color: textColor }}
              >
                {category}
              </ThemedText>
              <View
                style={{
                  backgroundColor: mutedColor + "20",
                  paddingHorizontal: 6,
                  paddingVertical: 1,
                  borderRadius: 8,
                }}
              >
                <ThemedText
                  style={{ fontSize: 10, fontWeight: "600", color: mutedColor }}
                >
                  {domains.length}
                </ThemedText>
              </View>
            </TouchableOpacity>

            {!collapsed &&
              domains.map((domain) => {
                const crudCodes = Object.values(domain.crud).filter(
                  Boolean,
                ) as Permission[];
                const allRowOn =
                  crudCodes.length > 0 && crudCodes.every((c) => isAssigned(c));

                return (
                  <View key={domain.key}>
                    {/* CRUD row */}
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 8,
                        paddingVertical: 8,
                        backgroundColor: cardColor,
                        borderBottomWidth: 1,
                        borderBottomColor: borderColor + "60",
                      }}
                    >
                      {/* Domain label */}
                      <View
                        style={{ flex: 1, minWidth: isCompact ? 100 : 160 }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <ThemedText
                            style={{
                              fontSize: 13,
                              fontWeight: "500",
                              color: textColor,
                            }}
                            numberOfLines={1}
                          >
                            {domain.label}
                          </ThemedText>
                          <View
                            style={{
                              borderWidth: 1,
                              borderColor,
                              borderRadius: 999,
                              paddingHorizontal: 8,
                              paddingVertical: 3,
                              backgroundColor: tintColor + "14",
                            }}
                          >
                            <ThemedText
                              style={{
                                fontSize: 10,
                                fontWeight: "700",
                                color: tintColor,
                                textTransform: "uppercase",
                              }}
                            >
                              {domain.category}
                            </ThemedText>
                          </View>
                        </View>
                        <ThemedText
                          style={{ fontSize: 10, color: mutedColor }}
                          numberOfLines={1}
                        >
                          {domain.key}
                        </ThemedText>
                      </View>

                      {/* CRUD checkboxes */}
                      {CRUD_COLUMNS.map((col) => {
                        const permCode = domain.crud[col.action];
                        if (!permCode) {
                          // No permission for this action — empty cell
                          return (
                            <View
                              key={col.action}
                              style={{
                                width: isCompact ? 44 : 56,
                                alignItems: "center",
                              }}
                            >
                              <ThemedText
                                style={{
                                  fontSize: 14,
                                  color: mutedColor + "40",
                                }}
                              >
                                —
                              </ThemedText>
                            </View>
                          );
                        }
                        const on = isAssigned(permCode);
                        const busy = isTogglingPerm(permCode);
                        return (
                          <TouchableOpacity
                            key={col.action}
                            onPress={() => toggle(permCode)}
                            disabled={!!toggling}
                            style={{
                              width: isCompact ? 44 : 56,
                              height: 36,
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {busy ? (
                              <ActivityIndicator
                                size="small"
                                color={tintColor}
                              />
                            ) : (
                              <View
                                style={{
                                  width: 22,
                                  height: 22,
                                  borderRadius: 6,
                                  borderWidth: 2,
                                  borderColor: on ? tintColor : borderColor,
                                  backgroundColor: on
                                    ? tintColor
                                    : "transparent",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                {on && (
                                  <Ionicons
                                    name="checkmark"
                                    size={14}
                                    color="#fff"
                                  />
                                )}
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })}

                      {/* Row toggle-all */}
                      <TouchableOpacity
                        onPress={() => toggleRow(domain)}
                        disabled={!!toggling || crudCodes.length === 0}
                        style={{
                          width: isCompact ? 36 : 44,
                          height: 36,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <View
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 10,
                            borderWidth: 2,
                            borderColor: allRowOn ? tintColor : borderColor,
                            backgroundColor: allRowOn
                              ? tintColor
                              : "transparent",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {allRowOn && (
                            <Ionicons name="checkmark" size={12} color="#fff" />
                          )}
                        </View>
                      </TouchableOpacity>
                    </View>

                    {/* Special actions (non-CRUD) */}
                    {domain.special.length > 0 && (
                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 6,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          backgroundColor: cardColor,
                          borderBottomWidth: 1,
                          borderBottomColor: borderColor + "40",
                        }}
                      >
                        <ThemedText
                          style={{
                            fontSize: 10,
                            color: mutedColor,
                            fontWeight: "600",
                            textTransform: "uppercase",
                            alignSelf: "center",
                            marginRight: 4,
                          }}
                        >
                          Especiais:
                        </ThemedText>
                        {domain.special.map((sp) => {
                          const on = isAssigned(sp.permission);
                          const busy = isTogglingPerm(sp.permission);
                          return (
                            <TouchableOpacity
                              key={sp.key}
                              onPress={() => toggle(sp.permission)}
                              disabled={!!toggling}
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 4,
                                paddingHorizontal: 10,
                                paddingVertical: 5,
                                borderRadius: 14,
                                backgroundColor: on
                                  ? tintColor + "20"
                                  : inputBg,
                                borderWidth: 1,
                                borderColor: on ? tintColor : borderColor,
                              }}
                            >
                              {busy ? (
                                <ActivityIndicator
                                  size="small"
                                  color={tintColor}
                                />
                              ) : (
                                <>
                                  <Ionicons
                                    name={
                                      on
                                        ? "checkmark-circle"
                                        : ("ellipse-outline" as any)
                                    }
                                    size={14}
                                    color={on ? tintColor : mutedColor}
                                  />
                                  <ThemedText
                                    style={{
                                      fontSize: 11,
                                      fontWeight: "600",
                                      color: on ? tintColor : textColor,
                                    }}
                                  >
                                    {sp.label}
                                  </ThemedText>
                                </>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })}
          </View>
        );
      })}

      {/* ── Bottom border radius ── */}
      <View
        style={{
          height: 4,
          backgroundColor: cardColor,
          borderBottomLeftRadius: 10,
          borderBottomRightRadius: 10,
          marginBottom: 24,
        }}
      />

      {filteredDomains.length === 0 && (
        <View style={{ alignItems: "center", paddingVertical: 32 }}>
          <ThemedText style={{ color: mutedColor, fontSize: 14 }}>
            Nenhum domínio encontrado.
          </ThemedText>
        </View>
      )}
    </ScrollView>
  );
}

/* ── Export with permission gate ── */

export default function RolePermissionsMatrixPage() {
  return (
    <ProtectedRoute
      requiredPermission={[
        PERMISSIONS.ROLE_MANAGE,
        PERMISSIONS.PERMISSION_MANAGE,
      ]}
    >
      <RolePermissionsMatrixScreen />
    </ProtectedRoute>
  );
}
