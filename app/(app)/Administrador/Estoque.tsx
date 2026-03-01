/**
 * Estoque — Admin screen
 *
 * CrudScreen showing current stock position for all items with track_stock=true.
 * Read-only list — stock changes come from sales, purchases, and manual adjustments.
 * Low-stock items highlighted with a warning indicator.
 * Recalculate button ensures stock_quantity matches the sum of all movements.
 */

import { ThemedText } from "@/components/themed-text";
import type { CrudScreenHandle } from "@/components/ui/CrudScreen";
import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
  buildSearchParams,
  CRUD_ENDPOINT,
  normalizeCrudList,
} from "@/services/crud";
import { adjustStock, recalculateStockFromMovements } from "@/services/stock";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type Row = Record<string, unknown>;

const fmt = (v: unknown) => {
  const n = Number(v);
  if (!n && n !== 0) return "-";
  return `R$ ${n.toFixed(2).replace(".", ",")}`;
};

export default function EstoqueScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const tenantId = user?.tenant_id;
  const tintColor = useThemeColor({}, "tint");
  const borderColor = useThemeColor({}, "border");
  const warningColor = "#f59e0b";

  const crudRef = useRef<CrudScreenHandle | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const loadItems = useMemo(() => {
    return async (): Promise<Row[]> => {
      const filters = [
        ...(tenantId ? [{ field: "tenant_id", value: tenantId }] : []),
        { field: "track_stock", value: "true", operator: "equal" as const },
      ];
      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "services",
        ...buildSearchParams(filters, {
          sortColumn: "name ASC",
          autoExcludeDeleted: true,
        }),
      });
      return normalizeCrudList<Row>(res.data);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, reloadKey]);

  const handleRecalculate = useCallback(async () => {
    if (!tenantId) return;
    setRecalculating(true);
    try {
      const result = await recalculateStockFromMovements(tenantId);
      const msg =
        result.corrected > 0
          ? `${result.recalculated} itens verificados, ${result.corrected} corrigido(s).`
          : `${result.recalculated} itens verificados. Estoque já está correto.`;
      Alert.alert("Recálculo concluído", msg);
      setReloadKey((k) => k + 1);
    } catch (err: any) {
      Alert.alert("Erro", err?.message ?? "Falha ao recalcular estoque.");
    } finally {
      setRecalculating(false);
    }
  }, [tenantId]);

  // Read-only — no create/delete.
  // Only adjustments via renderItemActions.
  const noop = async () => {
    throw new Error("Use Ajuste de Estoque para modificar quantidades");
  };

  const updateStock = useMemo(() => {
    return async (payload: Partial<Row> & { id?: string | null }) => {
      if (!payload.id) throw new Error("Id obrigatório");
      const response = await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "services",
        payload: { id: payload.id, min_stock: payload.min_stock },
      });
      return response.data;
    };
  }, []);

  const handleAdjust = useCallback(
    (item: Row) => {
      const doAdjust = async (newQty: number) => {
        const current = Number(item.stock_quantity ?? 0);
        const delta = newQty - current;
        if (delta === 0) return;
        try {
          await adjustStock(
            String(item.id),
            tenantId ?? "",
            delta,
            "Ajuste manual via tela de Estoque",
            user?.id,
          );
          setReloadKey((k) => k + 1);
        } catch (err: any) {
          Alert.alert("Erro", err?.message ?? "Falha no ajuste.");
        }
      };

      if (typeof Alert.prompt === "function") {
        Alert.prompt(
          "Ajuste de Estoque",
          `${item.name}: saldo atual ${item.stock_quantity ?? 0}.\nDigite a NOVA quantidade:`,
          (text) => {
            const newQty = parseFloat(text);
            if (isNaN(newQty) || newQty < 0) return;
            doAdjust(newQty);
          },
          "plain-text",
          String(item.stock_quantity ?? 0),
          "numeric",
        );
      } else {
        // Web fallback
        const text = prompt(
          `${item.name}: nova quantidade (atual: ${item.stock_quantity ?? 0}):`,
          String(item.stock_quantity ?? 0),
        );
        if (!text) return;
        const newQty = parseFloat(text);
        if (isNaN(newQty) || newQty < 0) return;
        doAdjust(newQty);
      }
    },
    [user?.id, tenantId],
  );

  const fields: CrudFieldConfig<Row>[] = [
    { key: "id", label: "Id", visibleInForm: false },
    {
      key: "name",
      label: "Item",
      readOnly: true,
      visibleInList: true,
    },
    {
      key: "sku",
      label: "SKU",
      readOnly: true,
      visibleInList: true,
    },
    {
      key: "item_kind",
      label: "Tipo",
      type: "select",
      options: [
        { label: "Produto", value: "product" },
        { label: "Serviço", value: "service" },
      ],
      readOnly: true,
      visibleInList: true,
    },
    {
      key: "stock_quantity",
      label: "Qtd. em Estoque",
      type: "number",
      readOnly: true,
      visibleInList: true,
    },
    {
      key: "min_stock",
      label: "Estoque Mínimo",
      type: "number",
      visibleInList: true,
    },
    {
      key: "cost_price",
      label: "Custo Unitário",
      type: "currency",
      readOnly: true,
    },
    {
      key: "sell_price",
      label: "Preço Venda",
      type: "currency",
      readOnly: true,
    },
  ];

  return (
    <CrudScreen<Row>
      title="Estoque"
      subtitle="Posição de estoque — todos os itens rastreados"
      searchPlaceholder="Buscar item..."
      searchFields={["name", "sku"]}
      fields={fields}
      loadItems={loadItems}
      createItem={noop}
      updateItem={updateStock}
      controlRef={crudRef}
      headerActions={
        <TouchableOpacity
          onPress={handleRecalculate}
          disabled={recalculating}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            borderWidth: 1,
            borderColor: tintColor,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 8,
            opacity: recalculating ? 0.6 : 1,
          }}
        >
          {recalculating ? (
            <ActivityIndicator size="small" color={tintColor} />
          ) : (
            <Ionicons name="refresh-outline" size={16} color={tintColor} />
          )}
          <ThemedText
            style={{ color: tintColor, fontWeight: "700", fontSize: 13 }}
          >
            {recalculating ? "Recalculando..." : "Recalcular Estoque"}
          </ThemedText>
        </TouchableOpacity>
      }
      getDetails={(item) => {
        const qty = Number(item.stock_quantity ?? 0);
        const min = Number(item.min_stock ?? 0);
        const isLow = min > 0 && qty <= min;
        const kind = item.item_kind === "product" ? "Produto" : "Serviço";

        return [
          { label: "Item", value: String(item.name ?? "-") },
          { label: "SKU", value: String(item.sku ?? "-") },
          { label: "Tipo", value: kind },
          {
            label: "Estoque",
            value: `${qty}${isLow ? " ⚠️ BAIXO" : ""}`,
          },
          { label: "Mínimo", value: String(min) },
          { label: "Custo", value: fmt(item.cost_price) },
          { label: "Preço", value: fmt(item.sell_price) },
          {
            label: "Valor Total",
            value: fmt(qty * Number(item.cost_price ?? 0)),
          },
        ];
      }}
      renderItemActions={(item) => {
        const qty = Number(item.stock_quantity ?? 0);
        const min = Number(item.min_stock ?? 0);
        const isLow = min > 0 && qty <= min;

        return (
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            {isLow && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 3,
                  backgroundColor: warningColor + "18",
                  borderRadius: 12,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                }}
              >
                <Ionicons
                  name="warning-outline"
                  size={14}
                  color={warningColor}
                />
                <Text
                  style={{
                    color: warningColor,
                    fontSize: 11,
                    fontWeight: "600",
                  }}
                >
                  Baixo
                </Text>
              </View>
            )}
            <TouchableOpacity
              onPress={() => handleAdjust(item)}
              style={{
                borderWidth: 1,
                borderColor: tintColor,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Ionicons name="swap-horizontal" size={14} color={tintColor} />
              <ThemedText
                style={{ color: tintColor, fontWeight: "700", fontSize: 12 }}
              >
                Ajustar
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Administrador/MovimentacoesEstoque" as any,
                  params: { serviceId: String(item.id) },
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
                Histórico
              </ThemedText>
            </TouchableOpacity>
          </View>
        );
      }}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => {
        const qty = Number(item.stock_quantity ?? 0);
        const min = Number(item.min_stock ?? 0);
        const isLow = min > 0 && qty <= min;
        return `📦 ${item.name ?? "Item"} — ${qty} un${isLow ? " ⚠️" : ""}`;
      }}
    />
  );
}
