/**
 * Lotes — Admin screen
 *
 * CrudScreen showing all stock batches (lots) with expiry dates.
 * Supports FEFO (First Expiry, First Out) visual indicators:
 * - Red highlight for items expiring within 7 days
 * - Gray/strikethrough for expired items
 * - Green for OK items
 *
 * Batches are created during purchase receiving (Compras.tsx).
 * This screen is read-only for core fields but allows editing notes.
 */

import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import { getExpiryAlerts } from "@/services/stock-batches";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";

type Row = Record<string, unknown>;

const fmtDate = (v: unknown): string => {
  if (!v) return "-";
  const d = new Date(String(v));
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
};

const fmtQty = (v: unknown): string => {
  const n = Number(v);
  if (isNaN(n)) return "0";
  return n.toLocaleString("pt-BR");
};

type ExpiryStatus = "expired" | "expiring_soon" | "ok" | "no_expiry";

const getExpiryStatus = (expiryDate: unknown): ExpiryStatus => {
  if (!expiryDate) return "no_expiry";
  const d = new Date(String(expiryDate));
  if (isNaN(d.getTime())) return "no_expiry";
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.floor(
    (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diff < 0) return "expired";
  if (diff <= 7) return "expiring_soon";
  return "ok";
};

const statusConfig: Record<
  ExpiryStatus,
  { label: string; color: string; bg: string; icon: string }
> = {
  expired: {
    label: "Vencido",
    color: "#6b7280",
    bg: "#f3f4f618",
    icon: "close-circle",
  },
  expiring_soon: {
    label: "Vence em breve",
    color: "#dc2626",
    bg: "#fee2e218",
    icon: "alert-circle",
  },
  ok: {
    label: "OK",
    color: "#16a34a",
    bg: "#dcfce718",
    icon: "checkmark-circle",
  },
  no_expiry: {
    label: "Sem validade",
    color: "#6b7280",
    bg: "#f3f4f618",
    icon: "remove-circle-outline",
  },
};

export default function LotesScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const params = useLocalSearchParams<{ serviceId?: string }>();
  const filterServiceId = params.serviceId ?? null;

  const [alertCount, setAlertCount] = useState<number>(0);

  // Product name cache (resolved from services table)
  const [productNames, setProductNames] = useState<Record<string, string>>({});

  const loadItems = useMemo(() => {
    return async (): Promise<Row[]> => {
      if (!tenantId) return [];

      const filters = [
        { field: "tenant_id", value: tenantId },
        ...(filterServiceId
          ? [{ field: "service_id", value: filterServiceId }]
          : []),
      ];

      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "stock_batches",
        ...buildSearchParams(filters, {
          sortColumn: "expiry_date ASC NULLS LAST",
          autoExcludeDeleted: true,
        }),
      });
      const batches = normalizeCrudList<Row>(res.data);

      // Resolve product names in batch
      const serviceIds = [
        ...new Set(
          batches.map((b) => String(b.service_id ?? "")).filter(Boolean),
        ),
      ];

      if (serviceIds.length > 0) {
        const CHUNK = 50;
        const names: Record<string, string> = {};
        for (let i = 0; i < serviceIds.length; i += CHUNK) {
          const chunk = serviceIds.slice(i, i + CHUNK);
          try {
            const svcRes = await api.post(CRUD_ENDPOINT, {
              action: "list",
              table: "services",
              ...buildSearchParams(
                [
                  {
                    field: "id",
                    value: chunk.join(","),
                    operator: "in" as const,
                  },
                ],
                { fields: ["id", "name", "sku"] },
              ),
            });
            const svcs = normalizeCrudList<Row>(svcRes.data);
            for (const s of svcs) {
              names[String(s.id)] = String(s.name ?? "");
            }
          } catch {
            // best effort
          }
        }
        setProductNames(names);

        // Enrich batches with product name for search
        return batches.map((b) => ({
          ...b,
          _product_name: names[String(b.service_id ?? "")] ?? "",
        }));
      }

      return batches;
    };
  }, [tenantId, filterServiceId]);

  const loadAlertCount = useCallback(async () => {
    if (!tenantId) return;
    try {
      const alerts = await getExpiryAlerts(tenantId, 7);
      setAlertCount(
        alerts.filter(
          (a) => a.status === "expired" || a.status === "expiring_soon",
        ).length,
      );
    } catch {
      // best effort
    }
  }, [tenantId]);

  // Load alerts on mount
  useMemo(() => {
    loadAlertCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const fields: CrudFieldConfig<Row>[] = [
    { key: "id", label: "Id", visibleInForm: false, visibleInList: false },
    {
      key: "batch_number",
      label: "Nº Lote",
      visibleInList: true,
      readOnly: true,
    },
    {
      key: "_product_name",
      label: "Produto",
      visibleInList: true,
      visibleInForm: false,
      readOnly: true,
    },
    {
      key: "service_id",
      label: "Produto",
      type: "reference",
      referenceTable: "services",
      referenceLabelField: "name",
      referenceSearchField: "name",
      visibleInList: false,
      readOnly: true,
    },
    {
      key: "expiry_date",
      label: "Validade",
      type: "date",
      visibleInList: true,
      readOnly: true,
    },
    {
      key: "quantity",
      label: "Quantidade",
      type: "number",
      visibleInList: true,
      readOnly: true,
    },
    {
      key: "purchase_order_id",
      label: "Pedido de Compra",
      type: "reference",
      referenceTable: "purchase_orders",
      referenceLabelField: "order_number",
      referenceSearchField: "order_number",
      visibleInList: false,
      readOnly: true,
    },
    {
      key: "notes",
      label: "Observações",
      type: "multiline",
      visibleInList: false,
    },
  ];

  const noop = async () => {
    throw new Error("Lotes são criados no recebimento de compras");
  };

  const updateBatch = async (
    payload: Partial<Row> & { id?: string | null },
  ) => {
    if (!payload.id) throw new Error("Id obrigatório");
    const response = await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "stock_batches",
      payload: { id: payload.id, notes: payload.notes },
    });
    return response.data;
  };

  const deleteBatch = async (
    payload: Partial<Row> & { id?: string | null },
  ) => {
    if (!payload.id) throw new Error("Id obrigatório");
    const response = await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "stock_batches",
      payload: { id: payload.id, deleted_at: new Date().toISOString() },
    });
    return response.data;
  };

  return (
    <CrudScreen<Row>
      tableName="stock_batches"
      title="Lotes"
      subtitle={
        alertCount > 0
          ? `${alertCount} lote(s) vencido(s) ou próximo(s) do vencimento`
          : "Gestão de lotes e validades — FEFO"
      }
      searchPlaceholder="Buscar lote, produto..."
      searchFields={["batch_number", "_product_name", "notes"]}
      fields={fields}
      loadItems={loadItems}
      createItem={noop}
      updateItem={updateBatch}
      deleteItem={deleteBatch}
      hideAddButton
      getDetails={(item) => {
        const status = getExpiryStatus(item.expiry_date);
        const cfg = statusConfig[status];
        const productName = String(
          item._product_name ||
            productNames[String(item.service_id ?? "")] ||
            "-",
        );

        return [
          { label: "Lote", value: String(item.batch_number ?? "-") },
          { label: "Produto", value: productName },
          { label: "Quantidade", value: fmtQty(item.quantity) },
          {
            label: "Validade",
            value: item.expiry_date
              ? `${fmtDate(item.expiry_date)} — ${cfg.label}`
              : "Sem validade",
          },
          ...(item.notes ? [{ label: "Obs.", value: String(item.notes) }] : []),
        ];
      }}
      renderItemActions={(item) => {
        const status = getExpiryStatus(item.expiry_date);
        const cfg = statusConfig[status];
        const qty = Number(item.quantity ?? 0);

        return (
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            {/* Expiry status badge */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 3,
                backgroundColor: cfg.bg,
                borderRadius: 12,
                paddingHorizontal: 8,
                paddingVertical: 4,
              }}
            >
              <Ionicons name={cfg.icon as any} size={14} color={cfg.color} />
              <Text
                style={{
                  color: cfg.color,
                  fontSize: 11,
                  fontWeight: "600",
                }}
              >
                {cfg.label}
              </Text>
            </View>

            {/* Quantity badge */}
            {qty === 0 && (
              <View
                style={{
                  backgroundColor: "#6b728018",
                  borderRadius: 12,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                }}
              >
                <Text
                  style={{ color: "#6b7280", fontSize: 11, fontWeight: "600" }}
                >
                  Esgotado
                </Text>
              </View>
            )}
          </View>
        );
      }}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => {
        const status = getExpiryStatus(item.expiry_date);
        const emoji =
          status === "expired"
            ? "⛔"
            : status === "expiring_soon"
              ? "🔴"
              : status === "ok"
                ? "🟢"
                : "⚪";
        const productName = String(
          item._product_name ||
            productNames[String(item.service_id ?? "")] ||
            "Produto",
        );
        return `${emoji} Lote ${item.batch_number ?? "-"} — ${productName} (${fmtQty(item.quantity)} un)`;
      }}
    />
  );
}
