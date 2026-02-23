/**
 * CRM LEAD DETAIL — Detalhes do Lead
 *
 * Tela de detalhes com:
 * - Card de informações do lead
 * - Timeline de atividades (notas, ligações, emails, reuniões...)
 * - Botão de conversão Lead → Cliente
 * - Edição de status inline
 * - Link para o cliente quando já convertido
 */

import { spacing, typography } from "@/app/theme/styles";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
    ACTIVITY_TYPES,
    CONVERTIBLE_STATUSES,
    convertLeadToCustomer,
    createLeadActivity,
    getActivityTypeConfig,
    getLeadStatusConfig,
    LEAD_PRIORITIES,
    LEAD_SOURCES,
    LEAD_STATUSES,
    listLeadActivities,
    markLeadAsLost,
    updateLead,
    type ActivityType,
    type Lead,
    type LeadActivity,
    type LeadStatus,
} from "@/services/crm";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

/* ─── Helpers ─── */

const formatDateTime = (d?: string | null) => {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    return `${dt.toLocaleDateString("pt-BR")} ${dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    return d;
  }
};

const formatCurrency = (v?: number | string | null) => {
  if (v == null || v === "") return "—";
  const num = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(num)) return "—";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

/* ─── Component ─── */

export default function CrmLeadDetailScreen() {
  const { leadId } = useLocalSearchParams<{ leadId: string }>();
  const { user } = useAuth();

  // Theme
  const bg = useThemeColor({}, "background");
  const cardBg = useThemeColor({}, "card");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");

  // State
  const [lead, setLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Customer name cache
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [serviceTypeName, setServiceTypeName] = useState<string | null>(null);
  const [assignedName, setAssignedName] = useState<string | null>(null);

  // Activity modal
  const [activityModalVisible, setActivityModalVisible] = useState(false);
  const [activityType, setActivityType] = useState<ActivityType>("nota");
  const [activityTitle, setActivityTitle] = useState("");
  const [activityDesc, setActivityDesc] = useState("");
  const [savingActivity, setSavingActivity] = useState(false);

  // Status change modal
  const [statusModalVisible, setStatusModalVisible] = useState(false);

  // Lost modal
  const [lostModalVisible, setLostModalVisible] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [savingLost, setSavingLost] = useState(false);

  /* ═══════════════════════════════════════════════════
   * DATA LOADING
   * ═══════════════════════════════════════════════════ */

  const loadData = useCallback(async () => {
    if (!leadId) return;
    try {
      setLoading(true);

      // Load lead
      const leadRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "leads",
        ...buildSearchParams([{ field: "id", value: leadId }]),
      });
      const leads = normalizeCrudList<Lead>(leadRes.data);
      const current = leads[0] ?? null;
      setLead(current);

      // Load activities
      const acts = await listLeadActivities(leadId);
      setActivities(acts);

      // Resolve references
      if (current?.customer_id) {
        const custRes = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "customers",
          ...buildSearchParams([{ field: "id", value: current.customer_id }]),
        });
        const custs = normalizeCrudList<{ id: string; name: string }>(
          custRes.data,
        );
        setCustomerName(custs[0]?.name ?? null);
      }

      if (current?.interested_service_type_id) {
        const stRes = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "service_types",
          ...buildSearchParams([
            { field: "id", value: current.interested_service_type_id },
          ]),
        });
        const sts = normalizeCrudList<{ id: string; name: string }>(stRes.data);
        setServiceTypeName(sts[0]?.name ?? null);
      }

      if (current?.assigned_to) {
        const uRes = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "users",
          ...buildSearchParams([{ field: "id", value: current.assigned_to }]),
        });
        const users = normalizeCrudList<{ id: string; name: string }>(
          uRes.data,
        );
        setAssignedName(users[0]?.name ?? null);
      }
    } catch {
      Alert.alert("Erro", "Falha ao carregar detalhes do lead");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [leadId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ═══════════════════════════════════════════════════
   * ACTIONS
   * ═══════════════════════════════════════════════════ */

  const handleChangeStatus = async (newStatus: LeadStatus) => {
    if (!lead) return;
    try {
      await updateLead(lead.id, {
        status: newStatus,
        last_contact_at: new Date().toISOString(),
      });
      setStatusModalVisible(false);
      loadData();
    } catch {
      Alert.alert("Erro", "Falha ao alterar status");
    }
  };

  const handleSaveActivity = async () => {
    if (!lead || !activityTitle.trim()) return;
    setSavingActivity(true);
    try {
      await createLeadActivity({
        lead_id: lead.id,
        tenant_id: lead.tenant_id,
        type: activityType,
        title: activityTitle.trim(),
        description: activityDesc.trim() || null,
        created_by: user?.id ?? null,
      });
      await updateLead(lead.id, { last_contact_at: new Date().toISOString() });
      setActivityModalVisible(false);
      setActivityTitle("");
      setActivityDesc("");
      loadData();
    } catch {
      Alert.alert("Erro", "Falha ao registrar atividade");
    } finally {
      setSavingActivity(false);
    }
  };

  const handleConvert = async () => {
    if (!lead) return;
    const doConvert = async () => {
      try {
        const result = await convertLeadToCustomer(lead);
        const msg = result.isExisting
          ? `Vinculado ao cliente existente: ${result.customer.name}`
          : `Novo cliente criado: ${result.customer.name}`;
        Alert.alert("Convertido!", msg);
        loadData();
      } catch (e: any) {
        Alert.alert("Erro", e?.message ?? "Falha na conversão");
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
        `Se existir um cliente com mesmo CPF/email/tel, será vinculado automaticamente.`,
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Converter", onPress: doConvert },
        ],
      );
    }
  };

  const handleMarkLost = async () => {
    if (!lead) return;
    setSavingLost(true);
    try {
      await markLeadAsLost(lead.id, lostReason.trim());
      setLostModalVisible(false);
      loadData();
    } catch {
      Alert.alert("Erro", "Falha ao marcar como perdido");
    } finally {
      setSavingLost(false);
    }
  };

  /* ═══════════════════════════════════════════════════
   * RENDER
   * ═══════════════════════════════════════════════════ */

  if (loading || !lead) {
    return (
      <View style={[s.container, { backgroundColor: bg }]}>
        <View style={s.centered}>
          <ActivityIndicator size="large" color={tintColor} />
          <Text style={[s.loadingText, { color: mutedColor }]}>
            Carregando...
          </Text>
        </View>
      </View>
    );
  }

  const statusCfg = getLeadStatusConfig(lead.status);
  const canConvert = CONVERTIBLE_STATUSES.includes(lead.status);
  const isTerminal = lead.status === "convertido" || lead.status === "perdido";

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      {/* Header */}
      <View
        style={[
          s.header,
          { backgroundColor: cardBg, borderBottomColor: borderColor },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={s.backRow}>
          <Ionicons name="arrow-back" size={18} color={tintColor} />
          <Text style={[s.backText, { color: tintColor }]}>Leads</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: textColor }]} numberOfLines={2}>
          {lead.name}
        </Text>
        <TouchableOpacity
          style={[s.statusBadge, { backgroundColor: statusCfg.color + "20" }]}
          onPress={() => !isTerminal && setStatusModalVisible(true)}
          disabled={isTerminal}
        >
          <Ionicons
            name={statusCfg.icon as any}
            size={14}
            color={statusCfg.color}
          />
          <Text style={[s.statusBadgeText, { color: statusCfg.color }]}>
            {statusCfg.label}
          </Text>
          {!isTerminal && (
            <Ionicons name="chevron-down" size={12} color={statusCfg.color} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadData();
            }}
          />
        }
      >
        {/* ═══ Info Card ═══ */}
        <View style={[s.infoCard, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[s.sectionTitle, { color: textColor }]}>
            Informações
          </Text>

          {lead.email && (
            <InfoRow
              icon="mail-outline"
              label="E-mail"
              value={lead.email}
              color={mutedColor}
              textColor={textColor}
            />
          )}
          {lead.phone && (
            <InfoRow
              icon="call-outline"
              label="Telefone"
              value={lead.phone}
              color={mutedColor}
              textColor={textColor}
            />
          )}
          {lead.cpf && (
            <InfoRow
              icon="card-outline"
              label="CPF/CNPJ"
              value={lead.cpf}
              color={mutedColor}
              textColor={textColor}
            />
          )}
          {lead.company_name && (
            <InfoRow
              icon="business-outline"
              label="Empresa"
              value={lead.company_name}
              color={mutedColor}
              textColor={textColor}
            />
          )}
          {lead.estimated_value && (
            <InfoRow
              icon="cash-outline"
              label="Valor Estimado"
              value={formatCurrency(lead.estimated_value)}
              color={mutedColor}
              textColor={textColor}
            />
          )}
          {serviceTypeName && (
            <InfoRow
              icon="construct-outline"
              label="Serviço"
              value={serviceTypeName}
              color={mutedColor}
              textColor={textColor}
            />
          )}
          {assignedName && (
            <InfoRow
              icon="person-outline"
              label="Responsável"
              value={assignedName}
              color={mutedColor}
              textColor={textColor}
            />
          )}
          {lead.source && (
            <InfoRow
              icon="globe-outline"
              label="Origem"
              value={
                LEAD_SOURCES.find((ls) => ls.value === lead.source)?.label ??
                lead.source
              }
              color={mutedColor}
              textColor={textColor}
            />
          )}
          {lead.priority && (
            <InfoRow
              icon="flag-outline"
              label="Prioridade"
              value={
                LEAD_PRIORITIES.find((p) => p.value === lead.priority)?.label ??
                lead.priority
              }
              color={mutedColor}
              textColor={textColor}
            />
          )}
          {lead.next_follow_up_at && (
            <InfoRow
              icon="alarm-outline"
              label="Próximo Follow-up"
              value={formatDateTime(lead.next_follow_up_at)}
              color={mutedColor}
              textColor={textColor}
            />
          )}
          {lead.last_contact_at && (
            <InfoRow
              icon="time-outline"
              label="Último Contato"
              value={formatDateTime(lead.last_contact_at)}
              color={mutedColor}
              textColor={textColor}
            />
          )}
          {lead.notes && (
            <View style={s.notesRow}>
              <Text style={[s.notesLabel, { color: mutedColor }]}>Notas</Text>
              <Text style={[s.notesText, { color: textColor }]}>
                {lead.notes}
              </Text>
            </View>
          )}
          {lead.lost_reason && (
            <View style={[s.notesRow, { borderLeftColor: "#ef4444" }]}>
              <Text style={[s.notesLabel, { color: "#ef4444" }]}>
                Motivo da Perda
              </Text>
              <Text style={[s.notesText, { color: textColor }]}>
                {lead.lost_reason}
              </Text>
            </View>
          )}

          {/* Converted: link to customer */}
          {lead.customer_id && customerName && (
            <TouchableOpacity
              style={[s.customerLink, { borderColor: "#22c55e" }]}
              onPress={() =>
                router.push({
                  pathname: "/Administrador/customers",
                  params: { customerId: lead.customer_id },
                } as any)
              }
            >
              <Ionicons
                name="person-circle-outline"
                size={18}
                color="#22c55e"
              />
              <View style={{ flex: 1 }}>
                <Text style={[s.customerLinkLabel, { color: "#22c55e" }]}>
                  Cliente Vinculado
                </Text>
                <Text style={[s.customerLinkName, { color: textColor }]}>
                  {customerName}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#22c55e" />
            </TouchableOpacity>
          )}
        </View>

        {/* ═══ Actions ═══ */}
        <View style={s.actionsRow}>
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: tintColor }]}
            onPress={() => {
              setActivityType("nota");
              setActivityTitle("");
              setActivityDesc("");
              setActivityModalVisible(true);
            }}
          >
            <Ionicons name="add-circle-outline" size={16} color="#fff" />
            <Text style={s.actionBtnText}>Atividade</Text>
          </TouchableOpacity>

          {canConvert && (
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: "#22c55e" }]}
              onPress={handleConvert}
            >
              <Ionicons name="person-add-outline" size={16} color="#fff" />
              <Text style={s.actionBtnText}>Converter</Text>
            </TouchableOpacity>
          )}

          {!isTerminal && (
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: "#ef4444" }]}
              onPress={() => {
                setLostReason("");
                setLostModalVisible(true);
              }}
            >
              <Ionicons name="close-circle-outline" size={16} color="#fff" />
              <Text style={s.actionBtnText}>Perdido</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ═══ Activity Timeline ═══ */}
        <View style={[s.infoCard, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[s.sectionTitle, { color: textColor }]}>
            Atividades ({activities.length})
          </Text>

          {activities.length === 0 ? (
            <Text style={[s.emptyText, { color: mutedColor }]}>
              Nenhuma atividade registrada
            </Text>
          ) : (
            activities.map((act, idx) => {
              const typeCfg = getActivityTypeConfig(act.type);
              return (
                <View key={act.id} style={s.timelineItem}>
                  {/* Timeline line */}
                  {idx < activities.length - 1 && (
                    <View
                      style={[s.timelineLine, { backgroundColor: borderColor }]}
                    />
                  )}
                  {/* Dot */}
                  <View style={[s.timelineDot, { backgroundColor: tintColor }]}>
                    <Ionicons
                      name={typeCfg.icon as any}
                      size={12}
                      color="#fff"
                    />
                  </View>
                  {/* Content */}
                  <View style={s.timelineContent}>
                    <View style={s.timelineHeader}>
                      <Text style={[s.timelineType, { color: tintColor }]}>
                        {typeCfg.label}
                      </Text>
                      <Text style={[s.timelineDate, { color: mutedColor }]}>
                        {formatDateTime(act.created_at)}
                      </Text>
                    </View>
                    <Text style={[s.timelineTitle, { color: textColor }]}>
                      {act.title}
                    </Text>
                    {act.description && (
                      <Text style={[s.timelineDesc, { color: mutedColor }]}>
                        {act.description}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* ═══════ STATUS CHANGE MODAL ═══════ */}
      <Modal
        visible={statusModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setStatusModalVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: cardBg }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: textColor }]}>
                Alterar Status
              </Text>
              <TouchableOpacity onPress={() => setStatusModalVisible(false)}>
                <Ionicons name="close" size={24} color={mutedColor} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {LEAD_STATUSES.filter(
                (st) => st.value !== lead.status && st.value !== "perdido",
              ).map((st) => (
                <TouchableOpacity
                  key={st.value}
                  style={[
                    s.stepOption,
                    { borderColor, borderLeftColor: st.color },
                  ]}
                  onPress={() => handleChangeStatus(st.value)}
                >
                  <Ionicons name={st.icon as any} size={16} color={st.color} />
                  <Text style={[s.stepOptionName, { color: textColor }]}>
                    {st.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
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
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: cardBg }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: textColor }]}>
                Nova Atividade
              </Text>
              <TouchableOpacity onPress={() => setActivityModalVisible(false)}>
                <Ionicons name="close" size={24} color={mutedColor} />
              </TouchableOpacity>
            </View>

            <Text style={[s.fieldLabel, { color: mutedColor }]}>Tipo</Text>
            <View style={s.chipRow}>
              {ACTIVITY_TYPES.map((at) => (
                <TouchableOpacity
                  key={at.value}
                  style={[
                    s.chip,
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
                      s.chipText,
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

            <Text style={[s.fieldLabel, { color: mutedColor }]}>Título *</Text>
            <TextInput
              value={activityTitle}
              onChangeText={setActivityTitle}
              placeholder="Ex: Reunião de apresentação"
              placeholderTextColor={mutedColor}
              style={[
                s.fieldInput,
                { backgroundColor: bg, borderColor, color: textColor },
              ]}
            />

            <Text style={[s.fieldLabel, { color: mutedColor }]}>Descrição</Text>
            <TextInput
              value={activityDesc}
              onChangeText={setActivityDesc}
              placeholder="Detalhes..."
              placeholderTextColor={mutedColor}
              multiline
              numberOfLines={3}
              style={[
                s.fieldInput,
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
                s.saveBtn,
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
                  <Text style={s.saveBtnText}>Registrar</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ═══════ LOST MODAL ═══════ */}
      <Modal
        visible={lostModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLostModalVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: cardBg }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: textColor }]}>
                Lead Perdido
              </Text>
              <TouchableOpacity onPress={() => setLostModalVisible(false)}>
                <Ionicons name="close" size={24} color={mutedColor} />
              </TouchableOpacity>
            </View>

            <Text style={[s.fieldLabel, { color: mutedColor }]}>Motivo</Text>
            <TextInput
              value={lostReason}
              onChangeText={setLostReason}
              placeholder="Ex: Sem resposta, escolheu concorrente..."
              placeholderTextColor={mutedColor}
              multiline
              numberOfLines={3}
              style={[
                s.fieldInput,
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
                s.saveBtn,
                { backgroundColor: "#ef4444", opacity: savingLost ? 0.6 : 1 },
              ]}
              onPress={handleMarkLost}
              disabled={savingLost}
            >
              {savingLost ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="close-circle" size={18} color="#fff" />
                  <Text style={s.saveBtnText}>Marcar como Perdido</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ─── InfoRow Component ─── */

function InfoRow({
  icon,
  label,
  value,
  color,
  textColor,
}: {
  icon: string;
  label: string;
  value: string;
  color: string;
  textColor: string;
}) {
  return (
    <View style={s.infoRow}>
      <Ionicons name={icon as any} size={14} color={color} />
      <Text style={[s.infoLabel, { color }]}>{label}</Text>
      <Text style={[s.infoValue, { color: textColor }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/* ═══════════════════════════════════════════════════
 * STYLES
 * ═══════════════════════════════════════════════════ */

const s = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { ...typography.body, marginTop: spacing.sm },

  // Header
  header: { padding: spacing.lg, borderBottomWidth: 1 },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  backText: { ...typography.body, fontWeight: "600" },
  headerTitle: { ...typography.title, marginBottom: spacing.sm },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: "flex-start",
  },
  statusBadgeText: { fontSize: 13, fontWeight: "700" },

  // Info card
  infoCard: { borderRadius: 12, borderWidth: 1, padding: spacing.lg },
  sectionTitle: {
    ...typography.subtitle,
    fontWeight: "700",
    marginBottom: spacing.md,
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
  },
  infoLabel: { ...typography.caption, width: 100 },
  infoValue: { ...typography.body, flex: 1 },
  notesRow: {
    marginTop: spacing.sm,
    paddingLeft: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: "#64748b",
  },
  notesLabel: { ...typography.caption, fontWeight: "600", marginBottom: 2 },
  notesText: { ...typography.body, lineHeight: 20 },

  customerLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
  },
  customerLinkLabel: { fontSize: 11, fontWeight: "600" },
  customerLinkName: { ...typography.body, fontWeight: "600" },

  // Actions
  actionsRow: { flexDirection: "row", gap: spacing.sm },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing.sm + 2,
    borderRadius: 8,
  },
  actionBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  // Timeline
  timelineItem: {
    flexDirection: "row",
    gap: spacing.sm,
    position: "relative",
    paddingBottom: spacing.md,
    minHeight: 50,
  },
  timelineLine: {
    position: "absolute",
    left: 12,
    top: 28,
    bottom: 0,
    width: 2,
  },
  timelineDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  timelineContent: { flex: 1 },
  timelineHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  timelineType: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  timelineDate: { ...typography.caption },
  timelineTitle: { ...typography.body, fontWeight: "600" },
  timelineDesc: { ...typography.caption, marginTop: 2, lineHeight: 18 },
  emptyText: {
    ...typography.body,
    fontStyle: "italic",
    textAlign: "center",
    padding: spacing.lg,
  },

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
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  modalTitle: { ...typography.subtitle, fontWeight: "700" },

  // Form
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

  stepOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderLeftWidth: 4,
  },
  stepOptionName: { ...typography.body, fontWeight: "600" },
});
