import { ThemedText } from "@/components/themed-text";
import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { filterActive } from "@/core/utils/soft-delete";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import { buildSearchParams, CRUD_ENDPOINT } from "@/services/crud";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { TouchableOpacity, View } from "react-native";

type Row = Record<string, unknown>;

const listRows = async (): Promise<Row[]> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "service_appointments",
    ...buildSearchParams([], { sortColumn: "scheduled_start" }),
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "service_appointments",
    payload,
  });
  return response.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "service_appointments",
    payload,
  });
  return response.data;
};

export default function AgendaAdminScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    appointmentId?: string;
    tenantId?: string;
  }>();
  const appointmentIdParam = Array.isArray(params.appointmentId)
    ? params.appointmentId[0]
    : params.appointmentId;
  const tenantIdParam = Array.isArray(params.tenantId)
    ? params.tenantId[0]
    : params.tenantId;
  const tintColor = useThemeColor({}, "tint");
  const borderColor = useThemeColor({}, "border");

  const loadRowsWithRelations = useMemo(() => {
    return async (): Promise<Row[]> => {
      const [appointmentsRows, logsResponse, executionsResponse] =
        await Promise.all([
          listRows(),
          api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "appointment_logs",
          }),
          api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "service_executions",
          }),
        ]);

      const logsRaw = logsResponse.data;
      const logs = filterActive(
        Array.isArray(logsRaw)
          ? (logsRaw as Row[])
          : (((logsRaw as any)?.data ?? []) as Row[]),
      );

      const executionsRaw = executionsResponse.data;
      const executions = filterActive(
        Array.isArray(executionsRaw)
          ? (executionsRaw as Row[])
          : (((executionsRaw as any)?.data ?? []) as Row[]),
      );

      return appointmentsRows
        .filter((appointment) => {
          if (
            appointmentIdParam &&
            String(appointment.id ?? "") !== appointmentIdParam
          ) {
            return false;
          }
          if (
            tenantIdParam &&
            String(appointment.tenant_id ?? "") !== tenantIdParam
          ) {
            return false;
          }
          return true;
        })
        .map((appointment) => {
          const appointmentId = String(appointment.id ?? "");
          const logsCount = logs.filter(
            (log) => String(log.appointment_id ?? "") === appointmentId,
          ).length;
          const executionsCount = executions.filter(
            (execution) =>
              String(execution.appointment_id ?? "") === appointmentId,
          ).length;

          return {
            ...appointment,
            appointment_logs_count: logsCount,
            service_executions_count: executionsCount,
          };
        });
    };
  }, [appointmentIdParam, tenantIdParam]);

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

  const fields: CrudFieldConfig<Row>[] = [
    {
      key: "tenant_id",
      label: "Tenant",
      type: "reference",
      referenceTable: "tenants",
      referenceLabelField: "company_name",
      referenceSearchField: "company_name",
      referenceIdField: "id",
      required: true,
      visibleInList: true,
      visibleInForm: !tenantIdParam,
    },
    {
      key: "service_id",
      label: "Serviço",
      type: "reference",
      referenceTable: "services",
      referenceLabelField: "name",
      referenceSearchField: "name",
      referenceIdField: "id",
      required: true,
      visibleInList: true,
    },
    {
      key: "partner_id",
      label: "Parceiro",
      type: "reference",
      referenceTable: "partners",
      referenceLabelField: "display_name",
      referenceSearchField: "display_name",
      referenceIdField: "id",
      required: true,
      visibleInList: true,
    },
    {
      key: "customer_id",
      label: "Cliente",
      type: "reference",
      referenceTable: "customers",
      referenceLabelField: "name",
      referenceIdField: "id",
      required: true,
      visibleInList: true,
    },
    {
      key: "scheduled_start",
      label: "Início",
      placeholder: "2026-02-11T10:00:00Z",
      required: true,
      visibleInList: true,
    },
    {
      key: "scheduled_end",
      label: "Fim",
      placeholder: "2026-02-11T11:00:00Z",
      required: true,
      visibleInList: true,
    },
    {
      key: "status",
      label: "Status",
      placeholder:
        "scheduled / confirmed / in_progress / completed / cancelled / no_show",
      required: true,
      visibleInList: true,
    },
    { key: "notes", label: "Notas", type: "multiline" },
    {
      key: "created_by",
      label: "Criado por",
      type: "reference",
      referenceTable: "users",
      referenceLabelField: "fullname",
      referenceSearchField: "fullname",
      referenceIdField: "id",
      readOnly: true,
    },
    { key: "created_at", label: "Criado em", readOnly: true },
    { key: "updated_at", label: "Atualizado em", readOnly: true },
    { key: "deleted_at", label: "Deletado em", readOnly: true },
  ];

  return (
    <CrudScreen<Row>
      title="Agenda"
      subtitle="Gestão de agendamentos de serviços"
      fields={fields}
      loadItems={loadRowsWithRelations}
      createItem={createWithContext}
      updateItem={updateWithContext}
      getDetails={(item) => [
        { label: "Tenant", value: String(item.tenant_id ?? "-") },
        { label: "Serviço", value: String(item.service_id ?? "-") },
        { label: "Parceiro", value: String(item.partner_id ?? "-") },
        { label: "Status", value: String(item.status ?? "-") },
        {
          label: "Logs",
          value: String(item.appointment_logs_count ?? 0),
        },
        {
          label: "Execuções",
          value: String(item.service_executions_count ?? 0),
        },
      ]}
      renderItemActions={(item) => {
        const appointmentId = String(item.id ?? "");
        const tenantId = String(item.tenant_id ?? "");
        const performedBy = String(item.created_by ?? "");
        const logsCount = Number(item.appointment_logs_count ?? 0);
        const executionsCount = Number(item.service_executions_count ?? 0);

        return (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Administrador/LogsAgendamentos" as any,
                  params: {
                    appointmentId,
                    tenantId,
                    performedBy,
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
                Logs ({Number.isFinite(logsCount) ? logsCount : 0})
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Administrador/ExecucoesServico" as any,
                  params: {
                    appointmentId,
                    tenantId,
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
                Execuções (
                {Number.isFinite(executionsCount) ? executionsCount : 0})
              </ThemedText>
            </TouchableOpacity>
          </View>
        );
      }}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => {
        const status = String(item.status ?? "");
        const start = String(item.scheduled_start ?? "");
        return status && start ? `${status} · ${start}` : "Agendamento";
      }}
    />
  );
}
