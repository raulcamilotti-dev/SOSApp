/**
 * CRM Plugin — Kanban plugin for scope "crm".
 *
 * Ported from crm-kanban.tsx. Provides:
 * - Create Lead modal (name, email, phone, cpf, company, estimated_value, source, priority, notes)
 * - Activity modal (type chips, title, description)
 * - Lost Reason modal (reason text)
 * - Card actions: crm_activity / crm_convert / crm_advance / crm_lost
 * - onCardPress → navigate to /Administrador/crm-lead-detail
 * - onAfterMove → sync lead.status + last_contact_at
 * - renderCard → CRM-specific card with priority dot, contact rows, value/source badges
 */

import { spacing, typography } from "@/app/theme/styles";
import type { KanbanTheme } from "@/components/ui/KanbanScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api, getApiErrorMessage } from "@/services/api";
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
    markLeadAsLost,
    updateLead,
    type Lead,
    type LeadPriority,
    type LeadSource,
    type LeadStatus,
} from "@/services/crm";
import { CRUD_ENDPOINT } from "@/services/crud";
import {
    startServiceOrderProcess,
    type EngineContext,
} from "@/services/service-order-engine";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
    forwardRef,
    useCallback,
    useImperativeHandle,
    useMemo,
    useState,
    type ReactNode,
} from "react";
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

import type {
    KanbanPluginProps,
    KanbanPluginRef,
    PluginCardAction,
    UnifiedKanbanItem,
    WorkflowStep,
} from "./types";

/* ═══════════════════════════════════════════════════════
 * HELPERS
 * ═══════════════════════════════════════════════════════ */

const formatDate = (d: string | null | undefined) => {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    return "";
  }
};

const formatCurrency = (v: number | string | null | undefined) => {
  if (v === null || v === undefined) return "";
  const num = typeof v === "number" ? v : parseFloat(String(v));
  if (isNaN(num) || num <= 0) return "";
  return num.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
};

const getPriorityColor = (p?: string) => {
  switch (p) {
    case "urgente":
      return "#ef4444";
    case "alta":
      return "#f97316";
    case "media":
      return "#f59e0b";
    case "baixa":
    default:
      return "#22c55e";
  }
};

/* ═══════════════════════════════════════════════════════
 * COMPONENT
 * ═══════════════════════════════════════════════════════ */

