/**
 * QuoteSection — Orçamentos section for Processo.tsx
 *
 * Allows creating, viewing, sending, and managing quotes
 * for a service order. Renders as a collapsible card.
 */
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
    applyTemplateToQuote,
    formatTemplateCurrency,
    listQuoteTemplates,
    parseTemplateItems,
    type QuoteTemplate,
} from "@/services/quote-templates";
import {
    buildQuoteUrl,
    buildQuoteWhatsAppUrl,
    createQuote,
    deleteQuote,
    listQuoteItems,
    listQuotes,
    sendQuote,
    type Quote,
    type QuoteItem,
    type QuoteItemInput,
    type QuoteStatus,
} from "@/services/quotes";
import { Ionicons } from "@expo/vector-icons";
import type { AxiosInstance } from "axios";
import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Linking,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

/* ── Props ──────────────────────────────────────────────────────── */

interface QuoteSectionProps {
  authApi: AxiosInstance;
  serviceOrderId: string;
  tenantId: string;
  userId: string;
  workflowStepId?: string | null;
  orderTitle?: string | null;
}

/* ── Status helpers ─────────────────────────────────────────────── */

const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "Rascunho",
  sent: "Enviado",
  viewed: "Visualizado",
  approved: "Aprovado",
  rejected: "Recusado",
  expired: "Expirado",
};

const STATUS_COLORS: Record<QuoteStatus, string> = {
  draft: "#94a3b8",
  sent: "#0a7ea4",
  viewed: "#f59e0b",
  approved: "#22c55e",
  rejected: "#ef4444",
  expired: "#94a3b8",
};

/* ── Component ──────────────────────────────────────────────────── */

