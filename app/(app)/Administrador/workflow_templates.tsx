import { ThemedText } from "@/components/themed-text";
import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { filterActive } from "@/core/utils/soft-delete";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { TouchableOpacity, View } from "react-native";
import { CRUD_ENDPOINT } from "@/services/crud";

type Row = Record<string, unknown>;

const listRows = async (): Promise<Row[]> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "workflow_templates",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

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
  const params = useLocalSearchParams<{ serviceId?: string }>();
  const serviceId = Array.isArray(params.serviceId)
    ? params.serviceId[0]
    : params.serviceId;

  const loadFilteredRows = useMemo(() => {
    return async (): Promise<Row[]> => {
      const rows = await listRows();
      return rows.filter((item) => {
        if (serviceId && String(item.service_id ?? "") !== serviceId)
          return false;
        return true;
      });
    };
  }, [serviceId]);

  const createWithContext = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> => {
      return createRow({
        ...payload,
        service_id: serviceId ?? payload.service_id,
      });
    };
  }, [serviceId]);

  const updateWithContext = useMemo(() => {
    return async (
      payload: Partial<Row> & { id?: string | null },
    ): Promise<unknown> => {
      return updateRow({
        ...payload,
        service_id: serviceId ?? payload.service_id,
      });
    };
  }, [serviceId]);

  const loadRowsWithRelations = useMemo(() => {
    return async (): Promise<Row[]> => {
      const [templateRows, stepsResponse] = await Promise.all([
        loadFilteredRows(),
        api.post(CRUD_ENDPOINT, { action: "list", table: "workflow_steps" }),
      ]);

      const steps = filterActive(
        Array.isArray(stepsResponse.data)
          ? (stepsResponse.data as Row[])
          : (((stepsResponse.data as any)?.data ?? []) as Row[]),
      );

      return templateRows.map((template) => {
        const templateId = String(template.id ?? "");
        const stepsCount = steps.filter(
          (step) => String(step.template_id ?? "") === templateId,
        ).length;

        return {
          ...template,
          workflow_steps_count: stepsCount,
        };
      });
    };
  }, [loadFilteredRows]);

  const tintColor = useThemeColor({}, "tint");
  const borderColor = useThemeColor({}, "border");

  const fields: CrudFieldConfig<Row>[] = [
    { key: "id", label: "Id", placeholder: "Id", visibleInForm: false },
    {
      key: "service_id",
      label: "Service Id",
      placeholder: "Service Id",
      type: "reference",
      referenceTable: "services",
      referenceLabelField: "name",
      referenceSearchField: "name",
      referenceIdField: "id",
      visibleInList: true,
      visibleInForm: !serviceId,
    },
    {
      key: "name",
      label: "Name",
      placeholder: "Name",
      required: true,
      visibleInList: true,
    },
    {
      key: "created_at",
      label: "Created At",
      placeholder: "Created At",
      visibleInForm: false,
    },
  ];

  return (
    <CrudScreen<Row>
      title="Workflow Templates"
      subtitle="Gestao de templates de workflow"
      fields={fields}
      loadItems={loadRowsWithRelations}
      createItem={createWithContext}
      updateItem={updateWithContext}
      deleteItem={deleteRow}
      getDetails={(item) => [
        { label: "Nome", value: String(item.name ?? "-") },
        { label: "Service", value: String(item.service_id ?? "-") },
        { label: "Steps", value: String(item.workflow_steps_count ?? 0) },
      ]}
      renderItemActions={(item) => {
        const templateId = String(item.id ?? "");
        const count = Number(item.workflow_steps_count ?? 0);

        return (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
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
                Steps ({Number.isFinite(count) ? count : 0})
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
