/**
 * SolicitacaoCompras — Purchase Requests screen.
 *
 * CrudScreen hybrid (same pattern as Compras.tsx):
 *  - CrudScreen for list/search/status display
 *  - Custom modals for creation, item editing, approval workflow
 *
 * Workflow: draft → pending_approval → approved → converted (→ Purchase Order)
 *           draft → cancelled | pending_approval → rejected
 */

import { ThemedText } from "@/components/themed-text";
import {
    type CrudFieldConfig,
    type CrudScreenHandle,
    CrudScreen
} from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api, getApiErrorMessage } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import {
    type PurchaseRequestItem,
    type PurchaseRequestPriority,
    addPurchaseRequestItem,
    approveRequest,
    cancelRequest,
    convertToPurchaseOrder,
    createPurchaseRequest,
    listPurchaseRequestItems,
    rejectRequest,
    submitForApproval
} from "@/services/purchase-requests";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    ScrollView,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

/* ═══════════════════════════ CONSTANTS ═══════════════════════════ */

type Row = Record<string, unknown>;

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  pending_approval: "Aguardando Aprovação",
  approved: "Aprovada",
  rejected: "Rejeitada",
  cancelled: "Cancelada",
  converted: "Convertida em Compra",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "#94a3b8",
  pending_approval: "#f59e0b",
  approved: "#22c55e",
  rejected: "#ef4444",
  cancelled: "#6b7280",
  converted: "#3b82f6",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "#94a3b8",
  medium: "#3b82f6",
  high: "#f59e0b",
  urgent: "#ef4444",
};

const PRIORITIES: { key: PurchaseRequestPriority; label: string }[] = [
  { key: "low", label: "Baixa" },
  { key: "medium", label: "Média" },
  { key: "high", label: "Alta" },
  { key: "urgent", label: "Urgente" },
];

const fmt = (v: unknown) => {
  const n = Number(v ?? 0);
  return isNaN(n)
    ? "R$ 0,00"
    : n.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 2,
      });
};

/* ── Draft item type used while building the request ── */
type DraftItem = {
  localId: number;
  serviceId: string | null;
  name: string;
  sku: string;
  quantity: string;
  estimatedCost: string;
  notes: string;
};

let _draftCounter = 0;
const draftId = () => ++_draftCounter;

/* ── Product option from services table ── */
type ProductOption = {
  id: string;
  name: string;
  sku?: string;
  cost_price?: number;
  average_cost?: number;
};

/* ═══════════════════════════ COMPONENT ═══════════════════════════ */

