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
    table: "appointment_logs",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "appointment_logs",
    payload,
  });
  return response.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "appointment_logs",
    payload,
  });
  return response.data;
};

export default function LogsAgendamentosAdminScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    tenantId?: string;
    appointmentId?: string;
    performedBy?: string;
  }>();
  const tintColor = useThemeColor({}, "tint");
  const borderColor = useThemeColor({}, "border");
  const tenantId = Array.isArray(params.tenantId)
    ? params.tenantId[0]
    : params.tenantId;
  const appointmentId = Array.isArray(params.appointmentId)
    ? params.appointmentId[0]
    : params.appointmentId;
  const performedBy = Array.isArray(params.performedBy)
    ? params.performedBy[0]
    : params.performedBy;

  const loadFilteredRows = useMemo(() => {
    return async (): Promise<Row[]> => {
      const rows = await listRows();
      return rows.filter((item) => {
        if (tenantId && String(item.tenant_id ?? "") !== tenantId) return false;
        if (
          appointmentId &&
          String(item.appointment_id ?? "") !== appointmentId
        ) {
          return false;
        }
        if (performedBy && String(item.performed_by ?? "") !== performedBy) {
          return false;
        }
        return true;
      });
    };
  }, [appointmentId, performedBy, tenantId]);

  const createWithContext = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> => {
      return createRow({
        ...payload,
        tenant_id: tenantId ?? payload.tenant_id,
        appointment_id: appointmentId ?? payload.appointment_id,
        performed_by: performedBy ?? payload.performed_by,
      });
    };
  }, [appointmentId, performedBy, tenantId]);

  const updateWithContext = useMemo(() => {
    return async (
      payload: Partial<Row> & { id?: string | null },
    ): Promise<unknown> => {
      return updateRow({
        ...payload,
        tenant_id: tenantId ?? payload.tenant_id,
        appointment_id: appointmentId ?? payload.appointment_id,
        performed_by: performedBy ?? payload.performed_by,
      });
    };
  }, [appointmentId, performedBy, tenantId]);

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
      visibleInForm: !tenantId,
    },
    {
      key: "appointment_id",
      label: "Agendamento",
      type: "reference",
      referenceTable: "service_appointments",
      referenceLabelField: "scheduled_start",
      referenceSearchField: "scheduled_start",
      referenceIdField: "id",
      required: true,
      visibleInList: true,
      visibleInForm: !appointmentId,
    },
    { key: "action", label: "Ação", required: true, visibleInList: true },
    {
      key: "performed_by",
      label: "Executado por",
      type: "reference",
      referenceTable: "users",
      referenceLabelField: "fullname",
      referenceSearchField: "fullname",
      referenceIdField: "id",
      required: true,
      visibleInList: true,
      visibleInForm: !performedBy,
    },
    { key: "payload_json", label: "Payload", type: "json" },
    {
      key: "created_at",
      label: "Criado em",
      readOnly: true,
      visibleInList: true,
    },
    { key: "deleted_at", label: "Deletado em", readOnly: true },
  ];

  return (
    <CrudScreen<Row>
      title="Logs de agendamentos"
      subtitle="Rastreabilidade do agendamento"
      fields={fields}
      loadItems={loadFilteredRows}
      createItem={createWithContext}
      updateItem={updateWithContext}
      getDetails={(item) => [
        { label: "Tenant", value: String(item.tenant_id ?? "-") },
        { label: "Agendamento", value: String(item.appointment_id ?? "-") },
        { label: "Ação", value: String(item.action ?? "-") },
        { label: "Executado por", value: String(item.performed_by ?? "-") },
      ]}
      renderItemActions={(item) => {
        const rowAppointmentId = String(item.appointment_id ?? "");
        const rowTenantId = String(item.tenant_id ?? "");

        if (!rowAppointmentId) return null;

        return (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Administrador/Agenda" as any,
                  params: {
                    appointmentId: rowAppointmentId,
                    tenantId: rowTenantId,
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
                Abrir agendamento
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Administrador/ExecucoesServico" as any,
                  params: {
                    appointmentId: rowAppointmentId,
                    tenantId: rowTenantId,
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
                Ver execuções
              </ThemedText>
            </TouchableOpacity>
          </View>
        );
      }}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => {
        const action = String(item.action ?? "");
        const created = String(item.created_at ?? "");
        return action ? `${action} · ${created}` : "Log";
      }}
    />
  );
}
