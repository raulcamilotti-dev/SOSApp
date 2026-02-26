/**
 * Catálogo de Serviços e Produtos — Admin screen
 *
 * CrudScreen for the `services` table with full PDV fields:
 * item_kind (product/service), sell_price, cost_price, stock, compositions, etc.
 * Supports filtering by item_kind via URL params.
 */

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
import { useMemo, useState } from "react";
import { Pressable, Text, TouchableOpacity, View } from "react-native";

type Row = Record<string, unknown>;

/* ------------------------------------------------------------------ */
/*  CRUD handlers                                                      */
/* ------------------------------------------------------------------ */

const ensureCrudSuccess = (data: unknown) => {
  const body = data as any;
  const logicalError =
    body?.success === false ||
    body?.ok === false ||
    String(body?.status ?? "").toLowerCase() === "error" ||
    String(body?.result ?? "").toLowerCase() === "error";
  if (logicalError) {
    const message =
      body?.message || body?.error || body?.detail || "Falha na operação";
    throw new Error(String(message));
  }
};

const listRows = async (tenantId?: string): Promise<Row[]> => {
  const filters = tenantId ? [{ field: "tenant_id", value: tenantId }] : [];
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "services",
    ...buildSearchParams(filters, { sortColumn: "name ASC" }),
  });
  return filterActive(normalizeCrudList<Row>(res.data));
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "services",
    payload,
  });
  ensureCrudSuccess(response.data);
  return response.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) throw new Error("Id obrigatório para atualizar");
  const response = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "services",
    payload,
  });
  ensureCrudSuccess(response.data);
  return response.data;
};

const deleteRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) throw new Error("Id obrigatório para deletar");
  const response = await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "services",
    payload: { id: payload.id },
  });
  ensureCrudSuccess(response.data);
  return response.data;
};

/* ------------------------------------------------------------------ */
/*  Filter tabs (item_kind)                                            */
/* ------------------------------------------------------------------ */

type ItemKindTab = "all" | "product" | "service" | "composition";
const TABS: { key: ItemKindTab; label: string; icon: string }[] = [
  { key: "all", label: "Todos", icon: "📋" },
  { key: "product", label: "Produtos", icon: "📦" },
  { key: "service", label: "Serviços", icon: "🔧" },
  { key: "composition", label: "Composições", icon: "🎁" },
];

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */

