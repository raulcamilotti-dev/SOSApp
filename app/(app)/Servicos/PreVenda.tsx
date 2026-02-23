/**
 * Pré-Venda — Comanda / Tab System
 *
 * Beautiful custom screen for managing open tabs (comandas).
 * Operators open tabs, add items over time, and close at the PDV.
 *
 * Use cases:
 *   - Restaurants: mesa 5, garçom adds pratos/drinks
 *   - Pharmacies: receita, separating prescription items
 *   - Services: client appointment, accumulating services
 *
 * NOT a CrudScreen — fully custom UI.
 */

import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import {
    addPreSaleItem,
    cancelPreSale,
    listPreSaleItems,
    listPreSales,
    openPreSale,
    removePreSaleItem,
    updatePreSaleItem,
    type PreSale,
    type PreSaleItem,
} from "@/services/pre-sales";
import { createSale, type SaleItemInput } from "@/services/sales";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CatalogItem {
  id: string;
  name: string;
  description?: string;
  item_kind: "product" | "service";
  sell_price: number;
  cost_price: number;
  sku?: string;
  barcode?: string;
  is_active: boolean;
}

type PaymentMethodKey =
  | "pix"
  | "credit_card"
  | "debit_card"
  | "cash"
  | "a_prazo";
const PAYMENT_METHODS: {
  key: PaymentMethodKey;
  label: string;
  icon: string;
}[] = [
  { key: "pix", label: "PIX", icon: "qr-code-outline" },
  { key: "credit_card", label: "Crédito", icon: "card-outline" },
  { key: "debit_card", label: "Débito", icon: "card-outline" },
  { key: "cash", label: "Dinheiro", icon: "cash-outline" },
  { key: "a_prazo", label: "A Prazo", icon: "time-outline" },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const fmt = (n: number | string | null | undefined) =>
  `R$ ${Number(n || 0)
    .toFixed(2)
    .replace(".", ",")
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

const timeSince = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h${mins % 60 > 0 ? `${mins % 60}m` : ""}`;
  return `${Math.floor(hrs / 24)}d`;
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PreVendaScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id ?? "";
  const partnerId = (user as any)?.partner_id;
  const userId = user?.id ?? "";

  /* Theme */
  const bg = useThemeColor({}, "background");
  const cardBg = useThemeColor({ light: "#fff", dark: "#23283a" }, "card");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");
  const errorColor = "#ef4444";
  const successColor = "#22c55e";

  /* State — tabs list */
  const [tabs, setTabs] = useState<PreSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"open" | "closed" | "all">("open");

  /* State — new tab modal */
  const [showNewTab, setShowNewTab] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [creating, setCreating] = useState(false);

  /* State — active tab detail */
  const [activeTab, setActiveTab] = useState<PreSale | null>(null);
  const [activeItems, setActiveItems] = useState<PreSaleItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  /* State — add item modal */
  const [showAddItem, setShowAddItem] = useState(false);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [addingItem, setAddingItem] = useState<string | null>(null);

  /* State — close/checkout modal */
  const [showCheckout, setShowCheckout] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodKey>("pix");
  const [discountPercent, setDiscountPercent] = useState("");
  const [closing, setClosing] = useState(false);

  /* ---------------------------------------------------------------- */
  /*  Load tabs                                                        */
  /* ---------------------------------------------------------------- */

  const loadTabs = useCallback(async () => {
    if (!tenantId) return;
    try {
      const status = filter === "all" ? undefined : filter;
      const data = await listPreSales(tenantId, {
        status: status as any,
        partnerId: partnerId ?? undefined,
      });
      setTabs(data);
    } catch {
      // silent
    }
  }, [tenantId, partnerId, filter]);

  useEffect(() => {
    setLoading(true);
    loadTabs().finally(() => setLoading(false));
  }, [loadTabs]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTabs();
    setRefreshing(false);
  }, [loadTabs]);

  /* ---------------------------------------------------------------- */
  /*  Load catalog (for add items)                                     */
  /* ---------------------------------------------------------------- */

  const loadCatalog = useCallback(async () => {
    if (catalog.length > 0) return; // already loaded
    setLoadingCatalog(true);
    try {
      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "services",
        ...buildSearchParams(
          [
            { field: "tenant_id", value: tenantId },
            { field: "is_active", value: "true", operator: "equal" as const },
          ],
          { sortColumn: "name ASC", limit: 2000 },
        ),
      });
      const items = normalizeCrudList<Record<string, unknown>>(res.data)
        .filter((r) => !r.deleted_at)
        .map(
          (r) =>
            ({
              id: String(r.id),
              name: String(r.name ?? ""),
              description: r.description ? String(r.description) : undefined,
              item_kind: (r.item_kind as "product" | "service") ?? "service",
              sell_price: Number(r.sell_price ?? 0),
              cost_price: Number(r.cost_price ?? 0),
              sku: r.sku ? String(r.sku) : undefined,
              barcode: r.barcode ? String(r.barcode) : undefined,
              is_active: Boolean(r.is_active),
            }) as CatalogItem,
        );
      setCatalog(items);
    } catch {
      // silent
    } finally {
      setLoadingCatalog(false);
    }
  }, [tenantId, catalog.length]);

  const filteredCatalog = useMemo(() => {
    if (!catalogSearch.trim()) return catalog;
    const q = catalogSearch.toLowerCase();
    return catalog.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.sku?.toLowerCase().includes(q) ||
        c.barcode?.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q),
    );
  }, [catalog, catalogSearch]);

  /* ---------------------------------------------------------------- */
  /*  Tab detail                                                       */
  /* ---------------------------------------------------------------- */

  const openTabDetail = useCallback(async (tab: PreSale) => {
    setActiveTab(tab);
    setLoadingItems(true);
    try {
      const items = await listPreSaleItems(tab.id);
      setActiveItems(items);
    } catch {
      setActiveItems([]);
    } finally {
      setLoadingItems(false);
    }
  }, []);

  const refreshTabDetail = useCallback(async () => {
    if (!activeTab) return;
    try {
      const items = await listPreSaleItems(activeTab.id);
      setActiveItems(items);
      // Refresh the tab data too
      const allTabs = await listPreSales(tenantId, {
        status: filter === "all" ? undefined : (filter as any),
      });
      setTabs(allTabs);
      const updated = allTabs.find((t) => t.id === activeTab.id);
      if (updated) setActiveTab(updated);
    } catch {
      // silent
    }
  }, [activeTab, tenantId, filter]);

  /* ---------------------------------------------------------------- */
  /*  Create new tab                                                   */
  /* ---------------------------------------------------------------- */

  const handleCreateTab = useCallback(async () => {
    if (!newLabel.trim()) {
      Alert.alert(
        "Nome obrigatório",
        "Dê um nome à comanda (ex: Mesa 5, Balcão 2).",
      );
      return;
    }
    setCreating(true);
    try {
      const ps = await openPreSale({
        tenantId,
        label: newLabel.trim(),
        partnerId: partnerId ?? undefined,
        openedBy: userId,
        notes: newNotes.trim() || undefined,
      });
      setShowNewTab(false);
      setNewLabel("");
      setNewNotes("");
      await loadTabs();
      openTabDetail(ps);
    } catch (err: any) {
      Alert.alert("Erro", err?.message ?? "Não foi possível criar a comanda.");
    } finally {
      setCreating(false);
    }
  }, [
    newLabel,
    newNotes,
    tenantId,
    partnerId,
    userId,
    loadTabs,
    openTabDetail,
  ]);

  /* ---------------------------------------------------------------- */
  /*  Add item to active tab                                           */
  /* ---------------------------------------------------------------- */

  const handleAddItem = useCallback(
    async (catItem: CatalogItem) => {
      if (!activeTab) return;
      setAddingItem(catItem.id);
      try {
        // Check if item already exists → increment qty
        const existing = activeItems.find((i) => i.service_id === catItem.id);
        if (existing) {
          await updatePreSaleItem(
            existing.id,
            { quantity: existing.quantity + 1 },
            activeTab.id,
          );
        } else {
          await addPreSaleItem({
            preSaleId: activeTab.id,
            serviceId: catItem.id,
            itemKind: catItem.item_kind,
            description: catItem.name,
            quantity: 1,
            unitPrice: catItem.sell_price,
            costPrice: catItem.cost_price,
            addedBy: userId,
          });
        }
        await refreshTabDetail();
      } catch (err: any) {
        Alert.alert("Erro", err?.message ?? "Falha ao adicionar item.");
      } finally {
        setAddingItem(null);
      }
    },
    [activeTab, activeItems, userId, refreshTabDetail],
  );

  /* ---------------------------------------------------------------- */
  /*  Remove item                                                      */
  /* ---------------------------------------------------------------- */

  const handleRemoveItem = useCallback(
    async (item: PreSaleItem) => {
      if (!activeTab) return;

      const doRemove = async () => {
        try {
          await removePreSaleItem(item.id, activeTab.id);
          await refreshTabDetail();
        } catch {
          // silent
        }
      };

      if (Platform.OS === "web") {
        const ok = window.confirm(
          `Remover item?\n${item.description ?? "Item"} (${item.quantity}x)`,
        );
        if (ok) await doRemove();
      } else {
        Alert.alert(
          "Remover item?",
          `${item.description ?? "Item"} (${item.quantity}x)`,
          [
            { text: "Não", style: "cancel" },
            { text: "Remover", style: "destructive", onPress: doRemove },
          ],
        );
      }
    },
    [activeTab, refreshTabDetail],
  );

  /* ---------------------------------------------------------------- */
  /*  Quantity +/-                                                     */
  /* ---------------------------------------------------------------- */

  const handleChangeQty = useCallback(
    async (item: PreSaleItem, delta: number) => {
      if (!activeTab) return;
      const newQty = item.quantity + delta;
      if (newQty <= 0) {
        handleRemoveItem(item);
        return;
      }
      try {
        await updatePreSaleItem(item.id, { quantity: newQty }, activeTab.id);
        await refreshTabDetail();
      } catch {
        // silent
      }
    },
    [activeTab, refreshTabDetail, handleRemoveItem],
  );

  /* ---------------------------------------------------------------- */
  /*  Cancel tab                                                       */
  /* ---------------------------------------------------------------- */

  const handleCancelTab = useCallback(async () => {
    if (!activeTab) return;

    const doCancel = async () => {
      try {
        await cancelPreSale(activeTab.id, userId);
        setActiveTab(null);
        setActiveItems([]);
        await loadTabs();
      } catch {
        Alert.alert("Erro", "Não foi possível cancelar.");
      }
    };

    if (Platform.OS === "web") {
      // window.confirm is more reliable on web than Alert.alert with callbacks
      const ok = window.confirm(
        `Cancelar comanda?\n"${activeTab.label}" será cancelada.`,
      );
      if (ok) await doCancel();
    } else {
      Alert.alert("Cancelar comanda?", `"${activeTab.label}" será cancelada.`, [
        { text: "Não", style: "cancel" },
        { text: "Cancelar", style: "destructive", onPress: doCancel },
      ]);
    }
  }, [activeTab, userId, loadTabs]);

  /* ---------------------------------------------------------------- */
  /*  Close tab → create sale                                          */
  /* ---------------------------------------------------------------- */

  const handleCloseTab = useCallback(async () => {
    if (!activeTab || activeItems.length === 0) return;
    setClosing(true);
    try {
      const items: SaleItemInput[] = activeItems.map((i) => ({
        serviceId: i.service_id,
        quantity: i.quantity,
        unitPrice: i.unit_price,
        discountAmount: i.discount_amount ?? 0,
      }));

      const discPct = parseFloat(discountPercent) || 0;

      const result = await createSale({
        tenantId,
        partnerId: partnerId ?? undefined,
        soldByUserId: userId,
        customer: activeTab.customer_id ? { id: activeTab.customer_id } : {},
        items,
        discount: discPct > 0 ? { percent: discPct } : undefined,
        paymentMethod,
        notes: `Pré-venda: ${activeTab.label}`,
      });

      // Mark pre-sale as closed
      const { markPreSaleClosed } = await import("@/services/pre-sales");
      await markPreSaleClosed(activeTab.id, result.sale.id, userId);

      setShowCheckout(false);
      setActiveTab(null);
      setActiveItems([]);
      setDiscountPercent("");
      setPaymentMethod("pix");
      await loadTabs();

      Alert.alert(
        "✅ Venda concluída!",
        `Total: ${fmt(result.sale.total)}\nVenda #${result.sale.id.slice(0, 8)}`,
      );
    } catch (err: any) {
      Alert.alert(
        "Erro ao fechar",
        err?.message ?? "Não foi possível concluir a venda.",
      );
    } finally {
      setClosing(false);
    }
  }, [
    activeTab,
    activeItems,
    tenantId,
    partnerId,
    userId,
    paymentMethod,
    discountPercent,
    loadTabs,
  ]);

  /* ---------------------------------------------------------------- */
  /*  Computed                                                         */
  /* ---------------------------------------------------------------- */

  const activeSubtotal = useMemo(
    () => activeItems.reduce((s, i) => s + i.unit_price * i.quantity, 0),
    [activeItems],
  );

  const checkoutDiscount = useMemo(() => {
    const pct = parseFloat(discountPercent) || 0;
    return (activeSubtotal * pct) / 100;
  }, [activeSubtotal, discountPercent]);

  const checkoutTotal = useMemo(
    () => Math.max(0, activeSubtotal - checkoutDiscount),
    [activeSubtotal, checkoutDiscount],
  );

  const openCount = tabs.filter((t) => t.status === "open").length;

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  if (loading) {
    return (
      <ThemedView
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: bg,
        }}
      >
        <ActivityIndicator size="large" color={tintColor} />
      </ThemedView>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Tab card                                                         */
  /* ---------------------------------------------------------------- */

  const renderTabCard = ({ item: tab }: { item: PreSale }) => {
    const isOpen = tab.status === "open";
    const isCancelled = tab.status === "cancelled";
    const statusColors: Record<string, string> = {
      open: successColor,
      closed: tintColor,
      cancelled: errorColor,
    };
    const statusLabels: Record<string, string> = {
      open: "Aberta",
      closed: "Fechada",
      cancelled: "Cancelada",
    };

    return (
      <Pressable
        onPress={() => openTabDetail(tab)}
        style={({ pressed }) => ({
          backgroundColor: pressed ? tintColor + "12" : cardBg,
          borderRadius: 14,
          padding: 16,
          marginBottom: 10,
          borderWidth: 1,
          borderColor: isOpen ? successColor + "40" : borderColor,
          borderLeftWidth: 4,
          borderLeftColor: statusColors[tab.status] ?? borderColor,
          opacity: isCancelled ? 0.5 : 1,
        })}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: textColor, fontWeight: "700", fontSize: 16 }}>
              {tab.label}
            </Text>
            {tab.notes ? (
              <Text
                style={{ color: mutedColor, fontSize: 12, marginTop: 2 }}
                numberOfLines={1}
              >
                {tab.notes}
              </Text>
            ) : null}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <View
              style={{
                backgroundColor:
                  (statusColors[tab.status] ?? mutedColor) + "20",
                borderRadius: 10,
                paddingHorizontal: 8,
                paddingVertical: 2,
              }}
            >
              <Text
                style={{
                  color: statusColors[tab.status] ?? mutedColor,
                  fontSize: 11,
                  fontWeight: "700",
                }}
              >
                {statusLabels[tab.status] ?? tab.status}
              </Text>
            </View>
          </View>
        </View>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 10,
          }}
        >
          <Text style={{ color: mutedColor, fontSize: 12 }}>
            ⏱ {tab.created_at ? timeSince(tab.created_at) : "—"}
          </Text>
          <Text style={{ color: tintColor, fontWeight: "700", fontSize: 16 }}>
            {fmt(tab.total)}
          </Text>
        </View>
      </Pressable>
    );
  };

  /* ---------------------------------------------------------------- */
  /*  Tab detail view                                                  */
  /* ---------------------------------------------------------------- */

  const tabDetailView = activeTab && (
    <Modal
      visible={!!activeTab}
      animationType="slide"
      transparent
      onRequestClose={() => setActiveTab(null)}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.4)",
          justifyContent: "flex-end",
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{
            backgroundColor: bg,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: "92%",
            minHeight: "60%",
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: borderColor,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{ color: textColor, fontWeight: "700", fontSize: 18 }}
              >
                📋 {activeTab.label}
              </Text>
              <Text style={{ color: mutedColor, fontSize: 12 }}>
                {activeTab.created_at
                  ? `Aberta há ${timeSince(activeTab.created_at)}`
                  : ""}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setActiveTab(null)}>
              <Ionicons name="close-circle" size={28} color={mutedColor} />
            </TouchableOpacity>
          </View>

          {/* Items list */}
          <ScrollView style={{ flex: 1, padding: 16 }}>
            {loadingItems ? (
              <ActivityIndicator color={tintColor} style={{ marginTop: 30 }} />
            ) : activeItems.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 40 }}>
                <Text style={{ fontSize: 40, marginBottom: 8 }}>📝</Text>
                <Text
                  style={{
                    color: mutedColor,
                    fontSize: 14,
                    textAlign: "center",
                  }}
                >
                  Comanda vazia{"\n"}Adicione itens para começar
                </Text>
              </View>
            ) : (
              activeItems.map((item) => {
                const itemTotal = item.unit_price * item.quantity;
                return (
                  <View
                    key={item.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 10,
                      borderBottomWidth: 1,
                      borderBottomColor: borderColor,
                      gap: 8,
                    }}
                  >
                    <Text style={{ fontSize: 18 }}>
                      {item.item_kind === "product" ? "📦" : "🔧"}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: textColor,
                          fontWeight: "600",
                          fontSize: 14,
                        }}
                        numberOfLines={1}
                      >
                        {item.description ?? "Item"}
                      </Text>
                      <Text style={{ color: mutedColor, fontSize: 12 }}>
                        {item.quantity}× {fmt(item.unit_price)} ={" "}
                        {fmt(itemTotal)}
                      </Text>
                    </View>

                    {activeTab.status === "open" && (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <TouchableOpacity
                          onPress={() => handleChangeQty(item, -1)}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 14,
                            backgroundColor: errorColor + "18",
                            justifyContent: "center",
                            alignItems: "center",
                          }}
                        >
                          <Ionicons
                            name="remove"
                            size={16}
                            color={errorColor}
                          />
                        </TouchableOpacity>
                        <Text
                          style={{
                            color: textColor,
                            fontWeight: "700",
                            fontSize: 14,
                            minWidth: 24,
                            textAlign: "center",
                          }}
                        >
                          {item.quantity}
                        </Text>
                        <TouchableOpacity
                          onPress={() => handleChangeQty(item, 1)}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 14,
                            backgroundColor: successColor + "18",
                            justifyContent: "center",
                            alignItems: "center",
                          }}
                        >
                          <Ionicons name="add" size={16} color={successColor} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleRemoveItem(item)}
                          style={{ marginLeft: 6 }}
                        >
                          <Ionicons
                            name="trash-outline"
                            size={18}
                            color={errorColor}
                          />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Footer — totals + actions */}
          {activeTab.status === "open" && (
            <View
              style={{
                padding: 16,
                borderTopWidth: 1,
                borderTopColor: borderColor,
                gap: 8,
              }}
            >
              {/* Subtotal */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ color: mutedColor, fontSize: 14 }}>
                  Subtotal
                </Text>
                <Text
                  style={{ color: textColor, fontWeight: "600", fontSize: 14 }}
                >
                  {fmt(activeSubtotal)}
                </Text>
              </View>

              {/* Total */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={{ color: textColor, fontWeight: "700", fontSize: 18 }}
                >
                  Total
                </Text>
                <Text
                  style={{ color: tintColor, fontWeight: "700", fontSize: 18 }}
                >
                  {fmt(activeTab.total)}
                </Text>
              </View>

              {/* Action buttons */}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                <TouchableOpacity
                  onPress={() => {
                    loadCatalog();
                    setCatalogSearch("");
                    setShowAddItem(true);
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: tintColor,
                    borderRadius: 12,
                    paddingVertical: 13,
                    alignItems: "center",
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <Ionicons name="add-circle" size={18} color="#fff" />
                  <Text
                    style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}
                  >
                    Adicionar Item
                  </Text>
                </TouchableOpacity>

                {activeItems.length > 0 && (
                  <TouchableOpacity
                    onPress={() => {
                      setDiscountPercent("");
                      setPaymentMethod("pix");
                      setShowCheckout(true);
                    }}
                    style={{
                      flex: 1,
                      backgroundColor: successColor,
                      borderRadius: 12,
                      paddingVertical: 13,
                      alignItems: "center",
                      flexDirection: "row",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <Ionicons name="checkmark-circle" size={18} color="#fff" />
                    <Text
                      style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}
                    >
                      Fechar Conta
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Cancel */}
              <TouchableOpacity
                onPress={handleCancelTab}
                style={{
                  alignSelf: "center",
                  paddingVertical: 6,
                  paddingHorizontal: 16,
                  marginTop: 2,
                }}
              >
                <Text
                  style={{ color: errorColor, fontSize: 13, fontWeight: "600" }}
                >
                  Cancelar Comanda
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Closed tab footer */}
          {activeTab.status !== "open" && (
            <View
              style={{
                padding: 16,
                borderTopWidth: 1,
                borderTopColor: borderColor,
                alignItems: "center",
              }}
            >
              <Text
                style={{ color: mutedColor, fontSize: 13, marginBottom: 8 }}
              >
                {activeTab.status === "closed"
                  ? `✅ Fechada — ${fmt(activeTab.total)}`
                  : "❌ Cancelada"}
              </Text>
              <TouchableOpacity
                onPress={() => setActiveTab(null)}
                style={{
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 10,
                  paddingVertical: 10,
                  paddingHorizontal: 24,
                }}
              >
                <Text style={{ color: textColor, fontWeight: "600" }}>
                  Fechar
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </KeyboardAvoidingView>

        {/* ── Add-item overlay (inside same modal) ── */}
        {showAddItem && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.4)",
              justifyContent: "flex-end",
            }}
          >
            <View
              style={{
                backgroundColor: bg,
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                maxHeight: "80%",
                minHeight: "50%",
              }}
            >
              {/* Header */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: borderColor,
                }}
              >
                <Text
                  style={{ color: textColor, fontWeight: "700", fontSize: 16 }}
                >
                  ➕ Adicionar Item
                </Text>
                <TouchableOpacity onPress={() => setShowAddItem(false)}>
                  <Ionicons name="close-circle" size={26} color={mutedColor} />
                </TouchableOpacity>
              </View>

              {/* Search */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: cardBg,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor,
                  paddingHorizontal: 12,
                  margin: 16,
                  marginBottom: 8,
                }}
              >
                <Ionicons name="search" size={18} color={mutedColor} />
                <TextInput
                  value={catalogSearch}
                  onChangeText={setCatalogSearch}
                  placeholder="Buscar produto ou serviço..."
                  placeholderTextColor={mutedColor}
                  style={{
                    flex: 1,
                    color: textColor,
                    paddingVertical: 10,
                    paddingHorizontal: 8,
                    fontSize: 14,
                  }}
                  autoCapitalize="none"
                />
                {catalogSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setCatalogSearch("")}>
                    <Ionicons
                      name="close-circle"
                      size={18}
                      color={mutedColor}
                    />
                  </TouchableOpacity>
                )}
              </View>

              {/* Catalog list */}
              {loadingCatalog ? (
                <ActivityIndicator
                  color={tintColor}
                  style={{ marginTop: 30 }}
                />
              ) : (
                <FlatList
                  data={filteredCatalog}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={{
                    paddingHorizontal: 16,
                    paddingBottom: 20,
                  }}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item: catItem }) => {
                    const isAdding = addingItem === catItem.id;
                    return (
                      <Pressable
                        onPress={() => !isAdding && handleAddItem(catItem)}
                        style={({ pressed }) => ({
                          backgroundColor: pressed ? tintColor + "18" : cardBg,
                          borderRadius: 10,
                          padding: 12,
                          marginBottom: 6,
                          borderWidth: 1,
                          borderColor: pressed ? tintColor + "40" : borderColor,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                          opacity: isAdding ? 0.5 : 1,
                        })}
                      >
                        <Text style={{ fontSize: 22 }}>
                          {catItem.item_kind === "product" ? "📦" : "🔧"}
                        </Text>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              color: textColor,
                              fontWeight: "600",
                              fontSize: 14,
                            }}
                            numberOfLines={1}
                          >
                            {catItem.name}
                          </Text>
                          <Text style={{ color: mutedColor, fontSize: 12 }}>
                            {fmt(catItem.sell_price)}
                            {catItem.sku ? ` | ${catItem.sku}` : ""}
                          </Text>
                        </View>
                        {isAdding ? (
                          <ActivityIndicator size="small" color={tintColor} />
                        ) : (
                          <Ionicons
                            name="add-circle"
                            size={24}
                            color={tintColor}
                          />
                        )}
                      </Pressable>
                    );
                  }}
                  ListEmptyComponent={
                    <Text
                      style={{
                        color: mutedColor,
                        textAlign: "center",
                        marginTop: 30,
                        fontSize: 14,
                      }}
                    >
                      Nenhum item encontrado
                    </Text>
                  }
                />
              )}
            </View>
          </View>
        )}

        {/* ── Checkout overlay (inside same modal) ── */}
        {showCheckout && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.5)",
              justifyContent: "center",
              alignItems: "center",
              padding: 20,
            }}
          >
            <View
              style={{
                backgroundColor: cardBg,
                borderRadius: 16,
                padding: 24,
                width: "100%",
                maxWidth: 420,
              }}
            >
              <Text
                style={{
                  color: textColor,
                  fontWeight: "700",
                  fontSize: 18,
                  marginBottom: 16,
                  textAlign: "center",
                }}
              >
                💰 Fechar Conta
              </Text>

              {activeTab && (
                <Text
                  style={{
                    color: mutedColor,
                    fontSize: 13,
                    textAlign: "center",
                    marginBottom: 12,
                  }}
                >
                  {activeTab.label} — {activeItems.length} ite
                  {activeItems.length === 1 ? "m" : "ns"}
                </Text>
              )}

              {/* Discount */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 12,
                  gap: 8,
                }}
              >
                <Text
                  style={{ color: textColor, fontWeight: "600", fontSize: 13 }}
                >
                  🏷️ Desconto %
                </Text>
                <TextInput
                  value={discountPercent}
                  onChangeText={setDiscountPercent}
                  placeholder="0"
                  placeholderTextColor={mutedColor}
                  keyboardType="decimal-pad"
                  style={{
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    color: textColor,
                    fontSize: 13,
                    width: 70,
                    textAlign: "center",
                  }}
                />
              </View>

              {/* Payment method */}
              <Text
                style={{
                  color: textColor,
                  fontWeight: "600",
                  fontSize: 13,
                  marginBottom: 6,
                }}
              >
                💳 Pagamento
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 6,
                  marginBottom: 16,
                }}
              >
                {PAYMENT_METHODS.map((pm) => {
                  const isActive = paymentMethod === pm.key;
                  return (
                    <Pressable
                      key={pm.key}
                      onPress={() => setPaymentMethod(pm.key)}
                      style={{
                        backgroundColor: isActive ? tintColor : "transparent",
                        borderRadius: 16,
                        paddingHorizontal: 12,
                        paddingVertical: 5,
                        borderWidth: 1,
                        borderColor: isActive ? tintColor : borderColor,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Ionicons
                        name={pm.icon as any}
                        size={14}
                        color={isActive ? "#fff" : mutedColor}
                      />
                      <Text
                        style={{
                          color: isActive ? "#fff" : mutedColor,
                          fontSize: 12,
                          fontWeight: "600",
                        }}
                      >
                        {pm.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Totals */}
              <View
                style={{
                  borderTopWidth: 1,
                  borderTopColor: borderColor,
                  paddingTop: 12,
                  gap: 4,
                  marginBottom: 16,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ color: mutedColor, fontSize: 13 }}>
                    Subtotal
                  </Text>
                  <Text style={{ color: textColor, fontSize: 13 }}>
                    {fmt(activeSubtotal)}
                  </Text>
                </View>
                {checkoutDiscount > 0 && (
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text style={{ color: errorColor, fontSize: 13 }}>
                      Desconto ({discountPercent}%)
                    </Text>
                    <Text style={{ color: errorColor, fontSize: 13 }}>
                      -{fmt(checkoutDiscount)}
                    </Text>
                  </View>
                )}
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text
                    style={{
                      color: textColor,
                      fontWeight: "700",
                      fontSize: 20,
                    }}
                  >
                    Total
                  </Text>
                  <Text
                    style={{
                      color: tintColor,
                      fontWeight: "700",
                      fontSize: 20,
                    }}
                  >
                    {fmt(checkoutTotal)}
                  </Text>
                </View>
              </View>

              {/* Buttons */}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity
                  onPress={() => setShowCheckout(false)}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 10,
                    paddingVertical: 12,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: textColor, fontWeight: "600" }}>
                    Voltar
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCloseTab}
                  disabled={closing}
                  style={{
                    flex: 1,
                    backgroundColor: successColor,
                    borderRadius: 10,
                    paddingVertical: 12,
                    alignItems: "center",
                    opacity: closing ? 0.6 : 1,
                  }}
                >
                  {closing ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={{ color: "#fff", fontWeight: "700" }}>
                      Confirmar Venda
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );

  /* ---------------------------------------------------------------- */
  /*  New tab modal                                                    */
  /* ---------------------------------------------------------------- */

  const newTabModal = (
    <Modal
      visible={showNewTab}
      animationType="fade"
      transparent
      onRequestClose={() => setShowNewTab(false)}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ width: "100%", maxWidth: 400 }}
        >
          <View
            style={{ backgroundColor: cardBg, borderRadius: 16, padding: 24 }}
          >
            <Text
              style={{
                color: textColor,
                fontWeight: "700",
                fontSize: 18,
                marginBottom: 16,
                textAlign: "center",
              }}
            >
              📋 Nova Comanda
            </Text>

            <Text
              style={{
                color: textColor,
                fontWeight: "600",
                fontSize: 13,
                marginBottom: 6,
              }}
            >
              Nome / Identificação *
            </Text>
            <TextInput
              value={newLabel}
              onChangeText={setNewLabel}
              placeholder="Ex: Mesa 5, Balcão 2, João Silva..."
              placeholderTextColor={mutedColor}
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 10,
                paddingHorizontal: 14,
                paddingVertical: 10,
                color: textColor,
                fontSize: 14,
                marginBottom: 12,
              }}
              autoFocus
            />

            <Text
              style={{
                color: textColor,
                fontWeight: "600",
                fontSize: 13,
                marginBottom: 6,
              }}
            >
              Observações
            </Text>
            <TextInput
              value={newNotes}
              onChangeText={setNewNotes}
              placeholder="Opcional..."
              placeholderTextColor={mutedColor}
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 10,
                paddingHorizontal: 14,
                paddingVertical: 10,
                color: textColor,
                fontSize: 14,
                marginBottom: 16,
              }}
              multiline
            />

            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={() => setShowNewTab(false)}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 10,
                  paddingVertical: 12,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: textColor, fontWeight: "600" }}>
                  Cancelar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCreateTab}
                disabled={creating}
                style={{
                  flex: 1,
                  backgroundColor: tintColor,
                  borderRadius: 10,
                  paddingVertical: 12,
                  alignItems: "center",
                  opacity: creating ? 0.6 : 1,
                }}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "700" }}>
                    Abrir Comanda
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );

  /* ---------------------------------------------------------------- */
  /*  Main layout                                                      */
  /* ---------------------------------------------------------------- */

  return (
    <ThemedView style={{ flex: 1, backgroundColor: bg }}>
      <View style={{ flex: 1, padding: 16 }}>
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 4,
          }}
        >
          <Text style={{ color: textColor, fontWeight: "bold", fontSize: 24 }}>
            📋 Pré-Venda
          </Text>
          <TouchableOpacity
            onPress={() => {
              setNewLabel("");
              setNewNotes("");
              setShowNewTab(true);
            }}
            style={{
              backgroundColor: tintColor,
              borderRadius: 12,
              paddingVertical: 10,
              paddingHorizontal: 16,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
              Nova Comanda
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={{ color: mutedColor, fontSize: 13, marginBottom: 12 }}>
          {openCount} comanda{openCount !== 1 ? "s" : ""} aberta
          {openCount !== 1 ? "s" : ""}
        </Text>

        {/* Filter chips */}
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 14 }}>
          {(
            [
              { key: "open", label: "Abertas", icon: "receipt-outline" },
              {
                key: "closed",
                label: "Fechadas",
                icon: "checkmark-circle-outline",
              },
              { key: "all", label: "Todas", icon: "list-outline" },
            ] as const
          ).map((f) => {
            const isActive = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={{
                  backgroundColor: isActive ? tintColor : "transparent",
                  borderRadius: 16,
                  paddingHorizontal: 14,
                  paddingVertical: 6,
                  borderWidth: 1,
                  borderColor: isActive ? tintColor : borderColor,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <Ionicons
                  name={f.icon}
                  size={14}
                  color={isActive ? "#fff" : mutedColor}
                />
                <Text
                  style={{
                    color: isActive ? "#fff" : mutedColor,
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Tabs list */}
        <FlatList
          data={tabs}
          keyExtractor={(item) => item.id}
          renderItem={renderTabCard}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingVertical: 60 }}>
              <Text style={{ fontSize: 48, marginBottom: 12 }}>📋</Text>
              <Text
                style={{ color: mutedColor, fontSize: 15, textAlign: "center" }}
              >
                {filter === "open"
                  ? "Nenhuma comanda aberta"
                  : filter === "closed"
                    ? "Nenhuma comanda fechada"
                    : "Nenhuma comanda encontrada"}
              </Text>
              {filter === "open" && (
                <TouchableOpacity
                  onPress={() => {
                    setNewLabel("");
                    setNewNotes("");
                    setShowNewTab(true);
                  }}
                  style={{
                    marginTop: 16,
                    backgroundColor: tintColor,
                    borderRadius: 12,
                    paddingVertical: 12,
                    paddingHorizontal: 24,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Ionicons name="add" size={18} color="#fff" />
                  <Text style={{ color: "#fff", fontWeight: "700" }}>
                    Abrir Primeira Comanda
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      </View>

      {/* Modals */}
      {newTabModal}
      {tabDetailView}
    </ThemedView>
  );
}
