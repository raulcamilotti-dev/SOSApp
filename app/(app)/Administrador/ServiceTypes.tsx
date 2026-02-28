import { ThemedText } from "@/components/themed-text";
import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { ProtectedRoute } from "@/core/auth/ProtectedRoute";
import { ADMIN_PANEL_PERMISSIONS } from "@/core/auth/permissions";
import { filterActive } from "@/core/utils/soft-delete";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import { CRUD_ENDPOINT } from "@/services/crud";
import {
    createServiceType,
    listServiceTypes,
    updateServiceType,
    type ServiceType,
} from "@/services/service-types";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { TouchableOpacity, View } from "react-native";

const normalize = <T,>(data: unknown): T[] => {
  const body = data as any;
  const list = Array.isArray(data)
    ? data
    : (body?.data ?? body?.value ?? body?.items ?? []);
  return Array.isArray(list) ? (list as T[]) : [];
};

const listRowsWithRelations = async (): Promise<ServiceType[]> => {
  const [serviceTypesRaw, servicesResponse, templatesResponse] =
    await Promise.all([
      listServiceTypes(),
      api.post(CRUD_ENDPOINT, { action: "list", table: "services" }),
      api.post(CRUD_ENDPOINT, { action: "list", table: "workflow_templates" }),
    ]);

  const serviceTypes = Array.isArray(serviceTypesRaw)
    ? (serviceTypesRaw as ServiceType[])
    : [];
  const services = filterActive(
    Array.isArray(servicesResponse.data)
      ? (servicesResponse.data as any[])
      : ((servicesResponse.data as any)?.data ?? []),
  ) as Record<string, unknown>[];
  const templates = normalize<Record<string, any>>(
    templatesResponse.data,
  ).filter((t) => !t.deleted_at);

  return serviceTypes.map((serviceType) => {
    const serviceTypeId = String(serviceType.id ?? "");
    const count = services.filter(
      (service) => String(service.service_type_id ?? "") === serviceTypeId,
    ).length;
    const linkedTemplates = templates.filter(
      (t) => String(t.service_type_id ?? "") === serviceTypeId,
    );
    const templateCount = linkedTemplates.length;
    // Resolve the default template name from the FK
    const defaultTpl = serviceType.default_template_id
      ? templates.find(
          (t) => String(t.id) === String(serviceType.default_template_id),
        )
      : null;
    return {
      ...serviceType,
      services_count: count,
      templates_count: templateCount,
      default_template_name: defaultTpl?.name ?? null,
    } as ServiceType;
  });
};

const fields: CrudFieldConfig<ServiceType>[] = [
  { key: "id", label: "Id", placeholder: "Id", visibleInForm: false },
  {
    key: "tenant_id",
    label: "Tenant",
    placeholder: "Tenant",
    type: "reference",
    referenceTable: "tenants",
    referenceLabelField: "company_name",
    referenceSearchField: "company_name",
    referenceIdField: "id",
    required: true,
    visibleInList: true,
  },
  {
    key: "name",
    label: "Nome",
    placeholder: "Nome do tipo de serviço",
    required: true,
    visibleInList: true,
  },
  {
    key: "description",
    label: "Descrição",
    placeholder: "Descrição do tipo de serviço",
    type: "multiline",
    visibleInList: false,
  },
  {
    key: "icon",
    label: "Ícone",
    placeholder: "Nome do ícone (ex: construct-outline)",
    visibleInList: true,
  },
  {
    key: "color",
    label: "Cor",
    placeholder: "Cor em hex (ex: #0a7ea4)",
    visibleInList: true,
  },
  {
    key: "is_active",
    label: "Ativo",
    placeholder: "Ativo",
    visibleInList: true,
  },
  {
    key: "category_id",
    label: "Categoria",
    placeholder: "Selecione a categoria",
    type: "reference",
    referenceTable: "service_categories",
    referenceLabelField: "name",
    referenceSearchField: "name",
    referenceIdField: "id",
    visibleInList: true,
    resolveReferenceLabelInList: true,
  },
  {
    key: "default_template_id",
    label: "Workflow Padrão",
    placeholder: "Selecione o workflow padrão",
    type: "reference",
    referenceTable: "workflow_templates",
    referenceLabelField: "name",
    referenceSearchField: "name",
    referenceIdField: "id",
    visibleInList: true,
    visibleInForm: true,
    resolveReferenceLabelInList: true,
  },
  {
    key: "entity_table",
    label: "Tabela de Entidade",
    placeholder: "Tabela vinculada (ex: properties)",
    visibleInList: false,
    visibleInForm: true,
  },
  {
    key: "default_chart_account_id" as keyof ServiceType & string,
    label: "Plano de Contas Padrão",
    placeholder: "Conta contábil padrão para receitas deste tipo",
    type: "reference",
    referenceTable: "chart_of_accounts",
    referenceLabelField: "name",
    referenceSearchField: "name",
    referenceIdField: "id",
    visibleInList: false,
    visibleInForm: true,
    section: "Classificação Financeira",
    referenceLabelFormatter: (item, _default) => {
      const code = String(item?.code ?? "");
      const name = String(item?.name ?? "");
      return code ? `${code} — ${name}` : name;
    },
    referenceFilter: (item) => {
      // Only show leaf accounts (level 3) that are active
      const level = Number(item?.level ?? 0);
      const isActive = item?.is_active !== false;
      return level === 3 && isActive;
    },
  },
  {
    key: "created_at",
    label: "Created At",
    placeholder: "Created At",
    visibleInForm: false,
  },
];

