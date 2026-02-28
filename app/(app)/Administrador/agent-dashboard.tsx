/**
 * UNIFIED AGENT DASHBOARD
 *
 * Consolidates 7 sub-screens into a single management view:
 * - Playbooks (+ nested Rules, Tables, Handoff Policies)
 * - States (+ nested Steps)
 * - Channel Bindings
 *
 * All CRUD inline via modals — no navigation to sub-screens.
 */

import { ThemedText } from "@/components/themed-text";
import { useAuth } from "@/core/auth/AuthContext";
import { filterActive } from "@/core/utils/soft-delete";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

/* ═══════════════════════════════════════════════════════
 * TYPES
 * ═══════════════════════════════════════════════════════ */

type Row = Record<string, unknown>;

type FieldType =
  | "text"
  | "multiline"
  | "number"
  | "url"
  | "boolean"
  | "select"
  | "json";

interface FormField {
  key: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  options?: { label: string; value: string }[];
  placeholder?: string;
}

type EntityType =
  | "playbook"
  | "rule"
  | "table"
  | "handoff"
  | "state"
  | "step"
  | "binding";

interface ModalState {
  open: boolean;
  mode: "create" | "edit";
  entityType: EntityType;
  data: Row;
  parentIds: Row;
}

/* ═══════════════════════════════════════════════════════
 * CONSTANTS & FIELD DEFINITIONS
 * ═══════════════════════════════════════════════════════ */

const CH_OPTS = [
  { label: "App Atendimento", value: "app_atendimento" },
  { label: "App Operador", value: "app_operador" },
  { label: "WhatsApp", value: "whatsapp" },
];

const TABLES: Record<EntityType, string> = {
  playbook: "agent_playbooks",
  rule: "agent_playbook_rules",
  table: "agent_playbook_tables",
  handoff: "agent_handoff_policies",
  state: "agent_states",
  step: "agent_state_steps",
  binding: "agent_channel_bindings",
};

const LABELS: Record<EntityType, string> = {
  playbook: "Playbook",
  rule: "Regra",
  table: "Tabela",
  handoff: "Handoff",
  state: "Estado",
  step: "Passo",
  binding: "Canal",
};

const FIELDS: Record<EntityType, FormField[]> = {
  playbook: [
    { key: "name", label: "Nome", required: true },
    {
      key: "channel",
      label: "Canal",
      type: "select",
      options: CH_OPTS,
      required: true,
    },
    { key: "description", label: "Descrição", type: "multiline" },
    {
      key: "behavior_source",
      label: "Origem Comportamento",
      type: "select",
      options: [
        { label: "System Prompt", value: "agent_system_prompt" },
        { label: "Playbook", value: "playbook" },
      ],
      required: true,
    },
    {
      key: "inherit_system_prompt",
      label: "Herda Prompt Base",
      type: "boolean",
    },
    {
      key: "state_machine_mode",
      label: "Modo",
      type: "select",
      options: [
        { label: "Guided", value: "guided" },
        { label: "Freeform", value: "freeform" },
      ],
    },
    { key: "webhook_url", label: "Webhook Bot", type: "url" },
    { key: "operator_webhook_url", label: "Webhook Operador", type: "url" },
    { key: "config_ui", label: "Config UI", type: "json" },
    { key: "is_active", label: "Ativo", type: "boolean" },
  ],
  rule: [
    { key: "title", label: "Título", required: true },
    { key: "rule_order", label: "Ordem", type: "number", required: true },
    {
      key: "rule_type",
      label: "Tipo",
      type: "select",
      options: [
        { label: "Policy", value: "policy" },
        { label: "Flow", value: "flow" },
        { label: "Safety", value: "safety" },
        { label: "Tooling", value: "tooling" },
      ],
      required: true,
    },
    {
      key: "instruction",
      label: "Instrução",
      type: "multiline",
      required: true,
    },
    {
      key: "severity",
      label: "Severidade",
      type: "select",
      options: [
        { label: "Info", value: "info" },
        { label: "Warning", value: "warning" },
        { label: "Critical", value: "critical" },
      ],
    },
    { key: "is_active", label: "Ativo", type: "boolean" },
    { key: "metadata", label: "Metadata", type: "json" },
  ],
  table: [
    { key: "table_name", label: "Nome da Tabela", required: true },
    {
      key: "access_mode",
      label: "Acesso",
      type: "select",
      options: [
        { label: "Leitura", value: "read" },
        { label: "Leitura/Escrita", value: "read_write" },
        { label: "Escrita", value: "write" },
      ],
      required: true,
    },
    { key: "purpose", label: "Finalidade", type: "multiline" },
    { key: "is_required", label: "Obrigatória", type: "boolean" },
    { key: "is_active", label: "Ativo", type: "boolean" },
    { key: "query_guardrails", label: "Guardrails", type: "json" },
  ],
  handoff: [
    {
      key: "from_channel",
      label: "De",
      type: "select",
      options: [
        { label: "Bot", value: "bot" },
        { label: "Operador", value: "operator" },
      ],
      required: true,
    },
    {
      key: "to_channel",
      label: "Para",
      type: "select",
      options: [
        { label: "Bot", value: "bot" },
        { label: "Operador", value: "operator" },
      ],
      required: true,
    },
    {
      key: "trigger_type",
      label: "Gatilho",
      type: "select",
      options: [
        { label: "Solicitação usuário", value: "user_request" },
        { label: "Regra do sistema", value: "system_rule" },
        { label: "Solicitação operador", value: "operator_request" },
      ],
      required: true,
    },
    { key: "trigger_config", label: "Config Gatilho", type: "json" },
    {
      key: "pause_bot_while_operator",
      label: "Pausar bot no operador",
      type: "boolean",
    },
    {
      key: "operator_can_return_to_bot",
      label: "Operador retorna ao bot",
      type: "boolean",
    },
    { key: "return_to_state_key", label: "State Key de retorno" },
    { key: "is_active", label: "Ativo", type: "boolean" },
  ],
  state: [
    { key: "state_key", label: "State Key", required: true },
    { key: "state_label", label: "Label", required: true },
    { key: "system_prompt", label: "System Prompt", type: "multiline" },
    { key: "rules", label: "Rules", type: "json" },
    { key: "tools", label: "Tools", type: "json" },
    { key: "is_initial", label: "Inicial", type: "boolean" },
    { key: "is_terminal", label: "Terminal", type: "boolean" },
  ],
  step: [
    { key: "step_key", label: "Step Key", required: true },
    { key: "step_label", label: "Label", required: true },
    { key: "step_order", label: "Ordem", type: "number", required: true },
    { key: "instruction", label: "Instrução", type: "multiline" },
    { key: "expected_inputs", label: "Inputs esperados", type: "json" },
    { key: "expected_outputs", label: "Outputs esperados", type: "json" },
    { key: "allowed_tables", label: "Tabelas permitidas", type: "json" },
    { key: "on_success_action", label: "Ação ao suceder" },
    { key: "on_failure_action", label: "Ação ao falhar" },
    {
      key: "handoff_to_operator",
      label: "Handoff p/ operador",
      type: "boolean",
    },
    { key: "return_to_bot_allowed", label: "Retorno ao bot", type: "boolean" },
    { key: "is_active", label: "Ativo", type: "boolean" },
  ],
  binding: [
    {
      key: "channel",
      label: "Canal",
      type: "select",
      options: CH_OPTS,
      required: true,
    },
    { key: "webhook_url", label: "Webhook URL", type: "url" },
    { key: "is_active", label: "Ativo", type: "boolean" },
    { key: "config", label: "Config", type: "json" },
  ],
};