export default function ServicesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    serviceTypeId?: string;
    tenantId?: string;
    itemKind?: string;
  }>();
  const serviceTypeId = Array.isArray(params.serviceTypeId)
    ? params.serviceTypeId[0]
    : params.serviceTypeId;
  const tenantId =
    (Array.isArray(params.tenantId) ? params.tenantId[0] : params.tenantId) ||
    user?.tenant_id;

  const [activeTab, setActiveTab] = useState<ItemKindTab>(
    (params.itemKind as ItemKindTab) || "all",
  );

  const loadFilteredRows = useMemo(() => {
    return async (): Promise<Row[]> => {
      const rows = await listRows(tenantId ?? undefined);
      return rows.filter((item) => {
        if (
          serviceTypeId &&
          String(item.service_type_id ?? "") !== serviceTypeId
        )
          return false;

        // Tab filter
        if (activeTab === "product" && item.item_kind !== "product")
          return false;
        if (activeTab === "service" && item.item_kind !== "service")
          return false;
        if (activeTab === "composition" && !item.is_composition) return false;

        return true;
      });
    };
  }, [serviceTypeId, tenantId, activeTab]);

  const createWithContext = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> => {
      return createRow({
        ...payload,
        service_type_id: serviceTypeId ?? payload.service_type_id,
        tenant_id: tenantId ?? payload.tenant_id,
        item_kind: payload.item_kind ?? "service",
      });
    };
  }, [serviceTypeId, tenantId]);

  const updateWithContext = useMemo(() => {
    return async (
      payload: Partial<Row> & { id?: string | null },
    ): Promise<unknown> => {
      return updateRow({
        ...payload,
        service_type_id: serviceTypeId ?? payload.service_type_id,
        tenant_id: tenantId ?? payload.tenant_id,
      });
    };
  }, [serviceTypeId, tenantId]);

  const loadRowsWithRelations = useMemo(() => {
    return async (): Promise<Row[]> => {
      const [serviceRows, templatesResponse] = await Promise.all([
        loadFilteredRows(),
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "workflow_templates",
        }),
      ]);

      const templates = filterActive(
        normalizeCrudList<Row>(templatesResponse.data),
      );

      return serviceRows.map((service) => {
        const serviceId = String(service.id ?? "");
        const templatesCount = templates.filter(
          (template) => String(template.service_id ?? "") === serviceId,
        ).length;
        return { ...service, workflow_templates_count: templatesCount };
      });
    };
  }, [loadFilteredRows]);

  const tintColor = useThemeColor({}, "tint");
  const borderColor = useThemeColor({}, "border");
  const cardBg = useThemeColor({ light: "#fff", dark: "#23283a" }, "card");
  const mutedColor = useThemeColor({}, "muted");

  /* ---------------------------------------------------------------- */
  /*  Fields                                                           */
  /* ---------------------------------------------------------------- */

  const fields: CrudFieldConfig<Row>[] = [
    { key: "id", label: "Id", visibleInForm: false },

    // ═══ Seção: Informações Básicas ═══
    {
      key: "tenant_id",
      label: "Tenant",
      type: "reference",
      referenceTable: "tenants",
      referenceLabelField: "company_name",
      referenceSearchField: "company_name",
      referenceIdField: "id",
      required: true,
      visibleInList: false,
      visibleInForm: !tenantId,
      section: "Informações Básicas",
    },
    {
      key: "name",
      label: "Nome",
      placeholder: "Nome do item",
      required: true,
      visibleInList: true,
      section: "Informações Básicas",
    },
    {
      key: "description",
      label: "Descrição",
      placeholder: "Descrição do produto ou serviço",
      type: "multiline",
      section: "Informações Básicas",
    },
    {
      key: "item_kind",
      label: "Tipo de Item",
      type: "select",
      options: [
        { value: "service", label: "🔧 Serviço" },
        { value: "product", label: "📦 Produto" },
      ],
      required: true,
      visibleInList: true,
      section: "Informações Básicas",
    },
    {
      key: "service_type_id",
      label: "Tipo de Serviço",
      type: "reference",
      referenceTable: "service_types",
      referenceLabelField: "name",
      referenceSearchField: "name",
      referenceIdField: "id",
      required: true,
      visibleInList: true,
      visibleInForm: !serviceTypeId,
      section: "Informações Básicas",
    },
    {
      key: "sku",
      label: "SKU",
      placeholder: "Código interno do produto",
      showWhen: (s) => s.item_kind === "product",
      section: "Informações Básicas",
    },
    {
      key: "barcode",
      label: "Código de Barras",
      placeholder: "EAN / Código de barras",
      showWhen: (s) => s.item_kind === "product",
      section: "Informações Básicas",
    },

    // ═══ Seção: Preço e Custo ═══
    {
      key: "sell_price",
      label: "Preço de Venda",
      placeholder: "0.00",
      type: "currency",
      section: "Preço e Custo",
    },
    {
      key: "cost_price",
      label: "Custo",
      placeholder: "0.00",
      type: "currency",
      section: "Preço e Custo",
    },
    {
      key: "commission_percent",
      label: "Comissão (%)",
      placeholder: "0",
      type: "number",
      section: "Preço e Custo",
    },
    {
      key: "unit_id",
      label: "Unidade de Medida",
      type: "reference",
      referenceTable: "measurement_units",
      referenceLabelField: "name",
      referenceSearchField: "name",
      referenceIdField: "id",
      section: "Preço e Custo",
    },

    // ═══ Seção: Estoque (só produto) ═══
    {
      key: "pricing_type",
      label: "Modelo de Precificação",
      type: "select",
      options: [
        { label: "💰 Preço Fixo", value: "fixed" },
        { label: "📋 Sob Consulta (Orçamento)", value: "quote" },
      ],
      section: "Precificação",
    },
    {
      key: "quote_template_id",
      label: "Template de Orçamento",
      type: "reference",
      referenceTable: "quote_templates",
      referenceLabelField: "name",
      referenceSearchField: "name",
      referenceIdField: "id",
      showWhen: (s) => s.pricing_type === "quote",
      section: "Precificação",
    },
    {
      key: "track_stock",
      label: "Controlar Estoque",
      type: "boolean",
      showWhen: (s) => s.item_kind === "product",
      section: "Estoque",
    },
    {
      key: "stock_quantity",
      label: "Quantidade em Estoque",
      placeholder: "0",
      type: "number",
      showWhen: (s) => s.item_kind === "product" && s.track_stock === "true",
      section: "Estoque",
    },
    {
      key: "min_stock",
      label: "Estoque Mínimo",
      placeholder: "0",
      type: "number",
      showWhen: (s) => s.item_kind === "product" && s.track_stock === "true",
      section: "Estoque",
    },

    // ═══ Seção: Serviço (só serviço) ═══
    {
      key: "duration_minutes",
      label: "Duração (min)",
      placeholder: "60",
      type: "number",
      showWhen: (s) => s.item_kind === "service",
      section: "Serviço",
    },
    {
      key: "requires_scheduling",
      label: "Requer Agendamento",
      type: "boolean",
      showWhen: (s) => s.item_kind === "service",
      section: "Serviço",
    },

    // ═══ Seção: Fulfillment (produto) ═══
    {
      key: "requires_separation",
      label: "Requer Separação",
      type: "boolean",
      showWhen: (s) => s.item_kind === "product",
      section: "Fulfillment",
    },
    {
      key: "requires_delivery",
      label: "Requer Entrega",
      type: "boolean",
      showWhen: (s) => s.item_kind === "product",
      section: "Fulfillment",
    },

    // ═══ Seção: Dimensões de Envio (produto) ═══
    {
      key: "weight_grams",
      label: "Peso (gramas)",
      type: "number",
      placeholder: "0",
      showWhen: (s) => s.item_kind === "product",
      section: "Dimensões de Envio",
    },
    {
      key: "dimension_length_cm",
      label: "Comprimento (cm)",
      type: "number",
      placeholder: "0",
      showWhen: (s) => s.item_kind === "product",
      section: "Dimensões de Envio",
    },
    {
      key: "dimension_width_cm",
      label: "Largura (cm)",
      type: "number",
      placeholder: "0",
      showWhen: (s) => s.item_kind === "product",
      section: "Dimensões de Envio",
    },
    {
      key: "dimension_height_cm",
      label: "Altura (cm)",
      type: "number",
      placeholder: "0",
      showWhen: (s) => s.item_kind === "product",
      section: "Dimensões de Envio",
    },

    // ═══ Seção: Composição ═══
    {
      key: "is_composition",
      label: "É Composição (Kit)",
      type: "boolean",
      section: "Composição",
    },

    // ═══ Seção: Configuração ═══
    {
      key: "config",
      label: "Config",
      type: "json",
      jsonTemplate: {
        sla_days: 0,
        requires_approval: false,
        auto_assign: false,
      },
      section: "Configuração",
    },
    {
      key: "is_active",
      label: "Ativo",
      type: "boolean",
      visibleInList: true,
      section: "Configuração",
    },
    {
      key: "created_at",
      label: "Criado em",
      type: "datetime",
      visibleInForm: false,
    },
  ];

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  const formatCurrency = (val: unknown) => {
    const n = Number(val);
    if (!n && n !== 0) return "-";
    return `R$ ${n.toFixed(2).replace(".", ",")}`;
  };

  const kindBadge = (kind: unknown) => {
    if (kind === "product") return "📦 Produto";
    return "🔧 Serviço";
  };

  return (
    <CrudScreen<Row>
      title="Catálogo"
      subtitle="Produtos e Serviços"
      searchPlaceholder="Buscar por nome, SKU ou código..."
      searchFields={["name", "sku", "barcode", "description"]}
      fields={fields}
      loadItems={loadRowsWithRelations}
      createItem={createWithContext}
      updateItem={updateWithContext}
      deleteItem={deleteRow}
      getDetails={(item) => {
        const details = [
          { label: "Tipo", value: kindBadge(item.item_kind) },
          {
            label: "Precificação",
            value:
              item.pricing_type === "quote"
                ? "📋 Sob Consulta"
                : "💰 Preço Fixo",
          },
          { label: "Preço", value: formatCurrency(item.sell_price) },
          { label: "Custo", value: formatCurrency(item.cost_price) },
          { label: "Ativo", value: item.is_active ? "Sim" : "Não" },
        ];
        if (item.item_kind === "product" && item.track_stock) {
          details.push({
            label: "Estoque",
            value: `${item.stock_quantity ?? 0} (mín: ${item.min_stock ?? 0})`,
          });
        }
        if (item.item_kind === "service" && item.duration_minutes) {
          details.push({
            label: "Duração",
            value: `${item.duration_minutes} min`,
          });
        }
        if (item.is_composition) {
          details.push({ label: "Composição", value: "Sim (Kit)" });
        }
        if (item.commission_percent) {
          details.push({
            label: "Comissão",
            value: `${item.commission_percent}%`,
          });
        }
        details.push({
          label: "Templates",
          value: String(item.workflow_templates_count ?? 0),
        });
        return details;
      }}
      renderItemActions={(item) => {
        const serviceId = String(item.id ?? "");
        const count = Number(item.workflow_templates_count ?? 0);

        return (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Administrador/workflow_templates" as any,
                  params: { serviceId },
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
                Templates ({Number.isFinite(count) ? count : 0})
              </ThemedText>
            </TouchableOpacity>
            {item.is_composition && (
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/Administrador/Composicoes" as any,
                    params: { parentServiceId: serviceId },
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
                  Composição
                </ThemedText>
              </TouchableOpacity>
            )}
          </View>
        );
      }}
      headerBefore={
        <View
          style={{
            flexDirection: "row",
            gap: 6,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          {TABS.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={{
                  backgroundColor: isActive ? tintColor : cardBg,
                  borderRadius: 20,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderWidth: 1,
                  borderColor: isActive ? tintColor : borderColor,
                }}
              >
                <Text
                  style={{
                    color: isActive ? "#fff" : mutedColor,
                    fontSize: 13,
                    fontWeight: isActive ? "700" : "500",
                  }}
                >
                  {tab.icon} {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      }
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => {
        const prefix =
          item.item_kind === "product"
            ? "📦 "
            : item.is_composition
              ? "🎁 "
              : "🔧 ";
        return `${prefix}${item.name ?? "Item"}`;
      }}
    />
  );
}
