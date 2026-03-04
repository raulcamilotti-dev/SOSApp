/**
 * Stock Plugin — Kanban plugin for scope "stock".
 *
 * Manages sale fulfillment flow through the workflow engine.
 * Templates define steps like Pendente → Em Separação → Pronto → Entregue.
 *
 * Provides:
 * - View Items modal (list of sale_items with qty, price, separation status)
 * - Card actions: stock_view_items / stock_mark_ready
 * - onAfterMove → sync sale separation statuses when moved to "ready" step
 * - getCreateButton → null (sales are created via checkout flow)
 * - renderCard → sale-specific card with total, items count, channel badge
 */

import { spacing, typography } from "@/app/theme/styles";
import type { KanbanTheme } from "@/components/ui/KanbanScreen";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api, getApiErrorMessage } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import { markSeparationReady, type SaleItem } from "@/services/sales";
import { Ionicons } from "@expo/vector-icons";
import {
    forwardRef,
    useCallback,
    useImperativeHandle,
    useState,
    type ReactNode,
} from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

import type {
    KanbanPluginProps,
    KanbanPluginRef,
    PluginCardAction,
    UnifiedKanbanItem,
    WorkflowStep,
} from "./types";

/* ═══════════════════════════════════════════════════════
 * HELPERS
 * ═══════════════════════════════════════════════════════ */

const formatCurrency = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "-";
  const num =
    typeof value === "number"
      ? value
      : parseFloat(
          String(value)
            .replace(/[^\d.,-]/g, "")
            .replace(",", "."),
        );
  if (isNaN(num)) return "-";
  return num.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
};

const formatDate = (value: unknown): string => {
  if (!value) return "-";
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
};

