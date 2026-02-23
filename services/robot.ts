import { api } from "@/services/api";
import {
    CRUD_ENDPOINT,
    buildSearchParams,
    normalizeCrudList,
} from "@/services/crud";

const DEFAULT_N8N_WEBHOOK_URL =
  "https://n8n.sosescritura.com.br/webhook/robo_radul";

type CrudRow = Record<string, unknown>;

type RobotGovernanceRuntime = {
  channel: string;
  webhook_url: string;
  playbook: {
    id: string;
    name: string;
    behavior_source: string;
    state_machine_mode: string;
    inherit_system_prompt: boolean;
  } | null;
  rules: Array<{
    order: number;
    type: string;
    title: string;
    instruction: string;
    severity: string;
  }>;
  tables: Array<{
    table_name: string;
    access_mode: string;
    is_required: boolean;
    purpose: string;
  }>;
  handoff: {
    pause_bot_while_operator: boolean;
    operator_can_return_to_bot: boolean;
    return_to_state_key: string;
    trigger_type: string;
  } | null;
  state_steps: Array<{
    state_id: string;
    step_key: string;
    step_label: string;
    step_order: number;
    instruction: string;
    handoff_to_operator: boolean;
    return_to_bot_allowed: boolean;
  }>;
  instructions_compact: string;
};

export type RobotWebhookPayload = {
  message: string;
  sessionId: string;
  user_id: string;
  channel: string;
  channel_identifier: string;
  tenant_id?: string;
  current_state_key?: string;
  session_id?: string;
  telefone_wa?: string;
  whatsapp_number?: string;
  phone?: string;
};

type RobotWebhookRuntimePayload = RobotWebhookPayload & {
  governance?: RobotGovernanceRuntime | null;
};

const normalizePhoneDigits = (value: unknown): string =>
  String(value ?? "")
    .replace(/\D+/g, "")
    .trim();

const withWhatsappMemoryKeys = (
  payload: RobotWebhookRuntimePayload,
): RobotWebhookRuntimePayload => {
  const basePhone =
    normalizePhoneDigits(payload.telefone_wa) ||
    normalizePhoneDigits(payload.whatsapp_number) ||
    normalizePhoneDigits(payload.phone) ||
    normalizePhoneDigits(payload.channel_identifier) ||
    normalizePhoneDigits(payload.session_id) ||
    normalizePhoneDigits(payload.sessionId);

  if (!basePhone) {
    throw new Error("Telefone do cliente é obrigatório para memória do chat");
  }

  return {
    ...payload,
    sessionId: basePhone,
    session_id: basePhone,
    telefone_wa: basePhone,
    whatsapp_number: basePhone,
    phone: basePhone,
    channel_identifier: basePhone,
  };
};

const asBoolean = (value: unknown): boolean => {
  const parsed = String(value ?? "")
    .trim()
    .toLowerCase();
  return parsed === "true" || parsed === "1" || parsed === "yes";
};

const asNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeChannel = (channel: string): string => {
  const parsed = String(channel || "")
    .trim()
    .toLowerCase();
  if (!parsed || parsed === "app") return "app_atendimento";
  if (parsed === "operator" || parsed === "app_operador") {
    return "app_operador";
  }
  return parsed;
};

const loadList = async (
  table: string,
  filters: Array<{ field: string; value: string; operator?: string }> = [],
  sortColumn?: string,
): Promise<CrudRow[]> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table,
    ...buildSearchParams(filters, { sortColumn }),
  });
  return normalizeCrudList<CrudRow>(response.data).filter(
    (item) => !item.deleted_at,
  );
};

