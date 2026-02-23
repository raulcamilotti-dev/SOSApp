import { ThemedText } from "@/components/themed-text";
import {
    CrudScreen,
    type CrudFieldConfig,
    type CrudScreenHandle,
} from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
    addPurchaseRequestItem,
    cancelRequest,
    createPurchaseRequest,
    listPurchaseRequestItems,
    listPurchaseRequests,
    removePurchaseRequestItem,
    updatePurchaseRequest,
    updatePurchaseRequestItem,
    type PurchaseRequest,
    type PurchaseRequestItem,
    type PurchaseRequestPriority,
    type PurchaseRequestStatus,
} from "@/services/purchase-requests";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo, useRef, useState } from "react";
import { Modal, ScrollView, TouchableOpacity, View } from "react-native";

type Row = Record<string, unknown>;
type PurchaseRequestRow = PurchaseRequest & Record<string, unknown>;
type PurchaseRequestItemRow = PurchaseRequestItem & Record<string, unknown>;

const STATUS_OPTIONS: { label: string; value: PurchaseRequestStatus }[] = [
  { label: "Rascunho", value: "draft" },
  { label: "Aguardando aprovacao", value: "pending_approval" },
  { label: "Aprovado", value: "approved" },
  { label: "Rejeitado", value: "rejected" },
  { label: "Cancelado", value: "cancelled" },
  { label: "Convertido", value: "converted" },
];

const PRIORITY_OPTIONS: { label: string; value: PurchaseRequestPriority }[] = [
  { label: "Baixa", value: "low" },
  { label: "Media", value: "medium" },
  { label: "Alta", value: "high" },
  { label: "Urgente", value: "urgent" },
];

const ITEM_KIND_OPTIONS = [
  { label: "Produto", value: "product" },
  { label: "Servico", value: "service" },
];

