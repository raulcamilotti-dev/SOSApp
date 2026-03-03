/**
 * Custom Fields — Admin screen for managing custom field definitions.
 *
 * Tenant admins can create custom fields for whitelisted tables
 * (customers, service_orders, leads). Each field becomes available
 * in any CrudScreen that has `tableName` set to that table.
 *
 * Uses CrudScreen with schema-driven fields + custom overrides.
 */

import {
    CrudScreen,
    type CrudFieldConfig,
    type CrudFieldType,
} from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { ProtectedRoute } from "@/core/auth/ProtectedRoute";
import { PERMISSIONS } from "@/core/auth/permissions";
import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import {
    CUSTOM_FIELDS_ALLOWED_TABLES,
    type CustomFieldDefinition,
} from "@/services/custom-fields";

/* ── Table label mapping (for display in the list) ── */
const TABLE_LABELS: Record<string, string> = {
  customers: "Clientes",
  service_orders: "Ordens de Serviço",
  leads: "Leads",
};

const formatTableLabel = (table: string): string =>
  TABLE_LABELS[table] ?? table;

/* ── Field type options ── */
const FIELD_TYPE_OPTIONS: { label: string; value: CrudFieldType }[] = [
  { label: "Texto", value: "text" },
  { label: "Texto longo", value: "multiline" },
  { label: "Número", value: "number" },
  { label: "Moeda (R$)", value: "currency" },
  { label: "Data", value: "date" },
  { label: "Data e hora", value: "datetime" },
  { label: "Booleano (Sim/Não)", value: "boolean" },
  { label: "Seleção", value: "select" },
  { label: "E-mail", value: "email" },
  { label: "Telefone", value: "phone" },
  { label: "URL", value: "url" },
  { label: "CPF/CNPJ/CEP (máscara)", value: "masked" },
  { label: "Referência", value: "reference" },
  { label: "JSON", value: "json" },
];

/* ── Mask type options ── */
const MASK_TYPE_OPTIONS = [
  { label: "CPF", value: "cpf" },
  { label: "CNPJ", value: "cnpj" },
  { label: "CPF ou CNPJ", value: "cpf_cnpj" },
  { label: "CEP", value: "cep" },
  { label: "Telefone", value: "phone" },
];

/* ── Target table options ── */
const TARGET_TABLE_OPTIONS = CUSTOM_FIELDS_ALLOWED_TABLES.map((table) => ({
  label: formatTableLabel(table),
  value: table,
}));

