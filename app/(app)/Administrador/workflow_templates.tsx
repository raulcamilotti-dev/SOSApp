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
import { useLocalSearchParams, useRouter } from "expo-router";
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
  const params = useLocalSearchParams<{ serviceId?: string }>();
  const serviceId = Array.isArray(params.serviceId)
    ? params.serviceId[0]
    : params.serviceId;

  const listRows = useCallback(async (): Promise<Row[]> => {
    const filters = tenantId ? [{ field: "tenant_id", value: tenantId }] : [];
    const response = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "workflow_templates",
      ...buildSearchParams(filters, { sortColumn: "created_at DESC" }),
    });
    return filterActive(normalizeCrudList<Row>(response.data));
  }, [tenantId]);

  const loadFilteredRows = useMemo(() => {
    return async (): Promise<Row[]> => {
      const rows = await listRows();
      return rows.filter((item) => {
        // Support legacy serviceId param and new serviceTypeId
        if (
          serviceId &&
          String(item.service_type_id ?? item.service_id ?? "") !== serviceId
        )
          return false;
        return true;
      });
    };
  }, [serviceId, listRows]);

  const createWithContext = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> => {
      return createRow({
        ...payload,
        tenant_id: tenantId ?? payload.tenant_id,
        service_type_id: serviceId ?? payload.service_type_id,
      });
    };
  }, [serviceId, tenantId]);

  const updateWithContext = useMemo(() => {
    return async (
      payload: Partial<Row> & { id?: string | null },
    ): Promise<unknown> => {
      return updateRow({
        ...payload,
        service_type_id: serviceId ?? payload.service_type_id,
      });
    };
  }, [serviceId]);

  const loadRowsWithRelations = useMemo(() => {
    return async (): Promise<Row[]> => {
      const tenantFilter = tenantId
        ? buildSearchParams([{ field: "tenant_id", value: tenantId }])
        : {};

      const [templateRows, stepsResponse, serviceTypesResponse] =
        await Promise.all([
          loadFilteredRows(),
          api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "workflow_steps",
            ...tenantFilter,
          }),
          api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "service_types",
            ...tenantFilter,
          }),
        ]);

      const steps = filterActive(
        Array.isArray(stepsResponse.data)
          ? (stepsResponse.data as Row[])
          : (((stepsResponse.data as any)?.data ?? []) as Row[]),
      );

      const serviceTypes = filterActive(
        normalizeCrudList<Row>(serviceTypesResponse.data),
      );

      return templateRows.map((template) => {
        const templateId = String(template.id ?? "");
        const stepsCount = steps.filter(
          (step) => String(step.template_id ?? "") === templateId,
        ).length;
        const linkedServiceTypes = serviceTypes.filter(
          (st) => String(st.default_template_id ?? "") === templateId,
        ).length;

        return {
          ...template,
          workflow_steps_count: stepsCount,
          linked_service_types_count: linkedServiceTypes,
        };
      });
    };
  }, [loadFilteredRows, tenantId]);

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
      ],
      visibleInList: true,
    },
    {
      key: "service_type_id",
      label: "Tipo de Serviço Principal",
      placeholder: "Tipo de Serviço",
      type: "reference",
      referenceTable: "service_types",
      referenceLabelField: "name",
      referenceSearchField: "name",
      referenceIdField: "id",
      visibleInList: true,
      visibleInForm: !serviceId,
      required: false,
      showWhen: (formState) =>
        (formState.workflow_scope || "operational") === "operational",
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
      getDetails={(item) => [
        { label: "Nome", value: String(item.name ?? "-") },
        {
          label: "Tipo de Serviço Principal",
          value: String(item.service_type_id ?? "-"),
        },
        { label: "Steps", value: String(item.workflow_steps_count ?? 0) },
        {
          label: "Tipos de Serviço Vinculados",
          value: String(item.linked_service_types_count ?? 0),
        },
      ]}
      renderItemActions={(item) => {
        const templateId = String(item.id ?? "");
        const stepsCount = Number(item.workflow_steps_count ?? 0);
        const linkedCount = Number(item.linked_service_types_count ?? 0);

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
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Administrador/ServicosWorkflow" as any,
                  params: {
                    workflowId: templateId,
                    tenantId: String(item.tenant_id ?? ""),
                    workflowName: String(item.name ?? "Workflow"),
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
                Tipos de Serviço ({linkedCount})
              </ThemedText>
            </TouchableOpacity>
          </View>
        );
      }}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => String(item.name ?? "Workflow Template")}
    />
  );
}
