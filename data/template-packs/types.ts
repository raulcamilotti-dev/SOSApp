/* ------------------------------------------------------------------ */
/*  Template Pack — Type Definitions                                   */
/*                                                                     */
/*  A template pack is a portable JSON-serializable bundle of          */
/*  pre-configured data for a specific business vertical (e.g.         */
/*  Cartório, Advocacia, Genérico). It seeds 13+ tables when a new    */
/*  tenant is created or when an existing tenant switches verticals.   */
/*                                                                     */
/*  IMPORTANT:                                                         */
/*  - All entities use `ref_key` strings (NOT UUIDs). UUIDs are        */
/*    generated at apply-time so packs are portable across tenants.    */
/*  - FK relationships use `*_ref` fields that point to other          */
/*    entities' `ref_key` in the same pack.                            */
/* ------------------------------------------------------------------ */

/* ---- Metadata ---------------------------------------------------- */

export interface PackMetadata {
  /** Unique key for this pack (e.g. "cartorio", "generico", "advocacia") */
  key: string;
  /** Display name (e.g. "Cartório & Registro de Imóveis") */
  name: string;
  /** Short description of the vertical this pack serves */
  description: string;
  /** Ionicons icon name for the pack card */
  icon: string;
  /** Hex color for the pack card */
  color: string;
  /** Semver version string */
  version: string;
}

/* ---- Tenant Config Overlay --------------------------------------- */

export interface PackTenantConfig {
  /** Business specialty identifier (e.g. "imobiliario", "juridico", "generico") */
  specialty: string;
  /** AI agent personality type */
  agent_type: string;
  /** Default AI agent name */
  agent_name: string;
  /** Whether to show prices in the portal público */
  show_price: boolean;
  /** Whether to allow online payments */
  allow_payment: boolean;
}

/* ---- Service Categories ------------------------------------------ */

export interface PackServiceCategory {
  ref_key: string;
  name: string;
  description?: string;
  color: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
}

/* ---- Service Types ----------------------------------------------- */

export interface PackServiceType {
  ref_key: string;
  name: string;
  description?: string;
  icon: string;
  color: string;
  is_active: boolean;
  /** Points to PackServiceCategory.ref_key */
  category_ref: string;
  /** DB table for entity context (e.g. "properties"). null for most types. */
  entity_table?: string | null;
  /** Points to PackWorkflowTemplate.ref_key for the default workflow */
  workflow_ref?: string;
}

/* ---- Workflow Templates ------------------------------------------ */

export interface PackWorkflowStep {
  ref_key: string;
  name: string;
  step_order: number;
  is_terminal: boolean;
  ocr_enabled?: boolean;
  has_protocol?: boolean;
}

export interface PackWorkflowTransition {
  from_step_ref: string;
  to_step_ref: string;
  name: string;
  description?: string;
  condition_json?: Record<string, unknown>;
}

export interface PackWorkflowTemplate {
  ref_key: string;
  name: string;
  /** Points to PackServiceType.ref_key */
  service_type_ref?: string;
  steps: PackWorkflowStep[];
  transitions: PackWorkflowTransition[];
}

/* ---- Deadline Rules ---------------------------------------------- */

export interface PackDeadlineRule {
  /** Points to a PackWorkflowStep.ref_key */
  step_ref: string;
  days_to_complete: number;
  priority: "low" | "medium" | "high" | "urgent" | "critical";
  notify_before_days: number;
  escalation_rule_json?: Record<string, unknown>;
}

/* ---- Step Task Templates ----------------------------------------- */

export interface PackStepTaskTemplate {
  /** Points to a PackWorkflowStep.ref_key */
  step_ref: string;
  title: string;
  description?: string;
  /** Points to PackRole.ref_key (optional) */
  assigned_role_ref?: string;
  is_required: boolean;
  due_days?: number;
  priority: "low" | "medium" | "high" | "urgent" | "critical";
  template_order: number;
  metadata_json?: Record<string, unknown>;
}

/* ---- Step Forms -------------------------------------------------- */

export interface PackStepForm {
  /** Points to a PackWorkflowStep.ref_key */
  step_ref: string;
  name: string;
  description?: string;
  form_schema_json: Record<string, unknown>;
  validation_rules_json?: Record<string, unknown>;
  is_required: boolean;
  can_block_transition?: boolean;
}

/* ---- Document Templates ------------------------------------------ */

export interface PackDocumentTemplate {
  ref_key: string;
  name: string;
  description?: string;
  category: string;
  content_html: string;
  variables: Record<string, unknown>;
  header_html?: string;
  footer_html?: string;
  page_config?: Record<string, unknown>;
  is_active: boolean;
}

/* ---- Roles & Permissions ----------------------------------------- */

export interface PackRole {
  ref_key: string;
  name: string;
  /** Array of global permission codes (must exist in `permissions` table) */
  permissions: string[];
}

/* ---- Services Catalog -------------------------------------------- */