export const CrmPlugin = forwardRef<KanbanPluginRef, KanbanPluginProps>(
  function CrmPlugin(props, ref) {
    const { tenantId, userId, userName, template, steps, onReload } = props;
    useAuth(); // keep provider context active

    /* ── Theme ── */
    const tintColor = useThemeColor({}, "tint");
    const cardBg = useThemeColor({}, "card");
    const textColor = useThemeColor({}, "text");
    const mutedColor = useThemeColor({}, "muted");
    const borderColor = useThemeColor({}, "border");
    const bgColor = useThemeColor({}, "background");

    /* ── Engine context ── */
    const engineCtx: EngineContext = useMemo(
      () => ({ tenantId, userId, userName: userName ?? "Operador" }),
      [tenantId, userId, userName],
    );

    /* ── Non-terminal steps (for advance logic) ── */
    const pipelineSteps = useMemo(
      () =>
        steps
          .filter((s) => !s.is_terminal)
          .sort((a, b) => a.step_order - b.step_order),
      [steps],
    );

    /* ═══════════════════════════════════════════════════════
     * STATE — Create Lead Modal
     * ═══════════════════════════════════════════════════════ */

    const [createVisible, setCreateVisible] = useState(false);
    const [creating, setCreating] = useState(false);
    const [formName, setFormName] = useState("");
    const [formEmail, setFormEmail] = useState("");
    const [formPhone, setFormPhone] = useState("");
    const [formCpf, setFormCpf] = useState("");
    const [formCompany, setFormCompany] = useState("");
    const [formEstimatedValue, setFormEstimatedValue] = useState("");
    const [formSource, setFormSource] = useState<LeadSource | "">("");
    const [formPriority, setFormPriority] = useState<LeadPriority | "">("");
    const [formNotes, setFormNotes] = useState("");

    /* ═══════════════════════════════════════════════════════
     * STATE — Activity Modal
     * ═══════════════════════════════════════════════════════ */

    const [activityVisible, setActivityVisible] = useState(false);
    const [activityLead, setActivityLead] = useState<Lead | null>(null);
    const [activityType, setActivityType] = useState("");
    const [activityTitle, setActivityTitle] = useState("");
    const [activityDesc, setActivityDesc] = useState("");
    const [savingActivity, setSavingActivity] = useState(false);

    /* ═══════════════════════════════════════════════════════
     * STATE — Lost Reason Modal
     * ═══════════════════════════════════════════════════════ */

    const [lostVisible, setLostVisible] = useState(false);
    const [lostLead, setLostLead] = useState<Lead | null>(null);
    const [lostReason, setLostReason] = useState("");
    const [savingLost, setSavingLost] = useState(false);

    /* ═══════════════════════════════════════════════════════
     * HELPERS — Extract lead from UnifiedKanbanItem
     * ═══════════════════════════════════════════════════════ */

    const extractLead = useCallback((item: UnifiedKanbanItem): Lead | null => {
      if (!item.entity) return null;
      return item.entity as unknown as Lead;
    }, []);

    /* ═══════════════════════════════════════════════════════
     * HANDLERS
     * ═══════════════════════════════════════════════════════ */

    const resetCreateForm = useCallback(() => {
      setFormName("");
      setFormEmail("");
      setFormPhone("");
      setFormCpf("");
      setFormCompany("");
      setFormEstimatedValue("");
      setFormSource("");
      setFormPriority("");
      setFormNotes("");
    }, []);

    const handleCreateLead = useCallback(async () => {
      if (!formName.trim()) {
        Alert.alert("Atenção", "Informe o nome do lead.");
        return;
      }

      try {
        setCreating(true);
        const lead = await createLead({
          tenant_id: tenantId,
          name: formName.trim(),
          email: formEmail.trim() || undefined,
          phone: formPhone.trim() || undefined,
          cpf: formCpf.replace(/\D/g, "") || undefined,
          company_name: formCompany.trim() || undefined,
          estimated_value: formEstimatedValue
            ? parseFloat(formEstimatedValue.replace(",", "."))
            : undefined,
          source: (formSource as LeadSource) || undefined,
          priority: (formPriority as LeadPriority) || "media",
          notes: formNotes.trim() || undefined,
          status: "novo",
        });

        // Also create a Service Order to wire into workflow engine
        if (template?.id) {
          try {
            const firstStep = pipelineSteps[0];
            const soRes = await api.post(CRUD_ENDPOINT, {
              action: "create",
              table: "service_orders",
              payload: {
                tenant_id: tenantId,
                customer_id: null,
                title: `Lead: ${lead.name}`,
                description: lead.notes ?? null,
                workflow_template_id: template.id,
                current_step_id: firstStep?.id ?? null,
                process_status: "active",
                created_by: userId,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
            });

            const soData = Array.isArray(soRes.data)
              ? soRes.data[0]
              : soRes.data;
            const soId = soData?.id;

            if (soId) {
              // Link lead → SO
              await updateLead(lead.id, { service_order_id: soId } as any);

              // Start engine (creates tasks, fires onEnterStep)
              await startServiceOrderProcess(
                soId,
                template.id,
                engineCtx,
              ).catch(() => {
                // Non-fatal — SO was created, engine hook failed
              });
            }
          } catch (err) {
            // Non-fatal — lead was created, but SO creation failed
            if (__DEV__) console.warn("[CrmPlugin] SO creation failed:", err);
          }
        }

        setCreateVisible(false);
        resetCreateForm();
        onReload();
        Alert.alert("Sucesso", `Lead "${lead.name}" criado com sucesso!`);
      } catch (err) {
        Alert.alert("Erro", getApiErrorMessage(err, "Falha ao criar lead."));
      } finally {
        setCreating(false);
      }
    }, [
      formName,
      formEmail,
      formPhone,
      formCpf,
      formCompany,
      formEstimatedValue,
      formSource,
      formPriority,
      formNotes,
      tenantId,
      userId,
      template,
      pipelineSteps,
      engineCtx,
      onReload,
      resetCreateForm,
    ]);

    const openActivityModal = useCallback((lead: Lead) => {
      setActivityLead(lead);
      setActivityType("");
      setActivityTitle("");
      setActivityDesc("");
      setActivityVisible(true);
    }, []);

    const handleSaveActivity = useCallback(async () => {
      if (!activityLead || !activityTitle.trim()) {
        Alert.alert("Atenção", "Informe o título da atividade.");
        return;
      }

      try {
        setSavingActivity(true);
        await createLeadActivity({
          lead_id: activityLead.id,
          tenant_id: tenantId,
          type: activityType || "nota",
          title: activityTitle.trim(),
          description: activityDesc.trim() || undefined,
          created_by: userId,
        });

        // Update last_contact_at
        await updateLead(activityLead.id, {
          last_contact_at: new Date().toISOString(),
        });

        setActivityVisible(false);
        onReload();
      } catch (err) {
        Alert.alert(
          "Erro",
          getApiErrorMessage(err, "Falha ao salvar atividade."),
        );
      } finally {
        setSavingActivity(false);
      }
    }, [
      activityLead,
      activityType,
      activityTitle,
      activityDesc,
      tenantId,
      userId,
      onReload,
    ]);

    const openLostModal = useCallback((lead: Lead) => {
      setLostLead(lead);
      setLostReason("");
      setLostVisible(true);
    }, []);

    const handleMarkLost = useCallback(async () => {
      if (!lostLead) return;

      try {
        setSavingLost(true);
        await markLeadAsLost(lostLead.id, lostReason.trim());
        setLostVisible(false);
        onReload();
      } catch (err) {
        Alert.alert(
          "Erro",
          getApiErrorMessage(err, "Falha ao marcar como perdido."),
        );
      } finally {
        setSavingLost(false);
      }
    }, [lostLead, lostReason, onReload]);

    const handleQuickAdvance = useCallback(
      async (lead: Lead) => {
        const currentStatus = lead.status as LeadStatus;
        const currentIdx = KANBAN_STAGES.indexOf(currentStatus);
        if (currentIdx < 0 || currentIdx >= KANBAN_STAGES.length - 1) {
          Alert.alert("Atenção", "Lead já está no último estágio do pipeline.");
          return;
        }

        const nextStatus = KANBAN_STAGES[currentIdx + 1];
        const nextConfig = getLeadStatusConfig(nextStatus);
        const proceed = await new Promise<boolean>((resolve) => {
          if (Platform.OS === "web") {
            resolve(window.confirm(`Avançar para "${nextConfig.label}"?`));
          } else {
            Alert.alert(
              "Confirmar",
              `Avançar lead para "${nextConfig.label}"?`,
              [
                {
                  text: "Cancelar",
                  style: "cancel",
                  onPress: () => resolve(false),
                },
                { text: "Confirmar", onPress: () => resolve(true) },
              ],
            );
          }
        });

        if (!proceed) return;

        try {
          await updateLead(lead.id, {
            status: nextStatus,
            last_contact_at: new Date().toISOString(),
          });
          onReload();
        } catch (err) {
          Alert.alert(
            "Erro",
            getApiErrorMessage(err, "Falha ao avançar lead."),
          );
        }
      },
      [onReload],
    );

    const handleConvert = useCallback(
      async (lead: Lead) => {
        const proceed = await new Promise<boolean>((resolve) => {
          const msg = `Converter "${lead.name}" em cliente?\n\nSe já existir um cliente com o mesmo CPF, e-mail ou telefone, o lead será vinculado ao cliente existente.`;
          if (Platform.OS === "web") {
            resolve(window.confirm(msg));
          } else {
            Alert.alert("Converter Lead", msg, [
              {
                text: "Cancelar",
                style: "cancel",
                onPress: () => resolve(false),
              },
              { text: "Converter", onPress: () => resolve(true) },
            ]);
          }
        });

        if (!proceed) return;

        try {
          const result = await convertLeadToCustomer(lead);
          const info = result.isExisting
            ? `Vinculado ao cliente existente: ${result.customer.name}`
            : `Novo cliente criado: ${result.customer.name}`;
          Alert.alert("Sucesso", info);
          onReload();
        } catch (err) {
          Alert.alert(
            "Erro",
            getApiErrorMessage(err, "Falha ao converter lead."),
          );
        }
      },
      [onReload],
    );

    /* ═══════════════════════════════════════════════════════
     * IMPERATIVE HANDLE
     * ═══════════════════════════════════════════════════════ */

    useImperativeHandle(
      ref,
      () => ({
        getCardActions(
          item: UnifiedKanbanItem,
          stepId: string,
        ): PluginCardAction[] {
          const lead = extractLead(item);
          if (!lead) return [];

          const step = steps.find((s) => s.id === stepId);
          const isFinal = step?.is_terminal ?? false;
          const isConvertible = CONVERTIBLE_STATUSES.includes(
            lead.status as any,
          );

          const actions: PluginCardAction[] = [
            {
              id: "crm_activity",
              label: "Atividade",
              icon: "chatbubble-ellipses-outline",
              color: tintColor,
              onPress: () => openActivityModal(lead),
            },
          ];

          if (isConvertible) {
            actions.push({
              id: "crm_convert",
              label: "Converter",
              icon: "person-add-outline",
              color: "#8b5cf6",
              onPress: () => handleConvert(lead),
            });
          } else if (!isFinal) {
            actions.push({
              id: "crm_advance",
              label: "Avançar",
              icon: "arrow-forward-outline",
              color: "#10b981",
              onPress: () => handleQuickAdvance(lead),
            });
          }

          if (!isFinal) {
            actions.push({
              id: "crm_lost",
              label: "Perdido",
              icon: "close-circle-outline",
              color: "#ef4444",
              onPress: () => openLostModal(lead),
            });
          }

          return actions;
        },

        onCardPress(item: UnifiedKanbanItem) {
          const lead = extractLead(item);
          if (lead) {
            router.push({
              pathname: "/Administrador/crm-lead-detail",
              params: { leadId: lead.id },
            } as any);
          }
        },

        async onAfterMove(
          item: UnifiedKanbanItem,
          _fromStepId: string,
          toStepId: string,
          allSteps: WorkflowStep[],
        ) {
          // Sync lead.status with the workflow step name
          const lead = extractLead(item);
          if (!lead) return;

          const targetStep = allSteps.find((s) => s.id === toStepId);
          if (!targetStep) return;

          // Try to map step name → LeadStatus
          const stepNameLower = targetStep.name.toLowerCase();
          const matchedStatus = KANBAN_STAGES.find(
            (s) => s === stepNameLower,
          ) as LeadStatus | undefined;

          if (matchedStatus) {
            await updateLead(lead.id, {
              status: matchedStatus,
              last_contact_at: new Date().toISOString(),
            }).catch(() => {
              // Non-fatal sync failure
            });
          }
        },

        getCreateButton() {
          return {
            label: "Novo Lead",
            onPress: () => setCreateVisible(true),
          };
        },

        renderCard(
          item: UnifiedKanbanItem,
          stepId: string,
          theme: KanbanTheme,
        ): ReactNode {
          const lead = extractLead(item);
          if (!lead) return null;

          const step = steps.find((s) => s.id === stepId);
          const isFinal = step?.is_terminal ?? false;
          const isConvertible = CONVERTIBLE_STATUSES.includes(
            lead.status as any,
          );
          const priorityColor = getPriorityColor(lead.priority);
          const value = formatCurrency(lead.estimated_value);
          const date = formatDate(lead.last_contact_at ?? lead.created_at);

          return (
            <TouchableOpacity
              key={item.id}
              style={[
                cs.card,
                {
                  backgroundColor: theme.cardBg,
                  borderColor: theme.borderColor,
                },
              ]}
              onLongPress={() => {
                /* handled by KanbanScreen move modal */
              }}
              activeOpacity={0.9}
            >
              {/* Header: name + priority dot */}
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/Administrador/crm-lead-detail",
                    params: { leadId: lead.id },
                  } as any)
                }
                activeOpacity={0.7}
              >
                <View style={cs.cardHeaderRow}>
                  <Text
                    style={[cs.cardTitle, { color: theme.textColor }]}
                    numberOfLines={2}
                  >
                    {lead.name}
                  </Text>
                  <View
                    style={[cs.priorityDot, { backgroundColor: priorityColor }]}
                  />
                </View>
              </TouchableOpacity>

              {/* Contact info rows */}
              {lead.email ? (
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
              ) : null}

              {lead.phone ? (
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
              ) : null}

              {lead.company_name ? (
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
              ) : null}

              {/* Value badge + date */}
              <View
                style={[
                  cs.cardRow,
                  { marginTop: 4, justifyContent: "space-between" },
                ]}
              >
                <Text
                  style={[cs.cardCaption, { color: theme.mutedColor }]}
                  numberOfLines={1}
                >
                  {date}
                </Text>
                {value ? (
                  <View
                    style={[cs.valueBadge, { backgroundColor: "#10b98118" }]}
                  >
                    <Text style={[cs.valueBadgeText, { color: "#10b981" }]}>
                      {value}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Source badge */}
              {lead.source ? (
                <View style={[cs.cardRow, { marginTop: 2 }]}>
                  <View
                    style={[
                      cs.sourceBadge,
                      { backgroundColor: theme.tintColor + "18" },
                    ]}
                  >
                    <Text
                      style={[cs.sourceBadgeText, { color: theme.tintColor }]}
                    >
                      {LEAD_SOURCES.find((s) => s.value === lead.source)
                        ?.label ?? lead.source}
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Action buttons */}
              <View style={cs.cardActions}>
                <TouchableOpacity
                  style={[cs.actionBtn, { backgroundColor: theme.tintColor }]}
                  onPress={() => openActivityModal(lead)}
                >
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={12}
                    color="#fff"
                  />
                  <Text style={cs.actionBtnText}>Atividade</Text>
                </TouchableOpacity>

                {isConvertible ? (
                  <TouchableOpacity
                    style={[cs.actionBtn, { backgroundColor: "#8b5cf6" }]}
                    onPress={() => handleConvert(lead)}
                  >
                    <Ionicons
                      name="person-add-outline"
                      size={12}
                      color="#fff"
                    />
                    <Text style={cs.actionBtnText}>Converter</Text>
                  </TouchableOpacity>
                ) : !isFinal ? (
                  <TouchableOpacity
                    style={[cs.actionBtn, { backgroundColor: "#10b981" }]}
                    onPress={() => handleQuickAdvance(lead)}
                  >
                    <Ionicons
                      name="arrow-forward-outline"
                      size={12}
                      color="#fff"
                    />
                    <Text style={cs.actionBtnText}>Avançar</Text>
                  </TouchableOpacity>
                ) : null}

                {!isFinal ? (
                  <TouchableOpacity
                    style={[cs.actionBtn, { backgroundColor: "#ef4444" }]}
                    onPress={() => openLostModal(lead)}
                  >
                    <Ionicons
                      name="close-circle-outline"
                      size={12}
                      color="#fff"
                    />
                    <Text style={cs.actionBtnText}>Perdido</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        },
      }),
      [
        steps,
        tintColor,
        extractLead,
        openActivityModal,
        handleConvert,
        handleQuickAdvance,
        openLostModal,
      ],
    );

    /* ═══════════════════════════════════════════════════════
     * RENDER — Plugin modals
     * ═══════════════════════════════════════════════════════ */

    return (
      <>
        {/* ─── Create Lead Modal ─── */}
        <Modal
          visible={createVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setCreateVisible(false)}
        >
          <View style={ms.modalOverlay}>
            <View style={[ms.modalSheet, { backgroundColor: cardBg }]}>
              <View style={ms.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[ms.modalTitle, { color: textColor }]}>
                    Novo Lead
                  </Text>
                  <Text style={[ms.modalSubtitle, { color: mutedColor }]}>
                    Adicionar ao pipeline CRM
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setCreateVisible(false)}>
                  <Ionicons name="close" size={24} color={mutedColor} />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={{ maxHeight: "80%" }}
                showsVerticalScrollIndicator={false}
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
                    { borderColor, color: textColor, backgroundColor: bgColor },
                  ]}
                />

                {/* Email */}
                <Text style={[ms.fieldLabel, { color: mutedColor }]}>
                  Email
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
                    { borderColor, color: textColor, backgroundColor: bgColor },
                  ]}
                />

                {/* Phone */}
                <Text style={[ms.fieldLabel, { color: mutedColor }]}>
                  Telefone
                </Text>
                <TextInput
                  value={formPhone}
                  onChangeText={setFormPhone}
                  placeholder="(00) 00000-0000"
                  placeholderTextColor={mutedColor}
                  keyboardType="phone-pad"
                  style={[
                    ms.fieldInput,
                    { borderColor, color: textColor, backgroundColor: bgColor },
                  ]}
                />

                {/* CPF */}
                <Text style={[ms.fieldLabel, { color: mutedColor }]}>CPF</Text>
                <TextInput
                  value={formCpf}
                  onChangeText={setFormCpf}
                  placeholder="000.000.000-00"
                  placeholderTextColor={mutedColor}
                  keyboardType="number-pad"
                  style={[
                    ms.fieldInput,
                    { borderColor, color: textColor, backgroundColor: bgColor },
                  ]}
                />

                {/* Company */}
                <Text style={[ms.fieldLabel, { color: mutedColor }]}>
                  Empresa
                </Text>
                <TextInput
                  value={formCompany}
                  onChangeText={setFormCompany}
                  placeholder="Nome da empresa"
                  placeholderTextColor={mutedColor}
                  style={[
                    ms.fieldInput,
                    { borderColor, color: textColor, backgroundColor: bgColor },
                  ]}
                />

                {/* Estimated Value */}
                <Text style={[ms.fieldLabel, { color: mutedColor }]}>
                  Valor Estimado
                </Text>
                <TextInput
                  value={formEstimatedValue}
                  onChangeText={setFormEstimatedValue}
                  placeholder="0,00"
                  placeholderTextColor={mutedColor}
                  keyboardType="decimal-pad"
                  style={[
                    ms.fieldInput,
                    { borderColor, color: textColor, backgroundColor: bgColor },
                  ]}
                />

                {/* Source chips */}
                <Text style={[ms.fieldLabel, { color: mutedColor }]}>
                  Origem
                </Text>
                <View style={ms.chipRow}>
                  {LEAD_SOURCES.map((src) => {
                    const selected = formSource === src.value;
                    return (
                      <TouchableOpacity
                        key={src.value}
                        style={[
                          ms.chip,
                          {
                            borderColor: selected ? tintColor : borderColor,
                            backgroundColor: selected
                              ? tintColor + "18"
                              : "transparent",
                          },
                        ]}
                        onPress={() =>
                          setFormSource(
                            selected ? "" : (src.value as LeadSource),
                          )
                        }
                      >
                        <Text
                          style={[
                            ms.chipText,
                            {
                              color: selected ? tintColor : mutedColor,
                            },
                          ]}
                        >
                          {src.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Priority chips */}
                <Text style={[ms.fieldLabel, { color: mutedColor }]}>
                  Prioridade
                </Text>
                <View style={ms.chipRow}>
                  {LEAD_PRIORITIES.map((pri) => {
                    const selected = formPriority === pri.value;
                    const priColor = getPriorityColor(pri.value);
                    return (
                      <TouchableOpacity
                        key={pri.value}
                        style={[
                          ms.chip,
                          {
                            borderColor: selected ? priColor : borderColor,
                            backgroundColor: selected
                              ? priColor + "18"
                              : "transparent",
                          },
                        ]}
                        onPress={() =>
                          setFormPriority(
                            selected ? "" : (pri.value as LeadPriority),
                          )
                        }
                      >
                        <Text
                          style={[
                            ms.chipText,
                            {
                              color: selected ? priColor : mutedColor,
                            },
                          ]}
                        >
                          {pri.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Notes */}
                <Text style={[ms.fieldLabel, { color: mutedColor }]}>
                  Observações
                </Text>
                <TextInput
                  value={formNotes}
                  onChangeText={setFormNotes}
                  placeholder="Detalhes do lead..."
                  placeholderTextColor={mutedColor}
                  multiline
                  numberOfLines={3}
                  style={[
                    ms.fieldInput,
                    {
                      borderColor,
                      color: textColor,
                      backgroundColor: bgColor,
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
                    backgroundColor: creating ? mutedColor : tintColor,
                  },
                ]}
                onPress={handleCreateLead}
                disabled={creating}
              >
                {creating && <ActivityIndicator size="small" color="#fff" />}
                <Text style={ms.saveBtnText}>
                  {creating ? "Criando..." : "Criar Lead"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ─── Activity Modal ─── */}
        <Modal
          visible={activityVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setActivityVisible(false)}
        >
          <View style={ms.modalOverlay}>
            <View style={[ms.modalSheet, { backgroundColor: cardBg }]}>
              <View style={ms.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[ms.modalTitle, { color: textColor }]}>
                    Nova Atividade
                  </Text>
                  {activityLead && (
                    <Text
                      style={[ms.modalSubtitle, { color: mutedColor }]}
                      numberOfLines={1}
                    >
                      {activityLead.name}
                    </Text>
                  )}
                </View>
                <TouchableOpacity onPress={() => setActivityVisible(false)}>
                  <Ionicons name="close" size={24} color={mutedColor} />
                </TouchableOpacity>
              </View>

              {/* Activity type chips */}
              <Text style={[ms.fieldLabel, { color: mutedColor }]}>Tipo</Text>
              <View style={ms.chipRow}>
                {ACTIVITY_TYPES.map((at) => {
                  const selected = activityType === at.value;
                  return (
                    <TouchableOpacity
                      key={at.value}
                      style={[
                        ms.chip,
                        {
                          borderColor: selected ? tintColor : borderColor,
                          backgroundColor: selected
                            ? tintColor + "18"
                            : "transparent",
                        },
                      ]}
                      onPress={() => setActivityType(selected ? "" : at.value)}
                    >
                      <Ionicons
                        name={at.icon as any}
                        size={12}
                        color={selected ? tintColor : mutedColor}
                      />
                      <Text
                        style={[
                          ms.chipText,
                          {
                            color: selected ? tintColor : mutedColor,
                          },
                        ]}
                      >
                        {at.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Title */}
              <Text style={[ms.fieldLabel, { color: mutedColor }]}>
                Título *
              </Text>
              <TextInput
                value={activityTitle}
                onChangeText={setActivityTitle}
                placeholder="Título da atividade"
                placeholderTextColor={mutedColor}
                style={[
                  ms.fieldInput,
                  { borderColor, color: textColor, backgroundColor: bgColor },
                ]}
              />

              {/* Description */}
              <Text style={[ms.fieldLabel, { color: mutedColor }]}>
                Descrição
              </Text>
              <TextInput
                value={activityDesc}
                onChangeText={setActivityDesc}
                placeholder="Detalhes..."
                placeholderTextColor={mutedColor}
                multiline
                numberOfLines={3}
                style={[
                  ms.fieldInput,
                  {
                    borderColor,
                    color: textColor,
                    backgroundColor: bgColor,
                    minHeight: 70,
                    textAlignVertical: "top",
                  },
                ]}
              />

              {/* Save button */}
              <TouchableOpacity
                style={[
                  ms.saveBtn,
                  {
                    backgroundColor: savingActivity ? mutedColor : tintColor,
                  },
                ]}
                onPress={handleSaveActivity}
                disabled={savingActivity}
              >
                {savingActivity && (
                  <ActivityIndicator size="small" color="#fff" />
                )}
                <Text style={ms.saveBtnText}>
                  {savingActivity ? "Salvando..." : "Salvar Atividade"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ─── Lost Reason Modal ─── */}
        <Modal
          visible={lostVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setLostVisible(false)}
        >
          <View style={ms.modalOverlay}>
            <View style={[ms.modalSheet, { backgroundColor: cardBg }]}>
              <View style={ms.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[ms.modalTitle, { color: textColor }]}>
                    Motivo da Perda
                  </Text>
                  {lostLead && (
                    <Text
                      style={[ms.modalSubtitle, { color: mutedColor }]}
                      numberOfLines={1}
                    >
                      {lostLead.name}
                    </Text>
                  )}
                </View>
                <TouchableOpacity onPress={() => setLostVisible(false)}>
                  <Ionicons name="close" size={24} color={mutedColor} />
                </TouchableOpacity>
              </View>

              <Text style={[ms.fieldLabel, { color: mutedColor }]}>Motivo</Text>
              <TextInput
                value={lostReason}
                onChangeText={setLostReason}
                placeholder="Por que este lead foi perdido?"
                placeholderTextColor={mutedColor}
                multiline
                numberOfLines={4}
                style={[
                  ms.fieldInput,
                  {
                    borderColor,
                    color: textColor,
                    backgroundColor: bgColor,
                    minHeight: 90,
                    textAlignVertical: "top",
                  },
                ]}
              />

              <TouchableOpacity
                style={[
                  ms.saveBtn,
                  {
                    backgroundColor: savingLost ? mutedColor : "#ef4444",
                  },
                ]}
                onPress={handleMarkLost}
                disabled={savingLost}
              >
                {savingLost && <ActivityIndicator size="small" color="#fff" />}
                <Text style={ms.saveBtnText}>
                  {savingLost ? "Salvando..." : "Marcar como Perdido"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </>
    );
  },
);

export default CrmPlugin;

/* ═══════════════════════════════════════════════════════
 * STYLES
 * ═══════════════════════════════════════════════════════ */

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
});

const ms = StyleSheet.create({
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
