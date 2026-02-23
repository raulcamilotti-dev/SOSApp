/**
 * Compras Admin screen (v2)
 *
 * Full purchase order management with:
 *   - Supplier picker (dedicated suppliers table)
 *   - Multi-item with product search + quantity + unit cost
 *   - Automatic totals (subtotal, discount, shipping, tax, total)
 *   - Receive flow with CMPM cost update
 *   - Status workflow: draft -> ordered -> partial_received / received
 */

import { ThemedText } from "@/components/themed-text";
import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import type { CrudFilter } from "@/services/crud";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import {
    listPurchaseRequestItems,
    listPurchaseRequests,
    updatePurchaseRequest,
    type PurchaseRequest,
    type PurchaseRequestItem,
} from "@/services/purchase-requests";
import {
    cancelPurchaseOrder,
    createPurchaseOrder,
    markAsOrdered,
    receivePurchaseOrder,
} from "@/services/purchases";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo, useState } from "react";
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

type Row = Record<string, unknown>;

interface POItemDraft {
  id: string;
  serviceId: string;
  name: string;
  sku: string;
  quantity: string;
  unitCost: string;
}

interface ReceiveRowUI {
  id: string;
  description: string;
  ordered: number;
  received: number;
  input: string;
}

interface ProductOption {
  id: string;
  name: string;
  sku: string;
  cost_price: number;
  average_cost: number;
  sell_price: number;
  stock_quantity: number;
  unit_id: string | null;
}

interface SupplierOption {
  id: string;
  name: string;
  trade_name: string | null;
  document: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  ordered: "Pedido Enviado",
  partial_received: "Receb. Parcial",
  received: "Recebido",
  cancelled: "Cancelado",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "#94a3b8",
  ordered: "#3b82f6",
  partial_received: "#f59e0b",
  received: "#22c55e",
  cancelled: "#ef4444",
};

const PAYMENT_METHODS: { key: string; label: string; icon: string }[] = [
  { key: "pix", label: "PIX", icon: "qr-code-outline" },
  { key: "boleto", label: "Boleto", icon: "barcode-outline" },
  { key: "credit_card", label: "Cartão Crédito", icon: "card-outline" },
  { key: "debit_card", label: "Cartão Débito", icon: "card-outline" },
  { key: "transfer", label: "Transferência", icon: "swap-horizontal-outline" },
  { key: "cash", label: "Dinheiro", icon: "cash-outline" },
  { key: "a_prazo", label: "A Prazo", icon: "time-outline" },
  { key: "other", label: "Outro", icon: "ellipsis-horizontal-outline" },
];

const PAYMENT_METHOD_LABELS: Record<string, string> = Object.fromEntries(
  PAYMENT_METHODS.map((m) => [m.key, m.label]),
);

const fmt = (v: unknown) => {
  const n = Number(v);
  if (!n && n !== 0) return "-";
  return `R$ ${n.toFixed(2).replace(".", ",")}`;
};

let nextDraftId = 1;
function draftId(): string {
  return `draft_${nextDraftId++}`;
}

