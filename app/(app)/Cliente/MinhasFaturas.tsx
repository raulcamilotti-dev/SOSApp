import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    TouchableOpacity,
    View,
} from "react-native";

type Sale = {
  id: string;
  customer_id: string;
  total: number;
  subtotal: number;
  discount_amount: number;
  status: string;
  payment_method: string;
  invoice_id: string | null;
  created_at: string;
  paid_at: string | null;
};

type Invoice = {
  id: string;
  invoice_number: string | null;
  total_amount: number;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  pix_key: string | null;
  pix_key_type: string | null;
  payment_url: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  open: "Em Aberto",
  completed: "Concluída",
  cancelled: "Cancelada",
  refunded: "Estornada",
  partial_refund: "Estorno Parcial",
};

const fmt = (val: unknown) => {
  const num = typeof val === "number" ? val : parseFloat(String(val ?? "0"));
  if (isNaN(num)) return "R$ 0,00";
  return num.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
};

const fmtDate = (val: unknown) => {
  if (!val) return "-";
  const date = new Date(String(val));
  if (isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function MinhasFaturasScreen() {
  const { user } = useAuth();
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const cardBg = useThemeColor({}, "card");
  const tintColor = useThemeColor({}, "tint");
  const bg = useThemeColor({}, "background");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sales, setSales] = useState<Sale[]>([]);
  const [invoiceModalVisible, setInvoiceModalVisible] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [invoiceData, setInvoiceData] = useState<Invoice | null>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);

  const loadSales = useCallback(async () => {
    if (!user?.customer_id) {
      setLoading(false);
      return;
    }

    try {
      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "sales",
        ...buildSearchParams(
          [{ field: "customer_id", value: user.customer_id }],
          {
            sortColumn: "created_at DESC",
          },
        ),
      });
      const items = normalizeCrudList<Sale>(res.data).filter(
        (item) => !("deleted_at" in item) || !item.deleted_at,
      );
      setSales(items);
    } catch (err) {
      console.error("Error loading sales:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.customer_id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadSales();
    }, [loadSales]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadSales();
  }, [loadSales]);

  const openInvoiceModal = useCallback(async (sale: Sale) => {
    setSelectedSale(sale);
    setInvoiceModalVisible(true);
    setLoadingInvoice(true);
    setInvoiceData(null);

    try {
      if (sale.invoice_id) {
        const res = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "invoices",
          ...buildSearchParams([{ field: "id", value: sale.invoice_id }]),
        });
        const invoice = normalizeCrudList<Invoice>(res.data)[0];
        setInvoiceData(invoice ?? null);
      }
    } catch (err) {
      console.error("Error loading invoice:", err);
    } finally {
      setLoadingInvoice(false);
    }
  }, []);

  if (!user?.customer_id) {
    return (
      <ThemedView style={{ flex: 1, padding: 20 }}>
        <ThemedText
          style={{ fontSize: 20, fontWeight: "700", marginBottom: 8 }}
        >
          Minhas Faturas
        </ThemedText>
        <ThemedText style={{ color: mutedColor }}>
          Você não tem um perfil de cliente associado.
        </ThemedText>
      </ThemedView>
    );
  }

  if (loading) {
    return (
      <ThemedView
        style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
      >
        <ActivityIndicator size="large" color={tintColor} />
        <ThemedText style={{ marginTop: 12, color: mutedColor }}>
          Carregando faturas...
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <ThemedText
          style={{ fontSize: 22, fontWeight: "700", marginBottom: 4 }}
        >
          Minhas Faturas
        </ThemedText>
        <ThemedText style={{ color: mutedColor, marginBottom: 20 }}>
          {sales.length} compra{sales.length !== 1 ? "s" : ""} realizada
          {sales.length !== 1 ? "s" : ""}
        </ThemedText>

        {sales.length === 0 && (
          <View
            style={{
              padding: 40,
              alignItems: "center",
              borderRadius: 12,
              backgroundColor: cardBg,
              borderWidth: 1,
              borderColor,
            }}
          >
            <Ionicons name="cart-outline" size={48} color={mutedColor} />
            <ThemedText
              style={{
                marginTop: 12,
                color: mutedColor,
                textAlign: "center",
              }}
            >
              Você ainda não realizou nenhuma compra.
            </ThemedText>
          </View>
        )}

        {/* Sales List */}
        {sales.map((sale) => {
          const statusLabel = STATUS_LABELS[sale.status] ?? sale.status;
          const statusColor =
            sale.status === "completed"
              ? "#10b981"
              : sale.status === "open"
                ? "#f59e0b"
                : sale.status === "cancelled"
                  ? "#ef4444"
                  : mutedColor;

          return (
            <View
              key={sale.id}
              style={{
                backgroundColor: cardBg,
                borderRadius: 12,
                borderWidth: 1,
                borderColor,
                padding: 16,
                marginBottom: 12,
              }}
            >
              {/* Top row */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 12,
                }}
              >
                <View style={{ flex: 1 }}>
                  <ThemedText
                    style={{ fontSize: 12, color: mutedColor, marginBottom: 4 }}
                  >
                    Compra #{sale.id.slice(0, 8)}
                  </ThemedText>
                  <ThemedText
                    style={{
                      fontSize: 18,
                      fontWeight: "700",
                      color: textColor,
                    }}
                  >
                    {fmt(sale.total)}
                  </ThemedText>
                </View>
                <View
                  style={{
                    backgroundColor: statusColor + "15",
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 12,
                  }}
                >
                  <ThemedText
                    style={{
                      fontSize: 11,
                      fontWeight: "700",
                      color: statusColor,
                    }}
                  >
                    {statusLabel}
                  </ThemedText>
                </View>
              </View>

              {/* Details */}
              <View
                style={{
                  borderTopWidth: 1,
                  borderTopColor: borderColor,
                  paddingTop: 12,
                  gap: 6,
                }}
              >
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={14}
                    color={mutedColor}
                  />
                  <ThemedText style={{ fontSize: 13, color: mutedColor }}>
                    {fmtDate(sale.created_at)}
                  </ThemedText>
                </View>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <Ionicons name="card-outline" size={14} color={mutedColor} />
                  <ThemedText style={{ fontSize: 13, color: mutedColor }}>
                    {sale.payment_method.toUpperCase()}
                  </ThemedText>
                </View>
                {sale.subtotal !== sale.total && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Ionicons
                      name="pricetag-outline"
                      size={14}
                      color={mutedColor}
                    />
                    <ThemedText style={{ fontSize: 13, color: mutedColor }}>
                      Desconto: {fmt(sale.discount_amount)}
                    </ThemedText>
                  </View>
                )}
              </View>

              {/* View Invoice Button */}
              {sale.invoice_id && (
                <TouchableOpacity
                  onPress={() => openInvoiceModal(sale)}
                  style={{
                    marginTop: 12,
                    borderWidth: 1,
                    borderColor: tintColor,
                    borderRadius: 8,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    backgroundColor: tintColor + "10",
                  }}
                >
                  <Ionicons
                    name="receipt-outline"
                    size={16}
                    color={tintColor}
                  />
                  <ThemedText
                    style={{
                      color: tintColor,
                      fontWeight: "600",
                      fontSize: 13,
                    }}
                  >
                    Ver Fatura
                  </ThemedText>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Invoice Modal */}
      <Modal
        visible={invoiceModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setInvoiceModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "flex-end",
          }}
        >
          <ThemedView
            style={{
              backgroundColor: cardBg,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 20,
              maxHeight: "90%",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <ThemedText
                style={{ fontSize: 20, fontWeight: "700", color: textColor }}
              >
                Detalhes da Fatura
              </ThemedText>
              <TouchableOpacity
                onPress={() => setInvoiceModalVisible(false)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: borderColor + "60",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Ionicons name="close" size={20} color={mutedColor} />
              </TouchableOpacity>
            </View>

            {loadingInvoice && (
              <View style={{ padding: 40, alignItems: "center" }}>
                <ActivityIndicator size="large" color={tintColor} />
                <ThemedText style={{ marginTop: 12, color: mutedColor }}>
                  Carregando fatura...
                </ThemedText>
              </View>
            )}

            {!loadingInvoice && invoiceData && selectedSale && (
              <ScrollView>
                <View style={{ gap: 16 }}>
                  {/* Sale Info */}
                  <View
                    style={{
                      padding: 16,
                      backgroundColor: bg,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor,
                    }}
                  >
                    <ThemedText
                      style={{
                        fontSize: 14,
                        fontWeight: "700",
                        color: textColor,
                        marginBottom: 8,
                      }}
                    >
                      Compra #{selectedSale.id.slice(0, 8)}
                    </ThemedText>
                    <View style={{ gap: 6 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                        }}
                      >
                        <ThemedText style={{ color: mutedColor, fontSize: 13 }}>
                          Total:
                        </ThemedText>
                        <ThemedText
                          style={{
                            color: textColor,
                            fontWeight: "600",
                            fontSize: 13,
                          }}
                        >
                          {fmt(selectedSale.total)}
                        </ThemedText>
                      </View>
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                        }}
                      >
                        <ThemedText style={{ color: mutedColor, fontSize: 13 }}>
                          Status:
                        </ThemedText>
                        <ThemedText
                          style={{
                            color: textColor,
                            fontWeight: "600",
                            fontSize: 13,
                          }}
                        >
                          {STATUS_LABELS[selectedSale.status] ??
                            selectedSale.status}
                        </ThemedText>
                      </View>
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                        }}
                      >
                        <ThemedText style={{ color: mutedColor, fontSize: 13 }}>
                          Pagamento:
                        </ThemedText>
                        <ThemedText
                          style={{
                            color: textColor,
                            fontWeight: "600",
                            fontSize: 13,
                          }}
                        >
                          {selectedSale.payment_method.toUpperCase()}
                        </ThemedText>
                      </View>
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                        }}
                      >
                        <ThemedText style={{ color: mutedColor, fontSize: 13 }}>
                          Data:
                        </ThemedText>
                        <ThemedText
                          style={{
                            color: textColor,
                            fontWeight: "600",
                            fontSize: 13,
                          }}
                        >
                          {fmtDate(selectedSale.created_at)}
                        </ThemedText>
                      </View>
                    </View>
                  </View>

                  {/* Invoice Info */}
                  <View
                    style={{
                      padding: 16,
                      backgroundColor: bg,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor,
                    }}
                  >
                    <ThemedText
                      style={{
                        fontSize: 14,
                        fontWeight: "700",
                        color: textColor,
                        marginBottom: 8,
                      }}
                    >
                      Fatura #{invoiceData.id.slice(0, 8)}
                    </ThemedText>
                    <View style={{ gap: 6 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                        }}
                      >
                        <ThemedText style={{ color: mutedColor, fontSize: 13 }}>
                          Total:
                        </ThemedText>
                        <ThemedText
                          style={{
                            color: textColor,
                            fontWeight: "600",
                            fontSize: 13,
                          }}
                        >
                          {fmt(invoiceData.total_amount)}
                        </ThemedText>
                      </View>
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                        }}
                      >
                        <ThemedText style={{ color: mutedColor, fontSize: 13 }}>
                          Status:
                        </ThemedText>
                        <ThemedText
                          style={{
                            color: textColor,
                            fontWeight: "600",
                            fontSize: 13,
                          }}
                        >
                          {invoiceData.status === "paid"
                            ? "Pago"
                            : invoiceData.status === "pending"
                              ? "Pendente"
                              : invoiceData.status === "cancelled"
                                ? "Cancelado"
                                : invoiceData.status.toUpperCase()}
                        </ThemedText>
                      </View>
                      {invoiceData.due_date && (
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                          }}
                        >
                          <ThemedText
                            style={{ color: mutedColor, fontSize: 13 }}
                          >
                            Vencimento:
                          </ThemedText>
                          <ThemedText
                            style={{
                              color: textColor,
                              fontWeight: "600",
                              fontSize: 13,
                            }}
                          >
                            {fmtDate(invoiceData.due_date)}
                          </ThemedText>
                        </View>
                      )}
                      {invoiceData.paid_at && (
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                          }}
                        >
                          <ThemedText
                            style={{ color: mutedColor, fontSize: 13 }}
                          >
                            Pago em:
                          </ThemedText>
                          <ThemedText
                            style={{
                              color: textColor,
                              fontWeight: "600",
                              fontSize: 13,
                            }}
                          >
                            {fmtDate(invoiceData.paid_at)}
                          </ThemedText>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* PIX Info */}
                  {invoiceData.pix_key && invoiceData.status !== "paid" && (
                    <View
                      style={{
                        padding: 16,
                        backgroundColor: "#10b98115",
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: "#10b981",
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
                          name="qr-code-outline"
                          size={20}
                          color="#10b981"
                        />
                        <ThemedText
                          style={{
                            fontSize: 14,
                            fontWeight: "700",
                            color: "#10b981",
                          }}
                        >
                          Pagar com PIX
                        </ThemedText>
                      </View>
                      <View style={{ gap: 6 }}>
                        <ThemedText style={{ color: mutedColor, fontSize: 12 }}>
                          Tipo de Chave:{" "}
                          {invoiceData.pix_key_type?.toUpperCase() ?? "-"}
                        </ThemedText>
                        <View
                          style={{
                            marginTop: 4,
                            padding: 10,
                            backgroundColor: cardBg,
                            borderRadius: 8,
                          }}
                        >
                          <ThemedText
                            style={{
                              color: textColor,
                              fontSize: 12,
                              fontFamily:
                                Platform.OS === "ios" ? "Courier" : "monospace",
                            }}
                            selectable
                          >
                            {invoiceData.pix_key}
                          </ThemedText>
                        </View>
                        <ThemedText
                          style={{
                            color: mutedColor,
                            fontSize: 11,
                            marginTop: 4,
                          }}
                        >
                          Copie a chave PIX acima e realize o pagamento no app
                          do seu banco.
                        </ThemedText>
                      </View>
                    </View>
                  )}

                  {/* Paid Badge */}
                  {invoiceData.status === "paid" && (
                    <View
                      style={{
                        padding: 16,
                        backgroundColor: "#10b98115",
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: "#10b981",
                        alignItems: "center",
                      }}
                    >
                      <Ionicons
                        name="checkmark-circle"
                        size={48}
                        color="#10b981"
                      />
                      <ThemedText
                        style={{
                          marginTop: 8,
                          fontSize: 16,
                          fontWeight: "700",
                          color: "#10b981",
                        }}
                      >
                        Pagamento Confirmado
                      </ThemedText>
                    </View>
                  )}
                </View>
              </ScrollView>
            )}

            {!loadingInvoice && !invoiceData && (
              <View style={{ padding: 40, alignItems: "center" }}>
                <Ionicons
                  name="alert-circle-outline"
                  size={48}
                  color={mutedColor}
                />
                <ThemedText
                  style={{
                    marginTop: 12,
                    color: mutedColor,
                    textAlign: "center",
                  }}
                >
                  Fatura não encontrada
                </ThemedText>
              </View>
            )}

            <TouchableOpacity
              onPress={() => setInvoiceModalVisible(false)}
              style={{
                marginTop: 16,
                padding: 14,
                borderRadius: 10,
                borderWidth: 1,
                borderColor,
                alignItems: "center",
              }}
            >
              <ThemedText style={{ color: textColor, fontWeight: "600" }}>
                Fechar
              </ThemedText>
            </TouchableOpacity>
          </ThemedView>
        </View>
      </Modal>
    </ThemedView>
  );
}