/* ═══════════════════════════════════════════════════════
 * API HELPERS
 * ═══════════════════════════════════════════════════════ */

async function fetchRows(
  table: string,
  filters: { field: string; value: string; operator?: string }[],
): Promise<Row[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table,
    ...buildSearchParams(filters, { sortColumn: "created_at DESC" }),
  });
  return filterActive(normalizeCrudList<Row>(res.data));
}

async function createRow(table: string, payload: Row): Promise<Row> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table,
    payload,
  });
  const list = normalizeCrudList<Row>(res.data);
  return list[0] ?? payload;
}

async function patchRow(table: string, payload: Row): Promise<Row> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table,
    payload,
  });
  const list = normalizeCrudList<Row>(res.data);
  return list[0] ?? payload;
}

async function softDelete(table: string, id: string): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table,
    payload: { id, deleted_at: new Date().toISOString() },
  });
}

/* ═══════════════════════════════════════════════════════
 * UTILITY HELPERS
 * ═══════════════════════════════════════════════════════ */

const str = (v: unknown) => (v == null ? "" : String(v));
const isTruthy = (v: string) =>
  ["true", "1", "yes", "sim"].includes(v.trim().toLowerCase());

const EMPTY_MODAL: ModalState = {
  open: false,
  mode: "create",
  entityType: "playbook",
  data: {},
  parentIds: {},
};

