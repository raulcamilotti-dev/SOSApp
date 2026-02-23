/**
 * CRM KANBAN — Pipeline de Leads
 *
 * Visualização em Kanban dos leads por estágio do pipeline.
 * Cards com ações: Registrar atividade, Avançar/Converter, Perdido.
 *
 * Pipeline: novo → contactado → qualificado → proposta → negociação
 * Terminal: convertido | perdido (mostrados separadamente)
 *
 * Refactored to use the generic KanbanScreen<T> component.
 */

import { spacing, typography } from "@/app/theme/styles";
import {
    KanbanScreen,
    type KanbanColumnDef,
    type KanbanScreenRef,
    type KanbanTheme,
} from "@/components/ui/KanbanScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
    ACTIVITY_TYPES,
    CONVERTIBLE_STATUSES,
    convertLeadToCustomer,
    createLead,
    createLeadActivity,
    getLeadStatusConfig,
    KANBAN_STAGES,
    LEAD_PRIORITIES,
    LEAD_SOURCES,
    listLeads,
    markLeadAsLost,
    updateLead,
    type ActivityType,
    type Lead,
    type LeadPriority,
    type LeadSource,
    type LeadStatus,
} from "@/services/crm";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

/* ─── Helpers ─── */

const formatDate = (d?: string | null) => {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("pt-BR");
  } catch {
    return d;
  }
};

const formatCurrency = (v?: number | string | null) => {
  if (v == null || v === "") return "";
  const num = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(num)) return "";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const getPriorityColor = (p?: LeadPriority | string | null): string => {
  const found = LEAD_PRIORITIES.find((lp) => lp.value === p);
  return found?.color ?? "#64748b";
};

/* ─── Component ─── */

