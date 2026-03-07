import { ThemedText } from "@/components/themed-text";
import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { ProtectedRoute } from "@/core/auth/ProtectedRoute";
import { PERMISSIONS } from "@/core/auth/permissions";
import { isRadulSuperAdmin } from "@/core/auth/auth.utils";
import { filterActive } from "@/core/utils/soft-delete";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { TouchableOpacity, View } from "react-native";
import { CRUD_ENDPOINT } from "@/services/crud";

type Row = Record<string, unknown>;

const normalizeList = (data: unknown): Row[] => {
  const list = Array.isArray(data) ? data : ((data as any)?.data ?? []);
  return Array.isArray(list) ? (list as Row[]) : [];
};

const listRows = async (): Promise<Row[]> => {
  const [permissionsResponse, rolePermissionsResponse] = await Promise.all([
    api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "permissions",
    }),
    api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "role_permissions",
    }),
  ]);

  const permissions = filterActive(normalizeList(permissionsResponse.data));
  const rolePermissions = filterActive(
    normalizeList(rolePermissionsResponse.data),
  );

  const roleIdsByPermission = new Map<string, string[]>();
  for (const rp of rolePermissions) {
    const permissionId = String(rp.permission_id ?? "");
    const roleId = String(rp.role_id ?? "");
    if (!permissionId || !roleId) continue;
    const list = roleIdsByPermission.get(permissionId) ?? [];
    list.push(roleId);
    roleIdsByPermission.set(permissionId, list);
  }

  return permissions.map((permission) => {
    const permissionId = String(permission.id ?? "");
    const roles = roleIdsByPermission.get(permissionId) ?? [];
    return {
      ...permission,
      permission_roles_count: roles.length,
    };
  });
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "permissions",
    payload,
  });
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
    table: "permissions",
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
    table: "permissions",
    payload: {
      id: payload.id,
    },
  });
  return response.data;
};

export default function PermissionsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const tintColor = useThemeColor({}, "tint");
  const borderColor = useThemeColor({}, "border");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");

  if (!isRadulSuperAdmin(user)) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <ThemedText style={{ fontSize: 18, fontWeight: "700", color: textColor }}>
          Acesso restrito
        </ThemedText>
        <ThemedText
          style={{ marginTop: 8, textAlign: "center", color: mutedColor }}
        >
          Esta tela e exclusiva para o super admin da Radul.
        </ThemedText>
      </View>
    );
  }

  const fields: CrudFieldConfig<Row>[] = [
    { key: "id", label: "Id", placeholder: "Id", visibleInForm: false },
    {
      key: "code",
      label: "CÃ³digo",
      placeholder: "code",
      required: true,
      visibleInList: true,
    },
    {
      key: "display_name",
      label: "Nome AmigÃ¡vel",
      placeholder: "Ex: Ler UsuÃ¡rios",
      required: true,
      visibleInList: true,
    },
    {
      key: "description",
      label: "DescriÃ§Ã£o",
      placeholder: "DescriÃ§Ã£o",
      type: "multiline",
    },
    {
      key: "created_at",
      label: "Criado em",
      placeholder: "Created At",
      visibleInForm: false,
    },
  ];

  return (
    <ProtectedRoute requiredPermission={PERMISSIONS.PERMISSION_MANAGE}>
      <View style={{ flex: 1 }}>
        {/* Quick action: sync permissions from code */}
        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 4,
            flexDirection: "row",
            justifyContent: "flex-end",
          }}
        >
          <TouchableOpacity
            onPress={() =>
              router.push("/Administrador/permissions_sync" as any)
            }
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              borderWidth: 1,
              borderColor,
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 8,
              backgroundColor: tintColor + "10",
            }}
          >
            <Ionicons name="sync-outline" size={16} color={tintColor} />
            <ThemedText
              style={{ color: tintColor, fontWeight: "700", fontSize: 13 }}
            >
              Sincronizar PermissÃµes
            </ThemedText>
          </TouchableOpacity>
        </View>

        <CrudScreen<Row>
          tableName="permissions"
          title="PermissÃµes"
          subtitle="GestÃ£o de PermissÃµes do Sistema"
          searchPlaceholder="Buscar por cÃ³digo, nome ou descriÃ§Ã£o"
          searchFields={["code", "display_name", "description"]}
          fields={fields}
          loadItems={listRows}
          createItem={createRow}
          updateItem={updateRow}
          deleteItem={deleteRow}
          getDetails={(item) => [
            { label: "CÃ³digo", value: String(item.code ?? "-") },
            { label: "Nome", value: String(item.display_name ?? "-") },
            { label: "DescriÃ§Ã£o", value: String(item.description ?? "-") },
            {
              label: "Roles vinculadas",
              value: String(item.permission_roles_count ?? 0),
            },
          ]}
          renderItemActions={(item) => {
            const permissionId = String(item.id ?? "");
            const count = Number(item.permission_roles_count ?? 0);

            return (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <TouchableOpacity
                  onPress={() =>
                    router.push({
                      pathname: "/Administrador/role_permissions" as any,
                      params: { permissionId },
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
                    Roles ({Number.isFinite(count) ? count : 0})
                  </ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() =>
                    router.push({
                      pathname: "/Administrador/role_permissions_matrix" as any,
                      params: { permissionId },
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
              </View>
            );
          }}
          getId={(item) => String(item.id ?? "")}
          getTitle={(item) =>
            String(item.display_name ?? item.code ?? "PermissÃ£o")
          }
        />
      </View>
    </ProtectedRoute>
  );
}

