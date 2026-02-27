/**
 * Minhas Compras — Customer-facing online orders screen.
 *
 * Shows all marketplace orders placed by the current user (sales with channel="online").
 * Features:
 * - Visual cards with status badges and progress
 * - Inline detail modal with items, address, payment, tracking
 * - Actions: re-generate PIX, cancel order, open tracking link
 */

import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { getApiErrorMessage } from "@/services/api";
import {
    cancelOnlineOrder,
    getOnlineOrderItems,
    listUserOrders,
    regenerateOrderPix,
    type OnlineOrder,
    type OnlineOrderItem,
    type OnlineOrderStatus,
} from "@/services/marketplace-checkout";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Linking,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

type StatusConfig = {
  label: string;
  color: string;
  bg: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const STATUS_MAP: Record<OnlineOrderStatus, StatusConfig> = {
  pending_payment: {
    label: "Aguardando Pagamento",
    color: "#d97706",
    bg: "#fef3c7",
    icon: "time-outline",
  },
  payment_confirmed: {
    label: "Pagamento Confirmado",
    color: "#2563eb",
    bg: "#dbeafe",
    icon: "checkmark-circle-outline",
  },
  processing: {
    label: "Em Processamento",
    color: "#7c3aed",
    bg: "#ede9fe",
    icon: "cog-outline",
  },
  shipped: {
    label: "Enviado",
    color: "#0891b2",
    bg: "#cffafe",
    icon: "airplane-outline",
  },
  delivered: {
    label: "Entregue",
    color: "#059669",
    bg: "#d1fae5",
    icon: "checkmark-done-outline",
  },
  completed: {
    label: "Concluído",
    color: "#059669",
    bg: "#d1fae5",
    icon: "trophy-outline",
  },
  cancelled: {
    label: "Cancelado",
    color: "#dc2626",
    bg: "#fee2e2",
    icon: "close-circle-outline",
  },
  return_requested: {
    label: "Devolução Solicitada",
    color: "#ea580c",
    bg: "#ffedd5",
    icon: "return-down-back-outline",
  },
};

const TIMELINE_STEPS: OnlineOrderStatus[] = [
  "pending_payment",
  "payment_confirmed",
  "processing",
  "shipped",
  "delivered",
  "completed",
];

const formatCurrency = (value: unknown): string => {
  const num = typeof value === "number" ? value : parseFloat(String(value ?? "0"));
  if (isNaN(num)) return "R$ 0,00";
  return `R$ ${num.toFixed(2).replace(".", ",")}`;
};

const formatDate = (iso?: string): string => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
};

const formatDateTime = (iso?: string): string => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
};

