/**
 * Vendas Admin — Full sales management
 *
 * CrudScreen showing all sales for the tenant.
 * Supports cancel action per sale. Sales are created from PDV, not here.
 */

import { ThemedText } from "@/components/themed-text";
import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import { cancelSale } from "@/services/sales";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo, useState } from "react";
import { Alert, TouchableOpacity, View } from "react-native";

type Row = Record<string, unknown>;

const STATUS_LABELS: Record<string, string> = {
  open: "Aberta",
  completed: "Concluída",
  cancelled: "Cancelada",
  refunded: "Estornada",
  partial_refund: "Estorno Parcial",
};

const fmt = (v: unknown) => {
  const n = Number(v);
  if (!n && n !== 0) return "-";
  return `R$ ${n.toFixed(2).replace(".", ",")}`;
};

export default function VendasAdminScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const errorColor = "#ef4444";

  const [reloadKey, setReloadKey] = useState(0);

  const loadItems = useMemo(() => {
    return async (): Promise<Row[]> => {
      const filters = tenantId ? [{ field: "tenant_id", value: tenantId }] : [];
      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "sales",
        ...buildSearchParams(filters, {
          sortColumn: "created_at DESC",
          autoExcludeDeleted: true,
        }),
      });
      return normalizeCrudList<Row>(res.data);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, reloadKey]);

  const handleCancel = useCallback(
    async (saleId: string) => {
      Alert.alert(
        "Cancelar Venda",
        "Tem certeza? O estoque será estornado e a fatura cancelada.",
        [
          { text: "Não", style: "cancel" },
          {
            text: "Sim, Cancelar",
            style: "destructive",
            onPress: async () => {
              try {
                await cancelSale(
                  saleId,
                  "Cancelamento manual pelo admin",
                  user?.id,
                );
                setReloadKey((k) => k + 1);
              } catch (err: any) {
                Alert.alert("Erro", err?.message ?? "Falha ao cancelar venda.");
              }
            },
          },
        ],
      );
    },
    [user?.id],
  );

  // Sales created from PDV — update only for admin edits
  const noop = async () => {
    throw new Error("Use o PDV para criar vendas");
  };

  const updateSale = useMemo(() => {
    return async (payload: Partial<Row> & { id?: string | null }) => {
      if (!payload.id) throw new Error("Id obrigatório");
      const response = await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "sales",
        payload,
      });
      return response.data;
    };
  }, []);

  const fields: CrudFieldConfig<Row>[] = [
    { key: "id", label: "Id", visibleInForm: false },
    {
      key: "customer_id",
      label: "Cliente",
      type: "reference",
      referenceTable: "customers",
      referenceLabelField: "name",
      referenceSearchField: "name",
      referenceIdField: "id",
      visibleInList: true,
      readOnly: true,
    },
    {
      key: "partner_id",
      label: "Parceiro",
      type: "reference",
      referenceTable: "partners",
      referenceLabelField: "name",
      referenceSearchField: "name",
      referenceIdField: "id",
      visibleInList: true,
      readOnly: true,
    },
    {
      key: "sold_by_user_id",
      label: "Vendedor",
      type: "reference",
      referenceTable: "users",
      referenceLabelField: "name",
      referenceSearchField: "name",
      referenceIdField: "id",
      readOnly: true,
    },
    {
      key: "total",
      label: "Total",
      type: "currency",
      readOnly: true,
      visibleInList: true,
    },
    {
      key: "subtotal",
      label: "Subtotal",
      type: "currency",
      readOnly: true,
    },
    {
      key: "discount_amount",
      label: "Desconto",
      type: "currency",
      readOnly: true,
    },
    {
      key: "discount_percent",
      label: "Desc. %",
      type: "number",
      readOnly: true,
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: Object.entries(STATUS_LABELS).map(([v, l]) => ({
        value: v,
        label: l,
      })),
      visibleInList: true,
      readOnly: true,
    },
    {
      key: "payment_method",
      label: "Método de Pagamento",
      readOnly: true,
      visibleInList: true,
    },
    {
      key: "has_pending_services",
      label: "Serviços Pendentes",
      type: "boolean",
      readOnly: true,
    },
    {
      key: "has_pending_products",
      label: "Produtos Pendentes",
      type: "boolean",
      readOnly: true,
    },
    {
      key: "invoice_id",
      label: "Fatura",
      type: "reference",
      referenceTable: "invoices",
      referenceLabelField: "title",
      referenceSearchField: "title",
      referenceIdField: "id",
      readOnly: true,
    },
    {
      key: "discount_approved_by",
      label: "Desconto Aprov. por",
      type: "reference",
      referenceTable: "users",
      referenceLabelField: "name",
      referenceSearchField: "name",
      referenceIdField: "id",
      readOnly: true,
    },
    {
      key: "notes",
      label: "Observações",
      type: "multiline",
    },
    {
      key: "created_at",
      label: "Data",
      type: "datetime",
      readOnly: true,
      visibleInList: true,
    },
  ];

  return (
    <CrudScreen<Row>
      title="Vendas"
      subtitle="Todas as vendas do tenant"
      searchPlaceholder="Buscar venda..."
      searchFields={["customer_id", "partner_id", "status", "payment_method"]}
      fields={fields}
      loadItems={loadItems}
      createItem={noop}
      updateItem={updateSale}
      getDetails={(item) => {
        const status = String(item.status ?? "");
        return [
          { label: "Total", value: fmt(item.total) },
          { label: "Subtotal", value: fmt(item.subtotal) },
          { label: "Desconto", value: fmt(item.discount_amount) },
          { label: "Status", value: STATUS_LABELS[status] ?? status },
          { label: "Pagamento", value: String(item.payment_method ?? "-") },
          {
            label: "Serviços pend.",
            value: item.has_pending_services ? "Sim" : "Não",
          },
          {
            label: "Produtos pend.",
            value: item.has_pending_products ? "Sim" : "Não",
          },
        ];
      }}
      renderItemActions={(item) => {
        const status = String(item.status ?? "");
        const canCancel = status === "completed" || status === "open";

        return (
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {canCancel && (
              <TouchableOpacity
                onPress={() => handleCancel(String(item.id))}
                style={{
                  borderWidth: 1,
                  borderColor: errorColor,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Ionicons
                  name="close-circle-outline"
                  size={14}
                  color={errorColor}
                />
                <ThemedText
                  style={{ color: errorColor, fontWeight: "700", fontSize: 12 }}
                >
                  Cancelar
                </ThemedText>
              </TouchableOpacity>
            )}
          </View>
        );
      }}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => {
        const id = String(item.id ?? "").slice(0, 8);
        const status = String(item.status ?? "");
        const label = STATUS_LABELS[status] ?? status;
        return `#${id} — ${label} — ${fmt(item.total)}`;
      }}
    />
  );
}