/** Separation status display labels */
const SEPARATION_LABELS: Record<string, string> = {
  not_required: "Não requer",
  pending: "Pendente",
  in_progress: "Em Separação",
  ready: "Pronto",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

/** Separation status colors */
const SEPARATION_COLORS: Record<string, string> = {
  not_required: "#6b7280",
  pending: "#f59e0b",
  in_progress: "#3b82f6",
  ready: "#22c55e",
  delivered: "#10b981",
  cancelled: "#ef4444",
};

/** Check if a step is the "ready" type by name */
const isReadyStep = (step: WorkflowStep): boolean => {
  const n = step.name.toLowerCase();
  return n === "pronto" || n === "ready" || n.includes("pronto");
};

/* ═══════════════════════════════════════════════════════
 * COMPONENT
 * ═══════════════════════════════════════════════════════ */

export const StockPlugin = forwardRef<KanbanPluginRef, KanbanPluginProps>(
  function StockPlugin(props, ref) {
    const { userId, steps, onReload } = props;

    /* ── Theme ── */
    const tintColor = useThemeColor({}, "tint");
    const cardBg = useThemeColor({}, "card");
    const textColor = useThemeColor({}, "text");
    const mutedColor = useThemeColor({}, "muted");
    const borderColor = useThemeColor({}, "border");
    const bgColor = useThemeColor({}, "background");

    /* ── View Items Modal ── */
    const [itemsVisible, setItemsVisible] = useState(false);
    const [itemsSale, setItemsSale] = useState<UnifiedKanbanItem | null>(null);
    const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
    const [itemsLoading, setItemsLoading] = useState(false);
    const [markingReady, setMarkingReady] = useState<string | null>(null);

    /* ── Extract the sale entity from a UnifiedKanbanItem ── */
    const extractSale = useCallback(
      (item: UnifiedKanbanItem): Record<string, unknown> | null => {
        return item.entity ?? null;
      },
      [],
    );

    /* ── Load sale items ── */
    const loadSaleItems = useCallback(async (saleId: string) => {
      try {
        setItemsLoading(true);
        const res = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "sale_items",
          ...buildSearchParams([{ field: "sale_id", value: saleId }], {
            sortColumn: "sort_order ASC",
          }),
        });
        const items = normalizeCrudList<SaleItem>(res.data);
        setSaleItems(items);
      } catch {
        setSaleItems([]);
      } finally {
        setItemsLoading(false);
      }
    }, []);

    /* ── Open view items modal ── */
    const openItemsModal = useCallback(
      (item: UnifiedKanbanItem) => {
        const sale = extractSale(item);
        if (!sale?.id) {
          Alert.alert("Erro", "Venda não encontrada para este processo.");
          return;
        }
        setItemsSale(item);
        setItemsVisible(true);
        loadSaleItems(String(sale.id));
      },
      [extractSale, loadSaleItems],
    );

    /* ── Mark one sale_item as separation ready ── */
    const handleMarkItemReady = useCallback(
      async (saleItem: SaleItem) => {
        try {
          setMarkingReady(saleItem.id);
          await markSeparationReady(saleItem.id, userId);
          // Reload items
          if (itemsSale) {
            const sale = extractSale(itemsSale);
            if (sale?.id) {
              await loadSaleItems(String(sale.id));
            }
          }
          onReload();
        } catch (err) {
          Alert.alert(
            "Erro",
            getApiErrorMessage(err, "Falha ao marcar como pronto."),
          );
        } finally {
          setMarkingReady(null);
        }
      },
      [userId, itemsSale, extractSale, loadSaleItems, onReload],
    );

    /* ── Mark ALL pending/in_progress items as ready ── */
    const handleMarkAllReady = useCallback(async () => {
      const pendingItems = saleItems.filter(
        (si) =>
          si.separation_status === "pending" ||
          si.separation_status === "in_progress",
      );

      if (pendingItems.length === 0) {
        Alert.alert("Info", "Todos os itens já estão prontos.");
        return;
      }

      const confirm = await new Promise<boolean>((resolve) => {
        if (Platform.OS === "web") {
          resolve(
            window.confirm(
              `Marcar ${pendingItems.length} item(ns) como pronto?`,
            ),
          );
        } else {
          Alert.alert(
            "Confirmar",
            `Marcar ${pendingItems.length} item(ns) como pronto?`,
            [
              {
                text: "Cancelar",
                style: "cancel",
                onPress: () => resolve(false),
              },
              { text: "Confirmar", onPress: () => resolve(true) },
            ],
          );
        }
      });

      if (!confirm) return;

      try {
        setMarkingReady("__all");
        for (const si of pendingItems) {
          await markSeparationReady(si.id, userId);
        }
        // Reload items
        if (itemsSale) {
          const sale = extractSale(itemsSale);
          if (sale?.id) {
            await loadSaleItems(String(sale.id));
          }
        }
        onReload();
      } catch (err) {
        Alert.alert("Erro", getApiErrorMessage(err, "Falha ao marcar itens."));
      } finally {
        setMarkingReady(null);
      }
    }, [saleItems, userId, itemsSale, extractSale, loadSaleItems, onReload]);

    /* ═══════════════════════════════════════════════════════
     * IMPERATIVE HANDLE
     * ═══════════════════════════════════════════════════════ */

    useImperativeHandle(ref, () => ({
      getCardActions(
        item: UnifiedKanbanItem,
        stepId: string,
      ): PluginCardAction[] {
        const step = steps.find((s) => s.id === stepId);
        const isFinal = step?.is_terminal ?? false;
        const actions: PluginCardAction[] = [];

        // View items — always available
        actions.push({
          id: "stock_view_items",
          label: "Itens",
          icon: "list-outline",
          color: tintColor,
          onPress: () => openItemsModal(item),
        });

        // Mark ready — only on non-terminal, non-ready steps
        if (!isFinal && !isReadyStep(step!)) {
          actions.push({
            id: "stock_mark_ready",
            label: "Pronto",
            icon: "checkmark-circle-outline",
            color: "#22c55e",
            onPress: () => {
              // Mark all items ready + move to ready step
              const sale = extractSale(item);
              if (!sale?.id) return;

              setItemsSale(item);
              loadSaleItems(String(sale.id)).then(() => {
                // Open items modal so user can see/confirm
                setItemsVisible(true);
              });
            },
          });
        }

        return actions;
      },

      onCardPress(item: UnifiedKanbanItem) {
        // Open items modal on card press
        openItemsModal(item);
      },

      async onAfterMove(
        item: UnifiedKanbanItem,
        _fromStepId: string,
        toStepId: string,
        allSteps: WorkflowStep[],
      ) {
        const sale = extractSale(item);
        if (!sale?.id) return;
        const saleId = String(sale.id);

        const targetStep = allSteps.find((s) => s.id === toStepId);
        if (!targetStep) return;

        // If moved to a "ready" step → mark all pending items as ready
        if (isReadyStep(targetStep)) {
          try {
            // Load items for this sale
            const res = await api.post(CRUD_ENDPOINT, {
              action: "list",
              table: "sale_items",
              ...buildSearchParams([{ field: "sale_id", value: saleId }]),
            });
            const items = normalizeCrudList<SaleItem>(res.data);
            const pending = items.filter(
              (si) =>
                si.separation_status === "pending" ||
                si.separation_status === "in_progress",
            );

            for (const si of pending) {
              await markSeparationReady(si.id, userId);
            }
          } catch {
            // Non-fatal — move succeeded, bulk status sync failed
          }
        }

        // If moved to a terminal "delivered" step → mark all as delivered
        if (targetStep.is_terminal) {
          const n = targetStep.name.toLowerCase();
          if (n === "entregue" || n === "delivered" || n.includes("entreg")) {
            try {
              const res = await api.post(CRUD_ENDPOINT, {
                action: "list",
                table: "sale_items",
                ...buildSearchParams([{ field: "sale_id", value: saleId }]),
              });
              const items = normalizeCrudList<SaleItem>(res.data);

              for (const si of items) {
                if (si.separation_status !== "delivered") {
                  await api.post(CRUD_ENDPOINT, {
                    action: "update",
                    table: "sale_items",
                    payload: {
                      id: si.id,
                      separation_status: "delivered",
                      delivered_at: new Date().toISOString(),
                    },
                  });
                }
              }
            } catch {
              // Non-fatal sync
            }
          }
        }
      },

      getCreateButton() {
        // Sales are created via the checkout flow, not manually on the kanban
        return null;
      },

      renderCard(
        item: UnifiedKanbanItem,
        stepId: string,
        theme: KanbanTheme,
      ): ReactNode {
        const sale = extractSale(item);
        const step = steps.find((s) => s.id === stepId);
        const isFinal = step?.is_terminal ?? false;

        // Sale fields
        const total = sale ? formatCurrency(sale.total) : "-";
        const channel = sale?.channel ? String(sale.channel) : null;
        const paymentMethod = sale?.payment_method
          ? String(sale.payment_method)
          : null;
        const itemCount = sale?.item_count
          ? Number(sale.item_count)
          : undefined;
        const createdAt = formatDate(item.created_at ?? sale?.created_at);

        // Customer name from enrichment or sale
        const customerName =
          item.customer_name ??
          (sale?.customer_name ? String(sale.customer_name) : null);

        const actions =
          ref && typeof ref !== "function" && ref.current
            ? ref.current.getCardActions(item, stepId)
            : [];

        return (
          <TouchableOpacity
            key={item.id}
            style={[
              cs.card,
              { backgroundColor: theme.cardBg, borderColor: theme.borderColor },
            ]}
            onPress={() => openItemsModal(item)}
            activeOpacity={0.85}
          >
            {/* Header: Sale ID + Total */}
            <View style={cs.headerRow}>
              <View style={{ flex: 1 }}>
                <Text
                  style={[cs.cardTitle, { color: theme.textColor }]}
                  numberOfLines={1}
                >
                  {item.title ??
                    `Venda ${String(sale?.id ?? item.id).slice(0, 8)}…`}
                </Text>
                {customerName ? (
                  <Text
                    style={[cs.cardSubtitle, { color: theme.mutedColor }]}
                    numberOfLines={1}
                  >
                    {customerName}
                  </Text>
                ) : null}
              </View>
              <View style={[cs.totalBadge, { backgroundColor: "#22c55e20" }]}>
                <Text style={[cs.totalText, { color: "#22c55e" }]}>
                  {total}
                </Text>
              </View>
            </View>

            {/* Metadata rows */}
            {paymentMethod ? (
              <View style={cs.cardRow}>
                <Ionicons
                  name="card-outline"
                  size={12}
                  color={theme.mutedColor}
                />
                <Text
                  style={[cs.metaText, { color: theme.mutedColor }]}
                  numberOfLines={1}
                >
                  {paymentMethod}
                </Text>
              </View>
            ) : null}

            {/* Date + Items count row */}
            <View style={cs.badgeRow}>
              <View
                style={[
                  cs.badge,
                  { backgroundColor: theme.borderColor + "40" },
                ]}
              >
                <Ionicons
                  name="calendar-outline"
                  size={10}
                  color={theme.mutedColor}
                />
                <Text style={[cs.badgeText, { color: theme.mutedColor }]}>
                  {createdAt}
                </Text>
              </View>
              {itemCount !== undefined ? (
                <View
                  style={[
                    cs.badge,
                    { backgroundColor: theme.borderColor + "40" },
                  ]}
                >
                  <Ionicons
                    name="cube-outline"
                    size={10}
                    color={theme.mutedColor}
                  />
                  <Text style={[cs.badgeText, { color: theme.mutedColor }]}>
                    {itemCount} {itemCount === 1 ? "item" : "itens"}
                  </Text>
                </View>
              ) : null}
              {channel ? (
                <View style={[cs.badge, { backgroundColor: tintColor + "15" }]}>
                  <Text style={[cs.badgeText, { color: tintColor }]}>
                    {channel}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Action buttons */}
            {!isFinal && actions.length > 0 ? (
              <View style={cs.actionsRow}>
                {actions.map((action) => (
                  <TouchableOpacity
                    key={action.id}
                    style={[cs.actionBtn, { backgroundColor: action.color }]}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      action.onPress();
                    }}
                    disabled={action.disabled}
                  >
                    <Ionicons
                      name={action.icon as any}
                      size={12}
                      color="#fff"
                    />
                    <Text style={cs.actionBtnText}>{action.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </TouchableOpacity>
        );
      },
    }));

    /* ═══════════════════════════════════════════════════════
     * RENDER — Modals only (card is rendered via ref)
     * ═══════════════════════════════════════════════════════ */

    const hasPendingItems = saleItems.some(
      (si) =>
        si.separation_status === "pending" ||
        si.separation_status === "in_progress",
    );

    return (
      <>
        {/* ── View Items Modal ── */}
        <Modal
          visible={itemsVisible}
          transparent
          animationType="slide"
          onRequestClose={() => {
            setItemsVisible(false);
            setItemsSale(null);
            setSaleItems([]);
          }}
        >
          <View style={ms.modalOverlay}>
            <View style={[ms.modalSheet, { backgroundColor: cardBg }]}>
              {/* Header */}
              <View style={ms.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[ms.modalTitle, { color: textColor }]}>
                    Itens da Venda
                  </Text>
                  {itemsSale?.title ? (
                    <Text
                      style={[ms.modalSubtitle, { color: mutedColor }]}
                      numberOfLines={1}
                    >
                      {itemsSale.title}
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setItemsVisible(false);
                    setItemsSale(null);
                    setSaleItems([]);
                  }}
                >
                  <Ionicons name="close" size={24} color={mutedColor} />
                </TouchableOpacity>
              </View>

              {/* Loading */}
              {itemsLoading ? (
                <View style={{ padding: 24, alignItems: "center" }}>
                  <ActivityIndicator size="large" color={tintColor} />
                  <Text style={[ms.loadingText, { color: mutedColor }]}>
                    Carregando itens...
                  </Text>
                </View>
              ) : (
                <ScrollView
                  style={{ maxHeight: 400 }}
                  contentContainerStyle={{ paddingBottom: 8 }}
                >
                  {saleItems.length === 0 ? (
                    <Text
                      style={{
                        color: mutedColor,
                        textAlign: "center",
                        padding: 24,
                        fontStyle: "italic",
                      }}
                    >
                      Nenhum item encontrado.
                    </Text>
                  ) : (
                    saleItems.map((si) => {
                      const sepColor =
                        SEPARATION_COLORS[si.separation_status] ?? "#6b7280";
                      const sepLabel =
                        SEPARATION_LABELS[si.separation_status] ??
                        si.separation_status;
                      const canMarkReady =
                        si.separation_status === "pending" ||
                        si.separation_status === "in_progress";

                      return (
                        <View
                          key={si.id}
                          style={[
                            ms.itemCard,
                            { borderColor, backgroundColor: bgColor },
                          ]}
                        >
                          {/* Item header: name + qty */}
                          <View style={ms.itemHeaderRow}>
                            <View style={{ flex: 1 }}>
                              <Text
                                style={[ms.itemName, { color: textColor }]}
                                numberOfLines={2}
                              >
                                {si.description ?? "Item"}
                              </Text>
                              <Text
                                style={[ms.itemMeta, { color: mutedColor }]}
                              >
                                {si.quantity}× {formatCurrency(si.unit_price)} ={" "}
                                {formatCurrency(si.subtotal)}
                              </Text>
                            </View>
                            {/* Separation badge */}
                            <View
                              style={[
                                ms.sepBadge,
                                { backgroundColor: sepColor + "20" },
                              ]}
                            >
                              <View
                                style={[
                                  ms.sepDot,
                                  { backgroundColor: sepColor },
                                ]}
                              />
                              <Text style={[ms.sepText, { color: sepColor }]}>
                                {sepLabel}
                              </Text>
                            </View>
                          </View>

                          {/* Mark ready button */}
                          {canMarkReady ? (
                            <TouchableOpacity
                              style={[
                                ms.markReadyBtn,
                                {
                                  backgroundColor: "#22c55e",
                                  opacity:
                                    markingReady === si.id ||
                                    markingReady === "__all"
                                      ? 0.6
                                      : 1,
                                },
                              ]}
                              onPress={() => handleMarkItemReady(si)}
                              disabled={
                                markingReady === si.id ||
                                markingReady === "__all"
                              }
                            >
                              {markingReady === si.id ? (
                                <ActivityIndicator size="small" color="#fff" />
                              ) : (
                                <>
                                  <Ionicons
                                    name="checkmark-circle-outline"
                                    size={14}
                                    color="#fff"
                                  />
                                  <Text style={ms.markReadyBtnText}>
                                    Marcar Pronto
                                  </Text>
                                </>
                              )}
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      );
                    })
                  )}
                </ScrollView>
              )}

              {/* Bulk action: mark all ready */}
              {hasPendingItems && !itemsLoading ? (
                <TouchableOpacity
                  style={[
                    ms.bulkBtn,
                    {
                      backgroundColor: "#22c55e",
                      opacity: markingReady === "__all" ? 0.6 : 1,
                    },
                  ]}
                  onPress={handleMarkAllReady}
                  disabled={markingReady === "__all"}
                >
                  {markingReady === "__all" ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons
                        name="checkmark-done-outline"
                        size={16}
                        color="#fff"
                      />
                      <Text style={ms.bulkBtnText}>
                        Marcar Todos como Pronto
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : null}

              {/* Close */}
              <TouchableOpacity
                style={[ms.closeBtn, { borderColor }]}
                onPress={() => {
                  setItemsVisible(false);
                  setItemsSale(null);
                  setSaleItems([]);
                }}
              >
                <Text style={[ms.closeBtnText, { color: textColor }]}>
                  Fechar
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </>
    );
  },
);

export default StockPlugin;

/* ═══════════════════════════════════════════════════════
 * STYLES — Card
 * ═══════════════════════════════════════════════════════ */

const cs = StyleSheet.create({
  card: {
    borderRadius: 8,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...(Platform.OS === "web"
      ? { boxShadow: "0px 1px 3px rgba(0,0,0,0.08)" }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 2,
          elevation: 1,
        }),
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: 4,
  },
  cardTitle: {
    ...typography.body,
    fontWeight: "700",
  },
  cardSubtitle: {
    ...typography.caption,
    marginTop: 1,
  },
  totalBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  totalText: {
    fontSize: 12,
    fontWeight: "700",
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
  },
  metaText: {
    ...typography.caption,
    flex: 1,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: spacing.sm,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: 5,
    borderRadius: 6,
  },
  actionBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#fff",
  },
});

/* ═══════════════════════════════════════════════════════
 * STYLES — Modal
 * ═══════════════════════════════════════════════════════ */

const ms = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.md,
  },
  modalTitle: {
    ...typography.subtitle,
    fontWeight: "700",
  },
  modalSubtitle: {
    ...typography.caption,
    marginTop: 2,
  },
  loadingText: {
    ...typography.caption,
    marginTop: 8,
  },

  // Item cards
  itemCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  itemHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  itemName: {
    ...typography.body,
    fontWeight: "600",
  },
  itemMeta: {
    ...typography.caption,
    marginTop: 2,
  },
  sepBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  sepDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sepText: {
    fontSize: 10,
    fontWeight: "700",
  },
  markReadyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: spacing.sm,
    paddingVertical: 6,
    borderRadius: 6,
  },
  markReadyBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },

  // Bulk + Close buttons
  bulkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: 10,
  },
  bulkBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  closeBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  closeBtnText: {
    ...typography.body,
    fontWeight: "600",
  },
});