export default function SolicitacoesComprasScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id ?? "";
  const userId = user?.id ?? "";

  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");
  const textColor = useThemeColor({}, "text");

  const requestRef = useRef<CrudScreenHandle | null>(null);

  const [itemsModalVisible, setItemsModalVisible] = useState(false);
  const [activeRequest, setActiveRequest] = useState<PurchaseRequest | null>(
    null,
  );

  const openItems = useCallback((request: PurchaseRequest) => {
    setActiveRequest(request);
    setItemsModalVisible(true);
  }, []);

  const closeItems = useCallback(() => {
    setItemsModalVisible(false);
    setActiveRequest(null);
  }, []);

  const requestFields = useMemo<CrudFieldConfig<PurchaseRequest>[]>(
    () => [
      {
        key: "title",
        label: "Titulo",
        required: true,
        visibleInList: true,
      },
      { key: "code", label: "Codigo", readOnly: true, visibleInList: true },
      { key: "department", label: "Departamento" },
      {
        key: "priority",
        label: "Prioridade",
        type: "select",
        options: PRIORITY_OPTIONS,
      },
      {
        key: "needed_by_date",
        label: "Necessario ate",
        type: "date",
      },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: STATUS_OPTIONS,
      },
      {
        key: "requested_by",
        label: "Solicitado por",
        type: "reference",
        referenceTable: "users",
        referenceLabelField: "fullname",
        referenceSearchField: "fullname",
        readOnly: true,
      },
      {
        key: "submitted_at",
        label: "Enviado em",
        type: "datetime",
        readOnly: true,
      },
      {
        key: "approved_by",
        label: "Aprovado por",
        type: "reference",
        referenceTable: "users",
        referenceLabelField: "fullname",
        referenceSearchField: "fullname",
        readOnly: true,
      },
      {
        key: "approved_at",
        label: "Aprovado em",
        type: "datetime",
        readOnly: true,
      },
      {
        key: "rejected_by",
        label: "Rejeitado por",
        type: "reference",
        referenceTable: "users",
        referenceLabelField: "fullname",
        referenceSearchField: "fullname",
        readOnly: true,
      },
      {
        key: "rejected_at",
        label: "Rejeitado em",
        type: "datetime",
        readOnly: true,
      },
      {
        key: "rejection_reason",
        label: "Motivo da rejeicao",
        type: "multiline",
      },
      {
        key: "subtotal",
        label: "Subtotal",
        type: "currency",
        readOnly: true,
      },
      {
        key: "total",
        label: "Total",
        type: "currency",
        readOnly: true,
      },
      {
        key: "notes",
        label: "Observacoes",
        type: "multiline",
      },
    ],
    [],
  );

  const itemFields = useMemo<CrudFieldConfig<PurchaseRequestItem>[]>(
    () => [
      {
        key: "service_id",
        label: "Produto/Servico",
        type: "reference",
        referenceTable: "services",
        referenceLabelField: "name",
        referenceSearchField: "name",
      },
      {
        key: "item_kind",
        label: "Tipo",
        type: "select",
        options: ITEM_KIND_OPTIONS,
      },
      {
        key: "description",
        label: "Descricao",
        type: "multiline",
      },
      {
        key: "quantity_requested",
        label: "Quantidade",
        type: "number",
        required: true,
      },
      {
        key: "estimated_unit_cost",
        label: "Custo estimado",
        type: "currency",
      },
      {
        key: "subtotal",
        label: "Subtotal",
        type: "currency",
        readOnly: true,
        visibleInList: true,
      },
      {
        key: "supplier_id",
        label: "Fornecedor sugerido",
        type: "reference",
        referenceTable: "suppliers",
        referenceLabelField: "name",
        referenceSearchField: "name",
      },
      {
        key: "supplier_suggestion",
        label: "Obs. fornecedor",
        type: "multiline",
      },
      {
        key: "notes",
        label: "Observacoes",
        type: "multiline",
      },
    ],
    [],
  );

  const loadRequests = useCallback(async (): Promise<PurchaseRequestRow[]> => {
    if (!tenantId) return [];
    const list = await listPurchaseRequests(tenantId);
    return list.filter((r) => !r.deleted_at) as PurchaseRequestRow[];
  }, [tenantId]);

  const createRequest = useCallback(
    async (payload: Row) => {
      if (!tenantId) throw new Error("Tenant invalido");
      const title = String(payload.title ?? "").trim();
      return createPurchaseRequest({
        tenantId,
        title: title || "Solicitacao de compra",
        department: payload.department ? String(payload.department) : undefined,
        priority: (payload.priority as PurchaseRequestPriority) ?? "medium",
        neededByDate: payload.needed_by_date
          ? String(payload.needed_by_date)
          : undefined,
        requestedBy: userId || undefined,
        notes: payload.notes ? String(payload.notes) : undefined,
      });
    },
    [tenantId, userId],
  );

  const updateRequest = useCallback(async (payload: Row) => {
    const id = String(payload.id ?? "");
    if (!id) throw new Error("Id obrigatorio");
    const changes: Partial<PurchaseRequest> = {};
    if (payload.title !== undefined) changes.title = String(payload.title);
    if (payload.department !== undefined) {
      changes.department = String(payload.department);
    }
    if (payload.priority !== undefined) {
      changes.priority = payload.priority as PurchaseRequestPriority;
    }
    if (payload.needed_by_date !== undefined) {
      changes.needed_by_date = String(payload.needed_by_date);
    }
    if (payload.status !== undefined) {
      changes.status = payload.status as PurchaseRequestStatus;
    }
    if (payload.rejection_reason !== undefined) {
      changes.rejection_reason = String(payload.rejection_reason);
    }
    if (payload.notes !== undefined) {
      changes.notes = String(payload.notes);
    }
    await updatePurchaseRequest(id, changes);
  }, []);

  const deleteRequest = useCallback(async (payload: Row) => {
    const id = String(payload.id ?? "");
    if (!id) throw new Error("Id obrigatorio");
    await cancelRequest(id);
  }, []);

  const loadItems = useCallback(async (): Promise<PurchaseRequestItemRow[]> => {
    if (!activeRequest?.id) return [];
    const items = await listPurchaseRequestItems(activeRequest.id);
    return items as PurchaseRequestItemRow[];
  }, [activeRequest?.id]);

  const createItem = useCallback(
    async (payload: Row) => {
      if (!activeRequest?.id) {
        throw new Error("Solicitacao invalida");
      }
      const qty = Number(payload.quantity_requested ?? 1);
      const unitCost = Number(payload.estimated_unit_cost ?? 0);
      const item = await addPurchaseRequestItem({
        requestId: activeRequest.id,
        serviceId: payload.service_id ? String(payload.service_id) : undefined,
        itemKind: payload.item_kind ? String(payload.item_kind) : undefined,
        description: payload.description
          ? String(payload.description)
          : undefined,
        quantityRequested: Number.isNaN(qty) ? 1 : qty,
        estimatedUnitCost: Number.isNaN(unitCost) ? 0 : unitCost,
        supplierSuggestion: payload.supplier_suggestion
          ? String(payload.supplier_suggestion)
          : undefined,
        supplierId: payload.supplier_id
          ? String(payload.supplier_id)
          : undefined,
        notes: payload.notes ? String(payload.notes) : undefined,
        addedBy: userId || undefined,
      });
      requestRef.current?.reload();
      return item;
    },
    [activeRequest?.id, userId],
  );

  const updateItem = useCallback(
    async (payload: Row) => {
      if (!activeRequest?.id) {
        throw new Error("Solicitacao invalida");
      }
      const id = String(payload.id ?? "");
      if (!id) throw new Error("Id obrigatorio");
      await updatePurchaseRequestItem(
        id,
        {
          service_id: payload.service_id
            ? String(payload.service_id)
            : undefined,
          item_kind: payload.item_kind ? String(payload.item_kind) : undefined,
          description: payload.description
            ? String(payload.description)
            : undefined,
          quantity_requested:
            payload.quantity_requested !== undefined
              ? Number(payload.quantity_requested)
              : undefined,
          estimated_unit_cost:
            payload.estimated_unit_cost !== undefined
              ? Number(payload.estimated_unit_cost)
              : undefined,
          supplier_suggestion: payload.supplier_suggestion
            ? String(payload.supplier_suggestion)
            : undefined,
          supplier_id: payload.supplier_id
            ? String(payload.supplier_id)
            : undefined,
          notes: payload.notes ? String(payload.notes) : undefined,
        },
        activeRequest.id,
      );
      requestRef.current?.reload();
    },
    [activeRequest?.id],
  );

  const deleteItem = useCallback(
    async (payload: Row) => {
      if (!activeRequest?.id) {
        throw new Error("Solicitacao invalida");
      }
      const id = String(payload.id ?? "");
      if (!id) throw new Error("Id obrigatorio");
      await removePurchaseRequestItem(id, activeRequest.id);
      requestRef.current?.reload();
    },
    [activeRequest?.id],
  );

  return (
    <View style={{ flex: 1 }}>
      <CrudScreen<PurchaseRequestRow>
        controlRef={requestRef}
        title="Solicitacoes de Compras"
        subtitle="Requisicoes internas com itens e aprovacao"
        searchPlaceholder="Buscar por titulo ou codigo"
        searchFields={["title", "code", "department", "status"]}
        fields={requestFields}
        loadItems={loadRequests}
        createItem={createRequest}
        updateItem={updateRequest}
        deleteItem={deleteRequest}
        getId={(item) => item.id}
        getTitle={(item) =>
          item.code ? `${item.code} - ${item.title}` : item.title
        }
        renderItemActions={(item) => (
          <TouchableOpacity
            onPress={() => openItems(item)}
            style={{
              marginTop: 8,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Ionicons name="list" size={16} color={tintColor} />
            <ThemedText style={{ color: tintColor, fontWeight: "600" }}>
              Itens
            </ThemedText>
          </TouchableOpacity>
        )}
      />

      <Modal
        visible={itemsModalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeItems}
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
              backgroundColor: cardColor,
              borderRadius: 16,
              padding: 16,
              maxHeight: "90%",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontSize: 18, fontWeight: "700" }}>
                  Itens da Solicitacao
                </ThemedText>
                {activeRequest ? (
                  <ThemedText style={{ color: textColor, fontSize: 12 }}>
                    {activeRequest.code ? `${activeRequest.code} - ` : ""}
                    {activeRequest.title}
                  </ThemedText>
                ) : null}
              </View>
              <TouchableOpacity onPress={closeItems}>
                <Ionicons name="close" size={22} color={textColor} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ maxHeight: "80%" }}
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              <CrudScreen<PurchaseRequestItemRow>
                title="Itens"
                subtitle="Adicione produtos e custos estimados"
                fields={itemFields}
                loadItems={loadItems}
                createItem={createItem}
                updateItem={updateItem}
                deleteItem={deleteItem}
                getId={(item) => item.id}
                getTitle={(item) =>
                  String(item.description ?? item.service_id ?? "Item")
                }
                hideAddButton={false}
              />
            </ScrollView>

            <TouchableOpacity
              onPress={closeItems}
              style={{
                marginTop: 12,
                paddingVertical: 10,
                borderRadius: 999,
                backgroundColor: tintColor,
                alignItems: "center",
                borderWidth: 1,
                borderColor,
              }}
            >
              <ThemedText style={{ fontWeight: "700", color: "#fff" }}>
                Fechar
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
