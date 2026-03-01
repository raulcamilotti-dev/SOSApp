import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { filterActive } from "@/core/utils/soft-delete";
import { useSafeTenantId } from "@/hooks/use-safe-tenant-id";
import { api } from "@/services/api";
import {
    CRUD_ENDPOINT,
    buildSearchParams,
    normalizeCrudList,
} from "@/services/crud";
import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";

type Row = Record<string, unknown>;

const listRowsForTenant = async (tenantId?: string | null): Promise<Row[]> => {
  const filters = tenantId ? [{ field: "tenant_id", value: tenantId }] : [];
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "agent_playbook_rules",
    ...buildSearchParams(filters, {
      sortColumn: "rule_order ASC, created_at ASC",
    }),
  });
  return filterActive(normalizeCrudList<Row>(response.data));
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "agent_playbook_rules",
    payload,
  });
  return response.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) throw new Error("Id obrigatorio para atualizar");
  const response = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "agent_playbook_rules",
    payload,
  });
  return response.data;
};

const deleteRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) throw new Error("Id obrigatorio para deletar");
  const response = await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "agent_playbook_rules",
    payload: { id: payload.id, deleted_at: new Date().toISOString() },
  });
  return response.data;
};

export default function AgentPlaybookRulesScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    tenantId?: string;
    playbookId?: string;
  }>();
  const tenantIdParam = Array.isArray(params.tenantId)
    ? params.tenantId[0]
    : params.tenantId;
  const playbookIdParam = Array.isArray(params.playbookId)
    ? params.playbookId[0]
    : params.playbookId;
  const { tenantId } = useSafeTenantId(tenantIdParam);

  const loadItems = useMemo(() => {
    return async (): Promise<Row[]> => {
      const rows = await listRowsForTenant(tenantId);
      return rows.filter((item) => {
        if (
          playbookIdParam &&
          String(item.playbook_id ?? "") !== String(playbookIdParam)
        ) {
          return false;
        }
        return true;
      });
    };
  }, [playbookIdParam, tenantId]);

  const createWithContext = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> =>
      createRow({
        ...payload,
        tenant_id: tenantId ?? payload.tenant_id,
        playbook_id: playbookIdParam ?? payload.playbook_id,
      });
  }, [playbookIdParam, tenantId]);

  const updateWithContext = useMemo(() => {
    return async (
      payload: Partial<Row> & { id?: string | null },
    ): Promise<unknown> =>
      updateRow({
        ...payload,
        tenant_id: tenantId ?? payload.tenant_id,
        playbook_id: playbookIdParam ?? payload.playbook_id,
      });
  }, [playbookIdParam, tenantId]);

  const fields: CrudFieldConfig<Row>[] = [
    { key: "id", label: "Id", visibleInForm: false },
    {
      key: "tenant_id",
      label: "Tenant",
      type: "reference",
      referenceTable: "tenants",
      referenceLabelField: "company_name",
      referenceSearchField: "company_name",
      referenceIdField: "id",
      visibleInForm: !tenantId,
      required: true,
    },
    {
      key: "playbook_id",
      label: "Playbook",
      type: "reference",
      referenceTable: "agent_playbooks",
      referenceLabelField: "name",
      referenceSearchField: "name",
      referenceIdField: "id",
      visibleInForm: !playbookIdParam,
      required: true,
      visibleInList: true,
    },
    {
      key: "rule_order",
      label: "Ordem",
      type: "number",
      required: true,
      visibleInList: true,
    },
    {
      key: "rule_type",
      label: "Tipo",
      type: "select",
      options: [
        { label: "Policy", value: "policy" },
        { label: "Flow", value: "flow" },
        { label: "Safety", value: "safety" },
        { label: "Tooling", value: "tooling" },
      ],
      required: true,
      visibleInList: true,
    },
    { key: "title", label: "Título", visibleInList: true },
    {
      key: "instruction",
      label: "Instrução",
      type: "multiline",
      required: true,
      visibleInList: true,
    },
    {
      key: "severity",
      label: "Severidade",
      type: "select",
      options: [
        { label: "Normal", value: "normal" },
        { label: "High", value: "high" },
        { label: "Critical", value: "critical" },
      ],
      visibleInList: true,
    },
    { key: "is_active", label: "Ativa" },
    { key: "metadata", label: "Metadata", type: "json" },
    { key: "created_at", label: "Criado em", visibleInForm: false },
    { key: "updated_at", label: "Atualizado em", visibleInForm: false },
  ];

  return (
    <CrudScreen<Row>
      title="Regras do Playbook"
      subtitle="Regras de comportamento do robô por tenant"
      searchPlaceholder="Buscar regra..."
      searchFields={["title", "instruction", "rule_type"]}
      fields={fields}
      loadItems={loadItems}
      createItem={createWithContext}
      updateItem={updateWithContext}
      deleteItem={deleteRow}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => String(item.title ?? item.rule_type ?? "Regra")}
      getDetails={(item) => [
        { label: "Tipo", value: String(item.rule_type ?? "-") },
        { label: "Ordem", value: String(item.rule_order ?? "-") },
        { label: "Severidade", value: String(item.severity ?? "-") },
      ]}
    />
  );
}