export default function ComprasScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const tintColor = useThemeColor({}, "tint");
  const borderColor = useThemeColor({}, "border");
  const bgColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const cardColor = useThemeColor({}, "card");
  const inputBg = useThemeColor({}, "input");

  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [creating, setCreating] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(false);
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>(
    [],
  );
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [requestSearch, setRequestSearch] = useState("");
  const [loadingRequestItems, setLoadingRequestItems] = useState(false);

  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [shippingCost, setShippingCost] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [poNotes, setPoNotes] = useState("");

  const [poItems, setPoItems] = useState<POItemDraft[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [installments, setInstallments] = useState("1");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string | null>(
    null,
  );

  const [submitting, setSubmitting] = useState(false);
  const [receiveModalVisible, setReceiveModalVisible] = useState(false);
  const [receivingOrder, setReceivingOrder] = useState<Row | null>(null);
  const [receivingItems, setReceivingItems] = useState<ReceiveRowUI[]>([]);

  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [detailsOrder, setDetailsOrder] = useState<Row | null>(null);
  const [detailsItems, setDetailsItems] = useState<Row[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const loadReferenceData = useCallback(async () => {
    if (!tenantId) return;
    setLoadingRefs(true);
    try {
      const supRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "suppliers",
        ...buildSearchParams([{ field: "tenant_id", value: tenantId }], {
          sortColumn: "name ASC",
          autoExcludeDeleted: true,
        }),
      });
      setSuppliers(
        normalizeCrudList<Row>(supRes.data).map((s) => ({
          id: String(s.id),
          name: String(s.name ?? ""),
          trade_name: s.trade_name ? String(s.trade_name) : null,
          document: s.document ? String(s.document) : null,
        })),
      );

      const prodRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "services",
        ...buildSearchParams(
          [
            { field: "tenant_id", value: tenantId },
            { field: "item_kind", value: "product", operator: "equal" },
          ],
          { sortColumn: "name ASC", autoExcludeDeleted: true },
        ),
      });
      setProducts(
        normalizeCrudList<Row>(prodRes.data).map((p) => ({
          id: String(p.id),
          name: String(p.name ?? ""),
          sku: String(p.sku ?? ""),
          cost_price: Number(p.cost_price ?? 0),
          average_cost: Number(p.average_cost ?? p.cost_price ?? 0),
          sell_price: Number(p.sell_price ?? 0),
          stock_quantity: Number(p.stock_quantity ?? 0),
          unit_id: p.unit_id ? String(p.unit_id) : null,
        })),
      );

      const reqs = await listPurchaseRequests(tenantId, {
        status: "approved",
      });
      setPurchaseRequests(reqs);
    } catch {
      /* silent */
    } finally {
      setLoadingRefs(false);
    }
  }, [tenantId]);

  const openCreateModal = useCallback(() => {
    setSelectedSupplierId("");
    setSupplierSearch("");
    setSelectedRequestId("");
    setRequestSearch("");
    setInvoiceNumber("");
    setInvoiceDate("");
    setShippingCost("");
    setDiscountAmount("");
    setPoNotes("");
    setPoItems([]);
    setProductSearch("");
    setShowProductPicker(false);
    setPaymentMethod("");
    setInstallments("1");
    setCreateModalVisible(true);
    loadReferenceData();
  }, [loadReferenceData]);

  const addProduct = useCallback((product: ProductOption) => {
    setPoItems((prev) => {
      const existing = prev.find((i) => i.serviceId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.serviceId === product.id
            ? { ...i, quantity: String(Number(i.quantity) + 1) }
            : i,
        );
      }
      return [
        ...prev,
        {
          id: draftId(),
          serviceId: product.id,
          name: product.name,
          sku: product.sku,
          quantity: "1",
          unitCost:
            product.average_cost > 0
              ? product.average_cost.toFixed(2)
              : product.cost_price > 0
                ? product.cost_price.toFixed(2)
                : "0",
        },
      ];
    });
    setProductSearch("");
    setShowProductPicker(false);
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setPoItems((prev) => prev.filter((i) => i.id !== itemId));
  }, []);

  const updateItemField = useCallback(
    (itemId: string, field: "quantity" | "unitCost", value: string) => {
      setPoItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, [field]: value } : i)),
      );
    },
    [],
  );

  const subtotal = poItems.reduce((sum, i) => {
    return sum + (parseFloat(i.quantity) || 0) * (parseFloat(i.unitCost) || 0);
  }, 0);
  const shipping = parseFloat(shippingCost) || 0;
  const discount = parseFloat(discountAmount) || 0;
  const total = subtotal - discount + shipping;

  const handleCreatePO = useCallback(async () => {
    if (!tenantId) return;
    if (poItems.length === 0) {
      Alert.alert("Aviso", "Adicione ao menos 1 produto.");
      return;
    }
    if (!selectedSupplierId) {
      Alert.alert("Aviso", "Selecione um fornecedor.");
      return;
    }
    setCreating(true);
    try {
      const supplier = suppliers.find((s) => s.id === selectedSupplierId);
      const po = await createPurchaseOrder(
        tenantId,
        {
          supplierId: selectedSupplierId,
          supplierName: supplier?.name,
          supplierDocument: supplier?.document ?? undefined,
          invoiceNumber: invoiceNumber || undefined,
          invoiceDate: invoiceDate || undefined,
          shippingCost: shipping,
          discountAmount: discount,
          notes: poNotes || undefined,
          paymentMethod: paymentMethod || undefined,
          installments: Math.max(1, parseInt(installments) || 1),
          userId: user?.id,
        },
        poItems.map((i) => ({
          serviceId: i.serviceId,
          description: `${i.name}${i.sku ? ` (${i.sku})` : ""}`,
          quantityOrdered: parseFloat(i.quantity) || 1,
          unitCost: parseFloat(i.unitCost) || 0,
        })),
      );

      if (selectedRequestId) {
        try {
          await updatePurchaseRequest(selectedRequestId, {
            status: "converted",
            purchase_order_id: String((po as any)?.id ?? ""),
          } as any);
        } catch {
          // keep flow working even if request link fails
        }
      }
      setCreateModalVisible(false);
      reload();
      Alert.alert("Sucesso", "Pedido de compra criado!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao criar pedido";
      Alert.alert("Erro", msg);
    } finally {
      setCreating(false);
    }
  }, [
    tenantId,
    poItems,
    selectedSupplierId,
    suppliers,
    invoiceNumber,
    invoiceDate,
    shipping,
    discount,
    poNotes,
    paymentMethod,
    installments,
    user?.id,
    reload,
    selectedRequestId,
  ]);

  const loadItems = useMemo(() => {
    return async (): Promise<Row[]> => {
      const filters: CrudFilter[] = [
        ...(tenantId ? [{ field: "tenant_id", value: tenantId }] : []),
      ];
      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "purchase_orders",
        ...buildSearchParams(filters, { sortColumn: "created_at DESC" }),
      });
      return normalizeCrudList<Row>(res.data).filter((r) => {
        if (r.deleted_at) return false;
        if (
          filterPaymentMethod &&
          String(r.payment_method ?? "") !== filterPaymentMethod
        )
          return false;
        return true;
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, reloadKey, filterPaymentMethod]);

  const createItemDummy = useMemo(() => async () => ({ ok: true }), []);

  const updateItem = useMemo(() => {
    return async (payload: Record<string, unknown>) => {
      const allowed = [
        "id",
        "supplier_name",
        "supplier_document",
        "supplier_id",
        "invoice_number",
        "invoice_date",
        "shipping_cost",
        "discount_amount",
        "notes",
      ];
      const clean: Record<string, unknown> = {};
      for (const k of allowed) {
        if (payload[k] !== undefined) clean[k] = payload[k];
      }
      if (!clean.id) throw new Error("Id obrigatorio");
      return (
        await api.post(CRUD_ENDPOINT, {
          action: "update",
          table: "purchase_orders",
          payload: clean,
        })
      ).data;
    };
  }, []);

  const deleteItem = useMemo(() => {
    return async (payload: Record<string, unknown>) => {
      if (!payload.id) throw new Error("Id obrigatorio");
      await cancelPurchaseOrder(String(payload.id));
      reload();
    };
  }, [reload]);

  const openReceiveModal = useCallback(async (order: Row) => {
    try {
      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "purchase_order_items",
        ...buildSearchParams([
          { field: "purchase_order_id", value: String(order.id) },
        ]),
      });
      const items = normalizeCrudList<Row>(res.data);
      setReceivingItems(
        items.map((it) => ({
          id: String(it.id),
          description: String(it.description ?? it.service_id ?? "-"),
          ordered: Number(it.quantity_ordered ?? 0),
          received: Number(it.quantity_received ?? 0),
          input: String(
            Math.max(
              0,
              Number(it.quantity_ordered ?? 0) -
                Number(it.quantity_received ?? 0),
            ),
          ),
        })),
      );
      setReceivingOrder(order);
      setReceiveModalVisible(true);
    } catch (err: unknown) {
      Alert.alert(
        "Erro",
        err instanceof Error ? err.message : "Falha ao carregar itens",
      );
    }
  }, []);

  const confirmReceive = useCallback(async () => {
    if (!receivingOrder || submitting) return;
    const items = receivingItems
      .filter((it) => parseFloat(it.input) > 0)
      .map((it) => ({
        itemId: it.id,
        quantityReceived: parseFloat(it.input),
      }));
    if (!items.length) {
      Alert.alert("Aviso", "Informe ao menos 1 item.");
      return;
    }
    setSubmitting(true);
    try {
      await receivePurchaseOrder(
        String(receivingOrder.id),
        tenantId ?? "",
        items,
        user?.id,
      );
      setReceiveModalVisible(false);
      setReceivingOrder(null);
      reload();
      Alert.alert(
        "Sucesso",
        "Recebimento registrado! Estoque, custo medio e contas a pagar atualizados.",
      );
    } catch (err: unknown) {
      Alert.alert(
        "Erro",
        err instanceof Error ? err.message : "Falha no recebimento",
      );
    } finally {
      setSubmitting(false);
    }
  }, [receivingOrder, receivingItems, tenantId, user?.id, reload, submitting]);

  const openDetailsModal = useCallback(async (order: Row) => {
    setDetailsOrder(order);
    setDetailsModalVisible(true);
    setLoadingDetails(true);
    try {
      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "purchase_order_items",
        ...buildSearchParams([
          { field: "purchase_order_id", value: String(order.id) },
        ]),
      });
      setDetailsItems(normalizeCrudList<Row>(res.data));
    } catch {
      setDetailsItems([]);
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  const handleMarkOrdered = useCallback(
    async (item: Row) => {
      if (submitting) return;
      setSubmitting(true);
      try {
        await markAsOrdered(String(item.id));
        reload();
      } catch (err: unknown) {
        Alert.alert("Erro", err instanceof Error ? err.message : "Falha");
      } finally {
        setSubmitting(false);
      }
    },
    [reload, submitting],
  );

  const handleCancel = useCallback(
    (item: Row) => {
      if (submitting) return;
      Alert.alert("Cancelar Pedido", "Deseja cancelar este pedido?", [
        { text: "Nao", style: "cancel" },
        {
          text: "Sim",
          style: "destructive",
          onPress: async () => {
            setSubmitting(true);
            try {
              await cancelPurchaseOrder(String(item.id));
              reload();
            } catch (err: unknown) {
              Alert.alert("Erro", err instanceof Error ? err.message : "Falha");
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]);
    },
    [reload, submitting],
  );

  const fields: CrudFieldConfig<Row>[] = [
    { key: "id", label: "Id", visibleInForm: false, visibleInList: false },
    {
      key: "supplier_name",
      label: "Fornecedor",
      visibleInList: true,
      visibleInForm: false,
    },
    {
      key: "invoice_number",
      label: "Nr NF",
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
      visibleInForm: false,
      visibleInList: true,
    },
    {
      key: "payment_method",
      label: "Pagamento",
      type: "select",
      options: PAYMENT_METHODS.map((m) => ({ value: m.key, label: m.label })),
      readOnly: true,
      visibleInForm: false,
      visibleInList: true,
    },
    {
      key: "total",
      label: "Total",
      type: "currency",
      readOnly: true,
      visibleInForm: false,
      visibleInList: true,
    },
  ];

  const filteredProducts = useMemo(() => {
    if (!productSearch) return products.slice(0, 20);
    const q = productSearch.toLowerCase();
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [products, productSearch]);

  const filteredSuppliers = useMemo(() => {
    if (!supplierSearch) return suppliers;
    const q = supplierSearch.toLowerCase();
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.trade_name?.toLowerCase().includes(q) ?? false) ||
        (s.document?.includes(q) ?? false),
    );
  }, [suppliers, supplierSearch]);

  const filteredRequests = useMemo(() => {
    if (!requestSearch) return purchaseRequests;
    const q = requestSearch.toLowerCase();
    return purchaseRequests.filter((r) => {
      const label = `${r.code ?? ""} ${r.title ?? ""}`.toLowerCase();
      return label.includes(q);
    });
  }, [purchaseRequests, requestSearch]);

  const selectedRequest = purchaseRequests.find(
    (r) => r.id === selectedRequestId,
  );

  const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId);

  const applyPurchaseRequest = useCallback(
    async (request: PurchaseRequest) => {
      setLoadingRequestItems(true);
      try {
        const items = await listPurchaseRequestItems(request.id);
        if (!items.length) {
          Alert.alert("Aviso", "Solicitacao sem itens.");
          return;
        }

        const missingItems: string[] = [];
        const drafts: POItemDraft[] = items.flatMap(
          (item: PurchaseRequestItem) => {
            if (!item.service_id) {
              missingItems.push(item.description ?? "Item sem produto");
              return [];
            }

            const product = products.find((p) => p.id === item.service_id);
            const name = product?.name ?? item.description ?? "Produto";
            const sku = product?.sku ?? "";
            const qty = Number(item.quantity_requested ?? 1);
            const unitCostRaw =
              Number(item.estimated_unit_cost ?? 0) ||
              Number(product?.average_cost ?? product?.cost_price ?? 0);
            const unitCost = Number.isNaN(unitCostRaw) ? 0 : unitCostRaw;

            return [
              {
                id: draftId(),
                serviceId: String(item.service_id),
                name,
                sku,
                quantity: String(Number.isNaN(qty) ? 1 : qty),
                unitCost: unitCost.toFixed(2),
              },
            ];
          },
        );

        if (!drafts.length) {
          Alert.alert(
            "Aviso",
            "Nenhum item com produto vinculado foi encontrado.",
          );
          return;
        }

        const supplierIds = Array.from(
          new Set(
            items.map((it) => String(it.supplier_id ?? "")).filter((id) => id),
          ),
        );
        if (supplierIds.length === 1) {
          setSelectedSupplierId(supplierIds[0]);
        }

        const requestLabel = `${request.code ? `${request.code} - ` : ""}${request.title}`;
        setPoNotes((prev) => {
          const base = String(prev ?? "").trim();
          const note = `Solicitacao: ${requestLabel}`;
          if (!base) return note;
          if (base.includes(note)) return base;
          return `${base}\n${note}`;
        });

        setPoItems(drafts);
        setProductSearch("");
        setShowProductPicker(false);

        if (missingItems.length > 0) {
          Alert.alert(
            "Atencao",
            "Alguns itens nao possuem produto vinculado e foram ignorados.",
          );
        }
      } finally {
        setLoadingRequestItems(false);
      }
    },
    [products],
  );

  /* ======================= CREATE PO MODAL ======================== */
  const createPOModal = (
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
            maxHeight: "90%",
          }}
        >
          <ThemedText
            style={{ fontSize: 20, fontWeight: "700", marginBottom: 16 }}
          >
            Nova Compra
          </ThemedText>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {loadingRefs && (
              <ActivityIndicator
                size="small"
                color={tintColor}
                style={{ marginBottom: 12 }}
              />
            )}

            {loadingRequestItems && (
              <ActivityIndicator
                size="small"
                color={tintColor}
                style={{ marginBottom: 12 }}
              />
            )}

            {/* PURCHASE REQUEST */}
            <ThemedText
              style={{
                fontSize: 14,
                fontWeight: "700",
                marginBottom: 8,
                color: tintColor,
              }}
            >
              Solicitacao de Compra (opcional)
            </ThemedText>
            {selectedRequest ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: `${tintColor}15`,
                  borderRadius: 10,
                  padding: 10,
                  marginBottom: 12,
                  gap: 8,
                }}
              >
                <View style={{ flex: 1 }}>
                  <ThemedText style={{ fontWeight: "600" }}>
                    {selectedRequest.code ? `${selectedRequest.code} - ` : ""}
                    {selectedRequest.title}
                  </ThemedText>
                  <ThemedText style={{ fontSize: 12, color: mutedColor }}>
                    Total estimado: {fmt(selectedRequest.total ?? 0)}
                  </ThemedText>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setSelectedRequestId("");
                    setPoItems([]);
                  }}
                >
                  <Ionicons name="close-circle" size={22} color="#ef4444" />
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TextInput
                  value={requestSearch}
                  onChangeText={setRequestSearch}
                  placeholder="Buscar solicitacao aprovada..."
                  placeholderTextColor={mutedColor}
                  style={{
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 10,
                    padding: 10,
                    fontSize: 14,
                    color: textColor,
                    backgroundColor: inputBg,
                    marginBottom: 8,
                  }}
                />
                {filteredRequests.slice(0, 5).map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    onPress={() => {
                      setSelectedRequestId(r.id);
                      applyPurchaseRequest(r);
                      setRequestSearch("");
                    }}
                    style={{
                      padding: 10,
                      borderBottomWidth: 1,
                      borderColor,
                    }}
                  >
                    <ThemedText style={{ fontWeight: "500" }}>
                      {r.code ? `${r.code} - ` : ""}
                      {r.title}
                    </ThemedText>
                    <ThemedText style={{ fontSize: 11, color: mutedColor }}>
                      Total: {fmt(r.total ?? 0)}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
                {filteredRequests.length === 0 && !loadingRefs && (
                  <ThemedText
                    style={{
                      fontSize: 12,
                      color: mutedColor,
                      textAlign: "center",
                      padding: 12,
                    }}
                  >
                    Nenhuma solicitacao aprovada encontrada.
                  </ThemedText>
                )}
              </>
            )}

            {/* SUPPLIER */}
            <ThemedText
              style={{
                fontSize: 14,
                fontWeight: "700",
                marginBottom: 8,
                color: tintColor,
              }}
            >
              Fornecedor *
            </ThemedText>
            {selectedSupplier ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: `${tintColor}15`,
                  borderRadius: 10,
                  padding: 10,
                  marginBottom: 12,
                  gap: 8,
                }}
              >
                <View style={{ flex: 1 }}>
                  <ThemedText style={{ fontWeight: "600" }}>
                    {selectedSupplier.trade_name || selectedSupplier.name}
                  </ThemedText>
                  {selectedSupplier.document && (
                    <ThemedText style={{ fontSize: 12, color: mutedColor }}>
                      {selectedSupplier.document}
                    </ThemedText>
                  )}
                </View>
                <TouchableOpacity onPress={() => setSelectedSupplierId("")}>
                  <Ionicons name="close-circle" size={22} color="#ef4444" />
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TextInput
                  value={supplierSearch}
                  onChangeText={setSupplierSearch}
                  placeholder="Buscar fornecedor..."
                  placeholderTextColor={mutedColor}
                  style={{
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 10,
                    padding: 10,
                    fontSize: 14,
                    color: textColor,
                    backgroundColor: inputBg,
                    marginBottom: 8,
                  }}
                />
                {filteredSuppliers.slice(0, 5).map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    onPress={() => {
                      setSelectedSupplierId(s.id);
                      setSupplierSearch("");
                    }}
                    style={{ padding: 10, borderBottomWidth: 1, borderColor }}
                  >
                    <ThemedText style={{ fontWeight: "500" }}>
                      {s.trade_name || s.name}
                    </ThemedText>
                    {s.document && (
                      <ThemedText style={{ fontSize: 11, color: mutedColor }}>
                        {s.document}
                      </ThemedText>
                    )}
                  </TouchableOpacity>
                ))}
                {filteredSuppliers.length === 0 && !loadingRefs && (
                  <ThemedText
                    style={{
                      fontSize: 12,
                      color: mutedColor,
                      textAlign: "center",
                      padding: 12,
                    }}
                  >
                    Nenhum fornecedor encontrado. Cadastre primeiro em
                    Fornecedores.
                  </ThemedText>
                )}
              </>
            )}

            {/* INVOICE */}
            <ThemedText
              style={{
                fontSize: 14,
                fontWeight: "700",
                marginTop: 12,
                marginBottom: 8,
                color: tintColor,
              }}
            >
              Nota Fiscal
            </ThemedText>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
              <TextInput
                value={invoiceNumber}
                onChangeText={setInvoiceNumber}
                placeholder="Nr da NF"
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
              <TextInput
                value={invoiceDate}
                onChangeText={setInvoiceDate}
                placeholder="Data (YYYY-MM-DD)"
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
            </View>

            {/* PRODUCTS */}
            <ThemedText
              style={{
                fontSize: 14,
                fontWeight: "700",
                marginTop: 12,
                marginBottom: 8,
                color: tintColor,
              }}
            >
              Produtos *
            </ThemedText>
            <TextInput
              value={productSearch}
              onChangeText={(t) => {
                setProductSearch(t);
                setShowProductPicker(true);
              }}
              onFocus={() => setShowProductPicker(true)}
              placeholder="Buscar produto por nome ou SKU..."
              placeholderTextColor={mutedColor}
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 10,
                padding: 10,
                fontSize: 14,
                color: textColor,
                backgroundColor: inputBg,
                marginBottom: 4,
              }}
            />
            {showProductPicker && filteredProducts.length > 0 && (
              <View
                style={{
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 10,
                  backgroundColor: cardColor,
                  maxHeight: 180,
                  marginBottom: 8,
                }}
              >
                <ScrollView nestedScrollEnabled>
                  {filteredProducts.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => addProduct(p)}
                      style={{
                        padding: 10,
                        borderBottomWidth: 1,
                        borderColor,
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <ThemedText style={{ fontWeight: "500" }}>
                          {p.name}
                        </ThemedText>
                        <ThemedText style={{ fontSize: 11, color: mutedColor }}>
                          {p.sku ? `SKU: ${p.sku} | ` : ""}Custo medio:{" "}
                          {fmt(p.average_cost)} | Estoque: {p.stock_quantity}
                        </ThemedText>
                      </View>
                      <Ionicons name="add-circle" size={24} color={tintColor} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ITEMS TABLE */}
            {poItems.length > 0 && (
              <View
                style={{
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 10,
                  overflow: "hidden",
                  marginBottom: 12,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    backgroundColor: `${tintColor}10`,
                    padding: 8,
                    gap: 4,
                  }}
                >
                  <ThemedText
                    style={{ flex: 3, fontWeight: "700", fontSize: 11 }}
                  >
                    Produto
                  </ThemedText>
                  <ThemedText
                    style={{
                      flex: 1,
                      fontWeight: "700",
                      fontSize: 11,
                      textAlign: "center",
                    }}
                  >
                    Qtd
                  </ThemedText>
                  <ThemedText
                    style={{
                      flex: 1.5,
                      fontWeight: "700",
                      fontSize: 11,
                      textAlign: "center",
                    }}
                  >
                    Custo Un.
                  </ThemedText>
                  <ThemedText
                    style={{
                      flex: 1.5,
                      fontWeight: "700",
                      fontSize: 11,
                      textAlign: "right",
                    }}
                  >
                    Subtotal
                  </ThemedText>
                  <View style={{ width: 28 }} />
                </View>
                {poItems.map((item) => {
                  const qty = parseFloat(item.quantity) || 0;
                  const cost = parseFloat(item.unitCost) || 0;
                  return (
                    <View
                      key={item.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        padding: 8,
                        borderTopWidth: 1,
                        borderColor,
                        gap: 4,
                      }}
                    >
                      <View style={{ flex: 3 }}>
                        <ThemedText
                          style={{ fontSize: 13, fontWeight: "500" }}
                          numberOfLines={1}
                        >
                          {item.name}
                        </ThemedText>
                        {item.sku ? (
                          <ThemedText
                            style={{ fontSize: 10, color: mutedColor }}
                          >
                            {item.sku}
                          </ThemedText>
                        ) : null}
                      </View>
                      <TextInput
                        value={item.quantity}
                        onChangeText={(v) =>
                          updateItemField(item.id, "quantity", v)
                        }
                        keyboardType="numeric"
                        style={{
                          flex: 1,
                          borderWidth: 1,
                          borderColor,
                          borderRadius: 6,
                          padding: 4,
                          textAlign: "center",
                          fontSize: 13,
                          color: textColor,
                          backgroundColor: inputBg,
                        }}
                      />
                      <TextInput
                        value={item.unitCost}
                        onChangeText={(v) =>
                          updateItemField(item.id, "unitCost", v)
                        }
                        keyboardType="decimal-pad"
                        style={{
                          flex: 1.5,
                          borderWidth: 1,
                          borderColor,
                          borderRadius: 6,
                          padding: 4,
                          textAlign: "center",
                          fontSize: 13,
                          color: textColor,
                          backgroundColor: inputBg,
                        }}
                      />
                      <ThemedText
                        style={{
                          flex: 1.5,
                          textAlign: "right",
                          fontSize: 13,
                          fontWeight: "600",
                        }}
                      >
                        {fmt(qty * cost)}
                      </ThemedText>
                      <TouchableOpacity onPress={() => removeItem(item.id)}>
                        <Ionicons
                          name="trash-outline"
                          size={18}
                          color="#ef4444"
                        />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}
            {poItems.length === 0 && (
              <ThemedText
                style={{
                  textAlign: "center",
                  color: mutedColor,
                  fontSize: 13,
                  padding: 16,
                }}
              >
                Nenhum produto adicionado.
              </ThemedText>
            )}

            {/* PAYMENT METHOD */}
            <ThemedText
              style={{
                fontSize: 14,
                fontWeight: "700",
                marginTop: 12,
                marginBottom: 8,
                color: tintColor,
              }}
            >
              Forma de Pagamento
            </ThemedText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 12 }}
            >
              <View style={{ flexDirection: "row", gap: 8 }}>
                {PAYMENT_METHODS.map((pm) => {
                  const selected = paymentMethod === pm.key;
                  return (
                    <TouchableOpacity
                      key={pm.key}
                      onPress={() => setPaymentMethod(selected ? "" : pm.key)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 999,
                        borderWidth: 1.5,
                        borderColor: selected ? tintColor : borderColor,
                        backgroundColor: selected
                          ? `${tintColor}18`
                          : "transparent",
                      }}
                    >
                      <Ionicons
                        name={pm.icon as any}
                        size={16}
                        color={selected ? tintColor : mutedColor}
                      />
                      <ThemedText
                        style={{
                          fontSize: 13,
                          fontWeight: selected ? "700" : "500",
                          color: selected ? tintColor : textColor,
                        }}
                      >
                        {pm.label}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* EXTRAS */}
            <ThemedText
              style={{
                fontSize: 14,
                fontWeight: "700",
                marginTop: 12,
                marginBottom: 8,
                color: tintColor,
              }}
            >
              Valores Adicionais
            </ThemedText>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
              <View style={{ flex: 1 }}>
                <ThemedText
                  style={{ fontSize: 11, color: mutedColor, marginBottom: 2 }}
                >
                  Frete (R$)
                </ThemedText>
                <TextInput
                  value={shippingCost}
                  onChangeText={setShippingCost}
                  keyboardType="decimal-pad"
                  placeholder="0,00"
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
                  style={{ fontSize: 11, color: mutedColor, marginBottom: 2 }}
                >
                  Desconto (R$)
                </ThemedText>
                <TextInput
                  value={discountAmount}
                  onChangeText={setDiscountAmount}
                  keyboardType="decimal-pad"
                  placeholder="0,00"
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
            <TextInput
              value={poNotes}
              onChangeText={setPoNotes}
              placeholder="Observacoes..."
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

            {/* PARCELAMENTO */}
            <ThemedText
              style={{
                fontSize: 14,
                fontWeight: "700",
                marginBottom: 8,
                color: tintColor,
              }}
            >
              Parcelamento
            </ThemedText>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <ThemedText style={{ fontSize: 13, color: mutedColor }}>
                Parcelas:
              </ThemedText>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <TouchableOpacity
                  onPress={() =>
                    setInstallments(
                      String(Math.max(1, (parseInt(installments) || 1) - 1)),
                    )
                  }
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ThemedText style={{ fontWeight: "700", fontSize: 16 }}>
                    −
                  </ThemedText>
                </TouchableOpacity>
                <TextInput
                  value={installments}
                  onChangeText={(t) =>
                    setInstallments(t.replace(/\D/g, "") || "1")
                  }
                  keyboardType="numeric"
                  style={{
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 8,
                    width: 50,
                    textAlign: "center",
                    fontSize: 16,
                    fontWeight: "700",
                    color: textColor,
                    backgroundColor: inputBg,
                    padding: 6,
                  }}
                />
                <TouchableOpacity
                  onPress={() =>
                    setInstallments(
                      String(Math.min(48, (parseInt(installments) || 1) + 1)),
                    )
                  }
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ThemedText style={{ fontWeight: "700", fontSize: 16 }}>
                    +
                  </ThemedText>
                </TouchableOpacity>
              </View>
              {parseInt(installments) > 1 && (
                <ThemedText
                  style={{ fontSize: 12, color: tintColor, fontWeight: "600" }}
                >
                  {parseInt(installments)}x de{" "}
                  {fmt(total / (parseInt(installments) || 1))}
                </ThemedText>
              )}
            </View>

            {/* TOTALS */}
            <View
              style={{
                backgroundColor: `${tintColor}10`,
                borderRadius: 10,
                padding: 12,
                marginBottom: 12,
                gap: 4,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <ThemedText style={{ fontSize: 13 }}>Subtotal</ThemedText>
                <ThemedText style={{ fontSize: 13, fontWeight: "600" }}>
                  {fmt(subtotal)}
                </ThemedText>
              </View>
              {shipping > 0 && (
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <ThemedText style={{ fontSize: 13 }}>Frete</ThemedText>
                  <ThemedText style={{ fontSize: 13 }}>
                    + {fmt(shipping)}
                  </ThemedText>
                </View>
              )}
              {discount > 0 && (
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <ThemedText style={{ fontSize: 13 }}>Desconto</ThemedText>
                  <ThemedText style={{ fontSize: 13, color: "#22c55e" }}>
                    - {fmt(discount)}
                  </ThemedText>
                </View>
              )}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  borderTopWidth: 1,
                  borderColor,
                  paddingTop: 6,
                  marginTop: 4,
                }}
              >
                <ThemedText style={{ fontSize: 16, fontWeight: "700" }}>
                  Total
                </ThemedText>
                <ThemedText style={{ fontSize: 16, fontWeight: "700" }}>
                  {fmt(total)}
                </ThemedText>
              </View>
            </View>
          </ScrollView>

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
              onPress={handleCreatePO}
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
                Salvar Compra
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  /* ======================= RECEIVE MODAL ========================== */
  const receiveModal = (
    <Modal
      visible={receiveModalVisible}
      animationType="slide"
      transparent
      onRequestClose={() => setReceiveModalVisible(false)}
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
            Receber Mercadoria
          </ThemedText>
          <ThemedText
            style={{ fontSize: 12, color: mutedColor, marginBottom: 12 }}
          >
            O custo medio ponderado sera atualizado automaticamente.
          </ThemedText>
          <ScrollView style={{ maxHeight: 400 }}>
            {receivingItems.map((it, idx) => {
              const remaining = Math.max(0, it.ordered - it.received);
              return (
                <View
                  key={it.id}
                  style={{
                    borderBottomWidth: 1,
                    borderColor,
                    paddingVertical: 10,
                  }}
                >
                  <ThemedText style={{ fontWeight: "600", marginBottom: 4 }}>
                    {it.description}
                  </ThemedText>
                  <ThemedText style={{ fontSize: 12, color: mutedColor }}>
                    Pedido: {it.ordered} | Recebido: {it.received} | Faltam:{" "}
                    {remaining}
                  </ThemedText>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      marginTop: 6,
                    }}
                  >
                    <ThemedText style={{ fontSize: 13 }}>Receber:</ThemedText>
                    <TextInput
                      value={it.input}
                      onChangeText={(text) => {
                        const copy = [...receivingItems];
                        copy[idx] = { ...copy[idx], input: text };
                        setReceivingItems(copy);
                      }}
                      keyboardType="numeric"
                      style={{
                        borderWidth: 1,
                        borderColor,
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: Platform.OS === "web" ? 6 : 8,
                        width: 80,
                        fontSize: 14,
                        color: textColor,
                        textAlign: "center",
                      }}
                    />
                  </View>
                </View>
              );
            })}
            {receivingItems.length === 0 && (
              <ThemedText
                style={{ opacity: 0.5, textAlign: "center", padding: 20 }}
              >
                Nenhum item neste pedido.
              </ThemedText>
            )}
          </ScrollView>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              gap: 12,
              marginTop: 16,
            }}
          >
            <TouchableOpacity
              onPress={() => setReceiveModalVisible(false)}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 999,
                borderWidth: 1,
                borderColor,
              }}
            >
              <ThemedText style={{ fontWeight: "600" }}>Fechar</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={confirmReceive}
              disabled={submitting}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 999,
                backgroundColor: submitting ? "#22c55e88" : "#22c55e",
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <ThemedText style={{ fontWeight: "700", color: "#fff" }}>
                  Confirmar Recebimento
                </ThemedText>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  /* ======================= DETAILS MODAL ========================== */
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
            style={{ fontSize: 18, fontWeight: "700", marginBottom: 12 }}
          >
            Itens do Pedido
            {detailsOrder?.supplier_name
              ? ` — ${detailsOrder.supplier_name}`
              : ""}
          </ThemedText>
          {loadingDetails ? (
            <ActivityIndicator size="small" color={tintColor} />
          ) : (
            <ScrollView style={{ maxHeight: 400 }}>
              {detailsItems.map((it) => {
                const qty = Number(it.quantity_ordered ?? 0);
                const cost = Number(it.unit_cost ?? 0);
                const recv = Number(it.quantity_received ?? 0);
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
                      {String(it.description ?? it.service_id ?? "-")}
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
                        Recebido: {recv}
                      </ThemedText>
                      <ThemedText style={{ fontSize: 12, color: mutedColor }}>
                        Custo: {fmt(cost)}
                      </ThemedText>
                      <ThemedText style={{ fontSize: 12, fontWeight: "600" }}>
                        Total: {fmt(qty * cost)}
                      </ThemedText>
                    </View>
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

  /* ======================= RENDER ================================= */
  return (
    <>
      <CrudScreen<Row>
        title="Compras"
        subtitle="Pedidos de compra com custo medio ponderado"
        searchPlaceholder="Buscar fornecedor ou NF..."
        searchFields={["supplier_name", "invoice_number"]}
        fields={fields}
        loadItems={loadItems}
        createItem={createItemDummy}
        updateItem={updateItem}
        deleteItem={deleteItem}
        addButtonLabel="Nova Compra"
        onAddPress={openCreateModal}
        headerActions={
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginVertical: 4 }}
          >
            <View style={{ flexDirection: "row", gap: 6 }}>
              <TouchableOpacity
                onPress={() => {
                  setFilterPaymentMethod(null);
                  reload();
                }}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 999,
                  borderWidth: 1.5,
                  borderColor: !filterPaymentMethod ? tintColor : borderColor,
                  backgroundColor: !filterPaymentMethod
                    ? `${tintColor}18`
                    : "transparent",
                }}
              >
                <ThemedText
                  style={{
                    fontSize: 12,
                    fontWeight: !filterPaymentMethod ? "700" : "500",
                    color: !filterPaymentMethod ? tintColor : textColor,
                  }}
                >
                  Todos
                </ThemedText>
              </TouchableOpacity>
              {PAYMENT_METHODS.map((pm) => {
                const active = filterPaymentMethod === pm.key;
                return (
                  <TouchableOpacity
                    key={pm.key}
                    onPress={() => {
                      setFilterPaymentMethod(active ? null : pm.key);
                      reload();
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 999,
                      borderWidth: 1.5,
                      borderColor: active ? tintColor : borderColor,
                      backgroundColor: active
                        ? `${tintColor}18`
                        : "transparent",
                    }}
                  >
                    <Ionicons
                      name={pm.icon as any}
                      size={13}
                      color={active ? tintColor : mutedColor}
                    />
                    <ThemedText
                      style={{
                        fontSize: 12,
                        fontWeight: active ? "700" : "500",
                        color: active ? tintColor : textColor,
                      }}
                    >
                      {pm.label}
                    </ThemedText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        }
        getId={(item) => String(item.id ?? "")}
        getTitle={(item) => {
          const supplier = item.supplier_name ?? "Sem fornecedor";
          const nf = item.invoice_number ? ` | NF ${item.invoice_number}` : "";
          return ` ${supplier}${nf}`;
        }}
        getDetails={(item) => {
          const status = String(item.status ?? "draft");
          return [
            { label: "Fornecedor", value: String(item.supplier_name ?? "-") },
            { label: "NF", value: String(item.invoice_number ?? "-") },
            { label: "Status", value: STATUS_LABELS[status] ?? status },
            { label: "Subtotal", value: fmt(item.subtotal) },
            { label: "Frete", value: fmt(item.shipping_cost) },
            { label: "Desconto", value: fmt(item.discount_amount) },
            {
              label: "Pagamento",
              value:
                PAYMENT_METHOD_LABELS[String(item.payment_method ?? "")] ??
                String(item.payment_method || "-"),
            },
            { label: "Total", value: fmt(item.total) },
          ];
        }}
        renderItemActions={(item) => {
          const status = String(item.status ?? "draft");
          const statusColor = STATUS_COLORS[status] ?? "#94a3b8";
          return (
            <View
              style={{
                flexDirection: "row",
                gap: 6,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
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
              {status === "draft" && (
                <TouchableOpacity
                  onPress={() => handleMarkOrdered(item)}
                  disabled={submitting}
                  style={{
                    borderWidth: 1,
                    borderColor: tintColor,
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    flexDirection: "row",
                    gap: 4,
                    alignItems: "center",
                    opacity: submitting ? 0.5 : 1,
                  }}
                >
                  <Ionicons name="send-outline" size={13} color={tintColor} />
                  <ThemedText
                    style={{
                      color: tintColor,
                      fontWeight: "700",
                      fontSize: 11,
                    }}
                  >
                    Enviar
                  </ThemedText>
                </TouchableOpacity>
              )}
              {(status === "ordered" || status === "partial_received") && (
                <TouchableOpacity
                  onPress={() => openReceiveModal(item)}
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
                    name="checkmark-done-outline"
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
                    Receber
                  </ThemedText>
                </TouchableOpacity>
              )}
              {(status === "draft" || status === "ordered") && (
                <TouchableOpacity
                  onPress={() => handleCancel(item)}
                  disabled={submitting}
                  style={{
                    borderWidth: 1,
                    borderColor: "#ef4444",
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    opacity: submitting ? 0.5 : 1,
                  }}
                >
                  <ThemedText
                    style={{
                      color: "#ef4444",
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
      {createPOModal}
      {receiveModal}
      {detailsModal}
    </>
  );
}
