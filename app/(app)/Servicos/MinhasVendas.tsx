/**
 * Minhas Vendas — Partner-facing sales list
 *
 * CrudScreen showing sales made by the current user/partner.
 * Read-only for partners (no create/delete from here — sales are created via PDV).
 */

import { ThemedText } from "@/components/themed-text";
import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { usePartnerScope } from "@/hooks/use-partner-scope";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { TouchableOpacity, View } from "react-native";

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

export default function MinhasVendasScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { partnerId, isPartnerUser } = usePartnerScope();
  const tenantId = user?.tenant_id;
  const tintColor = useThemeColor({}, "tint");
  const borderColor = useThemeColor({}, "border");

  const loadItems = useMemo(() => {
    return async (): Promise<Row[]> => {
      const filters = [
        ...(tenantId ? [{ field: "tenant_id", value: tenantId }] : []),
      ];

      // Partner scoping: show only their sales
      if (isPartnerUser && partnerId) {
        filters.push({ field: "partner_id", value: partnerId });
      } else {
        // Non-partner: show sales by this user
        if (user?.id) {
          filters.push({ field: "sold_by_user_id", value: user.id });
        }
      }

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
  }, [tenantId, partnerId, isPartnerUser, user?.id]);

  // Sales are created from PDV — no create/delete here
  const noop = async () => {
    throw new Error("Use o PDV para criar vendas");
  };

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
      readOnly: true,
      visibleInList: true,
    },
    {
      key: "total",
      label: "Total",
      type: "currency",
      readOnly: true,
      visibleInList: true,
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: Object.entries(STATUS_LABELS).map(([v, l]) => ({
        value: v,
        label: l,
      })),
      readOnly: true,
      visibleInList: true,
    },
    {
      key: "payment_method",
      label: "Pagamento",
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
      key: "discount_amount",
      label: "Desconto",
      type: "currency",
      readOnly: true,
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
      title="Minhas Vendas"
      subtitle="Vendas realizadas por você"
      searchPlaceholder="Buscar venda..."
      searchFields={["customer_id", "status", "payment_method"]}
      fields={fields}
      loadItems={loadItems}
      createItem={noop}
      updateItem={noop}
      getDetails={(item) => [
        { label: "Total", value: fmt(item.total) },
        {
          label: "Status",
          value: STATUS_LABELS[String(item.status)] ?? String(item.status),
        },
        { label: "Subtotal", value: fmt(item.subtotal) },
        { label: "Desconto", value: fmt(item.discount_amount) },
        { label: "Pagamento", value: String(item.payment_method ?? "-") },
        {
          label: "Serviços pend.",
          value: item.has_pending_services ? "Sim" : "Não",
        },
        {
          label: "Produtos pend.",
          value: item.has_pending_products ? "Sim" : "Não",
        },
      ]}
      renderItemActions={(item) => (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: "/Administrador/Vendas" as any,
                params: { saleId: String(item.id) },
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
              Detalhes
            </ThemedText>
          </TouchableOpacity>
        </View>
      )}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => {
        const id = String(item.id ?? "").slice(0, 8);
        const status =
          STATUS_LABELS[String(item.status)] ?? String(item.status);
        return `#${id} — ${status}`;
      }}
    />
  );
}
