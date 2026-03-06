/**
 * TabelasPreco — Admin screen
 *
 * CrudScreen for price_lists with nested detail modal for:
 * - Price list items (per product or per category pricing)
 * - Customer links (which customers use this price list)
 *
 * Price types: fixed, discount_percent, markup_percent
 * Resolution: customer's lists → highest priority → product-specific > category → fallback sell_price
 */

import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api, getApiErrorMessage } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import {
    createPriceList,
    createPriceListItem,
    deletePriceList,
    deletePriceListItem,
    getPriceListCustomers,
    linkCustomerToPriceList,
    listPriceListItems,
    listPriceLists,
    unlinkCustomerFromPriceList,
    updatePriceList,
    updatePriceListItem,
    type CustomerPriceList,
    type PriceListItem,
    type PriceType,
} from "@/services/price-lists";
import { Ionicons } from "@expo/vector-icons";
import { createElement, useCallback, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

type Row = Record<string, unknown>;

/* ─────────── Helpers ─────────── */

const PRICE_TYPE_LABELS: Record<PriceType, string> = {
  fixed: "Preço fixo",
  discount_percent: "Desconto %",
  markup_percent: "Markup %",
};

const fmtCurrency = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "-";
  const num = typeof v === "number" ? v : parseFloat(String(v));
  if (isNaN(num)) return "-";
  return num.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
};