/* ── Field config ── */
const FIELDS: CrudFieldConfig<CustomFieldDefinition>[] = [
  {
    key: "target_table",
    label: "Tabela Alvo",
    type: "select",
    options: TARGET_TABLE_OPTIONS,
    required: true,
    visibleInList: true,
    section: "Identificação",
  },
  {
    key: "field_key",
    label: "Chave do Campo",
    type: "text",
    placeholder: "ex: numero_processo, cor_preferida",
    required: true,
    visibleInList: true,
    section: "Identificação",
    validate: (value: string) => {
      if (!/^[a-z][a-z0-9_]*$/.test(value)) {
        return "Use apenas letras minúsculas, números e _ (começando com letra)";
      }
      if (value.length < 2) return "Mínimo 2 caracteres";
      if (value.length > 50) return "Máximo 50 caracteres";
      return null;
    },
  },
  {
    key: "label",
    label: "Rótulo (Label)",
    type: "text",
    placeholder: "ex: Número do Processo",
    required: true,
    visibleInList: true,
    section: "Identificação",
  },
  {
    key: "placeholder",
    label: "Placeholder",
    type: "text",
    placeholder: "Texto exibido quando vazio",
    section: "Identificação",
  },
  {
    key: "field_type",
    label: "Tipo do Campo",
    type: "select",
    options: FIELD_TYPE_OPTIONS,
    required: true,
    visibleInList: true,
    section: "Tipo & Comportamento",
  },
  {
    key: "mask_type",
    label: "Tipo de Máscara",
    type: "select",
    options: MASK_TYPE_OPTIONS,
    section: "Tipo & Comportamento",
    showWhen: (state) => state.field_type === "masked",
  },
  {
    key: "options",
    label: "Opções (JSON)",
    type: "json",
    placeholder: '[{"label": "Opção 1", "value": "op1"}]',
    section: "Tipo & Comportamento",
    showWhen: (state) => state.field_type === "select",
    jsonTemplate: {
      "0": { label: "Opção 1", value: "op1" },
      "1": { label: "Opção 2", value: "op2" },
    },
  },
  {
    key: "reference_config",
    label: "Configuração de Referência (JSON)",
    type: "json",
    placeholder:
      '{"table": "customers", "label_field": "name", "search_field": "name"}',
    section: "Tipo & Comportamento",
    showWhen: (state) => state.field_type === "reference",
    jsonTemplate: {
      table: "",
      label_field: "name",
      id_field: "id",
      search_field: "name",
    },
  },
  {
    key: "required",
    label: "Obrigatório",
    type: "boolean",
    section: "Exibição",
  },
  {
    key: "visible_in_list",
    label: "Visível na Listagem",
    type: "boolean",
    section: "Exibição",
  },
  {
    key: "visible_in_form",
    label: "Visível no Formulário",
    type: "boolean",
    section: "Exibição",
  },
  {
    key: "read_only",
    label: "Somente Leitura",
    type: "boolean",
    section: "Exibição",
  },
  {
    key: "section",
    label: "Seção no Formulário",
    type: "text",
    placeholder: "ex: Dados Adicionais",
    section: "Exibição",
  },
  {
    key: "sort_order",
    label: "Ordem de Exibição",
    type: "number",
    placeholder: "0",
    section: "Exibição",
  },
  {
    key: "default_value",
    label: "Valor Padrão",
    type: "text",
    section: "Avançado",
  },
  {
    key: "validation_rules",
    label: "Regras de Validação (JSON)",
    type: "json",
    placeholder:
      '{"min": 0, "max": 100, "minLength": 3, "maxLength": 50, "regex": "^[A-Z]"}',
    section: "Avançado",
    jsonTemplate: {},
  },
  {
    key: "show_when",
    label: "Visibilidade Condicional (JSON)",
    type: "json",
    placeholder: '{"field": "outro_campo", "operator": "equals", "value": "X"}',
    section: "Avançado",
    jsonTemplate: {},
  },
];

export default function CustomFieldsScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;

  return (
    <ProtectedRoute requiredPermission={[PERMISSIONS.TENANT_MANAGE]}>
      <CrudScreen<CustomFieldDefinition>
        title="Campos Personalizados"
        subtitle="Crie campos extras para clientes, ordens de serviço e leads"
        searchPlaceholder="Buscar campo..."
        searchFields={["label", "field_key", "target_table", "field_type"]}
        fields={FIELDS}
        loadItems={async () => {
          if (!tenantId) return [];
          const res = await api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "custom_field_definitions",
            ...buildSearchParams([{ field: "tenant_id", value: tenantId }], {
              sortColumn: "target_table ASC, sort_order ASC, label ASC",
            }),
          });
          return normalizeCrudList<CustomFieldDefinition>(res.data).filter(
            (item) => !item.deleted_at,
          );
        }}
        createItem={async (payload) => {
          const res = await api.post(CRUD_ENDPOINT, {
            action: "create",
            table: "custom_field_definitions",
            payload: {
              ...payload,
              tenant_id: tenantId,
            },
          });
          return res.data;
        }}
        updateItem={async (payload) => {
          const res = await api.post(CRUD_ENDPOINT, {
            action: "update",
            table: "custom_field_definitions",
            payload,
          });
          return res.data;
        }}
        deleteItem={async (payload) => {
          const res = await api.post(CRUD_ENDPOINT, {
            action: "update",
            table: "custom_field_definitions",
            payload: {
              id: payload.id,
              deleted_at: new Date().toISOString(),
            },
          });
          return res.data;
        }}
        getId={(item) => item.id}
        getTitle={(item) =>
          `${item.label} (${formatTableLabel(item.target_table)})`
        }
        getDetails={(item) => [
          { label: "Chave", value: item.field_key },
          { label: "Tabela", value: formatTableLabel(item.target_table) },
          {
            label: "Tipo",
            value:
              FIELD_TYPE_OPTIONS.find((o) => o.value === item.field_type)
                ?.label ?? item.field_type,
          },
          {
            label: "Obrigatório",
            value: item.required ? "Sim" : "Não",
          },
          {
            label: "Visível na lista",
            value: item.visible_in_list ? "Sim" : "Não",
          },
          {
            label: "Ordem",
            value: String(item.sort_order ?? 0),
          },
        ]}
      />
    </ProtectedRoute>
  );
}
