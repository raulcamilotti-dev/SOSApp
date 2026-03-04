import { ThemedText } from "@/components/themed-text";
import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { filterActive } from "@/core/utils/soft-delete";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
  buildSearchParams,
  CRUD_ENDPOINT,
  normalizeCrudList,
} from "@/services/crud";
import {
  countLinkedEntities,
  getScopeEntityConfig,
} from "@/services/workflow-service-types";
import { useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { TouchableOpacity, View } from "react-native";

type Row = Record<string, unknown>;

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "workflow_templates",
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
    table: "workflow_templates",
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
    table: "workflow_templates",
    payload: {
      id: payload.id,
    },
  });
  return response.data;
};

export default function WorkflowTemplatesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const tenantId = user?.tenant_id;

  const listRows = useCallback(async (): Promise<Row[]> => {
    const filters = tenantId ? [{ field: "tenant_id", value: tenantId }] : [];
    const response = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "workflow_templates",
      ...buildSearchParams(filters, { sortColumn: "created_at DESC" }),
    });
    return filterActive(normalizeCrudList<Row>(response.data));
  }, [tenantId]);

  const createWithContext = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> => {
      return createRow({
        ...payload,
        tenant_id: tenantId ?? payload.tenant_id,
      });
    };
  }, [tenantId]);

  const updateWithContext = useMemo(() => {
    return async (
      payload: Partial<Row> & { id?: string | null },
    ): Promise<unknown> => {
      return updateRow(payload);
    };
  }, []);

  const loadRowsWithRelations = useMemo(() => {
    return async (): Promise<Row[]> => {
      const [templateRows, stepsResponse] = await Promise.all([
        listRows(),
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "workflow_steps",
          auto_exclude_deleted: true,
        }),
      ]);

      const steps = filterActive(
        Array.isArray(stepsResponse.data)
          ? (stepsResponse.data as Row[])
          : (((stepsResponse.data as any)?.data ?? []) as Row[]),
      );

      // Count linked entities per template (scope-aware: service_types, campaigns, etc.)
      const entityCounts = await Promise.all(
        templateRows.map(async (template) => {
          const templateId = String(template.id ?? "");
          const scope = String(template.workflow_scope ?? "operational");
          if (!tenantId) return 0;
          try {
            return await countLinkedEntities(tenantId, templateId, scope);
          } catch {
            return 0;
          }
        }),
      );

      return templateRows.map((template, idx) => {
        const templateId = String(template.id ?? "");
        const stepsCount = steps.filter(
          (step) => String(step.template_id ?? "") === templateId,
        ).length;

        return {
          ...template,
          workflow_steps_count: stepsCount,
          linked_entities_count: entityCounts[idx],
        };
      });
    };
  }, [listRows, tenantId]);

  const tintColor = useThemeColor({}, "tint");
  const borderColor = useThemeColor({}, "border");

  const fields: CrudFieldConfig<Row>[] = [
    { key: "id", label: "Id", placeholder: "Id", visibleInForm: false },
    {
      key: "name",
      label: "Nome",
      placeholder: "Nome do workflow",
      required: true,
      visibleInList: true,
    },
    {
      key: "workflow_scope",
      label: "Escopo",
      placeholder: "Escopo do workflow",
      type: "select",
      options: [
        { label: "Operacional", value: "operational" },
        { label: "Administrativo", value: "administrative" },
        { label: "CRM", value: "crm" },
        { label: "Estoque", value: "stock" },
      ],
      visibleInList: true,
    },
    {
      key: "created_at",
      label: "Criado em",
      placeholder: "Criado em",
      type: "datetime",
      visibleInForm: false,
    },
  ];

  return (
    <CrudScreen<Row>
      tableName="workflow_templates"
      title="Workflow Templates"
      subtitle="Gestao de templates de workflow"
      fields={fields}
      loadItems={loadRowsWithRelations}
      createItem={createWithContext}
      updateItem={updateWithContext}
      deleteItem={deleteRow}
      getDetails={(item) => {
        const scope = String(item.workflow_scope ?? "operational");
        const scopeConfig = getScopeEntityConfig(scope);
        const entityLabel = scopeConfig?.entityLabel ?? "Entidades";
        return [
          { label: "Nome", value: String(item.name ?? "-") },
          {
            label: "Escopo",
            value: String(item.workflow_scope ?? "operational"),
          },
          { label: "Steps", value: String(item.workflow_steps_count ?? 0) },
          {
            label: `${entityLabel} Vinculados`,
            value: String(item.linked_entities_count ?? 0),
          },
        ];
      }}
      renderItemActions={(item) => {
        const templateId = String(item.id ?? "");
        const stepsCount = Number(item.workflow_steps_count ?? 0);
        const linkedCount = Number(item.linked_entities_count ?? 0);
        const scope = String(item.workflow_scope ?? "operational");
        const scopeConfig = getScopeEntityConfig(scope);

        return (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Administrador/workflow-editor" as any,
                  params: { templateId },
                })
              }
              style={{
                backgroundColor: tintColor,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 6,
              }}
            >
              <ThemedText
                style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}
              >
                Editor Visual ({Number.isFinite(stepsCount) ? stepsCount : 0}{" "}
                steps)
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Administrador/workflow_steps" as any,
                  params: { templateId },
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
                Steps (lista)
              </ThemedText>
            </TouchableOpacity>
            {scopeConfig && (
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/Administrador/ServicosWorkflow" as any,
                    params: {
                      workflowId: templateId,
                      tenantId: String(item.tenant_id ?? ""),
                      workflowName: String(item.name ?? "Workflow"),
                      workflowScope: scope,
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
                  {scopeConfig.entityLabel} ({linkedCount})
                </ThemedText>
              </TouchableOpacity>
            )}
          </View>
        );
      }}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => String(item.name ?? "Workflow Template")}
    />
  );
}
