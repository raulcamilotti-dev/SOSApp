/* ------------------------------------------------------------------ */
/*  Pack Export Service                                                */
/*                                                                     */
/*  Exports a tenant's structural configuration as a TemplatePack —    */
/*  the inverse of applyTemplatePack(). Reads DB records with UUIDs,  */
/*  generates deterministic ref_keys, resolves FK cross-references,   */
/*  and outputs a valid TemplatePack JSON.                             */
/*                                                                     */
/*  Export order (inverse of apply):                                   */
/*    1. service_categories                                            */
/*    2. workflow_templates + steps + transitions                      */
/*    3. service_types                                                 */
/*    4. deadline_rules                                                */
/*    5. step_task_templates                                           */
/*    6. step_forms                                                    */
/*    7. roles + role_permissions                                      */
/*    8. document_templates                                            */
/*    9. services                                                      */
/*   10. ocr_config                                                    */
/*   11. custom_field_definitions                                      */
/*   12. tenant_modules                                                */
/* ------------------------------------------------------------------ */

import type {
    ModuleKey,
    PackAgent,
    PackAgentState,
    PackAgentStateStep,
    PackAutomation,
    PackChannelBinding,
    PackCustomFieldDefinition,
    PackDeadlineRule,
    PackDocumentTemplate,
    PackHandoffPolicy,
    PackOcrConfig,
    PackPlaybook,
    PackPlaybookRule,
    PackPlaybookTable,
    PackRole,
    PackService,
    PackServiceCategory,
    PackServiceType,
    PackStepForm,
    PackStepTaskTemplate,
    PackWorkflowStep,
    PackWorkflowTemplate,
    PackWorkflowTransition,
    TemplatePack,
} from "@/data/template-packs/types";
import { Platform } from "react-native";
import { api } from "./api";
import {
    buildSearchParams,
    countCrud,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "./crud";
import { validatePack } from "./template-packs";

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

export interface PackExportOptions {
  /** Pack display name */
  name: string;
  /** URL-safe unique slug */
  slug: string;
  /** Description for the pack */
  description: string;
  /** Ionicons icon name */
  icon?: string;
  /** Brand color hex */
  color?: string;
  /** Which entity types to include */
  include: {
    service_categories: boolean;
    service_types: boolean;
    workflows: boolean;
    deadline_rules: boolean;
    step_forms: boolean;
    step_task_templates: boolean;
    roles: boolean;
    document_templates: boolean;
    custom_fields: boolean;
    services: boolean;
    ocr_configs: boolean;
    modules: boolean;
    /* AI Agent entities */
    agents: boolean;
    playbooks: boolean;
    playbook_rules: boolean;
    playbook_tables: boolean;
    agent_states: boolean;
    agent_state_steps: boolean;
    channel_bindings: boolean;
    handoff_policies: boolean;
    automations: boolean;
  };
}

export interface PackExportResult {
  pack: TemplatePack;
  validation: { valid: boolean; errors: string[] };
  counts: Record<string, number>;
}

export interface TenantEntityCounts {
  service_categories: number;
  service_types: number;
  workflow_templates: number;
  deadline_rules: number;
  step_forms: number;
  step_task_templates: number;
  roles: number;
  document_templates: number;
  custom_field_definitions: number;
  services: number;
  ocr_configs: number;
  modules: number;
  /* AI Agent entities */
  agents: number;
  playbooks: number;
  playbook_rules: number;
  playbook_tables: number;
  agent_states: number;
  agent_state_steps: number;
  channel_bindings: number;
  handoff_policies: number;
  automations: number;
}

/* ================================================================== */
/*  Utility Helpers                                                    */
/* ================================================================== */

/** Convert text to URL-safe slug (no accents, lowercase, underscores). */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/**
 * Generate a deterministic, human-readable ref_key for a DB record.
 * Priority: slug > name > title > key > last 8 chars of id.
 */
function generateRefKey(
  table: string,
  record: Record<string, unknown>,
): string {
  const candidates = [
    record.slug,
    record.name,
    record.title,
    record.key,
    record.field_key,
  ];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === "string" && candidate.trim()) {
      return `${table}_${slugify(candidate.trim())}`;
    }
  }
  // Fallback: last 8 chars of UUID
  return `${table}_${String(record.id ?? "unknown").slice(-8)}`;
}

/**
 * Ensure all ref_keys in an array are unique by appending a counter suffix.
 */
function ensureUniqueRefKeys<T extends { ref_key: string }>(
  records: T[],
): void {
  const seen = new Map<string, number>();
  for (const record of records) {
    const base = record.ref_key;
    const count = seen.get(base) ?? 0;
    if (count > 0) {
      record.ref_key = `${base}_${count}`;
    }
    seen.set(base, count + 1);
  }
}

/** Safely parse JSON from a DB column value (could be string or object). */
function safeParseJson(
  value: unknown,
): Record<string, unknown> | unknown[] | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
}

/* ================================================================== */
/*  Data Fetching                                                      */
/* ================================================================== */

type DbRecord = Record<string, unknown>;

/** Fetch all non-deleted records for a tenant from a given table. */
async function fetchTenantRecords(
  table: string,
  tenantId: string,
  sortColumn = "created_at ASC",
): Promise<DbRecord[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table,
    ...buildSearchParams([{ field: "tenant_id", value: tenantId }], {
      sortColumn,
      autoExcludeDeleted: true,
    }),
  });
  return normalizeCrudList<DbRecord>(res.data);
}

/**
 * Fetch records by a field value (or set of values via IN operator).
 * Used for tables that don't have tenant_id (e.g., workflow_steps uses template_id).
 */
async function fetchRecordsByField(
  table: string,
  field: string,
  ids: string[],
  sortColumn = "created_at ASC",
): Promise<DbRecord[]> {
  if (ids.length === 0) return [];
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table,
    ...buildSearchParams([{ field, value: ids.join(","), operator: "in" }], {
      sortColumn,
      autoExcludeDeleted: true,
    }),
  });
  return normalizeCrudList<DbRecord>(res.data);
}

