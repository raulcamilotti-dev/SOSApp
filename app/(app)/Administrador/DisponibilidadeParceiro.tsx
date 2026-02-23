import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { filterActive } from "@/core/utils/soft-delete";
import { api } from "@/services/api";
import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { CRUD_ENDPOINT } from "@/services/crud";

type Row = Record<string, unknown>;

const parseWeekday = (value: unknown): number => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    throw new Error("Informe o dia da semana (0 a 6).");
  }

  if (raw.includes("-")) {
    throw new Error(
      "Dia da semana inválido. Use apenas um número de 0 a 6 (ex.: 1).",
    );
  }

  const weekday = Number(raw);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw new Error("Dia da semana inválido. Use um valor entre 0 e 6.");
  }

  return weekday;
};

const normalizeTime = (value: unknown, fieldLabel: string): string => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    throw new Error(`Informe o horário de ${fieldLabel.toLowerCase()}.`);
  }

  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    throw new Error(
      `Horário de ${fieldLabel.toLowerCase()} inválido. Use o formato HH:mm (ex.: 09:00).`,
    );
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(
      `Horário de ${fieldLabel.toLowerCase()} inválido. Use HH:mm entre 00:00 e 23:59.`,
    );
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const toMinutes = (hhmm: string): number => {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
};

const normalizeAvailabilityPayload = (
  payload: Partial<Row>,
  context: { partnerId?: string; tenantId?: string },
): Partial<Row> => {
  const normalized: Partial<Row> = {
    ...payload,
    partner_id: context.partnerId ?? payload.partner_id,
    tenant_id: context.tenantId ?? payload.tenant_id,
  };

  const tenantId = String(normalized.tenant_id ?? "").trim();
  const partnerId = String(normalized.partner_id ?? "").trim();
  if (!tenantId) {
    throw new Error("Tenant obrigatório para disponibilidade.");
  }
  if (!partnerId) {
    throw new Error("Parceiro obrigatório para disponibilidade.");
  }

  const weekday = parseWeekday(normalized.weekday);
  const startTime = normalizeTime(normalized.start_time, "Início");
  const endTime = normalizeTime(normalized.end_time, "Fim");

  if (toMinutes(endTime) <= toMinutes(startTime)) {
    throw new Error("O horário de fim deve ser maior que o horário de início.");
  }

  normalized.weekday = weekday;
  normalized.start_time = startTime;
  normalized.end_time = endTime;

  if (typeof normalized.is_active === "string") {
    normalized.is_active = ["true", "1", "sim", "yes", "ativo"].includes(
      normalized.is_active.trim().toLowerCase(),
    );
  }

  return normalized;
};

const listRows = async (): Promise<Row[]> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "partner_availability",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "partner_availability",
    payload,
  });
  return response.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "partner_availability",
    payload,
  });
  return response.data;
};

export default function DisponibilidadeParceiroAdminScreen() {
  const params = useLocalSearchParams<{
    partnerId?: string;
    tenantId?: string;
  }>();
  const partnerId = Array.isArray(params.partnerId)
    ? params.partnerId[0]
    : params.partnerId;
  const tenantId = Array.isArray(params.tenantId)
    ? params.tenantId[0]
    : params.tenantId;

  const loadFilteredRows = useMemo(() => {
    return async (): Promise<Row[]> => {
      const rows = await listRows();
      return rows.filter((item) => {
        if (partnerId && String(item.partner_id ?? "") !== partnerId)
          return false;
        if (tenantId && String(item.tenant_id ?? "") !== tenantId) return false;
        return true;
      });
    };
  }, [partnerId, tenantId]);

  const createWithContext = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> => {
      return createRow(
        normalizeAvailabilityPayload(payload, {
          partnerId,
          tenantId,
        }),
      );
    };
  }, [partnerId, tenantId]);

  const updateWithContext = useMemo(() => {
    return async (
      payload: Partial<Row> & { id?: string | null },
    ): Promise<unknown> => {
      return updateRow(
        normalizeAvailabilityPayload(payload, {
          partnerId,
          tenantId,
        }) as Partial<Row> & { id?: string | null },
      );
    };
  }, [partnerId, tenantId]);

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
      key: "partner_id",
      label: "Parceiro",
      type: "reference",
      referenceTable: "partners",
      referenceLabelField: "display_name",
      referenceSearchField: "display_name",
      referenceIdField: "id",
      required: true,
      visibleInList: true,
      visibleInForm: !partnerId,
    },
    {
      key: "weekday",
      label: "Dia da semana (0 a 6)",
      placeholder: "0 (Dom) até 6 (Sáb)",
      required: true,
      visibleInList: true,
    },
    {
      key: "start_time",
      label: "Início",
      placeholder: "09:00",
      required: true,
      visibleInList: true,
    },
    {
      key: "end_time",
      label: "Fim",
      placeholder: "18:00",
      required: true,
      visibleInList: true,
    },
    {
      key: "is_active",
      label: "Ativo",
      placeholder: "true/false",
      visibleInList: true,
    },
    { key: "created_at", label: "Criado em", readOnly: true },
    { key: "updated_at", label: "Atualizado em", readOnly: true },
    { key: "deleted_at", label: "Deletado em", readOnly: true },
  ];

  return (
    <CrudScreen<Row>
      title="Disponibilidade do Parceiro"
      subtitle="Gestão de horários disponíveis por dia da semana"
      fields={fields}
      loadItems={loadFilteredRows}
      createItem={createWithContext}
      updateItem={updateWithContext}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => {
        const weekday = String(item.weekday ?? "");
        const start = String(item.start_time ?? "");
        const end = String(item.end_time ?? "");
        return weekday ? `Dia ${weekday} · ${start}-${end}` : "Disponibilidade";
      }}
    />
  );
}