const fmtDate = (v: unknown): string => {
  if (!v) return "-";
  const d = new Date(String(v));
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

/* ─────────── Screen ─────────── */

export default function TabelasPrecoScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;

  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");
  const inputBg = useThemeColor({}, "input");

  /* ── Detail modal state ── */
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailList, setDetailList] = useState<Row | null>(null);
  const [detailItems, setDetailItems] = useState<PriceListItem[]>([]);
  const [detailCustomers, setDetailCustomers] = useState<CustomerPriceList[]>(
    [],
  );
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  /* ── Item form state ── */
  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [itemEditing, setItemEditing] = useState<PriceListItem | null>(null);
  const [itemServiceId, setItemServiceId] = useState("");
  const [itemCategoryId, setItemCategoryId] = useState("");
  const [itemPriceType, setItemPriceType] = useState<PriceType>("fixed");
  const [itemPriceValue, setItemPriceValue] = useState("");
  const [itemSaving, setItemSaving] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);

  /* ── Customer link state ── */
  const [linkCustomerId, setLinkCustomerId] = useState("");
  const [linkSaving, setLinkSaving] = useState(false);

  /* ── Name caches ── */
  const [productNames, setProductNames] = useState<Record<string, string>>({});
  const [categoryNames, setCategoryNames] = useState<Record<string, string>>(
    {},
  );
  const [customerNames, setCustomerNames] = useState<Record<string, string>>(
    {},
  );

  const crudRef = useRef<{ reload: () => void } | null>(null);

  /* ════════ Main CrudScreen config ════════ */

  const fields: CrudFieldConfig<Row>[] = useMemo(
    () => [
      { key: "name", label: "Nome", type: "text", required: true },
      {
        key: "description",
        label: "Descrição",
        type: "multiline",
        visibleInList: false,
      },
      { key: "priority", label: "Prioridade", type: "number", required: true },
      { key: "valid_from", label: "Início vigência", type: "date" },
      { key: "valid_until", label: "Fim vigência", type: "date" },
      {
        key: "is_active",
        label: "Ativa",
        type: "boolean",
      },
    ],
    [],
  );

  const loadItems = useCallback(async (): Promise<Row[]> => {
    if (!tenantId) return [];
    return listPriceLists(tenantId) as unknown as Row[];
  }, [tenantId]);

  const handleCreate = useCallback(
    async (payload: Partial<Row>) => {
      if (!tenantId) throw new Error("Tenant não encontrado");
      return createPriceList({
        tenantId,
        name: String(payload.name ?? ""),
        description: payload.description
          ? String(payload.description)
          : undefined,
        priority: Number(payload.priority ?? 0),
        validFrom: payload.valid_from ? String(payload.valid_from) : undefined,
        validUntil: payload.valid_until
          ? String(payload.valid_until)
          : undefined,
        isActive:
          payload.is_active === true || payload.is_active === "true"
            ? true
            : false,
      });
    },
    [tenantId],
  );

  const handleUpdate = useCallback(
    async (payload: Partial<Row> & { id?: string | null }) => {
      if (!payload.id) throw new Error("ID não encontrado");
      return updatePriceList(payload.id, {
        name: payload.name ? String(payload.name) : undefined,
        description:
          payload.description !== undefined
            ? String(payload.description ?? "")
            : undefined,
        priority:
          payload.priority !== undefined ? Number(payload.priority) : undefined,
        valid_from:
          payload.valid_from !== undefined
            ? String(payload.valid_from ?? "")
            : undefined,
        valid_until:
          payload.valid_until !== undefined
            ? String(payload.valid_until ?? "")
            : undefined,
        is_active:
          payload.is_active !== undefined
            ? payload.is_active === true || payload.is_active === "true"
            : undefined,
      });
    },
    [],
  );

  const handleDelete = useCallback(
    async (payload: Partial<Row> & { id?: string | null }) => {
      if (!payload.id) throw new Error("ID não encontrado");
      return deletePriceList(payload.id);
    },
    [],
  );

  /* ════════ Detail modal logic ════════ */

  const resolveNames = useCallback(
    async (items: PriceListItem[], customers: CustomerPriceList[]) => {
      // Resolve product names
      const serviceIds = [
        ...new Set(
          items.map((i) => i.service_id).filter((id): id is string => !!id),
        ),
      ];
      if (serviceIds.length > 0) {
        try {
          const res = await api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "services",
            ...buildSearchParams(
              [
                {
                  field: "id",
                  value: serviceIds.join(","),
                  operator: "in" as const,
                },
              ],
              { fields: ["id", "name"] },
            ),
          });
          const rows = normalizeCrudList<Row>(res.data);
          const names: Record<string, string> = {};
          for (const r of rows) names[String(r.id)] = String(r.name ?? "");
          setProductNames((prev) => ({ ...prev, ...names }));
        } catch {
          /* best effort */
        }
      }

      // Resolve category names
      const catIds = [
        ...new Set(
          items
            .map((i) => i.service_category_id)
            .filter((id): id is string => !!id),
        ),
      ];
      if (catIds.length > 0) {
        try {
          const res = await api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "service_categories",
            ...buildSearchParams(
              [
                {
                  field: "id",
                  value: catIds.join(","),
                  operator: "in" as const,
                },
              ],
              { fields: ["id", "name"] },
            ),
          });
          const rows = normalizeCrudList<Row>(res.data);
          const names: Record<string, string> = {};
          for (const r of rows) names[String(r.id)] = String(r.name ?? "");
          setCategoryNames((prev) => ({ ...prev, ...names }));
        } catch {
          /* best effort */
        }
      }

      // Resolve customer names
      const custIds = [
        ...new Set(customers.map((c) => c.customer_id).filter(Boolean)),
      ];
      if (custIds.length > 0) {
        try {
          const res = await api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "customers",
            ...buildSearchParams(
              [
                {
                  field: "id",
                  value: custIds.join(","),
                  operator: "in" as const,
                },
              ],
              { fields: ["id", "name"] },
            ),
          });
          const rows = normalizeCrudList<Row>(res.data);
          const names: Record<string, string> = {};
          for (const r of rows) names[String(r.id)] = String(r.name ?? "");
          setCustomerNames((prev) => ({ ...prev, ...names }));
        } catch {
          /* best effort */
        }
      }
    },
    [],
  );

  const openDetail = useCallback(
    async (item: Row) => {
      const listId = String(item.id ?? "");
      if (!listId) return;
      setDetailList(item);
      setDetailOpen(true);
      setDetailLoading(true);
      setDetailError(null);

      try {
        const [items, customers] = await Promise.all([
          listPriceListItems(listId),
          getPriceListCustomers(listId),
        ]);
        setDetailItems(items.filter((i) => !i.deleted_at));
        setDetailCustomers(customers.filter((c) => !c.deleted_at));
        await resolveNames(items, customers);
      } catch (err) {
        setDetailError(getApiErrorMessage(err, "Falha ao carregar detalhes"));
      } finally {
        setDetailLoading(false);
      }
    },
    [resolveNames],
  );

  const refreshDetail = useCallback(async () => {
    if (!detailList) return;
    const listId = String(detailList.id ?? "");
    try {
      const [items, customers] = await Promise.all([
        listPriceListItems(listId),
        getPriceListCustomers(listId),
      ]);
      setDetailItems(items.filter((i) => !i.deleted_at));
      setDetailCustomers(customers.filter((c) => !c.deleted_at));
      await resolveNames(items, customers);
    } catch {
      /* silent */
    }
  }, [detailList, resolveNames]);

  /* ── Item form ── */

  const openItemForm = useCallback((existing?: PriceListItem) => {
    if (existing) {
      setItemEditing(existing);
      setItemServiceId(existing.service_id ?? "");
      setItemCategoryId(existing.service_category_id ?? "");
      setItemPriceType(existing.price_type);
      setItemPriceValue(String(existing.price_value));
    } else {
      setItemEditing(null);
      setItemServiceId("");
      setItemCategoryId("");
      setItemPriceType("fixed");
      setItemPriceValue("");
    }
    setItemError(null);
    setItemFormOpen(true);
  }, []);

  const saveItem = useCallback(async () => {
    if (!detailList) return;
    const listId = String(detailList.id ?? "");
    if (!itemServiceId && !itemCategoryId) {
      setItemError("Informe o produto ou a categoria.");
      return;
    }
    const value = parseFloat(itemPriceValue.replace(",", "."));
    if (isNaN(value) || value < 0) {
      setItemError("Valor inválido.");
      return;
    }

    setItemSaving(true);
    setItemError(null);
    try {
      if (itemEditing) {
        await updatePriceListItem(itemEditing.id, {
          service_id: itemServiceId || null,
          service_category_id: itemCategoryId || null,
          price_type: itemPriceType,
          price_value: value,
        });
      } else {
        await createPriceListItem({
          priceListId: listId,
          serviceId: itemServiceId || undefined,
          serviceCategoryId: itemCategoryId || undefined,
          priceType: itemPriceType,
          priceValue: value,
        });
      }
      setItemFormOpen(false);
      await refreshDetail();
    } catch (err) {
      setItemError(getApiErrorMessage(err, "Falha ao salvar."));
    } finally {
      setItemSaving(false);
    }
  }, [
    detailList,
    itemCategoryId,
    itemEditing,
    itemPriceType,
    itemPriceValue,
    itemServiceId,
    refreshDetail,
  ]);

  const removeItem = useCallback(
    async (itemId: string) => {
      const doDelete = async () => {
        try {
          await deletePriceListItem(itemId);
          await refreshDetail();
        } catch {
          /* silent */
        }
      };
      if (Platform.OS === "web") {
        if (window.confirm("Remover este preço?")) doDelete();
      } else {
        Alert.alert("Confirmar", "Remover este preço?", [
          { text: "Cancelar", style: "cancel" },
          { text: "Remover", style: "destructive", onPress: doDelete },
        ]);
      }
    },
    [refreshDetail],
  );

  /* ── Customer link ── */

  const addCustomerLink = useCallback(async () => {
    if (!detailList || !linkCustomerId.trim()) return;
    const listId = String(detailList.id ?? "");
    setLinkSaving(true);
    try {
      await linkCustomerToPriceList(linkCustomerId.trim(), listId);
      setLinkCustomerId("");
      await refreshDetail();
    } catch {
      /* silent */
    } finally {
      setLinkSaving(false);
    }
  }, [detailList, linkCustomerId, refreshDetail]);

  const removeCustomerLink = useCallback(
    async (linkId: string) => {
      const doDelete = async () => {
        try {
          await unlinkCustomerFromPriceList(linkId);
          await refreshDetail();
        } catch {
          /* silent */
        }
      };
      if (Platform.OS === "web") {
        if (window.confirm("Remover vínculo?")) doDelete();
      } else {
        Alert.alert("Confirmar", "Remover vínculo?", [
          { text: "Cancelar", style: "cancel" },
          { text: "Remover", style: "destructive", onPress: doDelete },
        ]);
      }
    },
    [refreshDetail],
  );

  /* ═══ Shared styles ═══ */

  const inputStyle = {
    borderWidth: 1,
    borderColor,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: inputBg,
    color: textColor,
    fontSize: 14,
  } as const;

  const pillSelected = {
    backgroundColor: tintColor + "1A",
    borderColor: tintColor,
  };

  /* ════════ Render ════════ */

  return (
    <View style={{ flex: 1 }}>
      <CrudScreen<Row>
        title="Tabelas de Preço"
        subtitle="Preços diferenciados por cliente"
        fields={fields}
        loadItems={loadItems}
        createItem={handleCreate}
        updateItem={handleUpdate}
        deleteItem={handleDelete}
        getId={(item) => String(item.id ?? "")}
        getTitle={(item) => String(item.name ?? "Sem nome")}
        getDetails={(item) => [
          {
            label: "Prioridade",
            value: String(item.priority ?? "0"),
          },
          {
            label: "Ativa",
            value: item.is_active ? "Sim" : "Não",
          },
          {
            label: "Vigência",
            value:
              item.valid_from || item.valid_until
                ? `${fmtDate(item.valid_from)} — ${fmtDate(item.valid_until)}`
                : "Sem restrição",
          },
        ]}
        renderItemActions={(item) => (
          <TouchableOpacity
            onPress={() => openDetail(item)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              backgroundColor: tintColor + "12",
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 8,
            }}
          >
            <Ionicons name="list-outline" size={14} color={tintColor} />
            <Text style={{ color: tintColor, fontWeight: "600", fontSize: 12 }}>
              Itens & Clientes
            </Text>
          </TouchableOpacity>
        )}
        renderCustomField={(field, value, onChange) => {
          if (field.key !== "valid_from" && field.key !== "valid_until")
            return null;
          if (Platform.OS !== "web") return null;
          return createElement("input", {
            type: "date",
            value: value || "",
            onChange: (e: any) => onChange(e.target?.value ?? ""),
            style: {
              fontSize: 14,
              padding: "10px 12px",
              borderRadius: 8,
              border: `1px solid ${borderColor}`,
              backgroundColor: inputBg,
              color: textColor,
              width: "100%",
              fontFamily: "inherit",
              cursor: "pointer",
            },
          });
        }}
        searchPlaceholder="Buscar tabelas..."
        searchFields={["name", "description"]}
        controlRef={crudRef as any}
      />

      {/* ══════ Detail Modal ══════ */}
      <Modal
        visible={detailOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailOpen(false)}
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
              backgroundColor: cardColor,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 20,
              maxHeight: "90%",
            }}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "700",
                    color: textColor,
                  }}
                >
                  {String(detailList?.name ?? "")}
                </Text>
                <Text style={{ fontSize: 12, color: mutedColor, marginTop: 2 }}>
                  Prioridade: {String(detailList?.priority ?? 0)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setDetailOpen(false)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: borderColor + "60",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: mutedColor, fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            </View>

            {detailLoading ? (
              <ActivityIndicator
                style={{ marginVertical: 32 }}
                color={tintColor}
              />
            ) : detailError ? (
              <Text style={{ color: "#dc2626", marginBottom: 12 }}>
                {detailError}
              </Text>
            ) : (
              <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
                {/* ── Price Items Section ── */}
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color: textColor,
                    }}
                  >
                    Preços ({detailItems.length})
                  </Text>
                  <TouchableOpacity
                    onPress={() => openItemForm()}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      backgroundColor: tintColor,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 8,
                    }}
                  >
                    <Ionicons name="add" size={14} color="#fff" />
                    <Text
                      style={{
                        color: "#fff",
                        fontWeight: "600",
                        fontSize: 12,
                      }}
                    >
                      Adicionar
                    </Text>
                  </TouchableOpacity>
                </View>

                {detailItems.length === 0 ? (
                  <Text
                    style={{
                      color: mutedColor,
                      fontStyle: "italic",
                      paddingVertical: 12,
                    }}
                  >
                    Nenhum preço configurado.
                  </Text>
                ) : (
                  detailItems.map((pi) => {
                    const productLabel = pi.service_id
                      ? (productNames[pi.service_id] ?? pi.service_id)
                      : null;
                    const catLabel = pi.service_category_id
                      ? (categoryNames[pi.service_category_id] ??
                        pi.service_category_id)
                      : null;

                    const valueLabel =
                      pi.price_type === "fixed"
                        ? fmtCurrency(pi.price_value)
                        : `${pi.price_value}%`;

                    return (
                      <View
                        key={pi.id}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingVertical: 10,
                          borderBottomWidth: 1,
                          borderBottomColor: borderColor + "40",
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: "600",
                              color: textColor,
                            }}
                            numberOfLines={1}
                          >
                            {productLabel
                              ? `🏷️ ${productLabel}`
                              : catLabel
                                ? `📁 ${catLabel}`
                                : "?"}
                          </Text>
                          <Text
                            style={{
                              fontSize: 12,
                              color: mutedColor,
                              marginTop: 2,
                            }}
                          >
                            {PRICE_TYPE_LABELS[pi.price_type]}: {valueLabel}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => openItemForm(pi)}
                          style={{ padding: 6 }}
                        >
                          <Ionicons
                            name="pencil-outline"
                            size={16}
                            color={tintColor}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => removeItem(pi.id)}
                          style={{ padding: 6 }}
                        >
                          <Ionicons
                            name="trash-outline"
                            size={16}
                            color="#dc2626"
                          />
                        </TouchableOpacity>
                      </View>
                    );
                  })
                )}

                {/* ── Customers Section ── */}
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 20,
                    marginBottom: 8,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color: textColor,
                    }}
                  >
                    Clientes ({detailCustomers.length})
                  </Text>
                </View>

                {/* Add customer input */}
                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    marginBottom: 8,
                    alignItems: "center",
                  }}
                >
                  <TextInput
                    value={linkCustomerId}
                    onChangeText={setLinkCustomerId}
                    placeholder="ID do cliente"
                    placeholderTextColor={mutedColor}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <TouchableOpacity
                    onPress={addCustomerLink}
                    disabled={linkSaving || !linkCustomerId.trim()}
                    style={{
                      backgroundColor:
                        linkSaving || !linkCustomerId.trim()
                          ? mutedColor
                          : tintColor,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderRadius: 8,
                    }}
                  >
                    {linkSaving ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text
                        style={{
                          color: "#fff",
                          fontWeight: "600",
                          fontSize: 12,
                        }}
                      >
                        Vincular
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>

                {detailCustomers.length === 0 ? (
                  <Text
                    style={{
                      color: mutedColor,
                      fontStyle: "italic",
                      paddingVertical: 8,
                    }}
                  >
                    Nenhum cliente vinculado.
                  </Text>
                ) : (
                  detailCustomers.map((cl) => (
                    <View
                      key={cl.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: 8,
                        borderBottomWidth: 1,
                        borderBottomColor: borderColor + "40",
                      }}
                    >
                      <Ionicons
                        name="person-outline"
                        size={14}
                        color={mutedColor}
                        style={{ marginRight: 6 }}
                      />
                      <Text
                        style={{
                          flex: 1,
                          fontSize: 13,
                          color: textColor,
                        }}
                        numberOfLines={1}
                      >
                        {customerNames[cl.customer_id] ?? cl.customer_id}
                      </Text>
                      <TouchableOpacity
                        onPress={() => removeCustomerLink(cl.id)}
                        style={{ padding: 6 }}
                      >
                        <Ionicons
                          name="close-circle-outline"
                          size={18}
                          color="#dc2626"
                        />
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ══════ Item Form Modal ══════ */}
      <Modal
        visible={itemFormOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setItemFormOpen(false)}
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
              backgroundColor: cardColor,
              borderRadius: 16,
              padding: 20,
            }}
          >
            <Text
              style={{
                fontSize: 17,
                fontWeight: "700",
                color: textColor,
                marginBottom: 16,
              }}
            >
              {itemEditing ? "Editar Preço" : "Novo Preço"}
            </Text>

            {/* Product ID */}
            <Text style={{ fontSize: 12, color: mutedColor, marginBottom: 4 }}>
              ID do Produto (ou deixe vazio)
            </Text>
            <TextInput
              value={itemServiceId}
              onChangeText={setItemServiceId}
              placeholder="UUID do produto"
              placeholderTextColor={mutedColor}
              style={{ ...inputStyle, marginBottom: 12 }}
            />

            {/* Category ID */}
            <Text style={{ fontSize: 12, color: mutedColor, marginBottom: 4 }}>
              ID da Categoria (ou deixe vazio)
            </Text>
            <TextInput
              value={itemCategoryId}
              onChangeText={setItemCategoryId}
              placeholder="UUID da categoria"
              placeholderTextColor={mutedColor}
              style={{ ...inputStyle, marginBottom: 12 }}
            />

            {/* Price type */}
            <Text style={{ fontSize: 12, color: mutedColor, marginBottom: 4 }}>
              Tipo de preço *
            </Text>
            <View
              style={{
                flexDirection: "row",
                gap: 8,
                marginBottom: 12,
                flexWrap: "wrap",
              }}
            >
              {(Object.entries(PRICE_TYPE_LABELS) as [PriceType, string][]).map(
                ([key, label]) => (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setItemPriceType(key)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor,
                      ...(itemPriceType === key ? pillSelected : {}),
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: itemPriceType === key ? "700" : "400",
                        color: itemPriceType === key ? tintColor : textColor,
                      }}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                ),
              )}
            </View>

            {/* Price value */}
            <Text style={{ fontSize: 12, color: mutedColor, marginBottom: 4 }}>
              Valor *
            </Text>
            <TextInput
              value={itemPriceValue}
              onChangeText={setItemPriceValue}
              placeholder={itemPriceType === "fixed" ? "45.00" : "10"}
              placeholderTextColor={mutedColor}
              keyboardType="decimal-pad"
              style={{ ...inputStyle, marginBottom: 12 }}
            />

            {itemError ? (
              <Text style={{ color: "#dc2626", marginBottom: 8, fontSize: 13 }}>
                {itemError}
              </Text>
            ) : null}

            <View
              style={{
                flexDirection: "row",
                gap: 8,
                justifyContent: "flex-end",
              }}
            >
              <TouchableOpacity
                onPress={() => setItemFormOpen(false)}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor,
                }}
              >
                <Text style={{ color: textColor, fontWeight: "600" }}>
                  Cancelar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={saveItem}
                disabled={itemSaving}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 8,
                  backgroundColor: itemSaving ? mutedColor : tintColor,
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>
                  {itemSaving ? "Salvando..." : "Salvar"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
