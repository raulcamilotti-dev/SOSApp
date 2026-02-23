import { ThemedText } from "@/components/themed-text";
import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { ProtectedRoute } from "@/core/auth/ProtectedRoute";
import { PERMISSIONS } from "@/core/auth/permissions";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import { type ServiceCategory } from "@/services/service-categories";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { TouchableOpacity, View } from "react-native";

const normalize = <T,>(data: unknown): T[] => {
  const body = data as any;
  const list = Array.isArray(data)
    ? data
    : (body?.data ?? body?.value ?? body?.items ?? []);
  return Array.isArray(list) ? (list as T[]) : [];
};

type CategoryWithRelations = ServiceCategory & {
  linked_types_count?: number;
  linked_type_names?: string[];
};

const fields: CrudFieldConfig<ServiceCategory>[] = [
  { key: "id", label: "ID", visibleInForm: false },
  {
    key: "tenant_id",
    label: "Tenant",
    visibleInForm: false,
    visibleInList: false,
  },
  {
    key: "name",
    label: "Nome",
    placeholder: "Nome da categoria (ex: Serviços Jurídicos)",
    required: true,
    visibleInList: true,
  },
  {
    key: "description",
    label: "Descrição",
    placeholder: "Descrição da categoria",
    type: "multiline",
    visibleInList: false,
  },
  {
    key: "color",
    label: "Cor",
    placeholder: "Cor em hex (ex: #2c3e50)",
    visibleInList: true,
  },
  {
    key: "icon",
    label: "Ícone",
    placeholder: "Nome do ícone Ionicons (ex: briefcase-outline)",
    visibleInList: true,
  },
  {
    key: "sort_order",
    label: "Ordem",
    placeholder: "Ordem de exibição (1, 2, 3...)",
    visibleInList: true,
  },
  {
    key: "is_active",
    label: "Ativo",
    visibleInList: true,
  },
  {
    key: "created_at",
    label: "Criado em",
    visibleInForm: false,
  },
];

export default function ServiceCategoriesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const tenantId = user?.tenant_id ?? "";
  const tintColor = useThemeColor({}, "tint");
  const borderColor = useThemeColor({}, "border");
  const mutedColor = useThemeColor({}, "muted");

  const listCategoriesWithRelations = useCallback(async (): Promise<
    CategoryWithRelations[]
  > => {
    const filters = tenantId ? [{ field: "tenant_id", value: tenantId }] : [];
    const [catRes, typesRes] = await Promise.all([
      api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "service_categories",
        ...buildSearchParams(filters, {
          sortColumn: "sort_order ASC, name ASC",
        }),
      }),
      api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "service_types",
        ...buildSearchParams(
          tenantId ? [{ field: "tenant_id", value: tenantId }] : [],
          { sortColumn: "name" },
        ),
      }),
    ]);

    const categories = normalizeCrudList<ServiceCategory>(catRes.data).filter(
      (c) => !c.deleted_at,
    );
    const types = normalize<Record<string, any>>(typesRes.data).filter(
      (t) => !t.deleted_at,
    );

    return categories.map((cat) => {
      const catId = String(cat.id ?? "");
      const linked = types.filter((t) => String(t.category_id ?? "") === catId);
      return {
        ...cat,
        linked_types_count: linked.length,
        linked_type_names: linked.map((t) => String(t.name ?? "")),
      };
    });
  }, [tenantId]);

  const createCategory = useCallback(
    async (payload: any) => {
      return api.post(CRUD_ENDPOINT, {
        action: "create",
        table: "service_categories",
        payload: { ...payload, tenant_id: tenantId },
      });
    },
    [tenantId],
  );

  const updateCategory = useCallback(async (payload: any) => {
    return api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "service_categories",
      payload,
    });
  }, []);

  const deleteCategory = useCallback(async (payload: any) => {
    return api.post(CRUD_ENDPOINT, {
      action: "delete",
      table: "service_categories",
      payload: {
        id: String(payload.id ?? ""),
        deleted_at: new Date().toISOString(),
      },
    });
  }, []);

  return (
    <ProtectedRoute requiredPermission={PERMISSIONS.ADMIN_FULL}>
      <CrudScreen<CategoryWithRelations>
        title="Categorias de Serviço"
        subtitle="Gestão de categorias (tipos macro) de serviços"
        searchPlaceholder="Buscar categoria..."
        searchFields={["name", "description"]}
        fields={fields}
        loadItems={listCategoriesWithRelations}
        createItem={createCategory}
        updateItem={updateCategory}
        deleteItem={deleteCategory}
        getId={(item) => String(item.id ?? "")}
        getTitle={(item) => String(item.name ?? "Categoria")}
        getDetails={(item) => [
          { label: "Nome", value: String(item.name ?? "-") },
          { label: "Descrição", value: String(item.description ?? "-") },
          { label: "Cor", value: String(item.color ?? "-") },
          { label: "Ícone", value: String(item.icon ?? "-") },
          { label: "Ordem", value: String(item.sort_order ?? 0) },
          {
            label: "Ativo",
            value: item.is_active ? "Sim" : "Não",
          },
          {
            label: "Tipos vinculados",
            value: String(item.linked_types_count ?? 0),
          },
          {
            label: "Serviços",
            value: item.linked_type_names?.length
              ? item.linked_type_names.join(", ")
              : "Nenhum tipo vinculado",
          },
        ]}
        renderItemActions={(item) => {
          const count = item.linked_types_count ?? 0;
          const names = item.linked_type_names ?? [];

          return (
            <View style={{ gap: 6 }}>
              {names.length > 0 ? (
                <View style={{ gap: 2 }}>
                  {names.map((name, idx) => (
                    <View
                      key={idx}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Ionicons
                        name="checkmark-circle"
                        size={14}
                        color={tintColor}
                      />
                      <ThemedText style={{ fontSize: 12, color: mutedColor }}>
                        {name}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              ) : (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Ionicons name="alert-outline" size={14} color="#f59e0b" />
                  <ThemedText style={{ fontSize: 12, color: "#f59e0b" }}>
                    Nenhum tipo vinculado
                  </ThemedText>
                </View>
              )}
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/Administrador/ServiceTypes" as any,
                  })
                }
                style={{
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  alignSelf: "flex-start",
                  marginTop: 4,
                }}
              >
                <ThemedText
                  style={{ color: tintColor, fontWeight: "700", fontSize: 12 }}
                >
                  Tipos de Serviço ({count})
                </ThemedText>
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </ProtectedRoute>
  );
}
