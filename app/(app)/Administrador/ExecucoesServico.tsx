import { ThemedText } from "@/components/themed-text";
import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { filterActive } from "@/core/utils/soft-delete";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {  buildSearchParams, CRUD_ENDPOINT } from "@/services/crud";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { TouchableOpacity, View } from "react-native";

type Row = Record<string, unknown>;

const EXECUTION_STATUS_OPTIONS = [
  { label: "Agendado", value: "scheduled" },
  { label: "Em andamento", value: "in_progress" },
  { label: "Concluído", value: "completed" },
  { label: "Cancelado", value: "cancelled" },
];

const normalizeList = <T,>(data: unknown): T[] => {
  const body = data as any;
  const list = Array.isArray(data)
    ? data
    : (body?.data ?? body?.value ?? body?.items ?? []);
  return Array.isArray(list) ? (list as T[]) : [];
};

const listRows = async (): Promise<Row[]> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "service_executions",
    ...buildSearchParams([], { sortColumn: "created_at" }),
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "service_executions",
    payload,
  });
  return response.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "service_executions",
    payload,
  });
  return response.data;
};

export default function ExecucoesServicoAdminScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{
    tenantId?: string;
    appointmentId?: string;
    partnerId?: string;
    executedByUserId?: string;
  }>();
  const tenantId = Array.isArray(params.tenantId)
    ? params.tenantId[0]
    : params.tenantId;
  const appointmentId = Array.isArray(params.appointmentId)
    ? params.appointmentId[0]
    : params.appointmentId;
  const partnerId = Array.isArray(params.partnerId)
    ? params.partnerId[0]
    : params.partnerId;
  const executedByUserId = Array.isArray(params.executedByUserId)
    ? params.executedByUserId[0]
    : params.executedByUserId;

  const currentUserId = String(user?.id ?? "").trim();

  const getAppointmentSchedule = useMemo(() => {
    return async (
      targetAppointmentId: string,
      targetTenantId?: string,
    ): Promise<{ scheduledStart?: string; scheduledEnd?: string } | null> => {
      if (!targetAppointmentId) return null;

      const response = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "service_appointments",
        ...buildSearchParams([{ field: "id", value: targetAppointmentId }]),
      });
      const list = normalizeList<Row>(response.data);
      const exact = list.find(
        (row) =>
          String(row.id ?? "") === targetAppointmentId &&
          (!targetTenantId || String(row.tenant_id ?? "") === targetTenantId),
      );
      if (!exact) return null;

      const scheduledStart = String(exact.scheduled_start ?? "").trim();
      const scheduledEnd = String(exact.scheduled_end ?? "").trim();

      return {
        scheduledStart: scheduledStart || undefined,
        scheduledEnd: scheduledEnd || undefined,
      };
    };
  }, []);

  const buildExecutionPayload = useMemo(() => {
    return async (payload: Partial<Row>): Promise<Partial<Row>> => {
      const effectiveAppointmentId = String(
        appointmentId ?? payload.appointment_id ?? "",
      ).trim();
      const effectiveTenantId = String(
        tenantId ?? payload.tenant_id ?? "",
      ).trim();

      if (!effectiveAppointmentId) {
        throw new Error("Agendamento é obrigatório para execução.");
      }

      const appointmentSchedule = await getAppointmentSchedule(
        effectiveAppointmentId,
        effectiveTenantId || undefined,
      );

      const normalizedStatus = String(payload.status ?? "scheduled").trim();
      const allowedStatus = new Set(
        EXECUTION_STATUS_OPTIONS.map((option) => option.value),
      );

      return {
        ...payload,
        tenant_id: effectiveTenantId || null,
        appointment_id: effectiveAppointmentId,
        executed_by_partner_id: partnerId ?? payload.executed_by_partner_id,
        executed_by_user_id:
          currentUserId || executedByUserId || payload.executed_by_user_id,
        status: allowedStatus.has(normalizedStatus)
          ? normalizedStatus
          : "scheduled",
        started_at:
          appointmentSchedule?.scheduledStart ?? payload.started_at ?? null,
        finished_at:
          appointmentSchedule?.scheduledEnd ?? payload.finished_at ?? null,
      };
    };
  }, [
    appointmentId,
    currentUserId,
    executedByUserId,
    getAppointmentSchedule,
    partnerId,
    tenantId,
  ]);

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
        if (
          partnerId &&
          String(item.executed_by_partner_id ?? "") !== partnerId
        ) {
          return false;
        }
        if (
          executedByUserId &&
          String(item.executed_by_user_id ?? "") !== executedByUserId
        ) {
          return false;
        }
        return true;
      });
    };
  }, [appointmentId, executedByUserId, partnerId, tenantId]);

  const createWithContext = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> => {
      return createRow(await buildExecutionPayload(payload));
    };
  }, [buildExecutionPayload]);

  const updateWithContext = useMemo(() => {
    return async (
      payload: Partial<Row> & { id?: string | null },
    ): Promise<unknown> => {
      return updateRow(
        (await buildExecutionPayload(payload)) as Partial<Row> & {
          id?: string | null;
        },
      );
    };
  }, [buildExecutionPayload]);

  const tintColor = useThemeColor({}, "tint");
  const borderColor = useThemeColor({}, "border");

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
    {
      key: "status",
      label: "Status",
      type: "select",
      options: EXECUTION_STATUS_OPTIONS,
      required: true,
      visibleInList: true,
    },
    {
      key: "started_at",
      label: "Iniciado em",
      placeholder: "2026-02-11T10:00:00Z",
      visibleInList: true,
      readOnly: true,
      visibleInForm: false,
    },
    {
      key: "finished_at",
      label: "Finalizado em",
      placeholder: "2026-02-11T11:00:00Z",
      visibleInList: true,
      readOnly: true,
      visibleInForm: false,
    },
    { key: "execution_notes", label: "Notas", type: "multiline" },
    {
      key: "executed_by_partner_id",
      label: "Executado por (parceiro)",
      type: "reference",
      referenceTable: "partners",
      referenceLabelField: "display_name",
      referenceSearchField: "display_name",
      referenceIdField: "id",
      visibleInForm: !partnerId,
    },
    {
      key: "executed_by_user_id",
      label: "Executado por (usuário)",
      type: "reference",
      referenceTable: "users",
      referenceLabelField: "fullname",
      referenceSearchField: "fullname",
      referenceIdField: "id",
      visibleInForm: false,
    },
    { key: "created_at", label: "Criado em", readOnly: true },
    { key: "updated_at", label: "Atualizado em", readOnly: true },
    { key: "deleted_at", label: "Deletado em", readOnly: true },
  ];

  return (
    <CrudScreen<Row>
      title="Execução"
      subtitle="Gestão de início/fim e status de execução"
      fields={fields}
      loadItems={loadFilteredRows}
      createItem={createWithContext}
      updateItem={updateWithContext}
      getDetails={(item) => [
        { label: "Tenant", value: String(item.tenant_id ?? "-") },
        { label: "Agendamento", value: String(item.appointment_id ?? "-") },
        { label: "Status", value: String(item.status ?? "-") },
        {
          label: "Parceiro",
          value: String(item.executed_by_partner_id ?? "-"),
        },
        { label: "Usuário", value: String(item.executed_by_user_id ?? "-") },
      ]}
      renderItemActions={(item) => {
        const rowTenantId = String(item.tenant_id ?? "");
        const rowAppointmentId = String(item.appointment_id ?? "");
        const rowUserId = String(item.executed_by_user_id ?? "");

        return (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Administrador/LogsAgendamentos" as any,
                  params: {
                    tenantId: rowTenantId,
                    appointmentId: rowAppointmentId,
                    performedBy: rowUserId,
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
                Ver logs do agendamento
              </ThemedText>
            </TouchableOpacity>

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
          </View>
        );
      }}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => {
        const status = String(item.status ?? "");
        const started = String(item.started_at ?? "");
        return status && started ? `${status} · ${started}` : "Execução";
      }}
    />
  );
}
