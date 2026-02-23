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
  | "delivery";

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
  };
}