export default function CrmKanbanScreen() {
  const { user } = useAuth();
  const kanbanRef = useRef<KanbanScreenRef>(null);

  // Theme
  const tintColor = useThemeColor({}, "tint");
  const bg = useThemeColor({}, "background");
  const cardBg = useThemeColor({}, "card");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");

  // Terminal counts (converted/lost)
  const [, setAllLeads] = useState<Lead[]>([]);
  const [convertedCount, setConvertedCount] = useState(0);
  const [lostCount, setLostCount] = useState(0);

  /* ═══════ Modals state ═══════ */
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [activityModalVisible, setActivityModalVisible] = useState(false);
  const [lostModalVisible, setLostModalVisible] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  // Create form
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formCpf, setFormCpf] = useState("");
  const [formCompany, setFormCompany] = useState("");
  const [formSource, setFormSource] = useState<LeadSource>("manual");
  const [formPriority, setFormPriority] = useState<LeadPriority>("media");
  const [formNotes, setFormNotes] = useState("");
  const [formEstimatedValue, setFormEstimatedValue] = useState("");
  const [creating, setCreating] = useState(false);

  // Activity form
  const [activityType, setActivityType] = useState<ActivityType>("nota");
  const [activityTitle, setActivityTitle] = useState("");
  const [activityDesc, setActivityDesc] = useState("");
  const [savingActivity, setSavingActivity] = useState(false);

  // Lost reason
  const [lostReason, setLostReason] = useState("");
  const [savingLost, setSavingLost] = useState(false);

  /* ══════════════════════════════════════════════════════
   * KANBANSCREEN CALLBACKS
   * ══════════════════════════════════════════════════════ */

  const loadColumns = useCallback(async (): Promise<KanbanColumnDef[]> => {
    return KANBAN_STAGES.map((status, i) => {
      const cfg = getLeadStatusConfig(status);
      return {
        id: status,
        label: cfg.label,
        color: cfg.color,
        order: i,
      };
    });
  }, []);

  const loadItems = useCallback(async (): Promise<Lead[]> => {
    const tenantId = user?.tenant_id;
    if (!tenantId) return [];
    const leads = await listLeads(tenantId);
    setAllLeads(leads);
    setConvertedCount(leads.filter((l) => l.status === "convertido").length);
    setLostCount(leads.filter((l) => l.status === "perdido").length);
    // Only pipeline leads (not terminal)
    return leads.filter((l) => KANBAN_STAGES.includes(l.status as LeadStatus));
  }, [user]);

  const onMoveItem = useCallback(async (lead: Lead, toColumnId: string) => {
    await updateLead(lead.id, {
      status: toColumnId as LeadStatus,
      last_contact_at: new Date().toISOString(),
    });
  }, []);

  /* ══════════════════════════════════════════════════════
   * ACTIONS
   * ══════════════════════════════════════════════════════ */

  const resetForm = () => {
    setFormName("");
    setFormEmail("");
    setFormPhone("");
    setFormCpf("");
    setFormCompany("");
    setFormSource("manual");
    setFormPriority("media");
    setFormNotes("");
    setFormEstimatedValue("");
  };

  const handleCreate = useCallback(async () => {
    if (!formName.trim()) {
      Alert.alert("Atenção", "Nome é obrigatório");
      return;
    }
    if (!user?.tenant_id) return;
    setCreating(true);
    try {
      await createLead({
        tenant_id: user.tenant_id,
        name: formName.trim(),
        email: formEmail.trim() || null,
        phone: formPhone.trim() || null,
        cpf: formCpf.trim() || null,
        company_name: formCompany.trim() || null,
        source: formSource,
        priority: formPriority,
        notes: formNotes.trim() || null,
        estimated_value: formEstimatedValue
          ? parseFloat(formEstimatedValue.replace(",", "."))
          : null,
        status: "novo",
      });
      setCreateModalVisible(false);
      resetForm();
      kanbanRef.current?.reload();
    } catch {
      Alert.alert("Erro", "Falha ao criar lead");
    } finally {
      setCreating(false);
    }
  }, [
    formName,
    formEmail,
    formPhone,
    formCpf,
    formCompany,
    formSource,
    formPriority,
    formNotes,
    formEstimatedValue,
    user,
  ]);

  const handleQuickAdvance = useCallback((lead: Lead) => {
    const currentIdx = KANBAN_STAGES.indexOf(lead.status as LeadStatus);
    if (currentIdx < 0 || currentIdx >= KANBAN_STAGES.length - 1) {
      Alert.alert("Atenção", "Lead já está no último estágio do pipeline");
      return;
    }
    const nextStatus = KANBAN_STAGES[currentIdx + 1];
    const nextCfg = getLeadStatusConfig(nextStatus);

    const doMove = async () => {
      try {
        await updateLead(lead.id, {
          status: nextStatus,
          last_contact_at: new Date().toISOString(),
        });
        kanbanRef.current?.reload();
      } catch {
        Alert.alert("Erro", "Falha ao mover lead");
      }
    };

    if (Platform.OS === "web") {
      const ok = window.confirm(
        `Avançar lead "${lead.name}" para "${nextCfg.label}"?`,
      );
      if (ok) doMove();
    } else {
      Alert.alert("Avançar", `Mover "${lead.name}" para "${nextCfg.label}"?`, [
        { text: "Cancelar", style: "cancel" },
        { text: "Avançar", onPress: doMove },
      ]);
    }
  }, []);

  const openActivityModal = useCallback((lead: Lead) => {
    setSelectedLead(lead);
    setActivityType("nota");
    setActivityTitle("");
    setActivityDesc("");
    setActivityModalVisible(true);
  }, []);

  const handleSaveActivity = useCallback(async () => {
    if (!selectedLead || !activityTitle.trim()) return;
    setSavingActivity(true);
    try {
      await createLeadActivity({
        lead_id: selectedLead.id,
        tenant_id: selectedLead.tenant_id,
        type: activityType,
        title: activityTitle.trim(),
        description: activityDesc.trim() || null,
        created_by: user?.id ?? null,
      });
      await updateLead(selectedLead.id, {
        last_contact_at: new Date().toISOString(),
      });
      setActivityModalVisible(false);
      kanbanRef.current?.reload();
    } catch {
      Alert.alert("Erro", "Falha ao registrar atividade");
    } finally {
      setSavingActivity(false);
    }
  }, [selectedLead, activityType, activityTitle, activityDesc, user]);

  const openLostModal = useCallback((lead: Lead) => {
    setSelectedLead(lead);
    setLostReason("");
    setLostModalVisible(true);
  }, []);

  const handleMarkLost = useCallback(async () => {
    if (!selectedLead) return;
    setSavingLost(true);
    try {
      await markLeadAsLost(selectedLead.id, lostReason.trim());
      setLostModalVisible(false);
      setSelectedLead(null);
      kanbanRef.current?.reload();
    } catch {
      Alert.alert("Erro", "Falha ao marcar lead como perdido");
    } finally {
      setSavingLost(false);
    }
  }, [selectedLead, lostReason]);

  const handleConvert = useCallback((lead: Lead) => {
    const doConvert = async () => {
      try {
        const result = await convertLeadToCustomer(lead);
        const msg = result.isExisting
          ? `Lead vinculado ao cliente existente: ${result.customer.name}`
          : `Novo cliente criado: ${result.customer.name}`;
        Alert.alert("Convertido!", msg);
        kanbanRef.current?.reload();
      } catch (e: any) {
        Alert.alert("Erro", e?.message ?? "Falha ao converter lead");
      }
    };

    if (Platform.OS === "web") {
      const ok = window.confirm(
        `Converter "${lead.name}" em cliente?\n\nSe já existir um cliente com mesmo CPF/email/telefone, será vinculado automaticamente.`,
      );
      if (ok) doConvert();
    } else {
      Alert.alert(
        "Converter em Cliente",
        `Converter "${lead.name}"?\n\nSe já existir um cliente com mesmo CPF/email/telefone, será vinculado automaticamente.`,
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Converter", onPress: doConvert },
        ],
      );
    }
  }, []);

  /* ══════════════════════════════════════════════════════
   * CUSTOM CARD RENDERER
   * ══════════════════════════════════════════════════════ */

  const renderCard = useCallback(
    (lead: Lead, _columnId: string, theme: KanbanTheme) => {
      const canConvert = CONVERTIBLE_STATUSES.includes(
        lead.status as LeadStatus,
      );
      const currentIdx = KANBAN_STAGES.indexOf(lead.status as LeadStatus);
      const canAdvance =
        currentIdx >= 0 && currentIdx < KANBAN_STAGES.length - 1;
      const priorityColor = getPriorityColor(lead.priority);

      return (
        <TouchableOpacity
          key={lead.id}
          style={[
            cs.card,
            { backgroundColor: theme.cardBg, borderColor: theme.borderColor },
          ]}
          activeOpacity={0.9}
        >
          {/* Header: name + priority */}
          <TouchableOpacity
            style={cs.cardHeaderRow}
            onPress={() =>
              router.push({
                pathname: "/Administrador/crm-lead-detail",
                params: { leadId: lead.id },
              } as any)
            }
            activeOpacity={0.7}
          >
            <Text
              style={[cs.cardTitle, { color: theme.textColor }]}
              numberOfLines={2}
            >
              {lead.name}
            </Text>
            {lead.priority && lead.priority !== "media" && (
              <View
                style={[cs.priorityDot, { backgroundColor: priorityColor }]}
              />
            )}
          </TouchableOpacity>

          {/* Contact info */}
          {lead.email && (
            <View style={cs.cardRow}>
              <Ionicons
                name="mail-outline"
                size={12}
                color={theme.mutedColor}
              />
              <Text
                style={[cs.cardMeta, { color: theme.mutedColor }]}
                numberOfLines={1}
              >
                {lead.email}
              </Text>
            </View>
          )}
          {lead.phone && (
            <View style={cs.cardRow}>
              <Ionicons
                name="call-outline"
                size={12}
                color={theme.mutedColor}
              />
              <Text
                style={[cs.cardMeta, { color: theme.mutedColor }]}
                numberOfLines={1}
              >
                {lead.phone}
              </Text>
            </View>
          )}
          {lead.company_name && (
            <View style={cs.cardRow}>
              <Ionicons
                name="business-outline"
                size={12}
                color={theme.mutedColor}
              />
              <Text
                style={[cs.cardMeta, { color: theme.mutedColor }]}
                numberOfLines={1}
              >
                {lead.company_name}
              </Text>
            </View>
          )}

          {/* Value + date */}
          <View style={[cs.cardRow, { marginTop: 4 }]}>
            <Text style={[cs.cardCaption, { color: theme.mutedColor }]}>
              {formatDate(lead.created_at)}
            </Text>
            {lead.estimated_value && (
              <View style={[cs.valueBadge, { backgroundColor: "#22c55e20" }]}>
                <Text style={[cs.valueBadgeText, { color: "#22c55e" }]}>
                  {formatCurrency(lead.estimated_value)}
                </Text>
              </View>
            )}
          </View>

          {/* Source badge */}
          {lead.source && (
            <View style={[cs.cardRow, { marginTop: 2 }]}>
              <View
                style={[
                  cs.sourceBadge,
                  { backgroundColor: theme.tintColor + "15" },
                ]}
              >
                <Text style={[cs.sourceBadgeText, { color: theme.tintColor }]}>
                  {LEAD_SOURCES.find((ls) => ls.value === lead.source)?.label ??
                    lead.source}
                </Text>
              </View>
            </View>
          )}

          {/* Actions */}
          <View style={cs.cardActions}>
            <TouchableOpacity
              style={[cs.actionBtn, { backgroundColor: theme.tintColor }]}
              onPress={() => openActivityModal(lead)}
            >
              <Ionicons name="create-outline" size={12} color="#fff" />
              <Text style={cs.actionBtnText}>Atividade</Text>
            </TouchableOpacity>

            {canConvert ? (
              <TouchableOpacity
                style={[cs.actionBtn, { backgroundColor: "#22c55e" }]}
                onPress={() => handleConvert(lead)}
              >
                <Ionicons name="person-add-outline" size={12} color="#fff" />
                <Text style={cs.actionBtnText}>Converter</Text>
              </TouchableOpacity>
            ) : canAdvance ? (
              <TouchableOpacity
                style={[cs.actionBtn, { backgroundColor: "#8b5cf6" }]}
                onPress={() => handleQuickAdvance(lead)}
              >
                <Ionicons name="arrow-forward-outline" size={12} color="#fff" />
                <Text style={cs.actionBtnText}>Avançar</Text>
              </TouchableOpacity>
            ) : (
              <View
                style={[
                  cs.actionBtn,
                  { backgroundColor: theme.mutedColor, opacity: 0.5 },
                ]}
              >
                <Ionicons
                  name="checkmark-done-outline"
                  size={12}
                  color="#fff"
                />
                <Text style={cs.actionBtnText}>Final</Text>
              </View>
            )}

            <TouchableOpacity
              style={[cs.actionBtn, { backgroundColor: "#ef444480" }]}
              onPress={() => openLostModal(lead)}
            >
              <Ionicons name="close-outline" size={12} color="#fff" />
              <Text style={cs.actionBtnText}>Perdido</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      );
    },
    [openActivityModal, handleQuickAdvance, openLostModal, handleConvert],
  );

  /* ══════════════════════════════════════════════════════
   * EXTRA MODALS (Create lead + Activity + Lost reason)
   * ══════════════════════════════════════════════════════ */

  const renderExtraModals = useCallback(
    () => (
      <>
        {/* ═══════ CREATE LEAD MODAL ═══════ */}
        <Modal
          visible={createModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setCreateModalVisible(false)}
        >
          <View style={ms.modalOverlay}>
            <View style={[ms.modalSheet, { backgroundColor: cardBg }]}>
              <View style={ms.modalHeader}>
                <View>
                  <Text style={[ms.modalTitle, { color: textColor }]}>
                    Novo Lead
                  </Text>
                  <Text style={[ms.modalSubtitle, { color: mutedColor }]}>
                    Cadastre uma oportunidade
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                  <Ionicons name="close" size={24} color={mutedColor} />
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                style={{ maxHeight: 500 }}
              >
                {/* Name */}
                <Text style={[ms.fieldLabel, { color: mutedColor }]}>
                  Nome *
                </Text>
                <TextInput
                  value={formName}
                  onChangeText={setFormName}
                  placeholder="Nome do lead"
                  placeholderTextColor={mutedColor}
                  style={[
                    ms.fieldInput,
                    { backgroundColor: bg, borderColor, color: textColor },
                  ]}
                />

                {/* Email */}
                <Text style={[ms.fieldLabel, { color: mutedColor }]}>
                  E-mail
                </Text>
                <TextInput
                  value={formEmail}
                  onChangeText={setFormEmail}
                  placeholder="email@exemplo.com"
                  placeholderTextColor={mutedColor}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={[
                    ms.fieldInput,
                    { backgroundColor: bg, borderColor, color: textColor },
                  ]}
                />

                {/* Phone */}
                <Text style={[ms.fieldLabel, { color: mutedColor }]}>
                  Telefone
                </Text>
                <TextInput
                  value={formPhone}
                  onChangeText={setFormPhone}
                  placeholder="(11) 99999-9999"
                  placeholderTextColor={mutedColor}
                  keyboardType="phone-pad"
                  style={[
                    ms.fieldInput,
                    { backgroundColor: bg, borderColor, color: textColor },
                  ]}
                />

                {/* CPF/CNPJ */}
                <Text style={[ms.fieldLabel, { color: mutedColor }]}>
                  CPF/CNPJ
                </Text>
                <TextInput
                  value={formCpf}
                  onChangeText={setFormCpf}
                  placeholder="000.000.000-00"
                  placeholderTextColor={mutedColor}
                  keyboardType="numeric"
                  style={[
                    ms.fieldInput,
                    { backgroundColor: bg, borderColor, color: textColor },
                  ]}
                />

                {/* Company */}
                <Text style={[ms.fieldLabel, { color: mutedColor }]}>
                  Empresa
                </Text>
                <TextInput
                  value={formCompany}
                  onChangeText={setFormCompany}
                  placeholder="Nome da empresa (se PJ)"
                  placeholderTextColor={mutedColor}
                  style={[
                    ms.fieldInput,
                    { backgroundColor: bg, borderColor, color: textColor },
                  ]}
                />

                {/* Estimated value */}
                <Text style={[ms.fieldLabel, { color: mutedColor }]}>
                  Valor estimado (R$)
                </Text>
                <TextInput
                  value={formEstimatedValue}
                  onChangeText={setFormEstimatedValue}
                  placeholder="0,00"
                  placeholderTextColor={mutedColor}
                  keyboardType="decimal-pad"
                  style={[
                    ms.fieldInput,
                    { backgroundColor: bg, borderColor, color: textColor },
                  ]}
                />

                {/* Source */}
                <Text style={[ms.fieldLabel, { color: mutedColor }]}>
                  Origem
                </Text>
                <View style={ms.chipRow}>
                  {LEAD_SOURCES.map((src) => (
                    <TouchableOpacity
                      key={src.value}
                      style={[
                        ms.chip,
                        {
                          borderColor:
                            formSource === src.value ? tintColor : borderColor,
                          backgroundColor:
                            formSource === src.value
                              ? tintColor + "15"
                              : "transparent",
                        },
                      ]}
                      onPress={() => setFormSource(src.value)}
                    >
                      <Text
                        style={[
                          ms.chipText,
                          {
                            color:
                              formSource === src.value ? tintColor : mutedColor,
                          },
                        ]}
                      >
                        {src.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Priority */}
                <Text style={[ms.fieldLabel, { color: mutedColor }]}>
                  Prioridade
                </Text>
                <View style={ms.chipRow}>
                  {LEAD_PRIORITIES.map((pri) => (
                    <TouchableOpacity
                      key={pri.value}
                      style={[
                        ms.chip,
                        {
                          borderColor:
                            formPriority === pri.value
                              ? pri.color
                              : borderColor,
                          backgroundColor:
                            formPriority === pri.value
                              ? pri.color + "15"
                              : "transparent",
                        },
                      ]}
                      onPress={() => setFormPriority(pri.value)}
                    >
                      <Text
                        style={[
                          ms.chipText,
                          {
                            color:
                              formPriority === pri.value
                                ? pri.color
                                : mutedColor,
                          },
                        ]}
                      >
                        {pri.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Notes */}
                <Text style={[ms.fieldLabel, { color: mutedColor }]}>
                  Observações
                </Text>
                <TextInput
                  value={formNotes}
                  onChangeText={setFormNotes}
                  placeholder="Notas sobre o lead..."
                  placeholderTextColor={mutedColor}
                  multiline
                  numberOfLines={3}
                  style={[
                    ms.fieldInput,
                    {
                      backgroundColor: bg,
                      borderColor,
                      color: textColor,
                      minHeight: 70,
                      textAlignVertical: "top",
                    },
                  ]}
                />
              </ScrollView>

              {/* Save button */}
              <TouchableOpacity
                style={[
                  ms.saveBtn,
                  {
                    backgroundColor: tintColor,
                    opacity: creating ? 0.6 : 1,
                  },
                ]}
                onPress={handleCreate}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={18} color="#fff" />
                    <Text style={ms.saveBtnText}>Criar Lead</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ═══════ ACTIVITY MODAL ═══════ */}
        <Modal
          visible={activityModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setActivityModalVisible(false)}
        >
          <View style={ms.modalOverlay}>
            <View style={[ms.modalSheet, { backgroundColor: cardBg }]}>
              <View style={ms.modalHeader}>
                <View>
                  <Text style={[ms.modalTitle, { color: textColor }]}>
                    Registrar Atividade
                  </Text>
                  <Text style={[ms.modalSubtitle, { color: mutedColor }]}>
                    {selectedLead?.name}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setActivityModalVisible(false)}
                >
                  <Ionicons name="close" size={24} color={mutedColor} />
                </TouchableOpacity>
              </View>

              {/* Activity type chips */}
              <Text style={[ms.fieldLabel, { color: mutedColor }]}>Tipo</Text>
              <View style={ms.chipRow}>
                {ACTIVITY_TYPES.map((at) => (
                  <TouchableOpacity
                    key={at.value}
                    style={[
                      ms.chip,
                      {
                        borderColor:
                          activityType === at.value ? tintColor : borderColor,
                        backgroundColor:
                          activityType === at.value
                            ? tintColor + "15"
                            : "transparent",
                      },
                    ]}
                    onPress={() => setActivityType(at.value)}
                  >
                    <Ionicons
                      name={at.icon as any}
                      size={12}
                      color={activityType === at.value ? tintColor : mutedColor}
                    />
                    <Text
                      style={[
                        ms.chipText,
                        {
                          color:
                            activityType === at.value ? tintColor : mutedColor,
                        },
                      ]}
                    >
                      {at.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Title */}
              <Text style={[ms.fieldLabel, { color: mutedColor }]}>
                Título *
              </Text>
              <TextInput
                value={activityTitle}
                onChangeText={setActivityTitle}
                placeholder="Ex: Ligação de qualificação"
                placeholderTextColor={mutedColor}
                style={[
                  ms.fieldInput,
                  { backgroundColor: bg, borderColor, color: textColor },
                ]}
              />

              {/* Description */}
              <Text style={[ms.fieldLabel, { color: mutedColor }]}>
                Descrição
              </Text>
              <TextInput
                value={activityDesc}
                onChangeText={setActivityDesc}
                placeholder="Detalhes da interação..."
                placeholderTextColor={mutedColor}
                multiline
                numberOfLines={3}
                style={[
                  ms.fieldInput,
                  {
                    backgroundColor: bg,
                    borderColor,
                    color: textColor,
                    minHeight: 70,
                    textAlignVertical: "top",
                  },
                ]}
              />

              <TouchableOpacity
                style={[
                  ms.saveBtn,
                  {
                    backgroundColor: tintColor,
                    opacity: savingActivity ? 0.6 : 1,
                  },
                ]}
                onPress={handleSaveActivity}
                disabled={savingActivity}
              >
                {savingActivity ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={18} color="#fff" />
                    <Text style={ms.saveBtnText}>Registrar</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ═══════ LOST REASON MODAL ═══════ */}
        <Modal
          visible={lostModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setLostModalVisible(false)}
        >
          <View style={ms.modalOverlay}>
            <View style={[ms.modalSheet, { backgroundColor: cardBg }]}>
              <View style={ms.modalHeader}>
                <View>
                  <Text style={[ms.modalTitle, { color: textColor }]}>
                    Lead Perdido
                  </Text>
                  <Text style={[ms.modalSubtitle, { color: mutedColor }]}>
                    {selectedLead?.name}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setLostModalVisible(false)}>
                  <Ionicons name="close" size={24} color={mutedColor} />
                </TouchableOpacity>
              </View>

              <Text style={[ms.fieldLabel, { color: mutedColor }]}>
                Motivo da perda
              </Text>
              <TextInput
                value={lostReason}
                onChangeText={setLostReason}
                placeholder="Ex: Escolheu concorrente, preço alto, sem resposta..."
                placeholderTextColor={mutedColor}
                multiline
                numberOfLines={3}
                style={[
                  ms.fieldInput,
                  {
                    backgroundColor: bg,
                    borderColor,
                    color: textColor,
                    minHeight: 70,
                    textAlignVertical: "top",
                  },
                ]}
              />

              <TouchableOpacity
                style={[
                  ms.saveBtn,
                  {
                    backgroundColor: "#ef4444",
                    opacity: savingLost ? 0.6 : 1,
                  },
                ]}
                onPress={handleMarkLost}
                disabled={savingLost}
              >
                {savingLost ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="close-circle" size={18} color="#fff" />
                    <Text style={ms.saveBtnText}>Marcar como Perdido</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </>
    ),
    [
      createModalVisible,
      formName,
      formEmail,
      formPhone,
      formCpf,
      formCompany,
      formSource,
      formPriority,
      formNotes,
      formEstimatedValue,
      creating,
      activityModalVisible,
      activityType,
      activityTitle,
      activityDesc,
      savingActivity,
      lostModalVisible,
      lostReason,
      savingLost,
      selectedLead,
      cardBg,
      textColor,
      mutedColor,
      borderColor,
      tintColor,
      bg,
      handleCreate,
      handleSaveActivity,
      handleMarkLost,
    ],
  );

  /* ══════════════════════════════════════════════════════
   * RENDER
   * ══════════════════════════════════════════════════════ */

  return (
    <KanbanScreen<Lead>
      ref={kanbanRef}
      title="Pipeline de Leads"
      getSubtitle={(total, visible) => {
        let sub = `${visible} de ${total} leads ativos`;
        if (convertedCount > 0)
          sub += ` · ${convertedCount} convertido${convertedCount > 1 ? "s" : ""}`;
        if (lostCount > 0)
          sub += ` · ${lostCount} perdido${lostCount > 1 ? "s" : ""}`;
        return sub;
      }}
      loadColumns={loadColumns}
      loadItems={loadItems}
      getId={(l) => l.id}
      getColumnId={(l) => l.status}
      getCardTitle={(l) => l.name}
      searchPlaceholder="Pesquisar lead por nome, email, telefone..."
      searchFields={(l) => [
        l.name,
        l.email,
        l.phone,
        l.cpf,
        l.company_name,
        l.notes,
      ]}
      onCardPress={(l) =>
        router.push({
          pathname: "/Administrador/crm-lead-detail",
          params: { leadId: l.id },
        } as any)
      }
      onMoveItem={onMoveItem}
      moveModalTitle="Mover Lead"
      renderCard={renderCard}
      createButtonLabel="Novo Lead"
      onCreatePress={() => setCreateModalVisible(true)}
      emptyColumnText="Nenhum lead"
      loadingText="Carregando pipeline..."
      headerAfter={
        <View style={cs.navRow}>
          <TouchableOpacity
            style={[cs.navChip, { borderColor: tintColor }]}
            onPress={() => router.push("/Administrador/crm-leads" as any)}
          >
            <Ionicons name="list-outline" size={14} color={tintColor} />
            <Text style={[cs.navChipText, { color: tintColor }]}>Lista</Text>
          </TouchableOpacity>
        </View>
      }
      renderExtraModals={renderExtraModals}
    />
  );
}

/* ══════════════════════════════════════════════════════
 * STYLES — Card-specific (cs) + Modal-specific (ms)
 * ══════════════════════════════════════════════════════ */

const cs = StyleSheet.create({
  // Card
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
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  cardTitle: { ...typography.body, fontWeight: "600", flex: 1 },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  cardMeta: { ...typography.caption, flex: 1 },
  cardCaption: { ...typography.caption },
  valueBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: "auto",
  },
  valueBadgeText: { fontSize: 10, fontWeight: "700" },
  sourceBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  sourceBadgeText: { fontSize: 10, fontWeight: "600" },
  cardActions: { flexDirection: "row", gap: 6, marginTop: spacing.sm },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: 5,
    borderRadius: 6,
  },
  actionBtnText: { fontSize: 10, fontWeight: "700", color: "#fff" },

  // Nav chip
  navRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  navChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  navChipText: { fontSize: 12, fontWeight: "600" },
});

const ms = StyleSheet.create({
  // Modal
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
  modalTitle: { ...typography.subtitle, fontWeight: "700" },
  modalSubtitle: { ...typography.caption, marginTop: 2 },

  // Form fields
  fieldLabel: {
    ...typography.caption,
    fontWeight: "600",
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    ...typography.body,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipText: { fontSize: 11, fontWeight: "600" },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: spacing.md,
    borderRadius: 10,
    marginTop: spacing.lg,
  },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