export interface PackService {
  name: string;
  /** Points to PackServiceType.ref_key */
  type_ref: string;
  config?: Record<string, unknown>;
  is_active: boolean;
  /** 'product' or 'service' (default: 'service') */
  item_kind?: "product" | "service";
  sell_price?: number;
  cost_price?: number;
  /** Reference to measurement_units.code (e.g. 'un', 'hr', 'kg') */
  unit_code?: string;
  duration_minutes?: number;
  requires_scheduling?: boolean;
  requires_separation?: boolean;
  requires_delivery?: boolean;
  commission_percent?: number;
  description?: string;
  sku?: string;
  track_stock?: boolean;
  stock_quantity?: number;
  min_stock?: number;
  is_composition?: boolean;
  compositions?: { child_ref: string; quantity: number }[];
}

/* ---- OCR Config -------------------------------------------------- */

export interface PackOcrConfig {
  /** Points to a PackWorkflowStep.ref_key (optional) */
  step_ref?: string;
  name: string;
  description?: string;
  document_types: string[];
  extract_features: string[];
  lang?: string;
  is_active: boolean;
}

/* ---- Module Keys ------------------------------------------------- */

/**
 * Known module keys in the platform.
 * Each pack specifies which modules to activate for the tenant.
 */
export type ModuleKey =
  | "core"
  | "documents"
  | "onr_cartorio"
  | "partners"
  | "ai_automation"
  | "bi_analytics"
  | "crm"
  | "financial"
  | "time_tracking"
  | "client_portal"
  | "pdv"
  | "products"
  | "stock"
  | "purchases"
  | "delivery"
  | "marketplace";

/* ==================================================================
   CUSTOM FIELD DEFINITION (from A.1)
   ================================================================== */

export interface PackCustomFieldDefinition {
  ref_key: string;
  target_table: string;
  field_key: string;
  label: string;
  placeholder?: string;
  field_type: string;
  required?: boolean;
  visible_in_list?: boolean;
  visible_in_form?: boolean;
  read_only?: boolean;
  section?: string;
  sort_order?: number;
  default_value?: string;
  options?: Record<string, unknown> | unknown[];
  validation_rules?: Record<string, unknown>;
  mask_type?: string;
  reference_config?: Record<string, unknown>;
  show_when?: Record<string, unknown>;
}

/* ==================================================================
   AI AGENT ENTITIES (unified from agent-packs)
   ================================================================== */

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
  webhook_url?: string;
  operator_webhook_url?: string;
  config_ui?: Record<string, unknown>;
  is_active: boolean;
}

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

export interface PackChannelBinding {
  /** Points to PackAgent.ref_key */
  agent_ref: string;
  channel: "app_atendimento" | "app_operador" | "whatsapp";
  webhook_url?: string;
  is_active: boolean;
  config?: Record<string, unknown>;
}

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

export interface PackAutomation {
  /** Points to PackAgent.ref_key */
  agent_ref: string;
  trigger: string;
  action: string;
  config?: Record<string, unknown>;
}

/* ==================================================================
   TEMPLATE PACK — Top-level type
   ================================================================== */

export interface TemplatePack {
  metadata: PackMetadata;
  tenant_config: PackTenantConfig;
  modules: ModuleKey[];

  service_categories: PackServiceCategory[];
  service_types: PackServiceType[];
  workflow_templates: PackWorkflowTemplate[];
  deadline_rules: PackDeadlineRule[];
  step_task_templates: PackStepTaskTemplate[];
  step_forms: PackStepForm[];
  document_templates: PackDocumentTemplate[];
  roles: PackRole[];
  services: PackService[];
  ocr_configs?: PackOcrConfig[];
  custom_fields?: PackCustomFieldDefinition[];

  /* ── AI Agent entities (optional) ── */
  agents?: PackAgent[];
  playbooks?: PackPlaybook[];
  playbook_rules?: PackPlaybookRule[];
  playbook_tables?: PackPlaybookTable[];
  agent_states?: PackAgentState[];
  agent_state_steps?: PackAgentStateStep[];
  channel_bindings?: PackChannelBinding[];
  handoff_policies?: PackHandoffPolicy[];
  automations?: PackAutomation[];
}

/* ---- Pack Registry ----------------------------------------------- */

/**
 * Summary info for the pack selection UI (no heavy data).
 */
export interface PackSummary {
  key: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  version: string;
  /** Number of service types included */
  serviceTypeCount: number;
  /** Number of workflow templates included */
  workflowCount: number;
  /** Module keys included */
  modules: ModuleKey[];
  /** Number of AI agents included */
  agentCount: number;
  /** Number of AI automations included */
  automationCount: number;
}

/**
 * Extract a lightweight summary from a full pack.
 */
export function packToSummary(pack: TemplatePack): PackSummary {
  return {
    key: pack.metadata.key,
    name: pack.metadata.name,
    description: pack.metadata.description,
    icon: pack.metadata.icon,
    color: pack.metadata.color,
    version: pack.metadata.version,
    serviceTypeCount: pack.service_types.length,
    workflowCount: pack.workflow_templates.length,
    modules: pack.modules,
    agentCount: pack.agents?.length ?? 0,
    automationCount: pack.automations?.length ?? 0,
  };
}