export function QuoteSection({
  authApi,
  serviceOrderId,
  tenantId,
  userId,
  workflowStepId,
  orderTitle,
}: QuoteSectionProps) {
  const tintColor = useThemeColor({}, "tint");
  const titleTextColor = useThemeColor({}, "text");
  const mutedTextColor = useThemeColor({}, "muted");
  const cardBackground = useThemeColor({}, "card");
  const inputBg = useThemeColor(
    { light: "#f8fafc", dark: "#1e293b" },
    "background",
  );

  /* ── State ──────────────────────────────────────────────── */
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [expandedQuoteId, setExpandedQuoteId] = useState<string | null>(null);
  const [quoteItems, setQuoteItems] = useState<Map<string, QuoteItem[]>>(
    new Map(),
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);

  /* ── Create form state ─────────────────────────────────── */
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formItems, setFormItems] = useState<QuoteItemInput[]>([
    { description: "", quantity: 1, unit_price: 0 },
  ]);
  const [formDiscount, setFormDiscount] = useState("");
  const [formValidUntil, setFormValidUntil] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [creating, setCreating] = useState(false);

  /* ── Template picker state ─────────────────────────────── */
  const [templates, setTemplates] = useState<QuoteTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(true);

  /* ── Load quotes ───────────────────────────────────────── */
  const loadQuotes = useCallback(async () => {
    try {
      setLoading(true);
      const list = await listQuotes(authApi, serviceOrderId);
      setQuotes(list);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [authApi, serviceOrderId]);

  useEffect(() => {
    loadQuotes();
  }, [loadQuotes]);

  /* ── Auto-expand when quotes exist ─────────────────────── */
  useEffect(() => {
    if (!loading && quotes.length > 0) {
      setExpanded(true);
    }
  }, [loading, quotes.length]);

  /* ── Load templates when modal opens ───────────────────── */
  const loadTemplates = useCallback(async () => {
    if (!tenantId) return;
    setTemplatesLoading(true);
    try {
      const list = await listQuoteTemplates(tenantId, [
        { field: "is_active", value: "true", operator: "equal" },
      ]);
      setTemplates(list);
    } catch {
      /* silent */
    } finally {
      setTemplatesLoading(false);
    }
  }, [tenantId]);

  /* ── Apply template to form ────────────────────────────── */
  const handleApplyTemplate = useCallback((tmpl: QuoteTemplate) => {
    const { items, discount, validDays, notes } = applyTemplateToQuote(tmpl);
    setFormTitle(tmpl.name);
    setFormDescription(tmpl.description ?? "");
    setFormItems(
      items.length > 0
        ? items.map((it) => ({
            description: it.description,
            quantity: it.quantity,
            unit_price: it.unit_price,
          }))
        : [{ description: "", quantity: 1, unit_price: 0 }],
    );
    setFormDiscount(discount > 0 ? String(discount) : "");
    if (validDays > 0) {
      const d = new Date(Date.now() + validDays * 86400000);
      setFormValidUntil(d.toISOString().split("T")[0]);
    } else {
      setFormValidUntil("");
    }
    setFormNotes(notes ?? "");
    setShowTemplatePicker(false);
  }, []);

  /* ── Format currency ───────────────────────────────────── */
  const fmt = (v: number | string) => {
    const n = typeof v === "string" ? parseFloat(v) || 0 : v;
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  /* ── Load items for a quote ────────────────────────────── */
  const loadItems = useCallback(
    async (quoteId: string) => {
      if (quoteItems.has(quoteId)) return;
      try {
        const items = await listQuoteItems(authApi, quoteId);
        setQuoteItems((prev) => new Map(prev).set(quoteId, items));
      } catch {
        /* silent */
      }
    },
    [authApi, quoteItems],
  );

  /* ── Toggle expand quote ───────────────────────────────── */
  const toggleQuote = useCallback(
    (quoteId: string) => {
      if (expandedQuoteId === quoteId) {
        setExpandedQuoteId(null);
      } else {
        setExpandedQuoteId(quoteId);
        loadItems(quoteId);
      }
    },
    [expandedQuoteId, loadItems],
  );

  /* ── Create quote ──────────────────────────────────────── */
  const handleCreate = useCallback(async () => {
    if (!formTitle.trim()) {
      Alert.alert("Atenção", "Informe o título do orçamento.");
      return;
    }
    const validItems = formItems.filter(
      (item) => item.description.trim() && item.unit_price > 0,
    );
    if (validItems.length === 0) {
      Alert.alert("Atenção", "Adicione pelo menos um item com valor.");
      return;
    }

    setCreating(true);
    try {
      await createQuote(authApi, {
        tenantId,
        serviceOrderId,
        workflowStepId: workflowStepId ?? undefined,
        title: formTitle.trim(),
        description: formDescription.trim() || undefined,
        items: validItems,
        discount: parseFloat(formDiscount) || 0,
        validUntil: formValidUntil || undefined,
        notes: formNotes.trim() || undefined,
        createdBy: userId,
      });

      // Reset form
      setFormTitle("");
      setFormDescription("");
      setFormItems([{ description: "", quantity: 1, unit_price: 0 }]);
      setFormDiscount("");
      setFormValidUntil("");
      setFormNotes("");
      setShowCreateModal(false);

      await loadQuotes();
    } catch (e: any) {
      Alert.alert("Erro", e.message || "Erro ao criar orçamento.");
    } finally {
      setCreating(false);
    }
  }, [
    authApi,
    tenantId,
    serviceOrderId,
    workflowStepId,
    userId,
    formTitle,
    formDescription,
    formItems,
    formDiscount,
    formValidUntil,
    formNotes,
    loadQuotes,
  ]);

  /* ── Send quote ────────────────────────────────────────── */
  const handleSend = useCallback(
    async (quote: Quote) => {
      try {
        await sendQuote(authApi, quote.id);
        await loadQuotes();
      } catch {
        Alert.alert("Erro", "Erro ao enviar orçamento.");
      }
    },
    [authApi, loadQuotes],
  );

  /* ── Copy link ─────────────────────────────────────────── */
  const handleCopyLink = useCallback(async (quote: Quote) => {
    const url = buildQuoteUrl(quote.token);
    await Clipboard.setStringAsync(url);
    setCopiedId(quote.id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  /* ── WhatsApp ──────────────────────────────────────────── */
  const handleWhatsApp = useCallback((quote: Quote) => {
    const url = buildQuoteWhatsAppUrl(quote.token, quote.title);
    Linking.openURL(url);
  }, []);

  /* ── Delete quote ──────────────────────────────────────── */
  const handleDelete = useCallback(
    (quote: Quote) => {
      const doDelete = async () => {
        try {
          await deleteQuote(authApi, quote.id);
          await loadQuotes();
        } catch {
          Alert.alert("Erro", "Erro ao excluir orçamento.");
        }
      };
      if (Platform.OS === "web") {
        if (confirm("Excluir este orçamento?")) doDelete();
      } else {
        Alert.alert("Excluir Orçamento", "Deseja excluir este orçamento?", [
          { text: "Cancelar", style: "cancel" },
          { text: "Excluir", style: "destructive", onPress: doDelete },
        ]);
      }
    },
    [authApi, loadQuotes],
  );

  /* ── Add / remove form item ────────────────────────────── */
  const addFormItem = useCallback(() => {
    setFormItems((prev) => [
      ...prev,
      { description: "", quantity: 1, unit_price: 0 },
    ]);
  }, []);

  const removeFormItem = useCallback((index: number) => {
    setFormItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateFormItem = useCallback(
    (index: number, field: keyof QuoteItemInput, value: string) => {
      setFormItems((prev) => {
        const updated = [...prev];
        if (field === "description") {
          updated[index] = { ...updated[index], description: value };
        } else {
          updated[index] = {
            ...updated[index],
            [field]: parseFloat(value.replace(",", ".")) || 0,
          };
        }
        return updated;
      });
    },
    [],
  );

  /* ── Computed form total ───────────────────────────────── */
  const formSubtotal = formItems.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0,
  );
  const formTotal = Math.max(0, formSubtotal - (parseFloat(formDiscount) || 0));

  /* ── Render ──────────────────────────────────────────── */
  return (
    <>
      <ThemedView style={[st.card, { backgroundColor: cardBackground }]}>
        {/* Header */}
        <TouchableOpacity
          onPress={() => setExpanded(!expanded)}
          style={st.headerRow}
          activeOpacity={0.7}
        >
          <View style={st.headerLeft}>
            <Ionicons
              name="document-text-outline"
              size={18}
              color={tintColor}
            />
            <ThemedText style={[st.headerTitle, { color: titleTextColor }]}>
              Orçamentos
            </ThemedText>
            {quotes.length > 0 && (
              <View
                style={[st.countBadge, { backgroundColor: tintColor + "20" }]}
              >
                <Text style={[st.countBadgeText, { color: tintColor }]}>
                  {quotes.length}
                </Text>
              </View>
            )}
          </View>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={mutedTextColor}
          />
        </TouchableOpacity>

        {expanded && (
          <View style={st.body}>
            {loading ? (
              <ActivityIndicator
                size="small"
                color={tintColor}
                style={{ marginVertical: 12 }}
              />
            ) : (
              <>
                {/* Quote list */}
                {quotes.length === 0 ? (
                  <Text style={[st.emptyText, { color: mutedTextColor }]}>
                    Nenhum orçamento criado.
                  </Text>
                ) : (
                  quotes.map((q) => {
                    const isExpanded = expandedQuoteId === q.id;
                    const items = quoteItems.get(q.id) ?? [];
                    const color =
                      STATUS_COLORS[q.status as QuoteStatus] ?? "#94a3b8";
                    const label =
                      STATUS_LABELS[q.status as QuoteStatus] ?? q.status;

                    return (
                      <View
                        key={q.id}
                        style={[st.quoteItem, { borderColor: color + "30" }]}
                      >
                        <TouchableOpacity
                          onPress={() => toggleQuote(q.id)}
                          style={st.quoteHeader}
                          activeOpacity={0.7}
                        >
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[st.quoteTitle, { color: titleTextColor }]}
                            >
                              {q.title}
                            </Text>
                            <View style={st.quoteMeta}>
                              <View
                                style={[
                                  st.statusBadge,
                                  { backgroundColor: color + "18" },
                                ]}
                              >
                                <Text style={[st.statusText, { color }]}>
                                  {label}
                                </Text>
                              </View>
                              <Text
                                style={[st.quoteTotal, { color: tintColor }]}
                              >
                                {fmt(
                                  Math.max(
                                    0,
                                    Number(q.subtotal) - Number(q.discount),
                                  ),
                                )}
                              </Text>
                            </View>
                          </View>
                          <Ionicons
                            name={isExpanded ? "chevron-up" : "chevron-down"}
                            size={16}
                            color={mutedTextColor}
                          />
                        </TouchableOpacity>

                        {isExpanded && (
                          <View style={st.quoteBody}>
                            {/* Items */}
                            {items.length > 0 && (
                              <View style={st.itemsList}>
                                {items.map((item, idx) => (
                                  <View
                                    key={item.id ?? idx}
                                    style={[
                                      st.itemRow,
                                      idx < items.length - 1 && st.itemBorder,
                                    ]}
                                  >
                                    <View style={{ flex: 1 }}>
                                      <Text
                                        style={[
                                          st.itemDesc,
                                          { color: titleTextColor },
                                        ]}
                                      >
                                        {item.description}
                                      </Text>
                                      <Text
                                        style={[
                                          st.itemQty,
                                          { color: mutedTextColor },
                                        ]}
                                      >
                                        {Number(item.quantity)} ×{" "}
                                        {fmt(item.unit_price)}
                                      </Text>
                                    </View>
                                    <Text
                                      style={[
                                        st.itemSubtotal,
                                        { color: titleTextColor },
                                      ]}
                                    >
                                      {fmt(item.subtotal)}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            )}

                            {/* Totals */}
                            <View style={st.totalsBox}>
                              <View style={st.totalRow}>
                                <Text
                                  style={[
                                    st.totalLabel,
                                    { color: mutedTextColor },
                                  ]}
                                >
                                  Subtotal
                                </Text>
                                <Text
                                  style={[
                                    st.totalLabel,
                                    { color: titleTextColor },
                                  ]}
                                >
                                  {fmt(q.subtotal)}
                                </Text>
                              </View>
                              {Number(q.discount) > 0 && (
                                <View style={st.totalRow}>
                                  <Text
                                    style={[
                                      st.totalLabel,
                                      { color: mutedTextColor },
                                    ]}
                                  >
                                    Desconto
                                  </Text>
                                  <Text
                                    style={{
                                      color: "#22c55e",
                                      fontWeight: "500",
                                    }}
                                  >
                                    −{fmt(q.discount)}
                                  </Text>
                                </View>
                              )}
                              <View style={[st.totalRow, { marginTop: 4 }]}>
                                <Text
                                  style={[
                                    st.grandTotalLabel,
                                    { color: titleTextColor },
                                  ]}
                                >
                                  Total
                                </Text>
                                <Text
                                  style={[
                                    st.grandTotalValue,
                                    { color: tintColor },
                                  ]}
                                >
                                  {fmt(
                                    Math.max(
                                      0,
                                      Number(q.subtotal) - Number(q.discount),
                                    ),
                                  )}
                                </Text>
                              </View>
                            </View>

                            {/* Valid until */}
                            {q.valid_until && (
                              <Text
                                style={[
                                  st.validUntil,
                                  { color: mutedTextColor },
                                ]}
                              >
                                Válido até{" "}
                                {new Date(
                                  q.valid_until + "T00:00:00",
                                ).toLocaleDateString("pt-BR")}
                              </Text>
                            )}

                            {/* Notes */}
                            {q.notes && (
                              <Text
                                style={[st.notes, { color: mutedTextColor }]}
                              >
                                {q.notes}
                              </Text>
                            )}

                            {/* Actions */}
                            <View style={st.actionsRow}>
                              {q.status === "draft" && (
                                <TouchableOpacity
                                  onPress={() => handleSend(q)}
                                  style={[
                                    st.actionBtn,
                                    { backgroundColor: tintColor },
                                  ]}
                                >
                                  <Ionicons
                                    name="send"
                                    size={14}
                                    color="#fff"
                                  />
                                  <Text style={st.actionBtnText}>Enviar</Text>
                                </TouchableOpacity>
                              )}

                              {q.status !== "draft" && (
                                <>
                                  <TouchableOpacity
                                    onPress={() => handleCopyLink(q)}
                                    style={[
                                      st.actionBtnOutline,
                                      { borderColor: tintColor + "40" },
                                    ]}
                                  >
                                    <Ionicons
                                      name={
                                        copiedId === q.id
                                          ? "checkmark"
                                          : "copy-outline"
                                      }
                                      size={14}
                                      color={tintColor}
                                    />
                                    <Text
                                      style={[
                                        st.actionOutlineText,
                                        { color: tintColor },
                                      ]}
                                    >
                                      {copiedId === q.id ? "Copiado!" : "Link"}
                                    </Text>
                                  </TouchableOpacity>

                                  <TouchableOpacity
                                    onPress={() => handleWhatsApp(q)}
                                    style={[
                                      st.actionBtn,
                                      { backgroundColor: "#25d366" },
                                    ]}
                                  >
                                    <Ionicons
                                      name="logo-whatsapp"
                                      size={14}
                                      color="#fff"
                                    />
                                    <Text style={st.actionBtnText}>
                                      WhatsApp
                                    </Text>
                                  </TouchableOpacity>
                                </>
                              )}

                              {q.status === "draft" && (
                                <TouchableOpacity
                                  onPress={() => handleDelete(q)}
                                  style={[
                                    st.actionBtnOutline,
                                    { borderColor: "#ef444440" },
                                  ]}
                                >
                                  <Ionicons
                                    name="trash-outline"
                                    size={14}
                                    color="#ef4444"
                                  />
                                  <Text
                                    style={{ fontSize: 12, color: "#ef4444" }}
                                  >
                                    Excluir
                                  </Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })
                )}

                {/* New quote button */}
                <TouchableOpacity
                  onPress={() => {
                    setShowTemplatePicker(true);
                    loadTemplates();
                    setShowCreateModal(true);
                  }}
                  style={[st.newBtn, { borderColor: tintColor + "40" }]}
                >
                  <Ionicons
                    name="add-circle-outline"
                    size={16}
                    color={tintColor}
                  />
                  <Text style={[st.newBtnText, { color: tintColor }]}>
                    Novo Orçamento
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </ThemedView>

      {/* ── Create Quote Modal ──────────────────────────────── */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={[st.modalContainer, { backgroundColor: cardBackground }]}>
          {/* Modal header */}
          <View style={st.modalHeader}>
            <TouchableOpacity
              onPress={() => {
                if (!showTemplatePicker) {
                  setShowTemplatePicker(true);
                } else {
                  setShowCreateModal(false);
                }
              }}
            >
              <Ionicons
                name={showTemplatePicker ? "close" : "arrow-back"}
                size={24}
                color={titleTextColor}
              />
            </TouchableOpacity>
            <Text style={[st.modalTitle, { color: titleTextColor }]}>
              {showTemplatePicker ? "Novo Orçamento" : "Preencher Orçamento"}
            </Text>
            {showTemplatePicker ? (
              <View style={{ width: 48 }} />
            ) : (
              <TouchableOpacity
                onPress={handleCreate}
                disabled={creating}
                style={{ opacity: creating ? 0.5 : 1 }}
              >
                {creating ? (
                  <ActivityIndicator size="small" color={tintColor} />
                ) : (
                  <Text style={[st.saveText, { color: tintColor }]}>
                    Salvar
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          {showTemplatePicker ? (
            /* ── Template selection step ── */
            <ScrollView
              style={st.modalBody}
              contentContainerStyle={{ paddingBottom: 40 }}
            >
              {/* Start blank option */}
              <TouchableOpacity
                onPress={() => {
                  setFormTitle("");
                  setFormDescription("");
                  setFormItems([
                    { description: "", quantity: 1, unit_price: 0 },
                  ]);
                  setFormDiscount("");
                  setFormValidUntil("");
                  setFormNotes("");
                  setShowTemplatePicker(false);
                }}
                style={{
                  borderWidth: 1.5,
                  borderColor: tintColor,
                  borderStyle: "dashed",
                  borderRadius: 10,
                  padding: 14,
                  marginBottom: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Ionicons name="create-outline" size={20} color={tintColor} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: titleTextColor,
                    }}
                  >
                    Criar em branco
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: mutedTextColor,
                      marginTop: 2,
                    }}
                  >
                    Preencher itens manualmente
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={mutedTextColor}
                />
              </TouchableOpacity>

              {/* Templates */}
              {templatesLoading ? (
                <ActivityIndicator
                  size="small"
                  color={tintColor}
                  style={{ marginTop: 20 }}
                />
              ) : templates.length > 0 ? (
                <>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: mutedTextColor,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      marginBottom: 8,
                      marginTop: 4,
                    }}
                  >
                    Usar template
                  </Text>
                  {templates.map((tmpl) => {
                    const items = parseTemplateItems(tmpl.items);
                    const total = items.reduce(
                      (s, i) => s + i.quantity * i.unit_price,
                      0,
                    );
                    return (
                      <TouchableOpacity
                        key={tmpl.id}
                        onPress={() => handleApplyTemplate(tmpl)}
                        style={{
                          borderWidth: 1,
                          borderColor:
                            cardBackground === "#fff" ? "#e2e8f0" : "#334155",
                          borderRadius: 10,
                          padding: 12,
                          marginBottom: 8,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <Ionicons
                          name="document-text-outline"
                          size={20}
                          color={tintColor}
                        />
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              fontSize: 14,
                              fontWeight: "600",
                              color: titleTextColor,
                            }}
                          >
                            {tmpl.name}
                          </Text>
                          <Text
                            style={{
                              fontSize: 12,
                              color: mutedTextColor,
                              marginTop: 2,
                            }}
                          >
                            {items.length}{" "}
                            {items.length === 1 ? "item" : "itens"}
                            {total > 0
                              ? ` · ${formatTemplateCurrency(total)}`
                              : ""}
                          </Text>
                        </View>
                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color={mutedTextColor}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </>
              ) : null}
            </ScrollView>
          ) : (
            /* ── Manual form step ── */
            <ScrollView
              style={st.modalBody}
              contentContainerStyle={{ paddingBottom: 40 }}
              keyboardShouldPersistTaps="handled"
            >
              {/* Title */}
              <Text style={[st.fieldLabel, { color: titleTextColor }]}>
                Título *
              </Text>
              <TextInput
                style={[
                  st.input,
                  { backgroundColor: inputBg, color: titleTextColor },
                ]}
                placeholder="Ex: Orçamento - Escritura"
                placeholderTextColor={mutedTextColor}
                value={formTitle}
                onChangeText={setFormTitle}
              />

              {/* Description */}
              <Text style={[st.fieldLabel, { color: titleTextColor }]}>
                Descrição
              </Text>
              <TextInput
                style={[
                  st.input,
                  st.multiline,
                  { backgroundColor: inputBg, color: titleTextColor },
                ]}
                placeholder="Descrição opcional..."
                placeholderTextColor={mutedTextColor}
                value={formDescription}
                onChangeText={setFormDescription}
                multiline
                numberOfLines={2}
              />

              {/* Items */}
              <Text style={[st.fieldLabel, { color: titleTextColor }]}>
                Itens *
              </Text>
              {formItems.map((item, idx) => (
                <View key={idx} style={st.formItemRow}>
                  <View style={{ flex: 1 }}>
                    <TextInput
                      style={[
                        st.input,
                        { backgroundColor: inputBg, color: titleTextColor },
                      ]}
                      placeholder="Descrição do item"
                      placeholderTextColor={mutedTextColor}
                      value={item.description}
                      onChangeText={(v) =>
                        updateFormItem(idx, "description", v)
                      }
                    />
                    <View style={st.formItemValues}>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[st.microLabel, { color: mutedTextColor }]}
                        >
                          Qtd
                        </Text>
                        <TextInput
                          style={[
                            st.input,
                            st.smallInput,
                            { backgroundColor: inputBg, color: titleTextColor },
                          ]}
                          placeholder="1"
                          placeholderTextColor={mutedTextColor}
                          value={item.quantity ? String(item.quantity) : ""}
                          onChangeText={(v) =>
                            updateFormItem(idx, "quantity", v)
                          }
                          keyboardType="decimal-pad"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[st.microLabel, { color: mutedTextColor }]}
                        >
                          Valor Unit. (R$)
                        </Text>
                        <TextInput
                          style={[
                            st.input,
                            st.smallInput,
                            { backgroundColor: inputBg, color: titleTextColor },
                          ]}
                          placeholder="0,00"
                          placeholderTextColor={mutedTextColor}
                          value={item.unit_price ? String(item.unit_price) : ""}
                          onChangeText={(v) =>
                            updateFormItem(idx, "unit_price", v)
                          }
                          keyboardType="decimal-pad"
                        />
                      </View>
                      <Text style={[st.formItemSubtotal, { color: tintColor }]}>
                        {fmt(item.quantity * item.unit_price)}
                      </Text>
                    </View>
                  </View>
                  {formItems.length > 1 && (
                    <TouchableOpacity
                      onPress={() => removeFormItem(idx)}
                      style={st.removeItemBtn}
                    >
                      <Ionicons name="close-circle" size={20} color="#ef4444" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              <TouchableOpacity onPress={addFormItem} style={st.addItemBtn}>
                <Ionicons name="add" size={16} color={tintColor} />
                <Text style={[st.addItemText, { color: tintColor }]}>
                  Adicionar Item
                </Text>
              </TouchableOpacity>

              {/* Discount */}
              <Text style={[st.fieldLabel, { color: titleTextColor }]}>
                Desconto (R$)
              </Text>
              <TextInput
                style={[
                  st.input,
                  { backgroundColor: inputBg, color: titleTextColor },
                ]}
                placeholder="0,00"
                placeholderTextColor={mutedTextColor}
                value={formDiscount}
                onChangeText={setFormDiscount}
                keyboardType="decimal-pad"
              />

              {/* Valid until */}
              <Text style={[st.fieldLabel, { color: titleTextColor }]}>
                Válido até
              </Text>
              <TextInput
                style={[
                  st.input,
                  { backgroundColor: inputBg, color: titleTextColor },
                ]}
                placeholder="AAAA-MM-DD"
                placeholderTextColor={mutedTextColor}
                value={formValidUntil}
                onChangeText={setFormValidUntil}
              />

              {/* Notes */}
              <Text style={[st.fieldLabel, { color: titleTextColor }]}>
                Observações
              </Text>
              <TextInput
                style={[
                  st.input,
                  st.multiline,
                  { backgroundColor: inputBg, color: titleTextColor },
                ]}
                placeholder="Condições, prazo de entrega..."
                placeholderTextColor={mutedTextColor}
                value={formNotes}
                onChangeText={setFormNotes}
                multiline
                numberOfLines={3}
              />

              {/* Summary */}
              <View style={st.formSummary}>
                <View style={st.totalRow}>
                  <Text style={[st.totalLabel, { color: mutedTextColor }]}>
                    Subtotal
                  </Text>
                  <Text style={[st.totalLabel, { color: titleTextColor }]}>
                    {fmt(formSubtotal)}
                  </Text>
                </View>
                {parseFloat(formDiscount) > 0 && (
                  <View style={st.totalRow}>
                    <Text style={[st.totalLabel, { color: mutedTextColor }]}>
                      Desconto
                    </Text>
                    <Text style={{ color: "#22c55e", fontWeight: "500" }}>
                      −{fmt(parseFloat(formDiscount))}
                    </Text>
                  </View>
                )}
                <View style={[st.totalRow, { marginTop: 4 }]}>
                  <Text style={[st.grandTotalLabel, { color: titleTextColor }]}>
                    Total
                  </Text>
                  <Text style={[st.grandTotalValue, { color: tintColor }]}>
                    {fmt(formTotal)}
                  </Text>
                </View>
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>
    </>
  );
}

/* ── Styles ─────────────────────────────────────────────────── */

const st = StyleSheet.create({
  card: {
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 16,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 3,
          elevation: 2,
        }),
  },

  /* Header */
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: { fontSize: 15, fontWeight: "600" },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countBadgeText: { fontSize: 12, fontWeight: "600" },

  /* Body */
  body: { marginTop: 12 },
  emptyText: { fontSize: 13, textAlign: "center", marginVertical: 12 },

  /* Quote item */
  quoteItem: {
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 8,
    overflow: "hidden",
  },
  quoteHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
  },
  quoteTitle: { fontSize: 14, fontWeight: "600" },
  quoteMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusText: { fontSize: 11, fontWeight: "600" },
  quoteTotal: { fontSize: 13, fontWeight: "600" },

  /* Quote body */
  quoteBody: { padding: 12, paddingTop: 0 },
  itemsList: { marginBottom: 8 },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: "#e2e8f020" },
  itemDesc: { fontSize: 13, fontWeight: "500" },
  itemQty: { fontSize: 11, marginTop: 1 },
  itemSubtotal: { fontSize: 13, fontWeight: "600" },

  totalsBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  totalLabel: { fontSize: 13 },
  grandTotalLabel: { fontSize: 14, fontWeight: "700" },
  grandTotalValue: { fontSize: 16, fontWeight: "700" },

  validUntil: { fontSize: 12, marginTop: 6 },
  notes: { fontSize: 12, marginTop: 4, fontStyle: "italic" },

  /* Actions */
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  actionBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  actionBtnOutline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  actionOutlineText: { fontSize: 12, fontWeight: "600" },

  /* New button */
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    marginTop: 4,
  },
  newBtnText: { fontSize: 13, fontWeight: "600" },

  /* Modal */
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  modalTitle: { fontSize: 17, fontWeight: "600" },
  saveText: { fontSize: 16, fontWeight: "600" },
  modalBody: { padding: 16 },

  /* Form */
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 4,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
  },
  multiline: { minHeight: 60, textAlignVertical: "top" },
  smallInput: { paddingVertical: 8 },
  microLabel: { fontSize: 11, marginBottom: 2 },

  formItemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f020",
  },
  formItemValues: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-end",
    marginTop: 6,
  },
  formItemSubtotal: {
    fontSize: 13,
    fontWeight: "600",
    minWidth: 70,
    textAlign: "right",
    paddingBottom: 10,
  },
  removeItemBtn: { paddingLeft: 8, paddingTop: 8 },

  addItemBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    marginBottom: 8,
  },
  addItemText: { fontSize: 13, fontWeight: "600" },

  formSummary: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
});