const loadGovernanceRuntime = async (
  tenantId: string | undefined,
  channel: string,
  currentStateKey?: string,
): Promise<RobotGovernanceRuntime | null> => {
  if (!tenantId) return null;

  const normalizedChannel = normalizeChannel(channel);

  const playbooks = await loadList(
    "agent_playbooks",
    [
      { field: "tenant_id", value: tenantId },
      { field: "channel", value: normalizedChannel },
      { field: "is_active", value: "true", operator: "equal" },
    ],
    "updated_at DESC",
  );

  const playbook = playbooks[0];
  if (!playbook?.id) {
    return {
      channel: normalizedChannel,
      webhook_url: DEFAULT_N8N_WEBHOOK_URL,
      playbook: null,
      rules: [],
      tables: [],
      handoff: null,
      state_steps: [],
      instructions_compact: "",
    };
  }

  const playbookId = String(playbook.id);
  const agentId = String(playbook.agent_id ?? "");

  const [rulesRows, tableRows, handoffRows, stepsRows, bindingRows] =
    await Promise.all([
      loadList(
        "agent_playbook_rules",
        [
          { field: "tenant_id", value: tenantId },
          { field: "playbook_id", value: playbookId },
          { field: "is_active", value: "true", operator: "equal" },
        ],
        "rule_order ASC, created_at ASC",
      ),
      loadList(
        "agent_playbook_tables",
        [
          { field: "tenant_id", value: tenantId },
          { field: "playbook_id", value: playbookId },
          { field: "is_active", value: "true", operator: "equal" },
        ],
        "table_name ASC",
      ),
      loadList(
        "agent_handoff_policies",
        [
          { field: "tenant_id", value: tenantId },
          { field: "agent_id", value: agentId },
          { field: "is_active", value: "true", operator: "equal" },
        ],
        "updated_at DESC",
      ),
      loadList(
        "agent_state_steps",
        [
          { field: "tenant_id", value: tenantId },
          { field: "agent_id", value: agentId },
          { field: "is_active", value: "true", operator: "equal" },
        ],
        "step_order ASC, created_at ASC",
      ),
      loadList(
        "agent_channel_bindings",
        [
          { field: "tenant_id", value: tenantId },
          { field: "agent_id", value: agentId },
          { field: "channel", value: normalizedChannel },
          { field: "is_active", value: "true", operator: "equal" },
        ],
        "updated_at DESC",
      ),
    ]);

  const resolvedSteps = stepsRows
    .filter((step) => {
      if (!currentStateKey) return true;
      return String(step.state_key ?? "") === String(currentStateKey);
    })
    .map((row) => ({
      state_id: String(row.state_id ?? ""),
      step_key: String(row.step_key ?? ""),
      step_label: String(row.step_label ?? ""),
      step_order: asNumber(row.step_order, 0),
      instruction: String(row.instruction ?? ""),
      handoff_to_operator: asBoolean(row.handoff_to_operator),
      return_to_bot_allowed: asBoolean(row.return_to_bot_allowed),
    }));

  const rules = rulesRows.map((row) => ({
    order: asNumber(row.rule_order, 999),
    type: String(row.rule_type ?? "policy"),
    title: String(row.title ?? ""),
    instruction: String(row.instruction ?? ""),
    severity: String(row.severity ?? "normal"),
  }));

  const tables = tableRows.map((row) => ({
    table_name: String(row.table_name ?? ""),
    access_mode: String(row.access_mode ?? "read"),
    is_required: asBoolean(row.is_required),
    purpose: String(row.purpose ?? ""),
  }));

  const handoff = handoffRows[0]
    ? {
        pause_bot_while_operator: asBoolean(
          handoffRows[0].pause_bot_while_operator,
        ),
        operator_can_return_to_bot: asBoolean(
          handoffRows[0].operator_can_return_to_bot,
        ),
        return_to_state_key: String(handoffRows[0].return_to_state_key ?? ""),
        trigger_type: String(handoffRows[0].trigger_type ?? ""),
      }
    : null;

  const compactRules = rules
    .slice(0, 12)
    .map((rule) => `${rule.order}. [${rule.type}] ${rule.instruction}`)
    .join("\n");

  const compactTables = tables
    .slice(0, 12)
    .map((table) => `${table.table_name}:${table.access_mode}`)
    .join(", ");

  const compactSteps = resolvedSteps
    .slice(0, 8)
    .map((step) => `${step.step_order}-${step.step_key}:${step.instruction}`)
    .join("\n");

  const instructionsCompact = [
    compactRules ? `Regras:\n${compactRules}` : "",
    compactTables ? `Tabelas: ${compactTables}` : "",
    compactSteps ? `Steps:\n${compactSteps}` : "",
    handoff
      ? `Handoff: pause=${handoff.pause_bot_while_operator}; return=${handoff.operator_can_return_to_bot}; state=${handoff.return_to_state_key || ""}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    channel: normalizedChannel,
    webhook_url:
      String(bindingRows[0]?.webhook_url ?? "") ||
      String(playbook.webhook_url ?? "") ||
      DEFAULT_N8N_WEBHOOK_URL,
    playbook: {
      id: playbookId,
      name: String(playbook.name ?? ""),
      behavior_source: String(playbook.behavior_source ?? "playbook"),
      state_machine_mode: String(playbook.state_machine_mode ?? "guided"),
      inherit_system_prompt: asBoolean(playbook.inherit_system_prompt),
    },
    rules,
    tables,
    handoff,
    state_steps: resolvedSteps,
    instructions_compact: instructionsCompact,
  };
};

async function postRobotWebhook(payload: RobotWebhookRuntimePayload) {
  const webhookUrl = payload.governance?.webhook_url || DEFAULT_N8N_WEBHOOK_URL;
  const normalizedPayload = withWhatsappMemoryKeys(payload);

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(normalizedPayload),
  });

  if (!res.ok) {
    throw new Error("Erro ao falar com o robô");
  }

  const data = await res.json();
  const item = Array.isArray(data) ? data[0] : data;
  return item ?? data;
}

export async function sendToRobot(payload: RobotWebhookPayload) {
  const governance = await loadGovernanceRuntime(
    payload.tenant_id,
    payload.channel,
    payload.current_state_key,
  ).catch(() => null);

  const item = await postRobotWebhook({
    ...payload,
    channel: governance?.channel ?? normalizeChannel(payload.channel),
    governance,
  });

  return (
    item?.reply ||
    item?.message ||
    item?.output ||
    "Não consegui processar sua solicitação."
  );
}

export async function sendOperatorToWebhook(payload: RobotWebhookPayload) {
  const governance = await loadGovernanceRuntime(
    payload.tenant_id,
    payload.channel,
    payload.current_state_key,
  ).catch(() => null);

  await postRobotWebhook({
    ...payload,
    channel: governance?.channel ?? normalizeChannel(payload.channel),
    governance,
  });
}