function confirmAction(title: string, msg: string, onOk: () => void) {
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n${msg}`)) onOk();
  } else {
    Alert.alert(title, msg, [
      { text: "Cancelar", style: "cancel" },
      { text: "Confirmar", style: "destructive", onPress: onOk },
    ]);
  }
}

function showAlert(title: string, msg: string) {
  if (Platform.OS === "web") {
    window.alert(`${title}\n${msg}`);
  } else {
    Alert.alert(title, msg);
  }
}

/* ═══════════════════════════════════════════════════════
 * MAIN COMPONENT
 * ═══════════════════════════════════════════════════════ */

export default function AgentDashboard() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    agentId?: string;
    tenantId?: string;
  }>();
  const agentId = Array.isArray(params.agentId)
    ? params.agentId[0]
    : params.agentId;
  const tenantId =
    (Array.isArray(params.tenantId) ? params.tenantId[0] : params.tenantId) ||
    user?.tenant_id;

  /* ── Theme ── */
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const cardColor = useThemeColor({}, "card");
  const tintColor = useThemeColor({}, "tint");
  const bgColor = useThemeColor({}, "background");
  const inputBg = useThemeColor({}, "input");

  /* ── Data State ── */
  const [agent, setAgent] = useState<Row | null>(null);
  const [playbooks, setPlaybooks] = useState<Row[]>([]);
  const [rules, setRules] = useState<Row[]>([]);
  const [tables, setTables] = useState<Row[]>([]);
  const [handoff, setHandoff] = useState<Row[]>([]);
  const [states, setStates] = useState<Row[]>([]);
  const [steps, setSteps] = useState<Row[]>([]);
  const [bindings, setBindings] = useState<Row[]>([]);

  /* ── UI State ── */
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalState>(EMPTY_MODAL);
  const [formState, setFormState] = useState<Record<string, string>>({});
  const [promptModal, setPromptModal] = useState(false);
  const [promptText, setPromptText] = useState("");

  /* ── Grouped Data ── */
  const rulesByPb = useMemo(() => {
    const m = new Map<string, Row[]>();
    rules.forEach((r) => {
      const k = str(r.playbook_id);
      m.set(k, [...(m.get(k) ?? []), r]);
    });
    return m;
  }, [rules]);

  const tablesByPb = useMemo(() => {
    const m = new Map<string, Row[]>();
    tables.forEach((t) => {
      const k = str(t.playbook_id);
      m.set(k, [...(m.get(k) ?? []), t]);
    });
    return m;
  }, [tables]);

  const handoffByPb = useMemo(() => {
    const m = new Map<string, Row[]>();
    handoff.forEach((h) => {
      const k = str(h.playbook_id);
      m.set(k, [...(m.get(k) ?? []), h]);
    });
    return m;
  }, [handoff]);

  const stepsByState = useMemo(() => {
    const m = new Map<string, Row[]>();
    steps.forEach((s) => {
      const k = str(s.state_id);
      m.set(k, [...(m.get(k) ?? []), s]);
    });
    return m;
  }, [steps]);

  /* ── Data Loading ── */
  const loadAll = useCallback(async () => {
    if (!agentId) return;
    try {
      setError(null);

      // Batch 1: agent + playbooks + states + bindings (all by agent_id)
      const [agentRes, pbRes, stRes, bnRes] = await Promise.all([
        fetchRows("agents", [{ field: "id", value: agentId }]),
        fetchRows("agent_playbooks", [{ field: "agent_id", value: agentId }]),
        fetchRows("agent_states", [{ field: "agent_id", value: agentId }]),
        fetchRows("agent_channel_bindings", [
          { field: "agent_id", value: agentId },
        ]),
      ]);

      const agentRow = agentRes[0] ?? null;
      setAgent(agentRow);
      setPlaybooks(pbRes);
      setStates(stRes);
      setBindings(bnRes);

      // Batch 2: children that depend on playbook/state IDs
      const pbIds = pbRes.map((p) => str(p.id)).filter(Boolean);
      const stIds = stRes.map((s) => str(s.id)).filter(Boolean);

      const promises: Promise<Row[]>[] = [];

      // Rules by playbook_id IN
      if (pbIds.length > 0) {
        promises.push(
          fetchRows("agent_playbook_rules", [
            { field: "playbook_id", value: pbIds.join(","), operator: "in" },
          ]),
        );
      } else {
        promises.push(Promise.resolve([]));
      }

      // Tables by playbook_id IN
      if (pbIds.length > 0) {
        promises.push(
          fetchRows("agent_playbook_tables", [
            { field: "playbook_id", value: pbIds.join(","), operator: "in" },
          ]),
        );
      } else {
        promises.push(Promise.resolve([]));
      }

      // Handoff by agent_id
      promises.push(
        fetchRows("agent_handoff_policies", [
          { field: "agent_id", value: agentId },
        ]),
      );

      // Steps by state_id IN
      if (stIds.length > 0) {
        promises.push(
          fetchRows("agent_state_steps", [
            { field: "state_id", value: stIds.join(","), operator: "in" },
          ]),
        );
      } else {
        promises.push(Promise.resolve([]));
      }

      const [rulesRes, tablesRes, handoffRes, stepsRes] =
        await Promise.all(promises);

      setRules(rulesRes);
      setTables(tablesRes);
      setHandoff(handoffRes);
      setSteps(stepsRes);
    } catch (err) {
      setError("Falha ao carregar dados do agente");
      console.error("AgentDashboard loadAll:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [agentId]);

  useEffect(() => {
    setLoading(true);
    loadAll();
  }, [loadAll]);

  /* ── Toggle Section ── */
  const toggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  /* ── CRUD Operations ── */
  const openCreate = useCallback(
    (entityType: EntityType, parentIds: Row = {}) => {
      const defaults: Record<string, string> = {};
      FIELDS[entityType].forEach((f) => {
        defaults[f.key] = "";
      });
      setFormState(defaults);
      setModal({
        open: true,
        mode: "create",
        entityType,
        data: {},
        parentIds,
      });
    },
    [],
  );

  const openEdit = useCallback((entityType: EntityType, row: Row) => {
    const values: Record<string, string> = {};
    FIELDS[entityType].forEach((f) => {
      const v = row[f.key];
      if (f.type === "json" && v != null && typeof v === "object") {
        values[f.key] = JSON.stringify(v, null, 2);
      } else if (f.type === "boolean") {
        values[f.key] = v ? "true" : "false";
      } else {
        values[f.key] = str(v);
      }
    });
    setFormState(values);
    setModal({
      open: true,
      mode: "edit",
      entityType,
      data: row,
      parentIds: {},
    });
  }, []);

  const handleSave = useCallback(async () => {
    const { entityType, mode, data, parentIds } = modal;
    const fields = FIELDS[entityType];
    const table = TABLES[entityType];

    // Validation
    for (const f of fields) {
      if (f.required && !formState[f.key]?.trim()) {
        showAlert("Campo obrigatório", `Preencha "${f.label}".`);
        return;
      }
    }

    // Build payload
    const payload: Row = {};
    for (const f of fields) {
      const raw = formState[f.key] ?? "";
      if (f.type === "boolean") {
        payload[f.key] = isTruthy(raw);
      } else if (f.type === "number") {
        payload[f.key] = raw ? parseFloat(raw.replace(",", ".")) : 0;
      } else if (f.type === "json") {
        if (!raw.trim()) {
          payload[f.key] = null;
        } else {
          try {
            JSON.parse(raw);
            payload[f.key] = raw.trim();
          } catch {
            showAlert("JSON inválido", `Campo "${f.label}" tem JSON inválido.`);
            return;
          }
        }
      } else {
        payload[f.key] = raw.trim() || null;
      }
    }

    // Inject system fields
    if (mode === "create") {
      payload.tenant_id = tenantId;
      payload.agent_id = agentId;
      // Entity-specific parent IDs
      if (parentIds.playbook_id) payload.playbook_id = parentIds.playbook_id;
      if (parentIds.state_id) payload.state_id = parentIds.state_id;
    }

    try {
      setSaving(true);
      if (mode === "create") {
        await createRow(table, payload);
      } else {
        payload.id = str(data.id);
        await patchRow(table, payload);
      }
      setModal(EMPTY_MODAL);
      await loadAll();
    } catch (err) {
      showAlert("Erro ao salvar", String((err as Error)?.message ?? err));
    } finally {
      setSaving(false);
    }
  }, [modal, formState, tenantId, agentId, loadAll]);

  const handleDelete = useCallback(
    (entityType: EntityType, row: Row) => {
      confirmAction(
        `Excluir ${LABELS[entityType]}`,
        `Deseja excluir "${str(row.name || row.title || row.state_label || row.step_label || row.channel || row.table_name || row.id)}"?`,
        async () => {
          try {
            setSaving(true);
            await softDelete(TABLES[entityType], str(row.id));
            await loadAll();
          } catch (err) {
            showAlert("Erro", String((err as Error)?.message ?? err));
          } finally {
            setSaving(false);
          }
        },
      );
    },
    [loadAll],
  );

  /* ── Prompt Editor ── */
  const openPrompt = useCallback(() => {
    setPromptText(str(agent?.system_prompt));
    setPromptModal(true);
  }, [agent]);

  const savePrompt = useCallback(async () => {
    if (!agent?.id) return;
    try {
      setSaving(true);
      await patchRow("agents", {
        id: str(agent.id),
        system_prompt: promptText,
      });
      setPromptModal(false);
      await loadAll();
    } catch (err) {
      showAlert("Erro", String((err as Error)?.message ?? err));
    } finally {
      setSaving(false);
    }
  }, [agent, promptText, loadAll]);

  /* ── Reusable UI Components ── */

  /** Section Header with collapse + add button */
  const SectionHeader = useCallback(
    ({
      icon,
      title,
      count,
      color,
      sectionKey,
      onAdd,
    }: {
      icon: string;
      title: string;
      count: number;
      color: string;
      sectionKey: string;
      onAdd: () => void;
    }) => {
      const isOpen = expanded.has(sectionKey);
      return (
        <TouchableOpacity
          onPress={() => toggle(sectionKey)}
          activeOpacity={0.7}
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: color + "14",
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 10,
            marginBottom: isOpen ? 8 : 0,
          }}
        >
          <Ionicons name={icon as any} size={18} color={color} />
          <ThemedText
            style={{
              color,
              fontWeight: "700",
              fontSize: 14,
              marginLeft: 8,
              flex: 1,
            }}
          >
            {title}
          </ThemedText>
          <View
            style={{
              backgroundColor: color + "22",
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 10,
              marginRight: 8,
            }}
          >
            <ThemedText style={{ color, fontSize: 11, fontWeight: "700" }}>
              {count}
            </ThemedText>
          </View>
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation?.();
              onAdd();
            }}
            hitSlop={8}
            style={{
              backgroundColor: color,
              width: 24,
              height: 24,
              borderRadius: 12,
              justifyContent: "center",
              alignItems: "center",
              marginRight: 8,
            }}
          >
            <Ionicons name="add" size={16} color="#fff" />
          </TouchableOpacity>
          <Ionicons
            name={isOpen ? "chevron-up" : "chevron-down"}
            size={16}
            color={mutedColor}
          />
        </TouchableOpacity>
      );
    },
    [expanded, toggle, mutedColor],
  );

  /** Inline item row with edit/delete */
  const ItemRow = useCallback(
    ({
      label,
      sublabel,
      entityType,
      row,
      isActive,
    }: {
      label: string;
      sublabel?: string;
      entityType: EntityType;
      row: Row;
      isActive?: boolean;
    }) => (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderBottomWidth: 1,
          borderBottomColor: borderColor + "40",
        }}
      >
        {isActive !== undefined && (
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: isActive ? "#22c55e" : "#94a3b8",
              marginRight: 8,
            }}
          />
        )}
        <View style={{ flex: 1 }}>
          <ThemedText
            style={{ color: textColor, fontSize: 13, fontWeight: "600" }}
            numberOfLines={1}
          >
            {label}
          </ThemedText>
          {sublabel ? (
            <ThemedText
              style={{ color: mutedColor, fontSize: 11, marginTop: 1 }}
              numberOfLines={1}
            >
              {sublabel}
            </ThemedText>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={() => openEdit(entityType, row)}
          hitSlop={6}
          style={{ padding: 4 }}
        >
          <Ionicons name="pencil-outline" size={16} color={tintColor} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => handleDelete(entityType, row)}
          hitSlop={6}
          style={{ padding: 4, marginLeft: 4 }}
        >
          <Ionicons name="trash-outline" size={16} color="#ef4444" />
        </TouchableOpacity>
      </View>
    ),
    [borderColor, textColor, mutedColor, tintColor, openEdit, handleDelete],
  );

  /** Sub-section header (nested) */
  const SubHeader = useCallback(
    ({
      icon,
      title,
      count,
      sectionKey,
      onAdd,
    }: {
      icon: string;
      title: string;
      count: number;
      sectionKey: string;
      onAdd: () => void;
    }) => {
      const isOpen = expanded.has(sectionKey);
      return (
        <TouchableOpacity
          onPress={() => toggle(sectionKey)}
          activeOpacity={0.7}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 12,
            paddingVertical: 6,
            marginTop: 2,
          }}
        >
          <Ionicons
            name={icon as any}
            size={14}
            color={mutedColor}
            style={{ marginRight: 6 }}
          />
          <ThemedText
            style={{
              color: textColor,
              fontSize: 12,
              fontWeight: "600",
              flex: 1,
            }}
          >
            {title} ({count})
          </ThemedText>
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation?.();
              onAdd();
            }}
            hitSlop={8}
            style={{ padding: 2, marginRight: 4 }}
          >
            <Ionicons name="add-circle-outline" size={16} color={tintColor} />
          </TouchableOpacity>
          <Ionicons
            name={isOpen ? "chevron-up" : "chevron-down"}
            size={14}
            color={mutedColor}
          />
        </TouchableOpacity>
      );
    },
    [expanded, toggle, mutedColor, textColor, tintColor],
  );

  /* ═══════════════════════════════════════════════════════
   * RENDER
   * ═══════════════════════════════════════════════════════ */

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: bgColor,
        }}
      >
        <ActivityIndicator size="large" color={tintColor} />
        <ThemedText style={{ color: mutedColor, marginTop: 12 }}>
          Carregando agente...
        </ThemedText>
      </View>
    );
  }

  if (!agent) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: bgColor,
          padding: 24,
        }}
      >
        <Ionicons name="alert-circle-outline" size={48} color={mutedColor} />
        <ThemedText
          style={{ color: mutedColor, marginTop: 12, textAlign: "center" }}
        >
          {error || "Agente não encontrado."}
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: bgColor }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadAll();
            }}
          />
        }
      >
        {/* ══════ AGENT HEADER ══════ */}
        <View
          style={{
            backgroundColor: cardColor,
            borderRadius: 14,
            borderWidth: 1,
            borderColor,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <Ionicons
              name="hardware-chip-outline"
              size={22}
              color={tintColor}
            />
            <ThemedText
              style={{
                color: textColor,
                fontSize: 18,
                fontWeight: "700",
                marginLeft: 8,
                flex: 1,
              }}
            >
              {str(agent.name) || str(agent.id).slice(0, 8)}
            </ThemedText>
            <View
              style={{
                backgroundColor: agent.is_active ? "#22c55e20" : "#ef444420",
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 8,
              }}
            >
              <ThemedText
                style={{
                  color: agent.is_active ? "#22c55e" : "#ef4444",
                  fontSize: 11,
                  fontWeight: "700",
                }}
              >
                {agent.is_active ? "Ativo" : "Inativo"}
              </ThemedText>
            </View>
          </View>

          {/* Stats badges */}
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 12,
            }}
          >
            {[
              {
                label: "Model",
                value: str(agent.model) || "—",
                icon: "cube-outline",
              },
              {
                label: "Playbooks",
                value: String(playbooks.length),
                icon: "book-outline",
              },
              {
                label: "States",
                value: String(states.length),
                icon: "toggle-outline",
              },
              {
                label: "Canais",
                value: String(bindings.length),
                icon: "link-outline",
              },
            ].map((b) => (
              <View
                key={b.label}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: tintColor + "10",
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 8,
                  gap: 4,
                }}
              >
                <Ionicons name={b.icon as any} size={12} color={tintColor} />
                <ThemedText style={{ color: mutedColor, fontSize: 11 }}>
                  {b.label}:
                </ThemedText>
                <ThemedText
                  style={{ color: textColor, fontSize: 11, fontWeight: "700" }}
                >
                  {b.value}
                </ThemedText>
              </View>
            ))}
          </View>

          {/* System Prompt */}
          <View
            style={{
              backgroundColor: bgColor,
              borderRadius: 8,
              padding: 10,
              borderWidth: 1,
              borderColor: borderColor + "60",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <ThemedText style={{ color: mutedColor, fontSize: 11, flex: 1 }}>
                System Prompt
              </ThemedText>
              <TouchableOpacity
                onPress={() =>
                  Clipboard.setStringAsync(str(agent.system_prompt))
                }
                hitSlop={6}
                style={{ padding: 2, marginRight: 6 }}
              >
                <Ionicons name="copy-outline" size={14} color={mutedColor} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={openPrompt}
                hitSlop={6}
                style={{ padding: 2 }}
              >
                <Ionicons name="pencil-outline" size={14} color={tintColor} />
              </TouchableOpacity>
            </View>
            <ThemedText
              style={{ color: textColor, fontSize: 12, lineHeight: 18 }}
              numberOfLines={4}
            >
              {str(agent.system_prompt) || "(vazio)"}
            </ThemedText>
          </View>
        </View>

        {error && (
          <View
            style={{
              backgroundColor: "#fee2e2",
              borderRadius: 10,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <ThemedText style={{ color: "#dc2626", fontSize: 13 }}>
              {error}
            </ThemedText>
          </View>
        )}

        {/* ══════ PLAYBOOKS SECTION ══════ */}
        <View style={{ marginBottom: 14 }}>
          <SectionHeader
            icon="book-outline"
            title="Playbooks"
            count={playbooks.length}
            color="#16a34a"
            sectionKey="playbooks"
            onAdd={() => openCreate("playbook")}
          />
          {expanded.has("playbooks") && (
            <View
              style={{
                backgroundColor: cardColor,
                borderRadius: 10,
                borderWidth: 1,
                borderColor,
                overflow: "hidden",
              }}
            >
              {playbooks.length === 0 ? (
                <ThemedText
                  style={{
                    color: mutedColor,
                    fontSize: 12,
                    padding: 14,
                    fontStyle: "italic",
                  }}
                >
                  Nenhum playbook configurado.
                </ThemedText>
              ) : (
                playbooks.map((pb) => {
                  const pbId = str(pb.id);
                  const pbRules = rulesByPb.get(pbId) ?? [];
                  const pbTables = tablesByPb.get(pbId) ?? [];
                  const pbHandoff = handoffByPb.get(pbId) ?? [];

                  return (
                    <View
                      key={pbId}
                      style={{
                        borderBottomWidth: 1,
                        borderBottomColor: borderColor + "30",
                      }}
                    >
                      {/* Playbook row */}
                      <ItemRow
                        label={str(pb.name) || "Sem nome"}
                        sublabel={`${str(pb.channel)} · ${str(pb.behavior_source)}`}
                        entityType="playbook"
                        row={pb}
                        isActive={!!pb.is_active}
                      />

                      {/* Nested: Rules */}
                      <View style={{ paddingLeft: 16 }}>
                        <SubHeader
                          icon="list-circle-outline"
                          title="Regras"
                          count={pbRules.length}
                          sectionKey={`rules-${pbId}`}
                          onAdd={() =>
                            openCreate("rule", { playbook_id: pbId })
                          }
                        />
                        {expanded.has(`rules-${pbId}`) &&
                          pbRules.map((r) => (
                            <ItemRow
                              key={str(r.id)}
                              label={`#${str(r.rule_order)} ${str(r.title)}`}
                              sublabel={`${str(r.rule_type)} · ${str(r.severity)}`}
                              entityType="rule"
                              row={r}
                              isActive={!!r.is_active}
                            />
                          ))}
                      </View>

                      {/* Nested: Tables */}
                      <View style={{ paddingLeft: 16 }}>
                        <SubHeader
                          icon="server-outline"
                          title="Tabelas"
                          count={pbTables.length}
                          sectionKey={`tables-${pbId}`}
                          onAdd={() =>
                            openCreate("table", { playbook_id: pbId })
                          }
                        />
                        {expanded.has(`tables-${pbId}`) &&
                          pbTables.map((t) => (
                            <ItemRow
                              key={str(t.id)}
                              label={str(t.table_name)}
                              sublabel={`${str(t.access_mode)} · ${t.is_required ? "Obrigatória" : "Opcional"}`}
                              entityType="table"
                              row={t}
                              isActive={!!t.is_active}
                            />
                          ))}
                      </View>

                      {/* Nested: Handoff */}
                      <View style={{ paddingLeft: 16 }}>
                        <SubHeader
                          icon="swap-horizontal-outline"
                          title="Handoff"
                          count={pbHandoff.length}
                          sectionKey={`handoff-${pbId}`}
                          onAdd={() =>
                            openCreate("handoff", { playbook_id: pbId })
                          }
                        />
                        {expanded.has(`handoff-${pbId}`) &&
                          pbHandoff.map((h) => (
                            <ItemRow
                              key={str(h.id)}
                              label={`${str(h.from_channel)} → ${str(h.to_channel)}`}
                              sublabel={str(h.trigger_type)}
                              entityType="handoff"
                              row={h}
                              isActive={!!h.is_active}
                            />
                          ))}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}
        </View>

        {/* ══════ STATES SECTION ══════ */}
        <View style={{ marginBottom: 14 }}>
          <SectionHeader
            icon="toggle-outline"
            title="Estados"
            count={states.length}
            color="#6366f1"
            sectionKey="states"
            onAdd={() => openCreate("state")}
          />
          {expanded.has("states") && (
            <View
              style={{
                backgroundColor: cardColor,
                borderRadius: 10,
                borderWidth: 1,
                borderColor,
                overflow: "hidden",
              }}
            >
              {states.length === 0 ? (
                <ThemedText
                  style={{
                    color: mutedColor,
                    fontSize: 12,
                    padding: 14,
                    fontStyle: "italic",
                  }}
                >
                  Nenhum estado configurado.
                </ThemedText>
              ) : (
                states.map((st) => {
                  const stId = str(st.id);
                  const stSteps = stepsByState.get(stId) ?? [];
                  const badges: string[] = [];
                  if (st.is_initial) badges.push("Inicial");
                  if (st.is_terminal) badges.push("Terminal");

                  return (
                    <View
                      key={stId}
                      style={{
                        borderBottomWidth: 1,
                        borderBottomColor: borderColor + "30",
                      }}
                    >
                      <ItemRow
                        label={str(st.state_label) || str(st.state_key)}
                        sublabel={`${str(st.state_key)}${badges.length ? " · " + badges.join(", ") : ""}`}
                        entityType="state"
                        row={st}
                      />

                      {/* Nested steps */}
                      <View style={{ paddingLeft: 16 }}>
                        <SubHeader
                          icon="footsteps-outline"
                          title="Passos"
                          count={stSteps.length}
                          sectionKey={`steps-${stId}`}
                          onAdd={() => openCreate("step", { state_id: stId })}
                        />
                        {expanded.has(`steps-${stId}`) &&
                          stSteps
                            .sort(
                              (a, b) =>
                                Number(a.step_order ?? 0) -
                                Number(b.step_order ?? 0),
                            )
                            .map((sp) => (
                              <ItemRow
                                key={str(sp.id)}
                                label={`#${str(sp.step_order)} ${str(sp.step_label)}`}
                                sublabel={str(sp.step_key)}
                                entityType="step"
                                row={sp}
                                isActive={!!sp.is_active}
                              />
                            ))}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}
        </View>

        {/* ══════ CHANNELS SECTION ══════ */}
        <View style={{ marginBottom: 14 }}>
          <SectionHeader
            icon="link-outline"
            title="Canais (Bindings)"
            count={bindings.length}
            color="#0891b2"
            sectionKey="channels"
            onAdd={() => openCreate("binding")}
          />
          {expanded.has("channels") && (
            <View
              style={{
                backgroundColor: cardColor,
                borderRadius: 10,
                borderWidth: 1,
                borderColor,
                overflow: "hidden",
              }}
            >
              {bindings.length === 0 ? (
                <ThemedText
                  style={{
                    color: mutedColor,
                    fontSize: 12,
                    padding: 14,
                    fontStyle: "italic",
                  }}
                >
                  Nenhum canal configurado.
                </ThemedText>
              ) : (
                bindings.map((bn) => (
                  <ItemRow
                    key={str(bn.id)}
                    label={str(bn.channel)}
                    sublabel={str(bn.webhook_url) || "Sem webhook"}
                    entityType="binding"
                    row={bn}
                    isActive={!!bn.is_active}
                  />
                ))
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* ══════ ENTITY MODAL ══════ */}
      <Modal
        visible={modal.open}
        transparent
        animationType="slide"
        onRequestClose={() => setModal(EMPTY_MODAL)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
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
                  marginBottom: 14,
                }}
              >
                <ThemedText
                  style={{ color: textColor, fontSize: 18, fontWeight: "700" }}
                >
                  {modal.mode === "create" ? "Criar" : "Editar"}{" "}
                  {LABELS[modal.entityType]}
                </ThemedText>
                <TouchableOpacity
                  onPress={() => setModal(EMPTY_MODAL)}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    backgroundColor: borderColor + "60",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <ThemedText style={{ color: mutedColor, fontSize: 14 }}>
                    ✕
                  </ThemedText>
                </TouchableOpacity>
              </View>

              {/* Form Fields */}
              <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
                {FIELDS[modal.entityType].map((f) => {
                  const val = formState[f.key] ?? "";

                  return (
                    <View key={f.key} style={{ marginBottom: 12 }}>
                      <ThemedText
                        style={{
                          color: mutedColor,
                          fontSize: 12,
                          marginBottom: 4,
                        }}
                      >
                        {f.label}
                        {f.required ? " *" : ""}
                      </ThemedText>

                      {f.type === "boolean" ? (
                        <View style={{ flexDirection: "row", gap: 8 }}>
                          {["true", "false"].map((opt) => (
                            <TouchableOpacity
                              key={opt}
                              onPress={() =>
                                setFormState((p) => ({ ...p, [f.key]: opt }))
                              }
                              style={{
                                paddingHorizontal: 14,
                                paddingVertical: 8,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor,
                                backgroundColor:
                                  val === opt ? tintColor + "1A" : inputBg,
                              }}
                            >
                              <ThemedText
                                style={{ color: textColor, fontSize: 13 }}
                              >
                                {opt === "true" ? "Sim" : "Não"}
                              </ThemedText>
                            </TouchableOpacity>
                          ))}
                        </View>
                      ) : f.type === "select" && f.options ? (
                        <View
                          style={{
                            flexDirection: "row",
                            flexWrap: "wrap",
                            gap: 6,
                          }}
                        >
                          {f.options.map((opt) => (
                            <TouchableOpacity
                              key={opt.value}
                              onPress={() =>
                                setFormState((p) => ({
                                  ...p,
                                  [f.key]: opt.value,
                                }))
                              }
                              style={{
                                paddingHorizontal: 12,
                                paddingVertical: 6,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor,
                                backgroundColor:
                                  val === opt.value
                                    ? tintColor + "1A"
                                    : inputBg,
                              }}
                            >
                              <ThemedText
                                style={{ color: textColor, fontSize: 12 }}
                              >
                                {opt.label}
                              </ThemedText>
                            </TouchableOpacity>
                          ))}
                        </View>
                      ) : (
                        <TextInput
                          value={val}
                          onChangeText={(t) =>
                            setFormState((p) => ({ ...p, [f.key]: t }))
                          }
                          placeholder={f.placeholder ?? f.label}
                          placeholderTextColor={mutedColor}
                          multiline={
                            f.type === "multiline" || f.type === "json"
                          }
                          keyboardType={
                            f.type === "number"
                              ? "decimal-pad"
                              : f.type === "url"
                                ? "url"
                                : "default"
                          }
                          autoCapitalize={f.type === "url" ? "none" : undefined}
                          style={{
                            borderWidth: 1,
                            borderColor,
                            borderRadius: 8,
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                            backgroundColor: inputBg,
                            color: textColor,
                            fontSize: 13,
                            minHeight:
                              f.type === "multiline"
                                ? 80
                                : f.type === "json"
                                  ? 100
                                  : undefined,
                            textAlignVertical:
                              f.type === "multiline" || f.type === "json"
                                ? "top"
                                : "auto",
                            fontFamily:
                              f.type === "json"
                                ? Platform.OS === "ios"
                                  ? "Menlo"
                                  : "monospace"
                                : undefined,
                          }}
                        />
                      )}
                    </View>
                  );
                })}
              </ScrollView>

              {/* Actions */}
              <View
                style={{
                  flexDirection: "row",
                  gap: 8,
                  marginTop: 8,
                  justifyContent: "flex-end",
                }}
              >
                <TouchableOpacity
                  onPress={() => setModal(EMPTY_MODAL)}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor,
                  }}
                >
                  <ThemedText style={{ color: textColor, fontWeight: "600" }}>
                    Cancelar
                  </ThemedText>
                </TouchableOpacity>
                {modal.mode === "edit" && (
                  <TouchableOpacity
                    onPress={() => {
                      setModal(EMPTY_MODAL);
                      handleDelete(modal.entityType, modal.data);
                    }}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      borderRadius: 8,
                      backgroundColor: "#ef4444",
                    }}
                  >
                    <ThemedText style={{ color: "#fff", fontWeight: "700" }}>
                      Excluir
                    </ThemedText>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={handleSave}
                  disabled={saving}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                    backgroundColor: saving ? mutedColor : tintColor,
                  }}
                >
                  <ThemedText style={{ color: "#fff", fontWeight: "700" }}>
                    {saving ? "Salvando..." : "Salvar"}
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ══════ PROMPT MODAL ══════ */}
      <Modal
        visible={promptModal}
        transparent
        animationType="slide"
        onRequestClose={() => setPromptModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
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
                maxHeight: "85%",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <ThemedText
                  style={{ color: textColor, fontSize: 18, fontWeight: "700" }}
                >
                  System Prompt
                </ThemedText>
                <TouchableOpacity
                  onPress={() => setPromptModal(false)}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    backgroundColor: borderColor + "60",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <ThemedText style={{ color: mutedColor, fontSize: 14 }}>
                    ✕
                  </ThemedText>
                </TouchableOpacity>
              </View>

              <TextInput
                value={promptText}
                onChangeText={setPromptText}
                multiline
                placeholder="System prompt do agente..."
                placeholderTextColor={mutedColor}
                style={{
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  backgroundColor: inputBg,
                  color: textColor,
                  fontSize: 13,
                  minHeight: 200,
                  textAlignVertical: "top",
                  lineHeight: 20,
                }}
              />

              <View
                style={{
                  flexDirection: "row",
                  gap: 8,
                  marginTop: 12,
                  justifyContent: "flex-end",
                }}
              >
                <TouchableOpacity
                  onPress={() => setPromptModal(false)}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor,
                  }}
                >
                  <ThemedText style={{ color: textColor, fontWeight: "600" }}>
                    Cancelar
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={savePrompt}
                  disabled={saving}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                    backgroundColor: saving ? mutedColor : tintColor,
                  }}
                >
                  <ThemedText style={{ color: "#fff", fontWeight: "700" }}>
                    {saving ? "Salvando..." : "Salvar"}
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ══════ SAVING OVERLAY ══════ */}
      {saving && (
        <View
          style={{
            ...({
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.25)",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 9999,
            } as any),
          }}
        >
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}
    </View>
  );
}