/**
 * Fetch tenant records from a table that has NO deleted_at column.
 * Skips autoExcludeDeleted to avoid querying a non-existent column.
 */
async function fetchTenantRecordsNoSoftDelete(
  table: string,
  tenantId: string,
  sortColumn = "created_at ASC",
): Promise<DbRecord[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table,
    ...buildSearchParams([{ field: "tenant_id", value: tenantId }], {
      sortColumn,
    }),
  });
  return normalizeCrudList<DbRecord>(res.data);
}

/**
 * Fetch all global permissions (id → code mapping).
 * Permissions table has NO tenant_id — it's global.
 */
async function fetchPermissionIdToCode(): Promise<Map<string, string>> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "permissions",
    sort_column: "code ASC",
  });
  const rows = normalizeCrudList<{ id: string; code: string }>(res.data);
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(String(row.id), String(row.code));
  }
  return map;
}

/**
 * Fetch role_permissions for a set of role IDs.
 * role_permissions has NO tenant_id — filter by role_id.
 * PK is (role_id, permission_id), no deleted_at.
 */
async function fetchRolePermissions(
  roleIds: string[],
): Promise<{ role_id: string; permission_id: string }[]> {
  if (roleIds.length === 0) return [];
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "role_permissions",
    ...buildSearchParams([
      { field: "role_id", value: roleIds.join(","), operator: "in" },
    ]),
  });
  return normalizeCrudList<{ role_id: string; permission_id: string }>(
    res.data,
  );
}

/**
 * Fetch all measurement units (for reverse-mapping unit_id → unit_code).
 */
async function fetchUnits(): Promise<Map<string, string>> {
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "measurement_units",
      sort_column: "code ASC",
    });
    const rows = normalizeCrudList<{ id: string; code: string }>(res.data);
    const map = new Map<string, string>();
    for (const row of rows) {
      map.set(String(row.id), String(row.code));
    }
    return map;
  } catch {
    // Table might not exist — return empty map
    return new Map();
  }
}

/* ================================================================== */
/*  Entity Count                                                       */
/* ================================================================== */

/**
 * Count how many exportable entities exist for a tenant.
 * Used by the UI to show checkboxes with counts.
 */
export async function countTenantEntities(
  tenantId: string,
): Promise<TenantEntityCounts> {
  const tenantFilter = [{ field: "tenant_id", value: tenantId }];
  const opts = { autoExcludeDeleted: true };

  const [
    service_categories,
    service_types,
    workflow_templates,
    deadline_rules,
    step_forms,
    step_task_templates,
    roles,
    document_templates,
    custom_field_definitions,
    services,
    ocr_configs,
    modules,
    agents,
    playbooks,
    playbook_rules,
    playbook_tables,
    agent_states,
    agent_state_steps,
    channel_bindings,
    handoff_policies,
    automations,
  ] = await Promise.all([
    countCrud("service_categories", tenantFilter, opts),
    countCrud("service_types", tenantFilter, opts),
    countCrud("workflow_templates", tenantFilter, opts),
    countCrud("deadline_rules", tenantFilter, opts),
    countCrud("step_forms", tenantFilter, opts),
    countCrud("step_task_templates", tenantFilter, opts),
    countCrud("roles", tenantFilter, opts),
    countCrud("document_templates", tenantFilter, opts),
    countCrud("custom_field_definitions", tenantFilter, opts),
    countCrud("services", tenantFilter, opts),
    countCrud("ocr_config", tenantFilter, opts),
    countCrud("tenant_modules", tenantFilter),
    /* AI Agent entities */
    countCrud("agents", tenantFilter, opts),
    countCrud("agent_playbooks", tenantFilter, opts),
    countCrud("agent_playbook_rules", tenantFilter, opts),
    countCrud("agent_playbook_tables", tenantFilter, opts),
    countCrud("agent_states", tenantFilter, opts),
    countCrud("agent_state_steps", tenantFilter, opts),
    countCrud("agent_channel_bindings", tenantFilter, opts),
    countCrud("agent_handoff_policies", tenantFilter, opts),
    countCrud("automations", tenantFilter, opts),
  ]);

  return {
    service_categories,
    service_types,
    workflow_templates,
    deadline_rules,
    step_forms,
    step_task_templates,
    roles,
    document_templates,
    custom_field_definitions,
    services,
    ocr_configs,
    modules,
    agents,
    playbooks,
    playbook_rules,
    playbook_tables,
    agent_states,
    agent_state_steps,
    channel_bindings,
    handoff_policies,
    automations,
  };
}

/* ================================================================== */
/*  RefMap — UUID → ref_key mapping                                    */
/* ================================================================== */

type RefMap = Map<string, string>; // uuid → ref_key

function lookupRef(map: RefMap, uuid: unknown): string | undefined {
  if (!uuid) return undefined;
  return map.get(String(uuid));
}

/* ================================================================== */
/*  Main Export Function                                                */
/* ================================================================== */

/**
 * Export a tenant's structural configuration as a TemplatePack.
 * This is the inverse of `applyTemplatePack()`.
 */
