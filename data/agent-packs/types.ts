/* ------------------------------------------------------------------ */
/*  AI Agent Template Pack — Type Definitions                          */
/*                                                                     */
/*  An agent pack is a portable JSON-serializable bundle of            */
/*  pre-configured AI agent data for a specific business vertical.     */
/*  It seeds agents, playbooks, states, state-steps, rules, tables,    */
/*  channel bindings, handoff policies, and automations.               */
/*                                                                     */
/*  IMPORTANT:                                                         */
/*  - All entities use `ref_key` strings (NOT UUIDs). UUIDs are        */
/*    generated at apply-time so packs are portable across tenants.    */
/*  - FK relationships use `*_ref` fields that point to other          */
/*    entities' `ref_key` in the same pack.                            */
/* ------------------------------------------------------------------ */

/* ---- Metadata ---------------------------------------------------- */

export interface AgentPackMetadata {
  /** Unique key for this pack (e.g. "generico", "cartorio", "advocacia") */
  key: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Ionicons icon name */
  icon: string;
  /** Hex color for the card */
  color: string;
  /** Semver version */
  version: string;
}

/* ---- Agent ------------------------------------------------------- */

export interface PackAgent {
  ref_key: string;
  /** System prompt — core identity of the agent */
  system_prompt: string;
  /** LLM model identifier */
  model: string;
  /** Temperature 0-1 */
  temperature: number;
  /** Max tokens per response */
  max_tokens: number;
  /** Whether this is the default agent for the tenant */
  is_default: boolean;
  is_active: boolean;
  version: number;
}

/* ---- Playbook ---------------------------------------------------- */

export interface PackPlaybook {
  ref_key: string;
  /** Points to PackAgent.ref_key */
  agent_ref: string;
  channel: "app_atendimento" | "app_operador" | "whatsapp";
  name: string;
  description?: string;
  behavior_source: "agent_system_prompt" | "playbook";
  inherit_system_prompt: boolean;
  state_machine_mode: "guided" | "freeform";
  /** Webhook URL for the bot — can be set per tenant at apply-time */
  webhook_url?: string;
  /** Webhook URL for operator — can be set per tenant at apply-time */
  operator_webhook_url?: string;
  config_ui?: Record<string, unknown>;
  is_active: boolean;
}

/* ---- Playbook Rule ----------------------------------------------- */

export interface PackPlaybookRule {
  /** Points to PackPlaybook.ref_key */
  playbook_ref: string;
  rule_order: number;
  rule_type: "policy" | "flow" | "safety" | "tooling";
  title: string;
  instruction: string;
  severity: "normal" | "high" | "critical";
  is_active: boolean;
  metadata?: Record<string, unknown>;
}

/* ---- Playbook Table ---------------------------------------------- */

export interface PackPlaybookTable {
  /** Points to PackPlaybook.ref_key */
  playbook_ref: string;
  table_name: string;
  access_mode: "read" | "read_write" | "write";
  is_required: boolean;
  purpose?: string;
  query_guardrails?: Record<string, unknown>;
  is_active: boolean;
}

/* ---- Agent State ------------------------------------------------- */

export interface PackAgentState {
  ref_key: string;
  /** Points to PackAgent.ref_key */
  agent_ref: string;
  state_key: string;
  state_label: string;
  system_prompt: string;
  rules?: Record<string, unknown>;
  tools?: Record<string, unknown>;
  is_initial: boolean;
  is_terminal: boolean;
}

/* ---- Agent State Step -------------------------------------------- */

export interface PackAgentStateStep {
  /** Points to PackAgentState.ref_key */
  state_ref: string;
  /** Points to PackAgent.ref_key */
  agent_ref: string;
  step_key: string;
  step_label: string;
  step_order: number;
  instruction: string;
  expected_inputs?: Record<string, unknown>;
  expected_outputs?: Record<string, unknown>;
  allowed_tables?: Record<string, unknown>;
  on_success_action?: string;
  on_failure_action?: string;
  handoff_to_operator: boolean;
  return_to_bot_allowed: boolean;
  is_active: boolean;
}

/* ---- Channel Binding --------------------------------------------- */

export interface PackChannelBinding {
  /** Points to PackAgent.ref_key */
  agent_ref: string;
  channel: "app_atendimento" | "app_operador" | "whatsapp";
  webhook_url?: string;
  is_active: boolean;
  config?: Record<string, unknown>;
}

/* ---- Handoff Policy ---------------------------------------------- */

export interface PackHandoffPolicy {
  /** Points to PackAgent.ref_key */
  agent_ref: string;
  /** Points to PackPlaybook.ref_key (optional) */
  playbook_ref?: string;
  from_channel: string;
  to_channel: string;
  trigger_type: "user_request" | "system_rule" | "operator_request";
  trigger_config?: Record<string, unknown>;
  pause_bot_while_operator: boolean;
  operator_can_return_to_bot: boolean;
  return_to_state_key?: string;
  is_active: boolean;
}

/* ---- Automation -------------------------------------------------- */

export interface PackAutomation {
  /** Points to PackAgent.ref_key */
  agent_ref: string;
  trigger: string;
  action: string;
  config?: Record<string, unknown>;
}

/* ==================================================================
   AGENT TEMPLATE PACK — Top-level type
   ================================================================== */

export interface AgentTemplatePack {
  metadata: AgentPackMetadata;

  agents: PackAgent[];
  playbooks: PackPlaybook[];
  playbook_rules: PackPlaybookRule[];
  playbook_tables: PackPlaybookTable[];
  agent_states: PackAgentState[];
  agent_state_steps: PackAgentStateStep[];
  channel_bindings: PackChannelBinding[];
  handoff_policies: PackHandoffPolicy[];
  automations: PackAutomation[];
}

/* ---- Pack Summary (lightweight, for UI) -------------------------- */

export interface AgentPackSummary {
  key: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  version: string;
  agentCount: number;
  playbookCount: number;
  stateCount: number;
  ruleCount: number;
  automationCount: number;
}

/** Extract a lightweight summary from a full agent pack. */
export function agentPackToSummary(pack: AgentTemplatePack): AgentPackSummary {
  return {
    key: pack.metadata.key,
    name: pack.metadata.name,
    description: pack.metadata.description,
    icon: pack.metadata.icon,
    color: pack.metadata.color,
    version: pack.metadata.version,
    agentCount: pack.agents.length,
    playbookCount: pack.playbooks.length,
    stateCount: pack.agent_states.length,
    ruleCount: pack.playbook_rules.length,
    automationCount: pack.automations.length,
  };
}
