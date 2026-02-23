/**
 * TEMPLATES DE ORÇAMENTO — Admin CrudScreen
 *
 * Gerencia templates reutilizáveis de orçamento com itens pré-definidos.
 * Templates podem ser standalone ou agrupados como pacotes (multi-opção).
 * Ao criar um orçamento, o operador pode escolher um template para pré-preencher.
 */

import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import {
    calculateTemplateTotal,
    formatTemplateCurrency,
    parseTemplateItems,
} from "@/services/quote-templates";
import { Ionicons } from "@expo/vector-icons";
import { useCallback } from "react";
import { Text, View } from "react-native";

type DetailItem = { label: string; value: string };
type Row = Record<string, unknown>;

export default function QuoteTemplatesScreen() {
  const { user } = useAuth();
  const tintColor = useThemeColor({}, "tint");
  const tenantId = user?.tenant_id ?? "";

  /* ─── Fields ─── */

  const fields: CrudFieldConfig<Row>[] = [
    {
      key: "name",
      label: "Nome do Template",
      placeholder: "Ex: Consulta Padrão",
      required: true,
      visibleInList: true,
      visibleInForm: true,
    },
    {
      key: "description",
      label: "Descrição",
      type: "multiline",
      placeholder: "Descrição do template de orçamento",
      visibleInList: false,
      visibleInForm: true,
    },
    {
      key: "items",
      label: "Itens do Template (JSON)",
      type: "json",
      placeholder: '[{"description":"Serviço","quantity":1,"unit_price":100}]',
      visibleInList: false,
      visibleInForm: true,
      section: "Itens",
      jsonTemplate: [{ description: "", quantity: 1, unit_price: 0 }] as any,
    },
    {
      key: "default_discount",
      label: "Desconto Padrão (R$)",
      type: "currency",
      placeholder: "0,00",
      visibleInList: false,
      visibleInForm: true,
      section: "Valores Padrão",
    },
    {
      key: "default_valid_days",
      label: "Validade (dias)",
      type: "number",
      placeholder: "30",
      visibleInList: false,
      visibleInForm: true,
    },
    {
      key: "default_notes",
      label: "Observações Padrão",
      type: "multiline",
      placeholder: "Condições de pagamento, termos...",
      visibleInList: false,
      visibleInForm: true,
    },
    {
      key: "is_package",
      label: "É Pacote (Multi-opção)",
      type: "boolean",
      visibleInList: true,
      visibleInForm: true,
      section: "Pacote",
    },
    {
      key: "package_name",
      label: "Nome do Pacote",
      placeholder: "Ex: Básico, Premium, Enterprise",
      visibleInList: false,
      visibleInForm: true,
      showWhen: (state) =>
        state.is_package === "true" || state.is_package === "1",
    },
    {
      key: "package_description",
      label: "Descrição do Pacote",
      type: "multiline",
      placeholder: "O que este pacote inclui?",
      visibleInList: false,
      visibleInForm: true,
      showWhen: (state) =>
        state.is_package === "true" || state.is_package === "1",
    },
    {
      key: "sort_order",
      label: "Ordem de Exibição",
      type: "number",
      placeholder: "0",
      visibleInList: false,
      visibleInForm: true,
    },
    {
      key: "is_active",
      label: "Ativo",
      type: "boolean",
      visibleInList: true,
      visibleInForm: true,
    },
  ];

  /* ─── CRUD Handlers ─── */

  const loadItems = useCallback(async (): Promise<Row[]> => {
    if (!tenantId) return [];
    try {
      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "quote_templates",
        ...buildSearchParams([{ field: "tenant_id", value: tenantId }], {
          sortColumn: "sort_order ASC, created_at DESC",
        }),
      });
      return normalizeCrudList(res.data).filter(
        (r: Row) => !r.deleted_at,
      ) as Row[];
    } catch {
      // Table may not exist yet — return empty list gracefully
      return [];
    }
  }, [tenantId]);

  const createItem = useCallback(
    async (payload: Row) => {
      // Ensure items is valid JSON string
      let itemsStr = String(payload.items ?? "[]");
      try {
        JSON.parse(itemsStr);
      } catch {
        itemsStr = "[]";
      }

      return api.post(CRUD_ENDPOINT, {
        action: "create",
        table: "quote_templates",
        payload: {
          ...payload,
          tenant_id: tenantId,
          items: itemsStr,
        },
      });
    },
    [tenantId],
  );

  const updateItem = useCallback(async (payload: Row) => {
    const updates: Record<string, unknown> = { ...payload };
    // Validate items JSON
    if (payload.items) {
      try {
        JSON.parse(String(payload.items));
      } catch {
        updates.items = "[]";
      }
    }
    return api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "quote_templates",
      payload: updates,
    });
  }, []);

  const deleteItem = useCallback(async (payload: Row) => {
    return api.post(CRUD_ENDPOINT, {
      action: "delete",
      table: "quote_templates",
      payload: {
        id: payload.id,
        deleted_at: new Date().toISOString(),
      },
    });
  }, []);

  /* ─── Details / Actions ─── */

  const getDetails = useCallback((item: Row): DetailItem[] => {
    const details: DetailItem[] = [];

    // Parse items and calculate total
    const items = parseTemplateItems(item.items as string);
    const { subtotal, discount, total } = calculateTemplateTotal(
      items,
      Number(item.default_discount ?? 0),
    );

    details.push({ label: "Itens", value: String(items.length) });
    if (subtotal > 0) {
      details.push({
        label: "Subtotal",
        value: formatTemplateCurrency(subtotal),
      });
    }
    if (discount > 0) {
      details.push({
        label: "Desconto",
        value: formatTemplateCurrency(discount),
      });
    }
    if (total > 0) {
      details.push({ label: "Total", value: formatTemplateCurrency(total) });
    }

    const validDays = Number(item.default_valid_days ?? 30);
    details.push({ label: "Validade", value: `${validDays} dias` });

    if (item.description) {
      details.push({
        label: "Descrição",
        value: String(item.description),
      });
    }

    return details;
  }, []);

  const renderItemActions = useCallback(
    (item: Row) => {
      const active = item.is_active === true || item.is_active === "true";
      const isPkg = item.is_package === true || item.is_package === "true";
      const items = parseTemplateItems(item.items as string);
      const { total } = calculateTemplateTotal(
        items,
        Number(item.default_discount ?? 0),
      );

      return (
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {/* Active badge */}
          <View
            style={{
              backgroundColor: active ? "#22c55e20" : "#94a3b820",
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 8,
            }}
          >
            <Text
              style={{
                color: active ? "#22c55e" : "#94a3b8",
                fontSize: 11,
                fontWeight: "600",
              }}
            >
              {active ? "Ativo" : "Inativo"}
            </Text>
          </View>

          {/* Package badge */}
          {isPkg ? (
            <View
              style={{
                backgroundColor: "#8b5cf620",
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 8,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Ionicons name="layers-outline" size={12} color="#8b5cf6" />
              <Text
                style={{ color: "#8b5cf6", fontSize: 11, fontWeight: "600" }}
              >
                Pacote
              </Text>
            </View>
          ) : null}

          {/* Items count + total */}
          <View
            style={{
              backgroundColor: tintColor + "15",
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 8,
            }}
          >
            <Text style={{ color: tintColor, fontSize: 11, fontWeight: "600" }}>
              {items.length} itens
              {total > 0 ? ` • ${formatTemplateCurrency(total)}` : ""}
            </Text>
          </View>
        </View>
      );
    },
    [tintColor],
  );

  return (
    <CrudScreen<Row>
      title="Templates de Orçamento"
      subtitle="Modelos reutilizáveis para criar orçamentos rapidamente"
      searchPlaceholder="Buscar por nome..."
      searchFields={["name", "package_name"]}
      fields={fields}
      loadItems={loadItems}
      createItem={createItem}
      updateItem={updateItem}
      deleteItem={deleteItem}
      getId={(item) => String(item.id)}
      getTitle={(item) => String(item.package_name || item.name || "Template")}
      getDetails={getDetails}
      renderItemActions={renderItemActions}
    />
  );
}