const shortOrderId = (id: string) => `#${id.slice(0, 8).toUpperCase()}`;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function MinhasComprasScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const tenantId = user?.tenant_id;
  const userId = user?.id;

  /* ── Theme ── */
  const bg = useThemeColor({}, "background");
  const cardBg = useThemeColor({}, "card");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");

  /* ── State ── */
  const [orders, setOrders] = useState<OnlineOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detail modal
  const [selectedOrder, setSelectedOrder] = useState<OnlineOrder | null>(null);
  const [detailItems, setDetailItems] = useState<OnlineOrderItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // PIX modal
  const [pixLoading, setPixLoading] = useState(false);
  const [pixBrCode, setPixBrCode] = useState<string | null>(null);
  const [pixQr, setPixQr] = useState<string | null>(null);
  const [pixCopied, setPixCopied] = useState(false);

  // Cancel
  const [cancelLoading, setCancelLoading] = useState(false);

  /* ── Load orders ── */
  const loadOrders = useCallback(async () => {
    if (!tenantId || !userId) return;
    try {
      setError(null);
      const list = await listUserOrders(tenantId, userId, { limit: 50 });
      setOrders(list);
    } catch (err) {
      setError(getApiErrorMessage(err, "Falha ao carregar pedidos"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId, userId]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadOrders();
  }, [loadOrders]);

  /* ── Open detail ── */
  const openDetail = useCallback(async (order: OnlineOrder) => {
    setSelectedOrder(order);
    setDetailItems([]);
    setDetailLoading(true);
    setPixBrCode(null);
    setPixQr(null);
    setPixCopied(false);
    try {
      const items = await getOnlineOrderItems(order.id);
      setDetailItems(items.filter((i) => !i.is_composition_parent));
    } catch {
      setDetailItems([]);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedOrder(null);
    setDetailItems([]);
    setPixBrCode(null);
    setPixQr(null);
    setPixCopied(false);
  }, []);

  /* ── PIX ── */
  const handleGeneratePix = useCallback(async () => {
    if (!selectedOrder) return;
    setPixLoading(true);
    try {
      const data = await regenerateOrderPix(selectedOrder.id);
      setPixBrCode(data.pixBrCode);
      setPixQr(data.pixQrCodeBase64);
    } catch (err) {
      const msg = getApiErrorMessage(err, "Falha ao gerar PIX");
      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert("Erro", msg);
      }
    } finally {
      setPixLoading(false);
    }
  }, [selectedOrder]);

  const handleCopyPix = useCallback(async () => {
    if (!pixBrCode) return;
    try {
      await Clipboard.setStringAsync(pixBrCode);
      setPixCopied(true);
      setTimeout(() => setPixCopied(false), 3000);
    } catch {
      /* ignore */
    }
  }, [pixBrCode]);

  /* ── Cancel ── */
  const handleCancel = useCallback(() => {
    if (!selectedOrder) return;

    const doCancel = async () => {
      setCancelLoading(true);
      try {
        await cancelOnlineOrder(
          selectedOrder.id,
          "Cancelado pelo cliente",
          userId,
        );
        closeDetail();
        loadOrders();
      } catch (err) {
        const msg = getApiErrorMessage(err, "Falha ao cancelar pedido");
        if (Platform.OS === "web") {
          window.alert(msg);
        } else {
          Alert.alert("Erro", msg);
        }
      } finally {
        setCancelLoading(false);
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm("Deseja realmente cancelar este pedido?")) {
        doCancel();
      }
    } else {
      Alert.alert("Cancelar Pedido", "Deseja realmente cancelar este pedido?", [
        { text: "Não", style: "cancel" },
        { text: "Sim, cancelar", style: "destructive", onPress: doCancel },
      ]);
    }
  }, [selectedOrder, userId, closeDetail, loadOrders]);

  /* ── Tracking ── */
  const handleTrack = useCallback((trackingCode: string) => {
    // Try to open as URL, fallback to search
    const url = trackingCode.startsWith("http")
      ? trackingCode
      : `https://rastreamento.correios.com.br/app/index.php?objetos=${trackingCode}`;
    Linking.openURL(url).catch(() => {});
  }, []);

  /* ── Helpers ── */
  const getStatusConfig = (status: OnlineOrderStatus): StatusConfig =>
    STATUS_MAP[status] ?? STATUS_MAP.pending_payment;

  const canCancel = (status: OnlineOrderStatus) =>
    ["pending_payment", "payment_confirmed", "processing"].includes(status);

  const canGeneratePix = (status: OnlineOrderStatus) =>
    status === "pending_payment";

  const getTimelineIndex = (status: OnlineOrderStatus): number => {
    if (status === "cancelled" || status === "return_requested") return -1;
    return TIMELINE_STEPS.indexOf(status);
  };

  /* ── Loading ── */
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: bg,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color={tintColor} />
        <Text style={{ color: mutedColor, marginTop: 12, fontSize: 14 }}>
          Carregando pedidos...
        </Text>
      </View>
    );
  }

  /* ── Render ── */
  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 40,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            marginBottom: 4,
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={12}
            style={{ padding: 4 }}
          >
            <Ionicons name="arrow-back" size={22} color={textColor} />
          </TouchableOpacity>
          <Text
            style={{
              fontSize: 24,
              fontWeight: "bold",
              color: textColor,
              flex: 1,
            }}
          >
            Minhas Compras
          </Text>
          <Ionicons name="bag-handle-outline" size={24} color={tintColor} />
        </View>

        <Text
          style={{
            color: mutedColor,
            fontSize: 13,
            marginBottom: 20,
            marginLeft: 36,
          }}
        >
          {orders.length === 0
            ? "Você ainda não fez nenhuma compra"
            : `${orders.length} pedido${orders.length > 1 ? "s" : ""}`}
        </Text>

        {error && (
          <View
            style={{
              backgroundColor: "#fee2e2",
              borderRadius: 10,
              padding: 14,
              marginBottom: 16,
            }}
          >
            <Text style={{ color: "#dc2626", fontSize: 13 }}>{error}</Text>
          </View>
        )}

        {/* Empty state */}
        {orders.length === 0 && !error && (
          <View
            style={{
              alignItems: "center",
              paddingVertical: 60,
              gap: 12,
            }}
          >
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: tintColor + "15",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name="bag-outline" size={36} color={tintColor} />
            </View>
            <Text
              style={{
                fontSize: 17,
                fontWeight: "600",
                color: textColor,
                marginTop: 4,
              }}
            >
              Nenhuma compra ainda
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: mutedColor,
                textAlign: "center",
                maxWidth: 280,
              }}
            >
              Quando você fizer uma compra na loja, seus pedidos aparecerão
              aqui.
            </Text>
          </View>
        )}

        {/* Order cards */}
        {orders.map((order) => {
          const sc = getStatusConfig(order.online_status);
          const timelineIdx = getTimelineIndex(order.online_status);
          const isCancelled =
            order.online_status === "cancelled" ||
            order.online_status === "return_requested";

          return (
            <TouchableOpacity
              key={order.id}
              onPress={() => openDetail(order)}
              activeOpacity={0.7}
              style={{
                backgroundColor: cardBg,
                borderRadius: 14,
                borderWidth: 1,
                borderColor,
                marginBottom: 12,
                overflow: "hidden",
              }}
            >
              {/* Status accent bar */}
              <View
                style={{
                  height: 4,
                  backgroundColor: sc.color,
                  borderTopLeftRadius: 14,
                  borderTopRightRadius: 14,
                }}
              />

              <View style={{ padding: 16 }}>
                {/* Row 1: Order ID + date */}
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 10,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "700",
                      color: textColor,
                    }}
                  >
                    Pedido {shortOrderId(order.id)}
                  </Text>
                  <Text style={{ fontSize: 12, color: mutedColor }}>
                    {formatDate(order.created_at)}
                  </Text>
                </View>

                {/* Row 2: Status badge */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      backgroundColor: sc.bg,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 20,
                    }}
                  >
                    <Ionicons name={sc.icon} size={14} color={sc.color} />
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        color: sc.color,
                      }}
                    >
                      {sc.label}
                    </Text>
                  </View>
                </View>

                {/* Mini progress bar (only for non-cancelled) */}
                {!isCancelled && timelineIdx >= 0 && (
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 3,
                      marginBottom: 12,
                    }}
                  >
                    {TIMELINE_STEPS.map((step, i) => (
                      <View
                        key={step}
                        style={{
                          flex: 1,
                          height: 4,
                          borderRadius: 2,
                          backgroundColor:
                            i <= timelineIdx ? sc.color : borderColor,
                        }}
                      />
                    ))}
                  </View>
                )}

                {/* Row 3: Total + details hint */}
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 18,
                      fontWeight: "700",
                      color: textColor,
                    }}
                  >
                    {formatCurrency(order.total)}
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Text style={{ fontSize: 12, color: tintColor }}>
                      Ver detalhes
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={14}
                      color={tintColor}
                    />
                  </View>
                </View>

                {/* Tracking badge */}
                {order.tracking_code && order.online_status === "shipped" && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      marginTop: 10,
                      backgroundColor: "#cffafe",
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 8,
                    }}
                  >
                    <Ionicons name="locate-outline" size={14} color="#0891b2" />
                    <Text
                      style={{
                        fontSize: 12,
                        color: "#0891b2",
                        fontWeight: "600",
                      }}
                    >
                      Rastreio: {order.tracking_code}
                    </Text>
                  </View>
                )}

                {/* Estimated delivery */}
                {order.estimated_delivery_date &&
                  !isCancelled &&
                  order.online_status !== "completed" &&
                  order.online_status !== "delivered" && (
                    <Text
                      style={{
                        fontSize: 12,
                        color: mutedColor,
                        marginTop: 8,
                      }}
                    >
                      Previsão de entrega:{" "}
                      {formatDate(order.estimated_delivery_date)}
                    </Text>
                  )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ════════════════════════════════════════════════════ */}
      {/*  DETAIL MODAL                                       */}
      {/* ════════════════════════════════════════════════════ */}
      <Modal
        visible={!!selectedOrder}
        transparent
        animationType="slide"
        onRequestClose={closeDetail}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: bg,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              maxHeight: "92%",
              minHeight: "50%",
            }}
          >
            {selectedOrder && (
              <ScrollView
                contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
                showsVerticalScrollIndicator={false}
              >
                {/* ── Modal Header ── */}
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 20,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 20,
                        fontWeight: "700",
                        color: textColor,
                      }}
                    >
                      Pedido {shortOrderId(selectedOrder.id)}
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        color: mutedColor,
                        marginTop: 4,
                      }}
                    >
                      {formatDateTime(selectedOrder.created_at)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={closeDetail}
                    hitSlop={12}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: borderColor + "60",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Ionicons name="close" size={18} color={textColor} />
                  </TouchableOpacity>
                </View>

                {/* ── Status + Timeline ── */}
                {(() => {
                  const sc = getStatusConfig(selectedOrder.online_status);
                  const timelineIdx = getTimelineIndex(
                    selectedOrder.online_status,
                  );
                  const isCancelled =
                    selectedOrder.online_status === "cancelled" ||
                    selectedOrder.online_status === "return_requested";

                  return (
                    <View
                      style={{
                        backgroundColor: cardBg,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor,
                        padding: 16,
                        marginBottom: 16,
                      }}
                    >
                      {/* Status badge */}
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 16,
                        }}
                      >
                        <View
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 18,
                            backgroundColor: sc.bg,
                            justifyContent: "center",
                            alignItems: "center",
                          }}
                        >
                          <Ionicons name={sc.icon} size={18} color={sc.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              fontSize: 15,
                              fontWeight: "600",
                              color: sc.color,
                            }}
                          >
                            {sc.label}
                          </Text>
                          {selectedOrder.estimated_delivery_date &&
                            !isCancelled && (
                              <Text
                                style={{
                                  fontSize: 12,
                                  color: mutedColor,
                                  marginTop: 2,
                                }}
                              >
                                Previsão:{" "}
                                {formatDate(
                                  selectedOrder.estimated_delivery_date,
                                )}
                              </Text>
                            )}
                        </View>
                      </View>

                      {/* Timeline dots */}
                      {!isCancelled && timelineIdx >= 0 && (
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          {TIMELINE_STEPS.map((step, i) => {
                            const isActive = i <= timelineIdx;
                            const isCurrent = i === timelineIdx;
                            const stepSc = STATUS_MAP[step];
                            return (
                              <View
                                key={step}
                                style={{
                                  alignItems: "center",
                                  flex: 1,
                                }}
                              >
                                <View
                                  style={{
                                    width: isCurrent ? 24 : 16,
                                    height: isCurrent ? 24 : 16,
                                    borderRadius: 12,
                                    backgroundColor: isActive
                                      ? sc.color
                                      : borderColor,
                                    justifyContent: "center",
                                    alignItems: "center",
                                    marginBottom: 4,
                                  }}
                                >
                                  {isActive && (
                                    <Ionicons
                                      name={
                                        isCurrent ? stepSc.icon : "checkmark"
                                      }
                                      size={isCurrent ? 14 : 10}
                                      color="#fff"
                                    />
                                  )}
                                </View>
                                <Text
                                  style={{
                                    fontSize: 9,
                                    color: isActive ? sc.color : mutedColor,
                                    fontWeight: isCurrent ? "700" : "400",
                                    textAlign: "center",
                                  }}
                                  numberOfLines={2}
                                >
                                  {stepSc.label.split(" ")[0]}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      )}

                      {/* Tracking */}
                      {selectedOrder.tracking_code && (
                        <TouchableOpacity
                          onPress={() =>
                            handleTrack(selectedOrder.tracking_code!)
                          }
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                            marginTop: 16,
                            backgroundColor: "#cffafe",
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                            borderRadius: 10,
                          }}
                        >
                          <Ionicons
                            name="locate-outline"
                            size={16}
                            color="#0891b2"
                          />
                          <View style={{ flex: 1 }}>
                            <Text
                              style={{
                                fontSize: 12,
                                fontWeight: "600",
                                color: "#0891b2",
                              }}
                            >
                              Rastrear encomenda
                            </Text>
                            <Text
                              style={{
                                fontSize: 11,
                                color: "#0891b2",
                                marginTop: 1,
                              }}
                            >
                              {selectedOrder.tracking_code}
                            </Text>
                          </View>
                          <Ionicons
                            name="open-outline"
                            size={16}
                            color="#0891b2"
                          />
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })()}

                {/* ── Items ── */}
                <View
                  style={{
                    backgroundColor: cardBg,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor,
                    padding: 16,
                    marginBottom: 16,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: textColor,
                      marginBottom: 12,
                    }}
                  >
                    Itens do Pedido
                  </Text>

                  {detailLoading ? (
                    <ActivityIndicator
                      size="small"
                      color={tintColor}
                      style={{ paddingVertical: 16 }}
                    />
                  ) : detailItems.length === 0 ? (
                    <Text style={{ fontSize: 13, color: mutedColor }}>
                      Nenhum item encontrado
                    </Text>
                  ) : (
                    detailItems.map((item, idx) => (
                      <View
                        key={item.id}
                        style={{
                          flexDirection: "row",
                          alignItems: "flex-start",
                          gap: 12,
                          paddingVertical: 10,
                          borderTopWidth: idx > 0 ? 1 : 0,
                          borderTopColor: borderColor,
                        }}
                      >
                        {/* Item kind icon */}
                        <View
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            backgroundColor: tintColor + "12",
                            justifyContent: "center",
                            alignItems: "center",
                            marginTop: 2,
                          }}
                        >
                          <Ionicons
                            name={
                              item.item_kind === "service"
                                ? "construct-outline"
                                : "cube-outline"
                            }
                            size={16}
                            color={tintColor}
                          />
                        </View>

                        {/* Item info */}
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              fontSize: 14,
                              fontWeight: "500",
                              color: textColor,
                            }}
                            numberOfLines={2}
                          >
                            {item.description || `Item ${idx + 1}`}
                          </Text>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 8,
                              marginTop: 4,
                            }}
                          >
                            <Text style={{ fontSize: 12, color: mutedColor }}>
                              {item.quantity}x {formatCurrency(item.unit_price)}
                            </Text>
                            {item.item_kind === "service" && (
                              <View
                                style={{
                                  backgroundColor: "#ede9fe",
                                  paddingHorizontal: 6,
                                  paddingVertical: 1,
                                  borderRadius: 4,
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 10,
                                    fontWeight: "600",
                                    color: "#7c3aed",
                                  }}
                                >
                                  Serviço
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>

                        {/* Subtotal */}
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: "600",
                            color: textColor,
                          }}
                        >
                          {formatCurrency(item.subtotal)}
                        </Text>
                      </View>
                    ))
                  )}
                </View>

                {/* ── Totals ── */}
                <View
                  style={{
                    backgroundColor: cardBg,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor,
                    padding: 16,
                    marginBottom: 16,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: textColor,
                      marginBottom: 10,
                    }}
                  >
                    Resumo
                  </Text>

                  <TotalRow
                    label="Subtotal"
                    value={formatCurrency(selectedOrder.subtotal)}
                    textColor={textColor}
                    mutedColor={mutedColor}
                  />

                  {selectedOrder.discount_amount > 0 && (
                    <TotalRow
                      label="Desconto"
                      value={`-${formatCurrency(selectedOrder.discount_amount)}`}
                      textColor="#059669"
                      mutedColor={mutedColor}
                    />
                  )}

                  {selectedOrder.shipping_cost > 0 && (
                    <TotalRow
                      label="Frete"
                      value={formatCurrency(selectedOrder.shipping_cost)}
                      textColor={textColor}
                      mutedColor={mutedColor}
                    />
                  )}

                  {selectedOrder.shipping_cost === 0 && (
                    <TotalRow
                      label="Frete"
                      value="Grátis"
                      textColor="#059669"
                      mutedColor={mutedColor}
                    />
                  )}

                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      marginTop: 10,
                      paddingTop: 10,
                      borderTopWidth: 1,
                      borderTopColor: borderColor,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "700",
                        color: textColor,
                      }}
                    >
                      Total
                    </Text>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "700",
                        color: textColor,
                      }}
                    >
                      {formatCurrency(selectedOrder.total)}
                    </Text>
                  </View>
                </View>

                {/* ── Shipping Address ── */}
                {selectedOrder.shipping_address && (
                  <View
                    style={{
                      backgroundColor: cardBg,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor,
                      padding: 16,
                      marginBottom: 16,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 10,
                      }}
                    >
                      <Ionicons
                        name="location-outline"
                        size={16}
                        color={tintColor}
                      />
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "700",
                          color: textColor,
                        }}
                      >
                        Endereço de Entrega
                      </Text>
                    </View>

                    <Text
                      style={{
                        fontSize: 13,
                        color: textColor,
                        lineHeight: 20,
                      }}
                    >
                      {selectedOrder.shipping_address.street}
                      {selectedOrder.shipping_address.number
                        ? `, ${selectedOrder.shipping_address.number}`
                        : ""}
                      {selectedOrder.shipping_address.complement
                        ? ` - ${selectedOrder.shipping_address.complement}`
                        : ""}
                      {"\n"}
                      {selectedOrder.shipping_address.neighborhood}
                      {"\n"}
                      {selectedOrder.shipping_address.city} -{" "}
                      {selectedOrder.shipping_address.state}
                      {"\n"}
                      CEP: {selectedOrder.shipping_address.cep}
                    </Text>
                  </View>
                )}

                {/* ── Notes ── */}
                {selectedOrder.notes && (
                  <View
                    style={{
                      backgroundColor: cardBg,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor,
                      padding: 16,
                      marginBottom: 16,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 8,
                      }}
                    >
                      <Ionicons
                        name="chatbox-outline"
                        size={16}
                        color={tintColor}
                      />
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "700",
                          color: textColor,
                        }}
                      >
                        Observações
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontSize: 13,
                        color: mutedColor,
                        lineHeight: 20,
                      }}
                    >
                      {selectedOrder.notes}
                    </Text>
                  </View>
                )}

                {/* ── PIX Section ── */}
                {canGeneratePix(selectedOrder.online_status) && (
                  <View
                    style={{
                      backgroundColor: cardBg,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor,
                      padding: 16,
                      marginBottom: 16,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 12,
                      }}
                    >
                      <Ionicons
                        name="qr-code-outline"
                        size={16}
                        color={tintColor}
                      />
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "700",
                          color: textColor,
                        }}
                      >
                        Pagamento PIX
                      </Text>
                    </View>

                    {!pixBrCode && (
                      <TouchableOpacity
                        onPress={handleGeneratePix}
                        disabled={pixLoading}
                        style={{
                          backgroundColor: tintColor,
                          paddingVertical: 12,
                          borderRadius: 10,
                          alignItems: "center",
                          flexDirection: "row",
                          justifyContent: "center",
                          gap: 8,
                          opacity: pixLoading ? 0.6 : 1,
                        }}
                      >
                        {pixLoading ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Ionicons
                            name="qr-code-outline"
                            size={18}
                            color="#fff"
                          />
                        )}
                        <Text
                          style={{
                            color: "#fff",
                            fontWeight: "700",
                            fontSize: 14,
                          }}
                        >
                          {pixLoading ? "Gerando..." : "Gerar código PIX"}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {pixBrCode && (
                      <View style={{ gap: 12 }}>
                        {/* QR Code image */}
                        {pixQr && Platform.OS === "web" && (
                          <View style={{ alignItems: "center" }}>
                            <img
                              src={pixQr}
                              alt="PIX QR Code"
                              style={{
                                width: 200,
                                height: 200,
                                borderRadius: 8,
                              }}
                            />
                          </View>
                        )}

                        {/* Copia e cola */}
                        <View
                          style={{
                            backgroundColor: bg,
                            borderRadius: 8,
                            padding: 12,
                            borderWidth: 1,
                            borderColor,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 11,
                              color: mutedColor,
                              marginBottom: 6,
                            }}
                          >
                            PIX Copia e Cola
                          </Text>
                          <Text
                            style={{
                              fontSize: 12,
                              color: textColor,
                              fontFamily:
                                Platform.OS === "web" ? "monospace" : undefined,
                            }}
                            numberOfLines={3}
                          >
                            {pixBrCode}
                          </Text>
                        </View>

                        <TouchableOpacity
                          onPress={handleCopyPix}
                          style={{
                            backgroundColor: pixCopied ? "#059669" : tintColor,
                            paddingVertical: 12,
                            borderRadius: 10,
                            alignItems: "center",
                            flexDirection: "row",
                            justifyContent: "center",
                            gap: 8,
                          }}
                        >
                          <Ionicons
                            name={
                              pixCopied ? "checkmark-circle" : "copy-outline"
                            }
                            size={18}
                            color="#fff"
                          />
                          <Text
                            style={{
                              color: "#fff",
                              fontWeight: "700",
                              fontSize: 14,
                            }}
                          >
                            {pixCopied ? "Copiado!" : "Copiar código PIX"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}

                {/* ── Actions ── */}
                <View style={{ gap: 10, marginTop: 4 }}>
                  {/* Tracking button */}
                  {selectedOrder.tracking_code &&
                    selectedOrder.online_status === "shipped" && (
                      <TouchableOpacity
                        onPress={() =>
                          handleTrack(selectedOrder.tracking_code!)
                        }
                        style={{
                          backgroundColor: "#0891b2",
                          paddingVertical: 14,
                          borderRadius: 10,
                          alignItems: "center",
                          flexDirection: "row",
                          justifyContent: "center",
                          gap: 8,
                        }}
                      >
                        <Ionicons
                          name="locate-outline"
                          size={18}
                          color="#fff"
                        />
                        <Text
                          style={{
                            color: "#fff",
                            fontWeight: "700",
                            fontSize: 14,
                          }}
                        >
                          Rastrear Encomenda
                        </Text>
                      </TouchableOpacity>
                    )}

                  {/* Cancel button */}
                  {canCancel(selectedOrder.online_status) && (
                    <TouchableOpacity
                      onPress={handleCancel}
                      disabled={cancelLoading}
                      style={{
                        backgroundColor: "#fee2e2",
                        paddingVertical: 14,
                        borderRadius: 10,
                        alignItems: "center",
                        flexDirection: "row",
                        justifyContent: "center",
                        gap: 8,
                        opacity: cancelLoading ? 0.6 : 1,
                      }}
                    >
                      {cancelLoading ? (
                        <ActivityIndicator size="small" color="#dc2626" />
                      ) : (
                        <Ionicons
                          name="close-circle-outline"
                          size={18}
                          color="#dc2626"
                        />
                      )}
                      <Text
                        style={{
                          color: "#dc2626",
                          fontWeight: "700",
                          fontSize: 14,
                        }}
                      >
                        {cancelLoading ? "Cancelando..." : "Cancelar Pedido"}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* Close button */}
                  <TouchableOpacity
                    onPress={closeDetail}
                    style={{
                      paddingVertical: 14,
                      borderRadius: 10,
                      alignItems: "center",
                      borderWidth: 1,
                      borderColor,
                    }}
                  >
                    <Text
                      style={{
                        color: textColor,
                        fontWeight: "600",
                        fontSize: 14,
                      }}
                    >
                      Fechar
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function TotalRow({
  label,
  value,
  textColor,
  mutedColor,
}: {
  label: string;
  value: string;
  textColor: string;
  mutedColor: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 6,
      }}
    >
      <Text style={{ fontSize: 13, color: mutedColor }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: "500", color: textColor }}>
        {value}
      </Text>
    </View>
  );
}