export default function ServiceTypesScreen() {
  const router = useRouter();
  const tintColor = useThemeColor({}, "tint");
  const borderColor = useThemeColor({}, "border");
  const mutedColor = useThemeColor({}, "muted");

  return (
    <ProtectedRoute requiredPermission={ADMIN_PANEL_PERMISSIONS}>
      <CrudScreen<ServiceType>
        title="Tipos de Serviço"
        subtitle="Gestão de tipos de serviços"
        fields={fields}
        loadItems={listRowsWithRelations}
        createItem={createServiceType}
        updateItem={updateServiceType}
        getDetails={(item) => [
          { label: "Nome", value: String(item.name ?? "-") },
          { label: "Tenant", value: String(item.tenant_id ?? "-") },
          { label: "Descrição", value: String(item.description ?? "-") },
          {
            label: "Serviços",
            value: String((item as any).services_count ?? 0),
          },
          {
            label: "Workflow padrão",
            value: String(
              (item as any).default_template_name ?? "Nenhum vinculado",
            ),
          },
          {
            label: "Templates",
            value: String((item as any).templates_count ?? 0),
          },
          {
            label: "Tabela de Entidade",
            value: String(item.entity_table ?? "Nenhuma (genérico)"),
          },
        ]}
        renderItemActions={(item) => {
          const serviceTypeId = String(item.id ?? "");
          const tenantId = String(item.tenant_id ?? "");
          const count = Number((item as any).services_count ?? 0);
          const templateCount = Number((item as any).templates_count ?? 0);
          const templateName = (item as any).default_template_name as
            | string
            | null;
          const entityTable = item.entity_table as string | null;

          return (
            <View style={{ gap: 8 }}>
              {entityTable ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingVertical: 4,
                  }}
                >
                  <Ionicons name="server-outline" size={14} color="#22c55e" />
                  <ThemedText style={{ fontSize: 12, color: "#22c55e" }}>
                    Entidade: {entityTable}
                  </ThemedText>
                </View>
              ) : null}
              {templateName ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingVertical: 4,
                  }}
                >
                  <Ionicons
                    name="git-branch-outline"
                    size={14}
                    color={tintColor}
                  />
                  <ThemedText style={{ fontSize: 12, color: mutedColor }}>
                    Workflow: {templateName}
                  </ThemedText>
                </View>
              ) : (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingVertical: 4,
                  }}
                >
                  <Ionicons name="warning-outline" size={14} color="#f59e0b" />
                  <ThemedText style={{ fontSize: 12, color: "#f59e0b" }}>
                    Sem workflow vinculado
                  </ThemedText>
                </View>
              )}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <TouchableOpacity
                  onPress={() =>
                    router.push({
                      pathname: "/Administrador/services" as any,
                      params: { serviceTypeId, tenantId },
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
                    Serviços ({Number.isFinite(count) ? count : 0})
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    router.push({
                      pathname: "/Administrador/WorkflowTemplates" as any,
                      params: { serviceTypeId, tenantId },
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
                    Templates (
                    {Number.isFinite(templateCount) ? templateCount : 0})
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        getId={(item) => item.id}
        getTitle={(item) => item.name}
      />
    </ProtectedRoute>
  );
}
