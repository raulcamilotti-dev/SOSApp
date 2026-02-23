/**
 * TASK DETAIL SCREEN
 *
 * Full task management: edit fields, change status/priority,
 * and access tools (Lançamento de Processo, Prazos, Ver Processo).
 */

import { spacing, typography } from "@/app/theme/styles";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
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
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

/* ─── Types ─── */

interface TaskData {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  completed_at?: string | null;
  assigned_to?: string | null;
  service_order_id?: string | null;
  property_id?: string | null;
  workflow_step_id?: string | null;
  tenant_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface UserItem {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

interface DeadlineItem {
  id: string;
  due_date: string;
  status: string;
  escalated: boolean;
  step_id?: string | null;
  service_order_id?: string | null;
}

interface StepItem {
  id: string;
  name: string;
}

/* ─── Helpers ─── */

const STATUS_OPTIONS = [
  {
    value: "todo",
    label: "A fazer",
    color: "#64748b",
    icon: "ellipse-outline",
  },
  {
    value: "in_progress",
    label: "Em andamento",
    color: "#3b82f6",
    icon: "play-circle-outline",
  },
  {
    value: "completed",
    label: "Concluído",
    color: "#22c55e",
    icon: "checkmark-circle",
  },
] as const;

const PRIORITY_OPTIONS = [
  { value: "low", label: "Baixa", color: "#22c55e", icon: "arrow-down-circle" },
  {
    value: "medium",
    label: "Média",
    color: "#f59e0b",
    icon: "remove-circle-outline",
  },
  { value: "high", label: "Alta", color: "#ef4444", icon: "arrow-up-circle" },
] as const;

const formatDate = (d?: string | null) => {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("pt-BR");
  } catch {
    return d;
  }
};

const formatDateInput = (d?: string | null): string => {
  if (!d) return "";
  try {
    const dt = new Date(d);
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const yyyy = dt.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    return d;
  }
};

const parseDateInput = (text: string): string | null => {
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
};

const daysUntil = (dateStr: string): number => {
  const now = new Date();
  const due = new Date(dateStr);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
};

/* ─── Component ─── */

export default function TaskDetailScreen() {
  const { user: authUser } = useAuth();
  const tenantId = authUser?.tenant_id ?? "";
  const params = useLocalSearchParams<{
    taskId: string;
    serviceOrderId?: string;
    orderTitle?: string;
  }>();

  const taskId = Array.isArray(params.taskId)
    ? params.taskId[0]
    : params.taskId;
  const serviceOrderId = Array.isArray(params.serviceOrderId)
    ? params.serviceOrderId[0]
    : params.serviceOrderId;
  const orderTitle = Array.isArray(params.orderTitle)
    ? params.orderTitle[0]
    : params.orderTitle;

  // ── Theme ──
  const bg = useThemeColor({}, "background");
  const cardBg = useThemeColor({}, "card");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");
  const inputBg = useThemeColor({}, "input");

  // ── State ──
  const [task, setTask] = useState<TaskData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [deadlines, setDeadlines] = useState<DeadlineItem[]>([]);
  const [steps, setSteps] = useState<StepItem[]>([]);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [userSearch, setUserSearch] = useState("");

  // Editable fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDateText, setStartDateText] = useState("");
  const [dueDateText, setDueDateText] = useState("");

  /* ══════════════════════════════════════════════════════
   * LOAD DATA
   * ══════════════════════════════════════════════════════ */

  const loadTask = useCallback(async () => {
    if (!taskId) return;
    try {
      setLoading(true);
      const [taskRes, usersRes, userTenantsRes] = await Promise.all([
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "tasks",
          ...buildSearchParams([{ field: "id", value: taskId }]),
        }),
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "users",
          ...buildSearchParams([], { sortColumn: "fullname" }),
        }),
        tenantId
          ? api.post(CRUD_ENDPOINT, {
              action: "list",
              table: "user_tenants",
              ...buildSearchParams([{ field: "tenant_id", value: tenantId }], {
                autoExcludeDeleted: true,
              }),
            })
          : Promise.resolve({ data: [] }),
      ]);