export async function exportTenantAsPack(
  tenantId: string,
  options: PackExportOptions,
): Promise<PackExportResult> {
  const counts: Record<string, number> = {};

  // RefMaps for cross-referencing UUID → ref_key
  const categoryRefs: RefMap = new Map();
  const workflowTemplateRefs: RefMap = new Map();
  const stepRefs: RefMap = new Map();
  const serviceTypeRefs: RefMap = new Map();
  const roleRefs: RefMap = new Map();
  const agentRefs: RefMap = new Map();
  const playbookRefs: RefMap = new Map();
  const agentStateRefs: RefMap = new Map();

  // Helper: build step → template mapping
  const stepToTemplateId: Map<string, string> = new Map();

  /* ──────────────────────────────────────────────────────────────── */
  /* 1. Service Categories                                           */
  /* ──────────────────────────────────────────────────────────────── */

  let packCategories: PackServiceCategory[] = [];

  if (options.include.service_categories) {
    const dbCategories = await fetchTenantRecords(
      "service_categories",
      tenantId,
      "sort_order ASC, created_at ASC",
    );

    packCategories = dbCategories.map((row) => {
      const refKey = generateRefKey("cat", row);
      categoryRefs.set(String(row.id), refKey);
      return {
        ref_key: refKey,
        name: String(row.name ?? ""),
        description: row.description ? String(row.description) : undefined,
        color: row.color ? String(row.color) : undefined,
        icon: row.icon ? String(row.icon) : undefined,
        sort_order: row.sort_order != null ? Number(row.sort_order) : undefined,
        is_active: row.is_active != null ? Boolean(row.is_active) : undefined,
      };
    });

    ensureUniqueRefKeys(packCategories);
    // Re-sync refMap after dedup
    for (const [i, row] of dbCategories.entries()) {
      categoryRefs.set(String(row.id), packCategories[i].ref_key);
    }
    counts.service_categories = packCategories.length;
  }

  /* ──────────────────────────────────────────────────────────────── */
  /* 2. Workflow Templates + Steps + Transitions                     */
  /* ──────────────────────────────────────────────────────────────── */

  let packWorkflows: PackWorkflowTemplate[] = [];

  if (options.include.workflows) {
    const dbTemplates = await fetchTenantRecords(
      "workflow_templates",
      tenantId,
    );
    // workflow_steps has NO tenant_id column — fetch via template_id IN (...)
    const templateIds = dbTemplates.map((r) => String(r.id)).filter(Boolean);
    const dbSteps = await fetchRecordsByField(
      "workflow_steps",
      "template_id",
      templateIds,
      "step_order ASC, created_at ASC",
    );
    const dbTransitions = await fetchTenantRecords(
      "workflow_step_transitions",
      tenantId,
    );

    // Generate ref_keys for templates
    const templateRefKeys: { id: string; ref_key: string }[] = [];
    for (const row of dbTemplates) {
      const refKey = generateRefKey("wf", row);
      templateRefKeys.push({ id: String(row.id), ref_key: refKey });
      workflowTemplateRefs.set(String(row.id), refKey);
    }
    ensureUniqueRefKeys(templateRefKeys);
    for (const tk of templateRefKeys) {
      workflowTemplateRefs.set(tk.id, tk.ref_key);
    }

    // Generate ref_keys for steps + build step→template map
    const stepRefKeys: { id: string; ref_key: string }[] = [];
    for (const row of dbSteps) {
      const refKey = generateRefKey("step", row);
      stepRefKeys.push({ id: String(row.id), ref_key: refKey });
      stepRefs.set(String(row.id), refKey);
      stepToTemplateId.set(
        String(row.id),
        String(row.template_id ?? row.workflow_template_id ?? ""),
      );
    }
    ensureUniqueRefKeys(stepRefKeys);
    for (const sk of stepRefKeys) {
      stepRefs.set(sk.id, sk.ref_key);
    }

    // Group steps by template_id
    const stepsByTemplate = new Map<string, DbRecord[]>();
    for (const row of dbSteps) {
      const tid = String(row.template_id ?? row.workflow_template_id ?? "");
      if (!stepsByTemplate.has(tid)) stepsByTemplate.set(tid, []);
      stepsByTemplate.get(tid)!.push(row);
    }

    // Group transitions by template (via from_step → template mapping)
    const transitionsByTemplate = new Map<string, DbRecord[]>();
    for (const row of dbTransitions) {
      const fromStepId = String(
        row.workflow_step_id_from ?? row.from_step_id ?? "",
      );
      const templateId = stepToTemplateId.get(fromStepId) ?? "";
      if (!transitionsByTemplate.has(templateId)) {
        transitionsByTemplate.set(templateId, []);
      }
      transitionsByTemplate.get(templateId)!.push(row);
    }

    // Assemble PackWorkflowTemplate
    packWorkflows = dbTemplates.map((tpl) => {
      const tplId = String(tpl.id);
      const tplSteps = stepsByTemplate.get(tplId) ?? [];
      const tplTransitions = transitionsByTemplate.get(tplId) ?? [];

      const steps: PackWorkflowStep[] = tplSteps.map((s) => ({
        ref_key: stepRefs.get(String(s.id)) ?? generateRefKey("step", s),
        name: String(s.name ?? ""),
        description: s.description ? String(s.description) : undefined,
        step_order: s.step_order != null ? Number(s.step_order) : 0,
        is_terminal: Boolean(s.is_terminal),
        ocr_enabled: s.ocr_enabled ? Boolean(s.ocr_enabled) : undefined,
        has_protocol: s.has_protocol ? Boolean(s.has_protocol) : undefined,
      }));

      const transitions: PackWorkflowTransition[] = tplTransitions.map((tr) => {
        const fromId = String(
          tr.workflow_step_id_from ?? tr.from_step_id ?? "",
        );
        const toId = String(tr.workflow_step_id_to ?? tr.to_step_id ?? "");
        return {
          from_step_ref: lookupRef(stepRefs, fromId) ?? fromId,
          to_step_ref: lookupRef(stepRefs, toId) ?? toId,
          name: tr.name ? String(tr.name) : undefined,
          description: tr.description ? String(tr.description) : undefined,
          condition_json: safeParseJson(tr.condition_json) as
            | Record<string, unknown>
            | undefined,
        };
      });

      const serviceTypeRef = lookupRef(serviceTypeRefs, tpl.service_type_id);

      return {
        ref_key: workflowTemplateRefs.get(tplId) ?? generateRefKey("wf", tpl),
        name: String(tpl.name ?? ""),
        description: tpl.description ? String(tpl.description) : undefined,
        service_type_ref: serviceTypeRef,
        steps,
        transitions,
      };
    });

    counts.workflow_templates = packWorkflows.length;
    counts.workflow_steps = dbSteps.length;
    counts.workflow_step_transitions = dbTransitions.length;
  }

  /* ──────────────────────────────────────────────────────────────── */
  /* 3. Service Types                                                */
  /* ──────────────────────────────────────────────────────────────── */

  let packServiceTypes: PackServiceType[] = [];

  if (options.include.service_types) {
    const dbTypes = await fetchTenantRecords("service_types", tenantId);

    const typeRefKeys: { id: string; ref_key: string }[] = [];
    for (const row of dbTypes) {
      const refKey = generateRefKey("type", row);
      typeRefKeys.push({ id: String(row.id), ref_key: refKey });
      serviceTypeRefs.set(String(row.id), refKey);
    }
    ensureUniqueRefKeys(typeRefKeys);
    for (const tk of typeRefKeys) {
      serviceTypeRefs.set(tk.id, tk.ref_key);
    }

    packServiceTypes = dbTypes.map((row, idx) => ({
      ref_key: typeRefKeys[idx].ref_key,
      name: String(row.name ?? ""),
      icon: row.icon ? String(row.icon) : undefined,
      color: row.color ? String(row.color) : undefined,
      is_active: row.is_active != null ? Boolean(row.is_active) : undefined,
      category_ref:
        lookupRef(categoryRefs, row.category_id) ??
        lookupRef(categoryRefs, row.service_category_id) ??
        "",
      entity_table: row.entity_table ? String(row.entity_table) : undefined,
      workflow_ref:
        lookupRef(workflowTemplateRefs, row.workflow_template_id) ??
        lookupRef(workflowTemplateRefs, row.default_template_id),
    }));

    counts.service_types = packServiceTypes.length;

    // Now backfill workflow_template.service_type_ref (bidirectional link)
    for (const wf of packWorkflows) {
      if (!wf.service_type_ref) {
        // Find the service_type that references this workflow
        const matchingType = packServiceTypes.find(
          (st) => st.workflow_ref === wf.ref_key,
        );
        if (matchingType) {
          wf.service_type_ref = matchingType.ref_key;
        }
      }
    }
  }

  /* ──────────────────────────────────────────────────────────────── */
  /* 4. Deadline Rules                                               */
  /* ──────────────────────────────────────────────────────────────── */

  let packDeadlineRules: PackDeadlineRule[] = [];

  if (options.include.deadline_rules) {
    const dbRules = await fetchTenantRecords("deadline_rules", tenantId);

    packDeadlineRules = dbRules.map((row) => ({
      step_ref: lookupRef(stepRefs, row.step_id) ?? "",
      days_to_complete: Number(row.days_to_complete ?? 0),
      priority: row.priority
        ? (String(row.priority) as PackDeadlineRule["priority"])
        : undefined,
      notify_before_days:
        row.notify_before_days != null
          ? Number(row.notify_before_days)
          : undefined,
      escalation_rule_json: safeParseJson(
        row.escalation_rule ?? row.escalation_rule_json,
      ) as Record<string, unknown> | undefined,
    }));

    // Filter out rules where step_ref couldn't be resolved
    packDeadlineRules = packDeadlineRules.filter((r) => r.step_ref);
    counts.deadline_rules = packDeadlineRules.length;
  }

  /* ──────────────────────────────────────────────────────────────── */
  /* 5. Roles + Permissions                                          */
  /* ──────────────────────────────────────────────────────────────── */

  let packRoles: PackRole[] = [];

  if (options.include.roles) {
    const dbRoles = await fetchTenantRecords("roles", tenantId);

    const roleRefKeys: { id: string; ref_key: string }[] = [];
    for (const row of dbRoles) {
      const refKey = generateRefKey("role", row);
      roleRefKeys.push({ id: String(row.id), ref_key: refKey });
      roleRefs.set(String(row.id), refKey);
    }
    ensureUniqueRefKeys(roleRefKeys);
    for (const rk of roleRefKeys) {
      roleRefs.set(rk.id, rk.ref_key);
    }

    // Fetch role_permissions + permission id→code map
    const roleIds = dbRoles.map((r) => String(r.id));
    const [dbRolePermissions, permIdToCode] = await Promise.all([
      fetchRolePermissions(roleIds),
      fetchPermissionIdToCode(),
    ]);

    // Group permissions by role_id
    const permsByRole = new Map<string, string[]>();
    for (const rp of dbRolePermissions) {
      const roleId = String(rp.role_id);
      const code = permIdToCode.get(String(rp.permission_id));
      if (!code) continue;
      if (!permsByRole.has(roleId)) permsByRole.set(roleId, []);
      permsByRole.get(roleId)!.push(code);
    }

    packRoles = dbRoles.map((row, idx) => ({
      ref_key: roleRefKeys[idx].ref_key,
      name: String(row.name ?? ""),
      permissions: permsByRole.get(String(row.id)) ?? [],
    }));

    counts.roles = packRoles.length;
  }

  /* ──────────────────────────────────────────────────────────────── */
  /* 6. Step Task Templates                                          */
  /* ──────────────────────────────────────────────────────────────── */

  let packStepTaskTemplates: PackStepTaskTemplate[] = [];

  if (options.include.step_task_templates) {
    const dbTasks = await fetchTenantRecords(
      "step_task_templates",
      tenantId,
      "template_order ASC, created_at ASC",
    );

    packStepTaskTemplates = dbTasks.map((row) => ({
      step_ref: lookupRef(stepRefs, row.step_id) ?? "",
      title: String(row.title ?? ""),
      description: row.description ? String(row.description) : undefined,
      assigned_role_ref: lookupRef(roleRefs, row.assigned_role_id),
      is_required:
        row.is_required != null ? Boolean(row.is_required) : undefined,
      due_days: row.due_days != null ? Number(row.due_days) : undefined,
      priority: row.priority
        ? (String(row.priority) as PackStepTaskTemplate["priority"])
        : undefined,
      template_order:
        row.template_order != null ? Number(row.template_order) : undefined,
      metadata_json: safeParseJson(row.metadata) as
        | Record<string, unknown>
        | undefined,
    }));

    // Filter out records where step_ref couldn't be resolved
    packStepTaskTemplates = packStepTaskTemplates.filter((t) => t.step_ref);
    counts.step_task_templates = packStepTaskTemplates.length;
  }

  /* ──────────────────────────────────────────────────────────────── */
  /* 7. Step Forms                                                   */
  /* ──────────────────────────────────────────────────────────────── */

  let packStepForms: PackStepForm[] = [];

  if (options.include.step_forms) {
    const dbForms = await fetchTenantRecords("step_forms", tenantId);

    packStepForms = dbForms.map((row) => ({
      step_ref: lookupRef(stepRefs, row.step_id) ?? "",
      name: String(row.name ?? ""),
      description: row.description ? String(row.description) : undefined,
      form_schema_json: safeParseJson(
        row.form_schema ?? row.form_schema_json,
      ) as Record<string, unknown> | undefined,
      validation_rules_json: safeParseJson(
        row.validation_rules ?? row.validation_rules_json,
      ) as Record<string, unknown> | undefined,
      is_required:
        row.is_required != null ? Boolean(row.is_required) : undefined,
      can_block_transition:
        row.can_block_transition != null
          ? Boolean(row.can_block_transition)
          : undefined,
    }));

    packStepForms = packStepForms.filter((f) => f.step_ref);
    counts.step_forms = packStepForms.length;
  }

  /* ──────────────────────────────────────────────────────────────── */
  /* 8. Document Templates                                           */
  /* ──────────────────────────────────────────────────────────────── */

  let packDocTemplates: PackDocumentTemplate[] = [];

  if (options.include.document_templates) {
    const dbDocs = await fetchTenantRecords("document_templates", tenantId);

    packDocTemplates = dbDocs.map((row) => {
      const refKey = generateRefKey("doc", row);
      return {
        ref_key: refKey,
        name: String(row.name ?? ""),
        description: row.description ? String(row.description) : undefined,
        category: row.category ? String(row.category) : undefined,
        content_html: row.content_html ? String(row.content_html) : undefined,
        variables: (safeParseJson(row.variables) ?? {}) as Record<
          string,
          unknown
        >,
        header_html: row.header_html ? String(row.header_html) : undefined,
        footer_html: row.footer_html ? String(row.footer_html) : undefined,
        page_config: safeParseJson(row.page_config) as
          | Record<string, unknown>
          | undefined,
        is_active: row.is_active != null ? Boolean(row.is_active) : undefined,
      };
    });

    ensureUniqueRefKeys(packDocTemplates);
    counts.document_templates = packDocTemplates.length;
  }

  /* ──────────────────────────────────────────────────────────────── */
  /* 9. Services (opt-in)                                            */
  /* ──────────────────────────────────────────────────────────────── */

  let packServices: PackService[] = [];

  if (options.include.services) {
    const dbServices = await fetchTenantRecords("services", tenantId);
    const unitMap = await fetchUnits();

    packServices = dbServices.map((row) => {
      const unitId = row.unit_id ? String(row.unit_id) : undefined;
      const unitCode = unitId ? unitMap.get(unitId) : undefined;

      return {
        name: String(row.name ?? ""),
        type_ref: lookupRef(serviceTypeRefs, row.service_type_id),
        config: safeParseJson(row.config) as
          | Record<string, unknown>
          | undefined,
        is_active: row.is_active != null ? Boolean(row.is_active) : undefined,
        // PDV fields
        sku: row.sku ? String(row.sku) : undefined,
        barcode: row.barcode ? String(row.barcode) : undefined,
        description: row.description ? String(row.description) : undefined,
        unit_code: unitCode,
        unit_price: row.unit_price != null ? Number(row.unit_price) : undefined,
        cost_price: row.cost_price != null ? Number(row.cost_price) : undefined,
        min_stock: row.min_stock != null ? Number(row.min_stock) : undefined,
        max_stock: row.max_stock != null ? Number(row.max_stock) : undefined,
        stock_quantity:
          row.stock_quantity != null ? Number(row.stock_quantity) : undefined,
        can_sell_online:
          row.can_sell_online != null
            ? Boolean(row.can_sell_online)
            : undefined,
        product_type: row.product_type ? String(row.product_type) : undefined,
        composition_type: row.composition_type
          ? String(row.composition_type)
          : undefined,
        tax_group: row.tax_group ? String(row.tax_group) : undefined,
        ncm_code: row.ncm_code ? String(row.ncm_code) : undefined,
        weight_kg: row.weight_kg != null ? Number(row.weight_kg) : undefined,
        dimensions_json: safeParseJson(row.dimensions_json) as
          | Record<string, unknown>
          | undefined,
        images: safeParseJson(row.images) as string[] | undefined,
        metadata_json: safeParseJson(row.metadata) as
          | Record<string, unknown>
          | undefined,
        // Note: compositions are NOT exported in this version
        // (would need to map component_product_id → service name)
      };
    });

    counts.services = packServices.length;
  }

  /* ──────────────────────────────────────────────────────────────── */
  /* 10. OCR Configs                                                 */
  /* ──────────────────────────────────────────────────────────────── */

  let packOcrConfigs: PackOcrConfig[] = [];

  if (options.include.ocr_configs) {
    const dbOcr = await fetchTenantRecords("ocr_config", tenantId);

    packOcrConfigs = dbOcr.map((row) => ({
      step_ref: lookupRef(stepRefs, row.step_id) ?? "",
      name: String(row.name ?? ""),
      description: row.description ? String(row.description) : undefined,
      document_types: safeParseJson(row.document_types) as string[] | undefined,
      extract_features: safeParseJson(row.extract_features) as
        | string[]
        | undefined,
      lang: row.lang ? String(row.lang) : undefined,
      is_active: row.is_active != null ? Boolean(row.is_active) : undefined,
    }));

    packOcrConfigs = packOcrConfigs.filter((o) => o.step_ref);
    counts.ocr_configs = packOcrConfigs.length;
  }

  /* ──────────────────────────────────────────────────────────────── */
  /* 11. Custom Field Definitions                                    */
  /* ──────────────────────────────────────────────────────────────── */

  let packCustomFields: PackCustomFieldDefinition[] = [];

  if (options.include.custom_fields) {
    const dbFields = await fetchTenantRecords(
      "custom_field_definitions",
      tenantId,
      "sort_order ASC, created_at ASC",
    );

    packCustomFields = dbFields.map((row) => ({
      ref_key: generateRefKey("cf", row),
      target_table: String(row.target_table ?? ""),
      field_key: String(row.field_key ?? ""),
      label: String(row.label ?? ""),
      placeholder: row.placeholder ? String(row.placeholder) : undefined,
      field_type: String(row.field_type ?? "text"),
      required: row.required != null ? Boolean(row.required) : undefined,
      visible_in_list:
        row.visible_in_list != null ? Boolean(row.visible_in_list) : undefined,
      visible_in_form:
        row.visible_in_form != null ? Boolean(row.visible_in_form) : undefined,
      read_only: row.read_only != null ? Boolean(row.read_only) : undefined,
      section: row.section ? String(row.section) : undefined,
      sort_order: row.sort_order != null ? Number(row.sort_order) : undefined,
      default_value: row.default_value ? String(row.default_value) : undefined,
      options: safeParseJson(row.options) as
        | Record<string, unknown>
        | unknown[]
        | undefined,
      validation_rules: safeParseJson(row.validation_rules) as
        | Record<string, unknown>
        | undefined,
      mask_type: row.mask_type ? String(row.mask_type) : undefined,
      reference_config: safeParseJson(row.reference_config) as
        | Record<string, unknown>
        | undefined,
      show_when: safeParseJson(row.show_when) as
        | Record<string, unknown>
        | undefined,
    }));

    ensureUniqueRefKeys(packCustomFields);
    counts.custom_field_definitions = packCustomFields.length;
  }

  /* ──────────────────────────────────────────────────────────────── */
  /* 12. Modules                                                     */
  /* ──────────────────────────────────────────────────────────────── */

  let packModules: ModuleKey[] = [];

  if (options.include.modules) {
    // tenant_modules has NO deleted_at column — skip autoExcludeDeleted
    const dbModules = await fetchTenantRecordsNoSoftDelete(
      "tenant_modules",
      tenantId,
    );
    packModules = dbModules
      .filter((row) => Boolean(row.enabled))
      .map((row) => String(row.module_key) as ModuleKey);
    counts.modules = packModules.length;
  }

  /* ──────────────────────────────────────────────────────────────── */
  /* 13. Agents                                                      */
  /* ──────────────────────────────────────────────────────────────── */

  let packAgents: PackAgent[] = [];

  if (options.include.agents) {
    const dbAgents = await fetchTenantRecords("agents", tenantId);

    packAgents = dbAgents.map((row) => {
      const refKey = generateRefKey("agent", row);
      agentRefs.set(String(row.id), refKey);
      return {
        ref_key: refKey,
        system_prompt: String(row.system_prompt ?? ""),
        model: String(row.model ?? ""),
        temperature: Number(row.temperature ?? 0),
        max_tokens: Number(row.max_tokens ?? 0),
        is_default: Boolean(row.is_default),
        is_active: Boolean(row.is_active),
        version: Number(row.version ?? 1),
      };
    });

    ensureUniqueRefKeys(packAgents);
    for (const [i, row] of dbAgents.entries()) {
      agentRefs.set(String(row.id), packAgents[i].ref_key);
    }
    counts.agents = packAgents.length;
  }

  /* ──────────────────────────────────────────────────────────────── */
  /* 14. Playbooks                                                   */
  /* ──────────────────────────────────────────────────────────────── */

  let packPlaybooks: PackPlaybook[] = [];

  if (options.include.playbooks) {
    const dbPlaybooks = await fetchTenantRecords("agent_playbooks", tenantId);

    packPlaybooks = dbPlaybooks
      .map((row): PackPlaybook | null => {
        const agentRef = lookupRef(agentRefs, row.agent_id);
        if (!agentRef) return null;
        const refKey = generateRefKey("pb", row);
        playbookRefs.set(String(row.id), refKey);
        return {
          ref_key: refKey,
          agent_ref: agentRef,
          channel: String(row.channel ?? "whatsapp") as PackPlaybook["channel"],
          name: String(row.name ?? ""),
          description: row.description ? String(row.description) : undefined,
          behavior_source: String(
            row.behavior_source ?? "agent_system_prompt",
          ) as PackPlaybook["behavior_source"],
          inherit_system_prompt: Boolean(row.inherit_system_prompt),
          state_machine_mode: String(
            row.state_machine_mode ?? "freeform",
          ) as PackPlaybook["state_machine_mode"],
          webhook_url: row.webhook_url ? String(row.webhook_url) : undefined,
          operator_webhook_url: row.operator_webhook_url
            ? String(row.operator_webhook_url)
            : undefined,
          config_ui: safeParseJson(row.config_ui) as
            | Record<string, unknown>
            | undefined,
          is_active: Boolean(row.is_active),
        };
      })
      .filter((p): p is PackPlaybook => p !== null);

    ensureUniqueRefKeys(packPlaybooks);
    // Re-sync refMap
    let pbIdx = 0;
    for (const row of dbPlaybooks) {
      if (lookupRef(agentRefs, row.agent_id)) {
        playbookRefs.set(String(row.id), packPlaybooks[pbIdx].ref_key);
        pbIdx++;
      }
    }
    counts.playbooks = packPlaybooks.length;
  }

  /* ──────────────────────────────────────────────────────────────── */
  /* 15. Playbook Rules                                              */
  /* ──────────────────────────────────────────────────────────────── */

  let packPlaybookRules: PackPlaybookRule[] = [];

  if (options.include.playbook_rules) {
    const dbRules = await fetchTenantRecords(
      "agent_playbook_rules",
      tenantId,
      "rule_order ASC, created_at ASC",
    );

    packPlaybookRules = dbRules
      .map((row): PackPlaybookRule | null => {
        const playbookRef = lookupRef(playbookRefs, row.playbook_id);
        if (!playbookRef) return null;
        return {
          playbook_ref: playbookRef,
          rule_order: Number(row.rule_order ?? 0),
          rule_type: String(
            row.rule_type ?? "policy",
          ) as PackPlaybookRule["rule_type"],
          title: String(row.title ?? ""),
          instruction: String(row.instruction ?? ""),
          severity: String(
            row.severity ?? "normal",
          ) as PackPlaybookRule["severity"],
          is_active: Boolean(row.is_active),
          metadata: safeParseJson(row.metadata) as
            | Record<string, unknown>
            | undefined,
        };
      })
      .filter((r): r is PackPlaybookRule => r !== null);

    counts.playbook_rules = packPlaybookRules.length;
  }

  /* ──────────────────────────────────────────────────────────────── */
  /* 16. Playbook Tables                                             */
  /* ──────────────────────────────────────────────────────────────── */

  let packPlaybookTables: PackPlaybookTable[] = [];

  if (options.include.playbook_tables) {
    const dbTables = await fetchTenantRecords(
      "agent_playbook_tables",
      tenantId,
    );

    packPlaybookTables = dbTables
      .map((row): PackPlaybookTable | null => {
        const playbookRef = lookupRef(playbookRefs, row.playbook_id);
        if (!playbookRef) return null;
        return {
          playbook_ref: playbookRef,
          table_name: String(row.table_name ?? ""),
          access_mode: String(
            row.access_mode ?? "read",
          ) as PackPlaybookTable["access_mode"],
          is_required: Boolean(row.is_required),
          purpose: row.purpose ? String(row.purpose) : undefined,
          query_guardrails: safeParseJson(row.query_guardrails) as
            | Record<string, unknown>
            | undefined,
          is_active: Boolean(row.is_active),
        };
      })
      .filter((t): t is PackPlaybookTable => t !== null);

    counts.playbook_tables = packPlaybookTables.length;
  }

  /* ──────────────────────────────────────────────────────────────── */
  /* 17. Agent States                                                */
  /* ──────────────────────────────────────────────────────────────── */

  let packAgentStates: PackAgentState[] = [];

  if (options.include.agent_states) {
    const dbStates = await fetchTenantRecords("agent_states", tenantId);

    packAgentStates = dbStates
      .map((row): PackAgentState | null => {
        const agentRef = lookupRef(agentRefs, row.agent_id);
        if (!agentRef) return null;
        const refKey = generateRefKey("as", row);
        agentStateRefs.set(String(row.id), refKey);
        return {
          ref_key: refKey,
          agent_ref: agentRef,
          state_key: String(row.state_key ?? ""),
          state_label: String(row.state_label ?? ""),
          system_prompt: String(row.system_prompt ?? ""),
          rules: safeParseJson(row.rules) as
            | Record<string, unknown>
            | undefined,
          tools: safeParseJson(row.tools) as
            | Record<string, unknown>
            | undefined,
          is_initial: Boolean(row.is_initial),
          is_terminal: Boolean(row.is_terminal),
        };
      })
      .filter((s): s is PackAgentState => s !== null);

    ensureUniqueRefKeys(packAgentStates);
    // Re-sync refMap
    let asIdx = 0;
    for (const row of dbStates) {
      if (lookupRef(agentRefs, row.agent_id)) {
        agentStateRefs.set(String(row.id), packAgentStates[asIdx].ref_key);
        asIdx++;
      }
    }
    counts.agent_states = packAgentStates.length;
  }

  /* ──────────────────────────────────────────────────────────────── */
  /* 18. Agent State Steps                                           */
  /* ──────────────────────────────────────────────────────────────── */

  let packAgentStateSteps: PackAgentStateStep[] = [];

  if (options.include.agent_state_steps) {
    const dbSteps = await fetchTenantRecords(
      "agent_state_steps",
      tenantId,
      "step_order ASC, created_at ASC",
    );

    packAgentStateSteps = dbSteps
      .map((row): PackAgentStateStep | null => {
        const stateRef = lookupRef(agentStateRefs, row.state_id);
        const agentRef = lookupRef(agentRefs, row.agent_id);
        if (!stateRef || !agentRef) return null;
        return {
          state_ref: stateRef,
          agent_ref: agentRef,
          step_key: String(row.step_key ?? ""),
          step_label: String(row.step_label ?? ""),
          step_order: Number(row.step_order ?? 0),
          instruction: String(row.instruction ?? ""),
          expected_inputs: safeParseJson(row.expected_inputs) as
            | Record<string, unknown>
            | undefined,
          expected_outputs: safeParseJson(row.expected_outputs) as
            | Record<string, unknown>
            | undefined,
          allowed_tables: safeParseJson(row.allowed_tables) as
            | Record<string, unknown>
            | undefined,
          on_success_action: row.on_success_action
            ? String(row.on_success_action)
            : undefined,
          on_failure_action: row.on_failure_action
            ? String(row.on_failure_action)
            : undefined,
          handoff_to_operator: Boolean(row.handoff_to_operator),
          return_to_bot_allowed: Boolean(row.return_to_bot_allowed),
          is_active: Boolean(row.is_active),
        };
      })
      .filter((s): s is PackAgentStateStep => s !== null);

    counts.agent_state_steps = packAgentStateSteps.length;
  }

  /* ──────────────────────────────────────────────────────────────── */
  /* 19. Channel Bindings                                            */
  /* ──────────────────────────────────────────────────────────────── */

  let packChannelBindings: PackChannelBinding[] = [];

  if (options.include.channel_bindings) {
    const dbBindings = await fetchTenantRecords(
      "agent_channel_bindings",
      tenantId,
    );

    packChannelBindings = dbBindings
      .map((row): PackChannelBinding | null => {
        const agentRef = lookupRef(agentRefs, row.agent_id);
        if (!agentRef) return null;
        return {
          agent_ref: agentRef,
          channel: String(
            row.channel ?? "whatsapp",
          ) as PackChannelBinding["channel"],
          webhook_url: row.webhook_url ? String(row.webhook_url) : undefined,
          is_active: Boolean(row.is_active),
          config: safeParseJson(row.config) as
            | Record<string, unknown>
            | undefined,
        };
      })
      .filter((b): b is PackChannelBinding => b !== null);

    counts.channel_bindings = packChannelBindings.length;
  }

  /* ──────────────────────────────────────────────────────────────── */
  /* 20. Handoff Policies                                            */
  /* ──────────────────────────────────────────────────────────────── */

  let packHandoffPolicies: PackHandoffPolicy[] = [];

  if (options.include.handoff_policies) {
    const dbPolicies = await fetchTenantRecords(
      "agent_handoff_policies",
      tenantId,
    );

    packHandoffPolicies = dbPolicies
      .map((row): PackHandoffPolicy | null => {
        const agentRef = lookupRef(agentRefs, row.agent_id);
        if (!agentRef) return null;
        return {
          agent_ref: agentRef,
          playbook_ref: lookupRef(playbookRefs, row.playbook_id),
          from_channel: String(row.from_channel ?? ""),
          to_channel: String(row.to_channel ?? ""),
          trigger_type: String(
            row.trigger_type ?? "user_request",
          ) as PackHandoffPolicy["trigger_type"],
          trigger_config: safeParseJson(row.trigger_config) as
            | Record<string, unknown>
            | undefined,
          pause_bot_while_operator: Boolean(row.pause_bot_while_operator),
          operator_can_return_to_bot: Boolean(row.operator_can_return_to_bot),
          return_to_state_key: row.return_to_state_key
            ? String(row.return_to_state_key)
            : undefined,
          is_active: Boolean(row.is_active),
        };
      })
      .filter((p): p is PackHandoffPolicy => p !== null);

    counts.handoff_policies = packHandoffPolicies.length;
  }

  /* ──────────────────────────────────────────────────────────────── */
  /* 21. Automations                                                 */
  /* ──────────────────────────────────────────────────────────────── */

  let packAutomations: PackAutomation[] = [];

  if (options.include.automations) {
    const dbAutomations = await fetchTenantRecords("automations", tenantId);

    packAutomations = dbAutomations
      .map((row): PackAutomation | null => {
        const agentRef = lookupRef(agentRefs, row.agent_id);
        if (!agentRef) return null;
        return {
          agent_ref: agentRef,
          trigger: String(row.trigger ?? ""),
          action: String(row.action ?? ""),
          config: safeParseJson(row.config) as
            | Record<string, unknown>
            | undefined,
        };
      })
      .filter((a): a is PackAutomation => a !== null);

    counts.automations = packAutomations.length;
  }

  /* ──────────────────────────────────────────────────────────────── */
  /* Assemble the TemplatePack                                       */
  /* ──────────────────────────────────────────────────────────────── */

  const pack: TemplatePack = {
    metadata: {
      key: options.slug,
      name: options.name,
      description: options.description,
      icon: options.icon ?? "rocket-outline",
      color: options.color ?? "#2563eb",
      version: "1.0.0",
    },
    tenant_config: {
      specialty: "custom",
      agent_type: "atendimento",
      agent_name: "Assistente",
      show_price: false,
      allow_payment: false,
    },
    modules: packModules,
    service_categories: packCategories,
    service_types: packServiceTypes,
    workflow_templates: packWorkflows,
    deadline_rules: packDeadlineRules,
    step_task_templates: packStepTaskTemplates,
    step_forms: packStepForms,
    document_templates: packDocTemplates,
    roles: packRoles,
    services: packServices,
    ocr_configs: packOcrConfigs.length > 0 ? packOcrConfigs : undefined,
    custom_fields: packCustomFields.length > 0 ? packCustomFields : undefined,
    agents: packAgents.length > 0 ? packAgents : undefined,
    playbooks: packPlaybooks.length > 0 ? packPlaybooks : undefined,
    playbook_rules:
      packPlaybookRules.length > 0 ? packPlaybookRules : undefined,
    playbook_tables:
      packPlaybookTables.length > 0 ? packPlaybookTables : undefined,
    agent_states: packAgentStates.length > 0 ? packAgentStates : undefined,
    agent_state_steps:
      packAgentStateSteps.length > 0 ? packAgentStateSteps : undefined,
    channel_bindings:
      packChannelBindings.length > 0 ? packChannelBindings : undefined,
    handoff_policies:
      packHandoffPolicies.length > 0 ? packHandoffPolicies : undefined,
    automations: packAutomations.length > 0 ? packAutomations : undefined,
  };

  /* ──────────────────────────────────────────────────────────────── */
  /* Validate                                                        */
  /* ──────────────────────────────────────────────────────────────── */

  const validation = validatePack(pack);

  return { pack, validation, counts };
}

/* ================================================================== */
/*  Download / Share                                                   */
/* ================================================================== */

/**
 * Download/share a TemplatePack as JSON file.
 * Web: triggers a browser download.
 * Native: writes to cache dir + opens share sheet.
 */
export async function downloadPackAsJson(pack: TemplatePack): Promise<void> {
  const json = JSON.stringify(pack, null, 2);
  const filename = `pack-${pack.metadata.key}.json`;

  if (Platform.OS === "web") {
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  // Native: write to FileSystem + share
  const fs = (await import("expo-file-system")) as any;
  const Sharing = await import("expo-sharing");

  const fileUri =
    (fs.cacheDirectory ?? fs.default?.cacheDirectory ?? "") + filename;
  await (fs.writeAsStringAsync ?? fs.default?.writeAsStringAsync)(
    fileUri,
    json,
    { encoding: "utf8" as any },
  );

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: "application/json",
      dialogTitle: `Exportar ${pack.metadata.name}`,
      UTI: "public.json",
    });
  }
}