export default function SolicitacaoComprasScreen() {
  const { user } = useAuth();
  const tenantId = String(user?.tenant_id ?? "");
  const userId = String(user?.id ?? "");

  /* ── Theme ── */
  const tintColor = useThemeColor({}, "tint");
  const borderColor = useThemeColor({}, "border");
  const bgColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const cardColor = useThemeColor({}, "card");
  const inputBg = useThemeColor({}, "input");

  /* ── CrudScreen handle for reload ── */
  const crudRef = useRef<CrudScreenHandle | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  /* ── Create modal state ── */
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [creating, setCreating] = useState(false);
  const [reqTitle, setReqTitle] = useState("");
  const [reqDepartment, setReqDepartment] = useState("");
  const [reqPriority, setReqPriority] =
    useState<PurchaseRequestPriority>("medium");
  const [reqNeededBy, setReqNeededBy] = useState("");
  const [reqNotes, setReqNotes] = useState("");

  /* ── Items inside create modal ── */
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [showProductPicker, setShowProductPicker] = useState(false);

  /* ── Details modal state ── */
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [detailsRequest, setDetailsRequest] = useState<Row | null>(null);
  const [detailsItems, setDetailsItems] = useState<PurchaseRequestItem[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  /* ── Reject modal state ── */
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectingRequestId, setRejectingRequestId] = useState<string | null>(
    null,
  );
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  /* ── General operation state ── */
  const [submitting, setSubmitting] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  /* ═════════ Load products for picker ═════════ */
  const loadProducts = useCallback(async () => {
    if (products.length > 0) return;
    setLoadingProducts(true);
    try {
      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "services",
        ...buildSearchParams(
          [
            { field: "tenant_id", value: tenantId },
            { field: "item_kind", value: "product" },
          ],
          { sortColumn: "name ASC", autoExcludeDeleted: true },
        ),
      });
      const list = normalizeCrudList<ProductOption>(res.data);
      setProducts(list);
    } catch {
      /* silently ignore — user can still add manual items */
    } finally {
      setLoadingProducts(false);
    }
  }, [products.length, tenantId]);

  /* ═════════ Open create modal ═════════ */
  const openCreateModal = useCallback(() => {
    setReqTitle("");
    setReqDepartment("");
    setReqPriority("medium");
    setReqNeededBy("");
    setReqNotes("");
    setDraftItems([]);
    setProductSearch("");
    setShowProductPicker(false);
    setCreating(false);
    setCreateModalVisible(true);
    loadProducts();
  }, [loadProducts]);

  /* ═════════ Item CRUD inside create modal ═════════ */
  const addProduct = useCallback((product: ProductOption) => {
    setDraftItems((prev) => {
      const existing = prev.find((i) => i.serviceId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.serviceId === product.id
            ? { ...i, quantity: String(Number(i.quantity || 0) + 1) }
            : i,
        );
      }
      return [
        ...prev,
        {
          localId: draftId(),
          serviceId: product.id,
          name: product.name,
          sku: product.sku ?? "",
          quantity: "1",
          estimatedCost: String(
            product.average_cost ?? product.cost_price ?? "",
          ),
          notes: "",
        },
      ];
    });
    setShowProductPicker(false);
    setProductSearch("");
  }, []);

  const addManualItem = useCallback(() => {
    setDraftItems((prev) => [
      ...prev,
      {
        localId: draftId(),
        serviceId: null,
        name: "",
        sku: "",
        quantity: "1",
        estimatedCost: "",
        notes: "",
      },
    ]);
  }, []);

  const removeItem = useCallback((localId: number) => {
    setDraftItems((prev) => prev.filter((i) => i.localId !== localId));
  }, []);

  const updateItemField = useCallback(
    (localId: number, field: keyof DraftItem, value: string) => {
      setDraftItems((prev) =>
        prev.map((i) => (i.localId === localId ? { ...i, [field]: value } : i)),
      );
    },
    [],
  );

  /* ═════════ Computed totals ═════════ */
  const subtotal = useMemo(
    () =>
      draftItems.reduce(
        (sum, i) =>
          sum +
          (parseFloat(i.quantity) || 0) * (parseFloat(i.estimatedCost) || 0),
        0,
      ),
    [draftItems],
  );

  /* ═════════ Save new request ═════════ */
  const handleCreate = useCallback(async () => {
    if (!reqTitle.trim()) {
      Alert.alert("Atenção", "Informe o título da solicitação.");
      return;
    }
    if (draftItems.length === 0) {
      Alert.alert("Atenção", "Adicione ao menos um item.");
      return;
    }

    setCreating(true);
    try {
      /* 1. create the request header */
      const request = await createPurchaseRequest({
        tenantId,
        title: reqTitle.trim(),
        department: reqDepartment.trim() || undefined,
        priority: reqPriority,
        neededByDate: reqNeededBy.trim() || undefined,
        requestedBy: userId,
        notes: reqNotes.trim() || undefined,
      });

      /* 2. add each item */
      for (const item of draftItems) {
        const description =
          item.name.trim() || `Item ${draftItems.indexOf(item) + 1}`;
        await addPurchaseRequestItem({
          requestId: request.id,
          serviceId: item.serviceId || undefined,
          itemKind: item.serviceId ? "product" : undefined,
          description,
          quantityRequested: parseFloat(item.quantity) || 1,
          estimatedUnitCost: parseFloat(item.estimatedCost) || undefined,
          notes: item.notes.trim() || undefined,
        });
      }

      setCreateModalVisible(false);
      reload();
    } catch (err) {
      Alert.alert("Erro", getApiErrorMessage(err, "Falha ao criar."));
    } finally {
      setCreating(false);
    }
  }, [
    reqTitle,
    reqDepartment,
    reqPriority,
    reqNeededBy,
    reqNotes,
    draftItems,
    tenantId,
    userId,
    reload,
  ]);

  /* ═════════ Workflow actions ═════════ */
  const handleSubmit = useCallback(
    async (item: Row) => {
      setSubmitting(true);
      try {
        await submitForApproval(String(item.id));
        reload();
      } catch (err) {
        Alert.alert("Erro", getApiErrorMessage(err));
      } finally {
        setSubmitting(false);
      }
    },
    [reload],
  );

  const handleApprove = useCallback(
    async (item: Row) => {
      Alert.alert(
        "Aprovar Solicitação",
        "Confirma a aprovação desta solicitação de compra?",
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Aprovar",
            onPress: async () => {
              setSubmitting(true);
              try {
                await approveRequest(String(item.id), userId);
                reload();
              } catch (err) {
                Alert.alert("Erro", getApiErrorMessage(err));
              } finally {
                setSubmitting(false);
              }
            },
          },
        ],
      );
    },
    [userId, reload],
  );

  const openRejectModal = useCallback((item: Row) => {
    setRejectingRequestId(String(item.id));
    setRejectionReason("");
    setRejectModalVisible(true);
  }, []);

  const handleRejectConfirm = useCallback(async () => {
    if (!rejectingRequestId) return;
    setRejecting(true);
    try {
      await rejectRequest(
        rejectingRequestId,
        userId,
        rejectionReason.trim() || undefined,
      );
      setRejectModalVisible(false);
      reload();
    } catch (err) {
      Alert.alert("Erro", getApiErrorMessage(err));
    } finally {
      setRejecting(false);
    }
  }, [rejectingRequestId, userId, rejectionReason, reload]);

  const handleCancel = useCallback(
    (item: Row) => {
      Alert.alert(
        "Cancelar Solicitação",
        "Deseja realmente cancelar esta solicitação?",
        [
          { text: "Não", style: "cancel" },
          {
            text: "Sim, cancelar",
            style: "destructive",
            onPress: async () => {
              setSubmitting(true);
              try {
                await cancelRequest(String(item.id));
                reload();
              } catch (err) {
                Alert.alert("Erro", getApiErrorMessage(err));
              } finally {
                setSubmitting(false);
              }
            },
          },
        ],
      );
    },
    [reload],
  );

  const handleConvert = useCallback(
    (item: Row) => {
      Alert.alert(
        "Converter em Pedido de Compra",
        "Ao confirmar, será criado um Pedido de Compra com os itens desta solicitação.",
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Converter",
            onPress: async () => {
              setSubmitting(true);
              try {
                const result = await convertToPurchaseOrder(
                  String(item.id),
                  tenantId,
                  userId,
                );
                Alert.alert(
                  "Sucesso",
                  `Pedido de Compra criado com sucesso!\nID: ${result.purchaseOrderId}`,
                );
                reload();
              } catch (err) {
                Alert.alert("Erro", getApiErrorMessage(err));
              } finally {
                setSubmitting(false);
              }
            },
          },
        ],
      );
    },
    [tenantId, userId, reload],
  );

  /* ═════════ Details modal ═════════ */
  const openDetailsModal = useCallback(async (item: Row) => {
    setDetailsRequest(item);
    setDetailsItems([]);
    setLoadingDetails(true);
    setDetailsModalVisible(true);
    try {
      const items = await listPurchaseRequestItems(String(item.id));
      setDetailsItems(items);
    } catch {
      /* silently fail */
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  /* ═════════ CrudScreen data callbacks ═════════ */
  const loadItems = useMemo(
    () => async (): Promise<Row[]> => {
      void reloadKey; // react to reload
      const filters: { field: string; value: string; operator?: string }[] = [
        { field: "tenant_id", value: tenantId },
      ];
      if (filterStatus) {
        filters.push({ field: "status", value: filterStatus });
      }
      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "purchase_requests",
        ...buildSearchParams(filters, {
          sortColumn: "created_at DESC",
          autoExcludeDeleted: true,
        }),
      });
      return normalizeCrudList<Row>(res.data);
    },
    [tenantId, filterStatus, reloadKey],
  );

  const createItemDummy = useMemo(
    () => async (): Promise<{ ok: true }> => ({ ok: true }),
    [],
  );

  const updateItem = useCallback(
    async (payload: Partial<Row> & { id?: string | null }) => {
      const allowed = ["notes", "priority", "department", "title"];
      const data: Record<string, unknown> = { id: payload.id };
      for (const key of allowed) {
        if (key in payload) data[key] = (payload as any)[key];
      }
      data.updated_at = new Date().toISOString();
      return api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "purchase_requests",
        payload: data,
      });
    },
    [],
  );

  const deleteItem = useCallback(
    async (payload: Partial<Row> & { id?: string | null }) => {
      await cancelRequest(String(payload.id));
      reload();
    },
    [reload],
  );

  /* ═════════ CrudScreen field config ═════════ */
  const fields: CrudFieldConfig<Row>[] = useMemo(
    () => [
      { key: "id", label: "ID", visibleInList: false, visibleInForm: false },
      {
        key: "title",
        label: "Título",
        required: true,
        visibleInList: true,
        visibleInForm: true,
      },
      {
        key: "code",
        label: "Código",
        readOnly: true,
        visibleInList: true,
        visibleInForm: false,
      },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: Object.entries(STATUS_LABELS).map(([value, label]) => ({
          value,
          label,
        })),
        readOnly: true,
        visibleInList: true,
        visibleInForm: false,
      },
      {
        key: "priority",
        label: "Prioridade",
        type: "select",
        options: PRIORITIES.map((p) => ({ value: p.key, label: p.label })),
        visibleInList: true,
        visibleInForm: true,
      },
      {
        key: "department",
        label: "Departamento",
        visibleInList: false,
        visibleInForm: true,
      },
      {
        key: "needed_by_date",
        label: "Precisa até",
        type: "date",
        visibleInList: false,
        visibleInForm: true,
      },
      {
        key: "total",
        label: "Total Estimado",
        type: "currency",
        readOnly: true,
        visibleInList: true,
        visibleInForm: false,
      },
      {
        key: "notes",
        label: "Observações",
        type: "multiline",
        visibleInList: false,
        visibleInForm: true,
      },
    ],
    [],
  );

  /* ═════════ Product search filter ═════════ */
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products.slice(0, 20);
    const q = productSearch.toLowerCase();
    return products
      .filter(
        (p) =>
          p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [products, productSearch]);

  /* ═══════════════════ CREATE MODAL JSX ═══════════════════ */
  const createModal = (
    <Modal
      visible={createModalVisible}
      animationType="slide"
      transparent
      onRequestClose={() => setCreateModalVisible(false)}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "center",
          padding: 16,
        }}
      >
        <View
          style={{
            backgroundColor: bgColor,
            borderRadius: 16,
            padding: 20,
            maxHeight: "92%",
          }}
        >
          <ThemedText
            style={{ fontSize: 18, fontWeight: "700", marginBottom: 12 }}
          >
            Nova Solicitação de Compra
          </ThemedText>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── Title ── */}
            <ThemedText
              style={{
                fontSize: 14,
                fontWeight: "700",
                marginBottom: 6,
                color: tintColor,
              }}
            >
              Título *
            </ThemedText>
            <TextInput
              value={reqTitle}
              onChangeText={setReqTitle}
              placeholder="Ex.: Reposição de estoque"
              placeholderTextColor={mutedColor}
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 10,
                padding: 10,
                fontSize: 14,
                color: textColor,
                backgroundColor: inputBg,
                marginBottom: 12,
              }}
            />

            {/* ── Department + Priority row ── */}
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <ThemedText
                  style={{
                    fontSize: 11,
                    color: mutedColor,
                    marginBottom: 2,
                  }}
                >
                  Departamento
                </ThemedText>
                <TextInput
                  value={reqDepartment}
                  onChangeText={setReqDepartment}
                  placeholder="Ex.: Produção"
                  placeholderTextColor={mutedColor}
                  style={{
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 10,
                    padding: 10,
                    fontSize: 14,
                    color: textColor,
                    backgroundColor: inputBg,
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText
                  style={{
                    fontSize: 11,
                    color: mutedColor,
                    marginBottom: 2,
                  }}
                >
                  Precisa até
                </ThemedText>
                <TextInput
                  value={reqNeededBy}
                  onChangeText={setReqNeededBy}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={mutedColor}
                  style={{
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 10,
                    padding: 10,
                    fontSize: 14,
                    color: textColor,
                    backgroundColor: inputBg,
                  }}
                />
              </View>
            </View>

            {/* ── Priority chips ── */}
            <ThemedText
              style={{
                fontSize: 14,
                fontWeight: "700",
                marginBottom: 8,
                color: tintColor,
              }}
            >
              Prioridade
            </ThemedText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 12 }}
            >
              <View style={{ flexDirection: "row", gap: 8 }}>
                {PRIORITIES.map((p) => {
                  const selected = reqPriority === p.key;
                  const color = PRIORITY_COLORS[p.key];
                  return (
                    <TouchableOpacity
                      key={p.key}
                      onPress={() => setReqPriority(p.key)}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: 999,
                        borderWidth: 1.5,
                        borderColor: selected ? color : borderColor,
                        backgroundColor: selected
                          ? `${color}18`
                          : "transparent",
                      }}
                    >
                      <ThemedText
                        style={{
                          fontSize: 13,
                          fontWeight: selected ? "700" : "500",
                          color: selected ? color : textColor,
                        }}
                      >
                        {p.label}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* ── Products section ── */}
            <ThemedText
              style={{
                fontSize: 14,
                fontWeight: "700",
                marginTop: 4,
                marginBottom: 8,
                color: tintColor,
              }}
            >
              Itens *
            </ThemedText>

            {/* Product search */}
            <View style={{ position: "relative", zIndex: 10, marginBottom: 8 }}>
              <View
                style={{ flexDirection: "row", gap: 8, alignItems: "center" }}
              >
                <TextInput
                  value={productSearch}
                  onChangeText={(t) => {
                    setProductSearch(t);
                    setShowProductPicker(true);
                  }}
                  onFocus={() => setShowProductPicker(true)}
                  placeholder="Buscar produto do catálogo..."
                  placeholderTextColor={mutedColor}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 10,
                    padding: 10,
                    fontSize: 14,
                    color: textColor,
                    backgroundColor: inputBg,
                  }}
                />
                <TouchableOpacity
                  onPress={addManualItem}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderRadius: 10,
                    backgroundColor: tintColor,
                  }}
                >
                  <ThemedText
                    style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}
                  >
                    + Manual
                  </ThemedText>
                </TouchableOpacity>
              </View>

              {/* Product dropdown */}
              {showProductPicker && filteredProducts.length > 0 && (
                <ScrollView
                  style={{
                    position: "absolute",
                    top: 48,
                    left: 0,
                    right: 60,
                    maxHeight: 180,
                    backgroundColor: cardColor,
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 10,
                    zIndex: 20,
                  }}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                >
                  {loadingProducts ? (
                    <ActivityIndicator
                      style={{ padding: 12 }}
                      size="small"
                      color={tintColor}
                    />
                  ) : (
                    filteredProducts.map((p) => (
                      <TouchableOpacity
                        key={p.id}
                        onPress={() => addProduct(p)}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          borderBottomWidth: 1,
                          borderColor,
                        }}
                      >
                        <ThemedText style={{ fontSize: 13, fontWeight: "600" }}>
                          {p.name}
                        </ThemedText>
                        {p.sku ? (
                          <ThemedText
                            style={{ fontSize: 11, color: mutedColor }}
                          >
                            SKU: {p.sku}
                          </ThemedText>
                        ) : null}
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              )}
            </View>

            {/* Items table */}
            {draftItems.length > 0 && (
              <View
                style={{
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 10,
                  overflow: "hidden",
                  marginBottom: 12,
                }}
              >
                {/* Header */}
                <View
                  style={{
                    flexDirection: "row",
                    backgroundColor: `${tintColor}10`,
                    paddingVertical: 8,
                    paddingHorizontal: 8,
                    gap: 4,
                  }}
                >
                  <ThemedText
                    style={{
                      flex: 3,
                      fontSize: 11,
                      fontWeight: "700",
                      color: mutedColor,
                    }}
                  >
                    Item
                  </ThemedText>
                  <ThemedText
                    style={{
                      flex: 1,
                      fontSize: 11,
                      fontWeight: "700",
                      color: mutedColor,
                      textAlign: "center",
                    }}
                  >
                    Qtd
                  </ThemedText>
                  <ThemedText
                    style={{
                      flex: 1.5,
                      fontSize: 11,
                      fontWeight: "700",
                      color: mutedColor,
                      textAlign: "center",
                    }}
                  >
                    Custo Est.
                  </ThemedText>
                  <ThemedText
                    style={{
                      flex: 1.5,
                      fontSize: 11,
                      fontWeight: "700",
                      color: mutedColor,
                      textAlign: "right",
                    }}
                  >
                    Subtotal
                  </ThemedText>
                  <View style={{ width: 30 }} />
                </View>

                {/* Rows */}
                {draftItems.map((item) => {
                  const qty = parseFloat(item.quantity) || 0;
                  const cost = parseFloat(item.estimatedCost) || 0;
                  const rowTotal = qty * cost;

                  return (
                    <View
                      key={item.localId}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: 8,
                        paddingHorizontal: 8,
                        borderTopWidth: 1,
                        borderColor,
                        gap: 4,
                      }}
                    >
                      {/* Name (editable for manual items) */}
                      <View style={{ flex: 3 }}>
                        {item.serviceId ? (
                          <ThemedText
                            style={{ fontSize: 12, fontWeight: "500" }}
                            numberOfLines={1}
                          >
                            {item.name}
                          </ThemedText>
                        ) : (
                          <TextInput
                            value={item.name}
                            onChangeText={(t) =>
                              updateItemField(item.localId, "name", t)
                            }
                            placeholder="Descrição"
                            placeholderTextColor={mutedColor}
                            style={{
                              fontSize: 12,
                              color: textColor,
                              borderBottomWidth: 1,
                              borderColor,
                              paddingVertical: 2,
                            }}
                          />
                        )}
                      </View>

                      {/* Quantity */}
                      <TextInput
                        value={item.quantity}
                        onChangeText={(t) =>
                          updateItemField(
                            item.localId,
                            "quantity",
                            t.replace(/[^\d.,]/g, ""),
                          )
                        }
                        keyboardType="decimal-pad"
                        style={{
                          flex: 1,
                          borderWidth: 1,
                          borderColor,
                          borderRadius: 6,
                          fontSize: 13,
                          textAlign: "center",
                          color: textColor,
                          paddingVertical: Platform.OS === "web" ? 4 : 6,
                          paddingHorizontal: 4,
                        }}
                      />

                      {/* Estimated cost */}
                      <TextInput
                        value={item.estimatedCost}
                        onChangeText={(t) =>
                          updateItemField(
                            item.localId,
                            "estimatedCost",
                            t.replace(/[^\d.,]/g, ""),
                          )
                        }
                        keyboardType="decimal-pad"
                        placeholder="0,00"
                        placeholderTextColor={mutedColor}
                        style={{
                          flex: 1.5,
                          borderWidth: 1,
                          borderColor,
                          borderRadius: 6,
                          fontSize: 13,
                          textAlign: "center",
                          color: textColor,
                          paddingVertical: Platform.OS === "web" ? 4 : 6,
                          paddingHorizontal: 4,
                        }}
                      />

                      {/* Subtotal */}
                      <ThemedText
                        style={{
                          flex: 1.5,
                          fontSize: 12,
                          fontWeight: "600",
                          textAlign: "right",
                        }}
                      >
                        {fmt(rowTotal)}
                      </ThemedText>

                      {/* Remove */}
                      <TouchableOpacity
                        onPress={() => removeItem(item.localId)}
                        style={{ width: 30, alignItems: "center" }}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={16}
                          color="#ef4444"
                        />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}

            {draftItems.length === 0 && (
              <ThemedText
                style={{
                  textAlign: "center",
                  color: mutedColor,
                  fontSize: 13,
                  padding: 16,
                }}
              >
                Nenhum item adicionado.
              </ThemedText>
            )}

            {/* Notes */}
            <ThemedText
              style={{
                fontSize: 14,
                fontWeight: "700",
                marginTop: 4,
                marginBottom: 6,
                color: tintColor,
              }}
            >
              Observações
            </ThemedText>
            <TextInput
              value={reqNotes}
              onChangeText={setReqNotes}
              placeholder="Observações opcionais..."
              placeholderTextColor={mutedColor}
              multiline
              numberOfLines={2}
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 10,
                padding: 10,
                fontSize: 14,
                color: textColor,
                backgroundColor: inputBg,
                marginBottom: 12,
                minHeight: 50,
              }}
            />

            {/* Totals */}
            <View
              style={{
                backgroundColor: `${tintColor}10`,
                borderRadius: 10,
                padding: 12,
                marginBottom: 12,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <ThemedText style={{ fontSize: 16, fontWeight: "700" }}>
                  Total Estimado
                </ThemedText>
                <ThemedText style={{ fontSize: 16, fontWeight: "700" }}>
                  {fmt(subtotal)}
                </ThemedText>
              </View>
            </View>
          </ScrollView>

          {/* Actions */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              gap: 12,
              marginTop: 8,
            }}
          >
            <TouchableOpacity
              onPress={() => setCreateModalVisible(false)}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 999,
                borderWidth: 1,
                borderColor,
              }}
            >
              <ThemedText style={{ fontWeight: "600" }}>Cancelar</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleCreate}
              disabled={creating}
              style={{
                paddingHorizontal: 20,
                paddingVertical: 10,
                borderRadius: 999,
                backgroundColor: creating ? `${tintColor}66` : tintColor,
                flexDirection: "row",
                gap: 6,
                alignItems: "center",
              }}
            >
              {creating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="save" size={16} color="#fff" />
              )}
              <ThemedText style={{ fontWeight: "700", color: "#fff" }}>
                Salvar Solicitação
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  /* ═══════════════════ DETAILS MODAL JSX ═══════════════════ */
  const detailsModal = (
    <Modal
      visible={detailsModalVisible}
      animationType="slide"
      transparent
      onRequestClose={() => setDetailsModalVisible(false)}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <View
          style={{
            backgroundColor: bgColor,
            borderRadius: 16,
            padding: 20,
            maxHeight: "80%",
          }}
        >
          <ThemedText
            style={{ fontSize: 18, fontWeight: "700", marginBottom: 4 }}
          >
            Itens da Solicitação
          </ThemedText>
          {detailsRequest && (
            <ThemedText
              style={{ fontSize: 13, color: mutedColor, marginBottom: 12 }}
            >
              {String(detailsRequest.title ?? "")}
              {detailsRequest.code ? ` — ${detailsRequest.code}` : ""}
            </ThemedText>
          )}

          {loadingDetails ? (
            <ActivityIndicator size="small" color={tintColor} />
          ) : (
            <ScrollView style={{ maxHeight: 400 }}>
              {detailsItems.map((it) => {
                const qty = Number(it.quantity_requested ?? 0);
                const cost = Number(it.estimated_unit_cost ?? 0);
                return (
                  <View
                    key={String(it.id)}
                    style={{
                      borderBottomWidth: 1,
                      borderColor,
                      paddingVertical: 10,
                    }}
                  >
                    <ThemedText style={{ fontWeight: "600" }}>
                      {String(it.description ?? "-")}
                    </ThemedText>
                    <View
                      style={{
                        flexDirection: "row",
                        gap: 12,
                        marginTop: 4,
                        flexWrap: "wrap",
                      }}
                    >
                      <ThemedText style={{ fontSize: 12, color: mutedColor }}>
                        Qtd: {qty}
                      </ThemedText>
                      <ThemedText style={{ fontSize: 12, color: mutedColor }}>
                        Custo est.: {fmt(cost)}
                      </ThemedText>
                      <ThemedText style={{ fontSize: 12, fontWeight: "600" }}>
                        Subtotal: {fmt(qty * cost)}
                      </ThemedText>
                      {it.supplier_suggestion ? (
                        <ThemedText style={{ fontSize: 12, color: mutedColor }}>
                          Fornecedor sugerido: {it.supplier_suggestion}
                        </ThemedText>
                      ) : null}
                    </View>
                    {it.notes ? (
                      <ThemedText
                        style={{
                          fontSize: 11,
                          color: mutedColor,
                          marginTop: 2,
                        }}
                      >
                        {it.notes}
                      </ThemedText>
                    ) : null}
                  </View>
                );
              })}
              {detailsItems.length === 0 && (
                <ThemedText
                  style={{
                    textAlign: "center",
                    color: mutedColor,
                    padding: 20,
                  }}
                >
                  Nenhum item.
                </ThemedText>
              )}
            </ScrollView>
          )}

          {/* Rejection info */}
          {detailsRequest &&
            String(detailsRequest.status) === "rejected" &&
            detailsRequest.rejection_reason && (
              <View
                style={{
                  marginTop: 12,
                  padding: 10,
                  backgroundColor: "#ef444418",
                  borderRadius: 8,
                }}
              >
                <ThemedText
                  style={{ fontSize: 12, fontWeight: "700", color: "#ef4444" }}
                >
                  Motivo da rejeição:
                </ThemedText>
                <ThemedText style={{ fontSize: 12, color: textColor }}>
                  {String(detailsRequest.rejection_reason)}
                </ThemedText>
              </View>
            )}

          <TouchableOpacity
            onPress={() => setDetailsModalVisible(false)}
            style={{
              marginTop: 16,
              paddingVertical: 10,
              borderRadius: 999,
              backgroundColor: tintColor,
              alignItems: "center",
            }}
          >
            <ThemedText style={{ fontWeight: "700", color: "#fff" }}>
              Fechar
            </ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  /* ═══════════════════ REJECT MODAL JSX ═══════════════════ */
  const rejectModal = (
    <Modal
      visible={rejectModalVisible}
      animationType="fade"
      transparent
      onRequestClose={() => setRejectModalVisible(false)}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <View
          style={{
            backgroundColor: bgColor,
            borderRadius: 16,
            padding: 20,
          }}
        >
          <ThemedText
            style={{ fontSize: 18, fontWeight: "700", marginBottom: 12 }}
          >
            Rejeitar Solicitação
          </ThemedText>
          <ThemedText
            style={{ fontSize: 13, color: mutedColor, marginBottom: 12 }}
          >
            Informe o motivo da rejeição (opcional).
          </ThemedText>
          <TextInput
            value={rejectionReason}
            onChangeText={setRejectionReason}
            placeholder="Motivo da rejeição..."
            placeholderTextColor={mutedColor}
            multiline
            numberOfLines={3}
            style={{
              borderWidth: 1,
              borderColor,
              borderRadius: 10,
              padding: 10,
              fontSize: 14,
              color: textColor,
              backgroundColor: inputBg,
              minHeight: 80,
              marginBottom: 16,
            }}
          />
          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              gap: 12,
            }}
          >
            <TouchableOpacity
              onPress={() => setRejectModalVisible(false)}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 999,
                borderWidth: 1,
                borderColor,
              }}
            >
              <ThemedText style={{ fontWeight: "600" }}>Cancelar</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleRejectConfirm}
              disabled={rejecting}
              style={{
                paddingHorizontal: 20,
                paddingVertical: 10,
                borderRadius: 999,
                backgroundColor: rejecting ? "#ef444466" : "#ef4444",
                flexDirection: "row",
                gap: 6,
                alignItems: "center",
              }}
            >
              {rejecting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="close-circle-outline" size={16} color="#fff" />
              )}
              <ThemedText style={{ fontWeight: "700", color: "#fff" }}>
                Rejeitar
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  /* ═══════════════════ RENDER ═══════════════════ */
  return (
    <>
      <CrudScreen<Row>
        title="Solicitações de Compra"
        subtitle="Requisições internas de compras e materiais"
        searchPlaceholder="Buscar por título ou código..."
        searchFields={["title", "code", "department"]}
        fields={fields}
        loadItems={loadItems}
        createItem={createItemDummy}
        updateItem={updateItem}
        deleteItem={deleteItem}
        addButtonLabel="Nova Solicitação"
        onAddPress={openCreateModal}
        controlRef={crudRef}
        headerActions={
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginVertical: 4 }}
          >
            <View style={{ flexDirection: "row", gap: 6 }}>
              <TouchableOpacity
                onPress={() => {
                  setFilterStatus(null);
                  reload();
                }}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 999,
                  borderWidth: 1.5,
                  borderColor: !filterStatus ? tintColor : borderColor,
                  backgroundColor: !filterStatus
                    ? `${tintColor}18`
                    : "transparent",
                }}
              >
                <ThemedText
                  style={{
                    fontSize: 12,
                    fontWeight: !filterStatus ? "700" : "500",
                    color: !filterStatus ? tintColor : textColor,
                  }}
                >
                  Todos
                </ThemedText>
              </TouchableOpacity>
              {Object.entries(STATUS_LABELS).map(([key, label]) => {
                const active = filterStatus === key;
                const color = STATUS_COLORS[key] ?? tintColor;
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => {
                      setFilterStatus(active ? null : key);
                      reload();
                    }}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 999,
                      borderWidth: 1.5,
                      borderColor: active ? color : borderColor,
                      backgroundColor: active ? `${color}18` : "transparent",
                    }}
                  >
                    <ThemedText
                      style={{
                        fontSize: 12,
                        fontWeight: active ? "700" : "500",
                        color: active ? color : textColor,
                      }}
                    >
                      {label}
                    </ThemedText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        }
        getId={(item) => String(item.id ?? "")}
        getTitle={(item) => {
          const title = String(item.title ?? "Sem título");
          const code = item.code ? ` (${item.code})` : "";
          return `${title}${code}`;
        }}
        getDetails={(item) => {
          const status = String(item.status ?? "draft");
          const priority = String(item.priority ?? "medium");
          return [
            { label: "Status", value: STATUS_LABELS[status] ?? status },
            {
              label: "Prioridade",
              value: PRIORITY_LABELS[priority] ?? priority,
            },
            {
              label: "Departamento",
              value: String(item.department ?? "-"),
            },
            { label: "Total Estimado", value: fmt(item.total) },
            {
              label: "Precisa até",
              value: item.needed_by_date
                ? new Date(String(item.needed_by_date)).toLocaleDateString(
                    "pt-BR",
                  )
                : "-",
            },
          ];
        }}
        renderItemActions={(item) => {
          const status = String(item.status ?? "draft");
          const statusColor = STATUS_COLORS[status] ?? "#94a3b8";
          const priorityKey = String(item.priority ?? "medium");
          const priorityColor = PRIORITY_COLORS[priorityKey] ?? "#94a3b8";

          return (
            <View
              style={{
                flexDirection: "row",
                gap: 6,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              {/* Status badge */}
              <View
                style={{
                  backgroundColor: statusColor + "18",
                  borderRadius: 12,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                }}
              >
                <ThemedText
                  style={{
                    color: statusColor,
                    fontSize: 11,
                    fontWeight: "700",
                  }}
                >
                  {STATUS_LABELS[status] ?? status}
                </ThemedText>
              </View>

              {/* Priority badge */}
              <View
                style={{
                  backgroundColor: priorityColor + "18",
                  borderRadius: 12,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                }}
              >
                <ThemedText
                  style={{
                    color: priorityColor,
                    fontSize: 11,
                    fontWeight: "700",
                  }}
                >
                  {PRIORITY_LABELS[priorityKey] ?? priorityKey}
                </ThemedText>
              </View>

              {/* View items */}
              <TouchableOpacity
                onPress={() => openDetailsModal(item)}
                style={{
                  borderWidth: 1,
                  borderColor: tintColor,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  flexDirection: "row",
                  gap: 4,
                  alignItems: "center",
                }}
              >
                <Ionicons name="list-outline" size={13} color={tintColor} />
                <ThemedText
                  style={{ color: tintColor, fontWeight: "700", fontSize: 11 }}
                >
                  Itens
                </ThemedText>
              </TouchableOpacity>

              {/* Draft → Submit for approval */}
              {status === "draft" && (
                <TouchableOpacity
                  onPress={() => handleSubmit(item)}
                  disabled={submitting}
                  style={{
                    borderWidth: 1,
                    borderColor: "#f59e0b",
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    flexDirection: "row",
                    gap: 4,
                    alignItems: "center",
                    opacity: submitting ? 0.5 : 1,
                  }}
                >
                  <Ionicons name="send-outline" size={13} color="#f59e0b" />
                  <ThemedText
                    style={{
                      color: "#f59e0b",
                      fontWeight: "700",
                      fontSize: 11,
                    }}
                  >
                    Enviar
                  </ThemedText>
                </TouchableOpacity>
              )}

              {/* Pending → Approve */}
              {status === "pending_approval" && (
                <TouchableOpacity
                  onPress={() => handleApprove(item)}
                  disabled={submitting}
                  style={{
                    borderWidth: 1,
                    borderColor: "#22c55e",
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    flexDirection: "row",
                    gap: 4,
                    alignItems: "center",
                    opacity: submitting ? 0.5 : 1,
                  }}
                >
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={13}
                    color="#22c55e"
                  />
                  <ThemedText
                    style={{
                      color: "#22c55e",
                      fontWeight: "700",
                      fontSize: 11,
                    }}
                  >
                    Aprovar
                  </ThemedText>
                </TouchableOpacity>
              )}

              {/* Pending → Reject */}
              {status === "pending_approval" && (
                <TouchableOpacity
                  onPress={() => openRejectModal(item)}
                  disabled={submitting}
                  style={{
                    borderWidth: 1,
                    borderColor: "#ef4444",
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    flexDirection: "row",
                    gap: 4,
                    alignItems: "center",
                    opacity: submitting ? 0.5 : 1,
                  }}
                >
                  <Ionicons
                    name="close-circle-outline"
                    size={13}
                    color="#ef4444"
                  />
                  <ThemedText
                    style={{
                      color: "#ef4444",
                      fontWeight: "700",
                      fontSize: 11,
                    }}
                  >
                    Rejeitar
                  </ThemedText>
                </TouchableOpacity>
              )}

              {/* Approved → Convert to Purchase Order */}
              {status === "approved" && (
                <TouchableOpacity
                  onPress={() => handleConvert(item)}
                  disabled={submitting}
                  style={{
                    borderWidth: 1,
                    borderColor: "#3b82f6",
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    flexDirection: "row",
                    gap: 4,
                    alignItems: "center",
                    opacity: submitting ? 0.5 : 1,
                  }}
                >
                  <Ionicons
                    name="swap-horizontal-outline"
                    size={13}
                    color="#3b82f6"
                  />
                  <ThemedText
                    style={{
                      color: "#3b82f6",
                      fontWeight: "700",
                      fontSize: 11,
                    }}
                  >
                    Converter em Compra
                  </ThemedText>
                </TouchableOpacity>
              )}

              {/* Draft or pending → Cancel */}
              {(status === "draft" || status === "pending_approval") && (
                <TouchableOpacity
                  onPress={() => handleCancel(item)}
                  disabled={submitting}
                  style={{
                    borderWidth: 1,
                    borderColor: "#6b7280",
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    opacity: submitting ? 0.5 : 1,
                  }}
                >
                  <ThemedText
                    style={{
                      color: "#6b7280",
                      fontWeight: "700",
                      fontSize: 11,
                    }}
                  >
                    Cancelar
                  </ThemedText>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />
      {createModal}
      {detailsModal}
      {rejectModal}
    </>
  );
}