      const taskList = normalizeCrudList<TaskData>(taskRes.data);
      const foundTask = taskList.find((t) => t.id === taskId);
      if (!foundTask) {
        Alert.alert("Erro", "Tarefa não encontrada");
        router.back();
        return;
      }

      setTask(foundTask);
      setTitle(foundTask.title || "");
      setDescription(foundTask.description || "");
      setStartDateText(formatDateInput(foundTask.start_date));
      setDueDateText(formatDateInput(foundTask.due_date));

      const allUsers = normalizeCrudList<UserItem>(usersRes.data).filter(
        (u) => !(u as any).deleted_at,
      );

      // Filter users by tenant membership
      if (tenantId) {
        const tenantUserIds = new Set(
          normalizeCrudList<{ user_id: string }>(userTenantsRes.data).map(
            (ut) => String(ut.user_id),
          ),
        );
        // Also include users with direct tenant_id match
        const filteredUsers = allUsers.filter(
          (u) =>
            tenantUserIds.has(String(u.id)) ||
            String((u as any).tenant_id ?? "") === tenantId,
        );
        setUsers(filteredUsers);
      } else {
        setUsers(allUsers);
      }

      // Load deadlines + steps if we have a service order
      const soId = foundTask.service_order_id || serviceOrderId;
      if (soId) {
        const [dlRes, stepsRes] = await Promise.all([
          api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "process_deadlines",
            ...buildSearchParams([{ field: "service_order_id", value: soId }], {
              sortColumn: "due_date",
            }),
          }),
          api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "workflow_steps",
            ...buildSearchParams([], { sortColumn: "step_order" }),
          }),
        ]);
        setDeadlines(
          normalizeCrudList<DeadlineItem>(dlRes.data).filter(
            (d) => !(d as any).deleted_at && d.status !== "completed",
          ),
        );
        setSteps(normalizeCrudList<StepItem>(stepsRes.data));
      }
    } catch (err) {
      console.error("Erro ao carregar tarefa:", err);
      Alert.alert("Erro", "Falha ao carregar detalhes da tarefa");
    } finally {
      setLoading(false);
    }
  }, [taskId, serviceOrderId]);

  useEffect(() => {
    loadTask();
  }, [loadTask]);

  /* ══════════════════════════════════════════════════════
   * SAVE FIELD
   * ══════════════════════════════════════════════════════ */

  const saveField = useCallback(
    async (field: string, value: any) => {
      if (!task) return;
      setSaving(true);
      try {
        await api.post(CRUD_ENDPOINT, {
          action: "update",
          table: "tasks",
          payload: {
            id: task.id,
            [field]: value,
            updated_at: new Date().toISOString(),
            ...(field === "status" && value === "completed"
              ? { completed_at: new Date().toISOString() }
              : {}),
            ...(field === "status" && value !== "completed"
              ? { completed_at: null }
              : {}),
          },
        });
        setTask((prev) => (prev ? { ...prev, [field]: value } : prev));
      } catch {
        Alert.alert("Erro", `Falha ao salvar ${field}`);
      } finally {
        setSaving(false);
      }
    },
    [task],
  );

  const handleSaveTitle = () => {
    if (title.trim() && title !== task?.title) {
      saveField("title", title.trim());
    }
  };

  const handleSaveDescription = () => {
    if (description !== (task?.description ?? "")) {
      saveField("description", description || null);
    }
  };

  const handleSaveStartDate = () => {
    if (!startDateText.trim()) {
      saveField("start_date", null);
      return;
    }
    const parsed = parseDateInput(startDateText);
    if (parsed) {
      saveField("start_date", parsed);
    } else {
      Alert.alert("Data inválida", "Use o formato DD/MM/AAAA");
    }
  };

  const handleSaveDueDate = () => {
    if (!dueDateText.trim()) {
      saveField("due_date", null);
      return;
    }
    const parsed = parseDateInput(dueDateText);
    if (parsed) {
      saveField("due_date", parsed);
    } else {
      Alert.alert("Data inválida", "Use o formato DD/MM/AAAA");
    }
  };

  /* ══════════════════════════════════════════════════════
   * RENDER
   * ══════════════════════════════════════════════════════ */

  if (loading || !task) {
    return (
      <View style={[st.container, { backgroundColor: bg }]}>
        <View style={st.centered}>
          <ActivityIndicator size="large" color={tintColor} />
          <Text style={[st.loadingText, { color: mutedColor }]}>
            Carregando tarefa...
          </Text>
        </View>
      </View>
    );
  }

  const assignedUser = users.find((u) => u.id === task.assigned_to);
  const soId = task.service_order_id || serviceOrderId;
  const stepName = task.workflow_step_id
    ? steps.find((s) => s.id === task.workflow_step_id)?.name
    : null;

  const filteredUsers = userSearch.trim()
    ? users.filter((u) => {
        const term = userSearch.toLowerCase();
        return (
          (u.name ?? "").toLowerCase().includes(term) ||
          (u.email ?? "").toLowerCase().includes(term)
        );
      })
    : users;

  return (
    <View style={[st.container, { backgroundColor: bg }]}>
      {/* Header */}
      <View
        style={[
          st.header,
          { backgroundColor: cardBg, borderBottomColor: borderColor },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={st.backRow}>
          <Ionicons name="arrow-back" size={18} color={tintColor} />
          <Text style={[st.backText, { color: tintColor }]}>Voltar</Text>
        </TouchableOpacity>
        <Text style={[st.headerTitle, { color: textColor }]}>
          Detalhes da Tarefa
        </Text>
        {orderTitle ? (
          <Text
            style={[st.headerSubtitle, { color: mutedColor }]}
            numberOfLines={1}
          >
            {orderTitle}
          </Text>
        ) : null}
        {saving && (
          <View style={st.savingRow}>
            <ActivityIndicator size="small" color={tintColor} />
            <Text style={[st.savingText, { color: tintColor }]}>
              Salvando...
            </Text>
          </View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }}
      >
        {/* ── Title ── */}
        <View style={[st.fieldCard, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[st.fieldLabel, { color: mutedColor }]}>Título</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            onBlur={handleSaveTitle}
            style={[
              st.textInput,
              { color: textColor, backgroundColor: inputBg, borderColor },
            ]}
            placeholder="Título da tarefa"
            placeholderTextColor={mutedColor}
          />
        </View>

        {/* ── Status ── */}
        <View style={[st.fieldCard, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[st.fieldLabel, { color: mutedColor }]}>Status</Text>
          <View style={st.pillRow}>
            {STATUS_OPTIONS.map((opt) => {
              const active = task.status === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => saveField("status", opt.value)}
                  style={[
                    st.pill,
                    {
                      backgroundColor: active ? opt.color : "transparent",
                      borderColor: opt.color,
                    },
                  ]}
                >
                  <Ionicons
                    name={opt.icon as any}
                    size={14}
                    color={active ? "#fff" : opt.color}
                  />
                  <Text
                    style={[
                      st.pillText,
                      { color: active ? "#fff" : opt.color },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Priority ── */}
        <View style={[st.fieldCard, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[st.fieldLabel, { color: mutedColor }]}>Prioridade</Text>
          <View style={st.pillRow}>
            {PRIORITY_OPTIONS.map((opt) => {
              const active = task.priority === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => saveField("priority", opt.value)}
                  style={[
                    st.pill,
                    {
                      backgroundColor: active ? opt.color : "transparent",
                      borderColor: opt.color,
                    },
                  ]}
                >
                  <Ionicons
                    name={opt.icon as any}
                    size={14}
                    color={active ? "#fff" : opt.color}
                  />
                  <Text
                    style={[
                      st.pillText,
                      { color: active ? "#fff" : opt.color },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Dates ── */}
        <View style={[st.fieldCard, { backgroundColor: cardBg, borderColor }]}>
          <View style={st.dateRow}>
            <View style={{ flex: 1 }}>
              <Text style={[st.fieldLabel, { color: mutedColor }]}>Início</Text>
              <TextInput
                value={startDateText}
                onChangeText={setStartDateText}
                onBlur={handleSaveStartDate}
                placeholder="DD/MM/AAAA"
                placeholderTextColor={mutedColor}
                style={[
                  st.textInput,
                  { color: textColor, backgroundColor: inputBg, borderColor },
                ]}
                keyboardType="numeric"
                maxLength={10}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st.fieldLabel, { color: mutedColor }]}>Prazo</Text>
              <TextInput
                value={dueDateText}
                onChangeText={setDueDateText}
                onBlur={handleSaveDueDate}
                placeholder="DD/MM/AAAA"
                placeholderTextColor={mutedColor}
                style={[
                  st.textInput,
                  { color: textColor, backgroundColor: inputBg, borderColor },
                ]}
                keyboardType="numeric"
                maxLength={10}
              />
            </View>
          </View>
          {task.due_date && (
            <View style={{ marginTop: spacing.xs }}>
              {(() => {
                const days = daysUntil(task.due_date);
                const color =
                  days < 0 ? "#ef4444" : days <= 3 ? "#f59e0b" : "#22c55e";
                const label =
                  days < 0
                    ? `Vencido há ${Math.abs(days)} dia(s)`
                    : days === 0
                      ? "Vence hoje"
                      : `${days} dia(s) restante(s)`;
                return (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Ionicons name="time-outline" size={12} color={color} />
                    <Text style={{ fontSize: 12, color, fontWeight: "600" }}>
                      {label}
                    </Text>
                  </View>
                );
              })()}
            </View>
          )}
        </View>

        {/* ── Assigned To ── */}
        <View style={[st.fieldCard, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[st.fieldLabel, { color: mutedColor }]}>
            Responsável
          </Text>
          <TouchableOpacity
            style={[st.pickerBtn, { backgroundColor: inputBg, borderColor }]}
            onPress={() => setShowUserPicker(!showUserPicker)}
          >
            <Ionicons name="person-outline" size={16} color={mutedColor} />
            <Text
              style={[
                st.pickerBtnText,
                {
                  color: assignedUser ? textColor : mutedColor,
                },
              ]}
              numberOfLines={1}
            >
              {assignedUser
                ? `${assignedUser.name || assignedUser.email || "Sem nome"}`
                : "Selecionar responsável"}
            </Text>
            <Ionicons
              name={showUserPicker ? "chevron-up" : "chevron-down"}
              size={16}
              color={mutedColor}
            />
          </TouchableOpacity>
          {assignedUser?.email && (
            <Text style={[st.pickerMeta, { color: mutedColor }]}>
              {assignedUser.email}
              {assignedUser.phone ? ` · ${assignedUser.phone}` : ""}
            </Text>
          )}
          {showUserPicker && (
            <View style={[st.userPickerList, { borderColor }]}>
              <TextInput
                value={userSearch}
                onChangeText={setUserSearch}
                placeholder="Buscar usuário..."
                placeholderTextColor={mutedColor}
                style={[
                  st.userSearchInput,
                  { color: textColor, borderColor, backgroundColor: bg },
                ]}
              />
              <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                <TouchableOpacity
                  style={[st.userOption, { borderColor }]}
                  onPress={() => {
                    saveField("assigned_to", null);
                    setShowUserPicker(false);
                    setUserSearch("");
                  }}
                >
                  <Text
                    style={[
                      st.userOptionText,
                      { color: mutedColor, fontStyle: "italic" },
                    ]}
                  >
                    Nenhum (remover)
                  </Text>
                </TouchableOpacity>
                {filteredUsers.map((u) => (
                  <TouchableOpacity
                    key={u.id}
                    style={[
                      st.userOption,
                      {
                        borderColor,
                        backgroundColor:
                          u.id === task.assigned_to
                            ? tintColor + "15"
                            : "transparent",
                      },
                    ]}
                    onPress={() => {
                      saveField("assigned_to", u.id);
                      setShowUserPicker(false);
                      setUserSearch("");
                    }}
                  >
                    <Text style={[st.userOptionText, { color: textColor }]}>
                      {u.name || u.email || u.id.slice(0, 8)}
                    </Text>
                    {u.email && (
                      <Text style={[st.userOptionMeta, { color: mutedColor }]}>
                        {u.email}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* ── Description ── */}
        <View style={[st.fieldCard, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[st.fieldLabel, { color: mutedColor }]}>Descrição</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            onBlur={handleSaveDescription}
            style={[
              st.textInput,
              st.multilineInput,
              { color: textColor, backgroundColor: inputBg, borderColor },
            ]}
            placeholder="Descrição da tarefa..."
            placeholderTextColor={mutedColor}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* ── Workflow step info ── */}
        {stepName && (
          <View
            style={[st.fieldCard, { backgroundColor: cardBg, borderColor }]}
          >
            <Text style={[st.fieldLabel, { color: mutedColor }]}>
              Etapa do workflow
            </Text>
            <Text style={[st.infoText, { color: textColor }]}>{stepName}</Text>
          </View>
        )}

        {/* ── Deadlines section ── */}
        {deadlines.length > 0 && (
          <View
            style={[st.fieldCard, { backgroundColor: cardBg, borderColor }]}
          >
            <Text style={[st.fieldLabel, { color: mutedColor }]}>
              Prazos do Processo
            </Text>
            {deadlines.map((dl) => {
              const dlStep = steps.find((s) => s.id === dl.step_id);
              const days = daysUntil(dl.due_date);
              const dlColor = dl.escalated
                ? "#ef4444"
                : days < 0
                  ? "#ef4444"
                  : days <= 3
                    ? "#f59e0b"
                    : "#22c55e";
              return (
                <View key={dl.id} style={[st.deadlineRow, { borderColor }]}>
                  <View
                    style={[st.deadlineDot, { backgroundColor: dlColor }]}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[st.deadlineLabel, { color: textColor }]}>
                      {dlStep?.name || "Prazo"}
                    </Text>
                    <Text style={[st.deadlineMeta, { color: mutedColor }]}>
                      Vence: {formatDate(dl.due_date)}
                      {dl.escalated ? " · Escalonado" : ""}
                      {days < 0
                        ? ` · Vencido`
                        : days === 0
                          ? " · Hoje"
                          : ` · ${days}d`}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Metadata ── */}
        <View style={[st.fieldCard, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[st.fieldLabel, { color: mutedColor }]}>
            Informações
          </Text>
          <Text style={[st.metaLine, { color: mutedColor }]}>
            Criado em: {formatDate(task.created_at)}
          </Text>
          {task.completed_at && (
            <Text style={[st.metaLine, { color: mutedColor }]}>
              Concluído em: {formatDate(task.completed_at)}
            </Text>
          )}
          <Text style={[st.metaLine, { color: mutedColor }]}>
            ID: {task.id.slice(0, 8)}...
          </Text>
        </View>

        {/* ═══════════════════════════════════════
         * ACTION BUTTONS (tools)
         * ═══════════════════════════════════════ */}
        <Text style={[st.sectionTitle, { color: textColor }]}>Ferramentas</Text>

        {/* Lançamento de Processo */}
        {soId && (
          <TouchableOpacity
            style={[st.toolBtn, { backgroundColor: tintColor }]}
            onPress={() =>
              router.push({
                pathname: "/Administrador/lancamentos-processos",
                params: {
                  taskId: task.id,
                  taskTitle: task.title,
                  serviceOrderId: soId,
                  lockProperty: "1",
                },
              } as any)
            }
          >
            <Ionicons name="create-outline" size={20} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={st.toolBtnTitle}>Lançar Atualização</Text>
              <Text style={st.toolBtnDesc}>
                Publicar atualização no processo com arquivos e solicitações
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#fff" />
          </TouchableOpacity>
        )}

        {/* Ver Processo */}
        {soId && (
          <TouchableOpacity
            style={[st.toolBtn, { backgroundColor: "#8b5cf6" }]}
            onPress={() =>
              router.push({
                pathname: "/Servicos/Processo",
                params: { serviceOrderId: soId },
              } as any)
            }
          >
            <Ionicons name="document-text-outline" size={20} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={st.toolBtnTitle}>Ver Processo</Text>
              <Text style={st.toolBtnDesc}>
                Atualizações, documentos, OCR, assinaturas e protocolos
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#fff" />
          </TouchableOpacity>
        )}

        {/* Prazos */}
        {deadlines.length > 0 && soId && (
          <TouchableOpacity
            style={[st.toolBtn, { backgroundColor: "#f59e0b" }]}
            onPress={() => {
              const pending = deadlines.filter((d) => d.status !== "completed");
              const overdue = pending.filter((d) => daysUntil(d.due_date) < 0);
              Alert.alert(
                "Resumo de Prazos",
                `${pending.length} prazo(s) pendente(s)\n${overdue.length} vencido(s)\n\nDetalhes completos no processo.`,
                [
                  { text: "OK" },
                  {
                    text: "Abrir Processo",
                    onPress: () =>
                      router.push({
                        pathname: "/Servicos/Processo",
                        params: { serviceOrderId: soId },
                      } as any),
                  },
                ],
              );
            }}
          >
            <Ionicons name="timer-outline" size={20} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={st.toolBtnTitle}>Prazos</Text>
              <Text style={st.toolBtnDesc}>
                {deadlines.length} prazo(s) ativo(s)
                {deadlines.some((d) => daysUntil(d.due_date) < 0)
                  ? " — atenção: há vencidos!"
                  : ""}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#fff" />
          </TouchableOpacity>
        )}

        {/* Delete task */}
        <TouchableOpacity
          style={[st.deleteBtn, { borderColor: "#ef4444" }]}
          onPress={() => {
            Alert.alert("Excluir tarefa", `Excluir "${task.title}"?`, [
              { text: "Cancelar", style: "cancel" },
              {
                text: "Excluir",
                style: "destructive",
                onPress: async () => {
                  try {
                    await api.post(CRUD_ENDPOINT, {
                      action: "delete",
                      table: "tasks",
                      payload: {
                        id: task.id,
                        deleted_at: new Date().toISOString(),
                      },
                    });
                    router.back();
                  } catch {
                    Alert.alert("Erro", "Falha ao excluir tarefa");
                  }
                },
              },
            ]);
          }}
        >
          <Ionicons name="trash-outline" size={18} color="#ef4444" />
          <Text style={{ color: "#ef4444", fontWeight: "600" }}>
            Excluir Tarefa
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

/* ══════════════════════════════════════════════════════
 * STYLES
 * ══════════════════════════════════════════════════════ */

const st = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { ...typography.body, marginTop: spacing.sm },

  header: { padding: spacing.lg, borderBottomWidth: 1 },
  headerTitle: { ...typography.title, marginBottom: spacing.xs },
  headerSubtitle: { ...typography.caption },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  backText: { ...typography.body, fontWeight: "600" },
  savingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.xs,
  },
  savingText: { ...typography.caption, fontWeight: "600" },

  fieldCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    ...typography.caption,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
  },
  multilineInput: {
    minHeight: 80,
    paddingTop: spacing.sm,
  },
  infoText: { ...typography.body },

  // Pills
  pillRow: { flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  pillText: { fontSize: 12, fontWeight: "700" },

  // Date
  dateRow: { flexDirection: "row", gap: spacing.md },

  // User picker
  pickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  pickerBtnText: { flex: 1, ...typography.body },
  pickerMeta: { ...typography.caption, marginTop: 4, marginLeft: 4 },
  userPickerList: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: 8,
    overflow: "hidden",
  },
  userSearchInput: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    ...typography.body,
  },
  userOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  userOptionText: { ...typography.body },
  userOptionMeta: { ...typography.caption, marginTop: 1 },

  // Deadlines
  deadlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  deadlineDot: { width: 8, height: 8, borderRadius: 4 },
  deadlineLabel: { ...typography.body, fontWeight: "600", fontSize: 13 },
  deadlineMeta: { ...typography.caption },

  // Metadata
  metaLine: { ...typography.caption, marginBottom: 2 },

  // Tools section
  sectionTitle: {
    ...typography.subtitle,
    fontWeight: "700",
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  toolBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    marginBottom: spacing.sm,
    ...(Platform.OS === "web"
      ? { boxShadow: "0px 2px 4px rgba(0,0,0,0.12)" }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3,
        }),
  },
  toolBtnTitle: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  toolBtnDesc: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 11,
    marginTop: 1,
  },

  // Delete
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 10,
    borderWidth: 1.5,
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
});
