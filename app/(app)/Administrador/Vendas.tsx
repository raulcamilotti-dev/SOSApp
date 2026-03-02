/**
 * Vendas Admin — Full sales management
 *
 * CrudScreen showing all sales for the tenant.
 * Supports cancel action per sale. Sales are created from PDV, not here.
 */

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
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
import { cancelSale, confirmSalePayment } from "@/services/sales";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";

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
  const { partnerId, isPartnerUser } = usePartnerScope();
  const tenantId = user?.tenant_id;
  const errorColor = "#ef4444";
  const successColor = "#10b981";

  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const cardBg = useThemeColor({}, "card");
  const tintColor = useThemeColor({}, "tint");
  const bg = useThemeColor({}, "background");

  const [reloadKey, setReloadKey] = useState(0);
  const [showOnlyMySales, setShowOnlyMySales] = useState(false);
  const [invoiceModalVisible, setInvoiceModalVisible] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Row | null>(null);
  const [invoiceData, setInvoiceData] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState(false);

  const loadItems = useMemo(() => {
    return async (): Promise<Row[]> => {
      const filters = tenantId ? [{ field: "tenant_id", value: tenantId }] : [];

      // Partner scoping or "My Sales" filter
      if (showOnlyMySales) {
        if (isPartnerUser && partnerId) {
          filters.push({ field: "partner_id", value: partnerId });
        } else if (user?.id) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tenantId,
    reloadKey,
    showOnlyMySales,
    partnerId,
    isPartnerUser,
    user?.id,
  ]);

  const handleCancel = useCallback(
    async (saleId: string) => {
      const executeCancel = async () => {
        try {
          await cancelSale(saleId, "Cancelamento manual pelo admin", user?.id);
          setReloadKey((k) => k + 1);
        } catch (err: any) {
          Alert.alert("Erro", err?.message ?? "Falha ao cancelar venda.");
        }
      };

      if (Platform.OS === "web") {
        const confirmed = window.confirm(
          "Tem certeza? O estoque será estornado e a fatura cancelada.",
        );
        if (confirmed) {
          executeCancel();
        }
        return;
      }

      Alert.alert(
        "Cancelar Venda",
        "Tem certeza? O estoque será estornado e a fatura cancelada.",
        [
          { text: "Não", style: "cancel" },
          {
            text: "Sim, Cancelar",
            style: "destructive",
            onPress: executeCancel,
          },
        ],
      );
    },
    [user?.id],
  );

  const handleConfirmPayment = useCallback(
    async (saleId: string) => {
      const executeConfirm = async () => {
        try {
          setConfirmingPayment(true);
          await confirmSalePayment(
            saleId,
            user?.id ?? "",
            "Confirmado via admin",
          );
          setReloadKey((k) => k + 1);
          setInvoiceModalVisible(false);
          Alert.alert("Sucesso", "Pagamento confirmado com sucesso!");
        } catch (err: any) {
          Alert.alert("Erro", err?.message ?? "Falha ao confirmar pagamento.");
        } finally {
          setConfirmingPayment(false);
        }
      };

      if (Platform.OS === "web") {
        const confirmed = window.confirm(
          "Confirmar que o pagamento PIX foi recebido?",
        );
        if (confirmed) {
          executeConfirm();
        }
        return;
      }

      Alert.alert(
        "Confirmar Pagamento",
        "Confirmar que o pagamento PIX foi recebido?",
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Confirmar",
            onPress: executeConfirm,
          },
        ],
      );
    },
    [user?.id],
  );

  const openInvoiceModal = useCallback(async (sale: Row) => {
    setSelectedSale(sale);
    setInvoiceModalVisible(true);
    setLoadingInvoice(true);
    setInvoiceData(null);

    try {
      if (sale.invoice_id) {
        const res = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "invoices",
          ...buildSearchParams([
            { field: "id", value: String(sale.invoice_id) },
          ]),
        });
        const invoice = normalizeCrudList<Record<string, unknown>>(res.data)[0];
        setInvoiceData(invoice ?? null);
      }
    } catch (err) {
      console.error("Error loading invoice:", err);
    } finally {
      setLoadingInvoice(false);
    }
  }, []);

  // Sales created from PDV — update only for admin edits
  const noop = async () => {
    throw new Error("Use o PDV para criar vendas");
  };

  const updateSale = useMemo(() => {
    return async (payload: Partial<Row> & { id?: string | null }) => {
      if (!payload.id) throw new Error("Id obrigatório");
      const safePayload: Partial<Row> & { id: string } = {
        id: String(payload.id),
      };

      if (typeof payload.notes !== "undefined") {
        safePayload.notes = payload.notes;
      }

      const response = await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "sales",
        payload: safePayload,
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
      label: "Usuário da Venda",
      type: "reference",
      referenceTable: "users",
      referenceLabelField: "fullname",
      referenceSearchField: "fullname",
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
      referenceLabelField: "fullname",
      referenceSearchField: "fullname",
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
    <>
      <CrudScreen<Row>
        title="Vendas"
        subtitle={
          showOnlyMySales
            ? "Vendas realizadas por você"
            : "Todas as vendas do tenant"
        }
        searchPlaceholder="Buscar venda..."
        searchFields={["customer_id", "partner_id", "status", "payment_method"]}
        fields={fields}
        loadItems={loadItems}
        createItem={noop}
        updateItem={updateSale}
        headerActions={
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <TouchableOpacity
              onPress={() => setShowOnlyMySales(false)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: !showOnlyMySales ? tintColor : "transparent",
                borderWidth: 1,
                borderColor: tintColor,
              }}
            >
              <ThemedText
                style={{
                  color: !showOnlyMySales ? "#fff" : tintColor,
                  fontWeight: "700",
                  fontSize: 13,
                }}
              >
                Todas
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowOnlyMySales(true)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: showOnlyMySales ? tintColor : "transparent",
                borderWidth: 1,
                borderColor: tintColor,
              }}
            >
              <ThemedText
                style={{
                  color: showOnlyMySales ? "#fff" : tintColor,
                  fontWeight: "700",
                  fontSize: 13,
                }}
              >
                Minhas Vendas
              </ThemedText>
            </TouchableOpacity>
          </View>
        }
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
          const hasInvoice = !!item.invoice_id;

          return (
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {hasInvoice && (
                <TouchableOpacity
                  onPress={() => openInvoiceModal(item)}
                  style={{
                    borderWidth: 1,
                    borderColor: tintColor,
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    backgroundColor: tintColor + "10",
                  }}
                >
                  <Ionicons
                    name="receipt-outline"
                    size={14}
                    color={tintColor}
                  />
                  <ThemedText
                    style={{
                      color: tintColor,
                      fontWeight: "700",
                      fontSize: 12,
                    }}
                  >
                    Ver Fatura
                  </ThemedText>
                </TouchableOpacity>
              )}
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
                    style={{
                      color: errorColor,
                      fontWeight: "700",
                      fontSize: 12,
                    }}
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
                Fatura da Venda
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

            {!loadingInvoice && invoiceData && (
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
                      Venda #{String(selectedSale?.id ?? "").slice(0, 8)}
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
                          {fmt(selectedSale?.total)}
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
                          {STATUS_LABELS[String(selectedSale?.status ?? "")] ??
                            String(selectedSale?.status ?? "-")}
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
                          {String(
                            selectedSale?.payment_method ?? "-",
                          ).toUpperCase()}
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
                      Fatura #{String(invoiceData.id ?? "").slice(0, 8)}
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
                          {String(invoiceData.status ?? "-").toUpperCase()}
                        </ThemedText>
                      </View>
                    </View>
                  </View>

                  {/* PIX Info */}
                  {invoiceData.pix_key && (
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
                          PIX
                        </ThemedText>
                      </View>
                      <View style={{ gap: 6 }}>
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                          }}
                        >
                          <ThemedText
                            style={{ color: mutedColor, fontSize: 13 }}
                          >
                            Tipo:
                          </ThemedText>
                          <ThemedText
                            style={{
                              color: textColor,
                              fontWeight: "600",
                              fontSize: 13,
                            }}
                          >
                            {String(
                              invoiceData.pix_key_type ?? "-",
                            ).toUpperCase()}
                          </ThemedText>
                        </View>
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
                            {String(invoiceData.pix_key ?? "-")}
                          </ThemedText>
                        </View>
                      </View>
                    </View>
                  )}

                  {/* Confirm Payment Button */}
                  {String(selectedSale?.status ?? "") === "open" &&
                    String(selectedSale?.payment_method ?? "") === "pix" && (
                      <TouchableOpacity
                        onPress={() =>
                          handleConfirmPayment(String(selectedSale?.id))
                        }
                        disabled={confirmingPayment}
                        style={{
                          backgroundColor: confirmingPayment
                            ? mutedColor
                            : successColor,
                          padding: 16,
                          borderRadius: 12,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                        }}
                      >
                        {confirmingPayment ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Ionicons
                            name="checkmark-circle"
                            size={20}
                            color="#fff"
                          />
                        )}
                        <ThemedText
                          style={{
                            color: "#fff",
                            fontWeight: "700",
                            fontSize: 14,
                          }}
                        >
                          {confirmingPayment
                            ? "Confirmando..."
                            : "Confirmar Pagamento PIX"}
                        </ThemedText>
                      </TouchableOpacity>
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
    </>
  );
}
