/* ------------------------------------------------------------------ */
/*  Template Pack — Apply Service                                      */
/*                                                                     */
/*  Applies a template pack to a tenant, creating all entities in the  */
/*  correct dependency order. Uses api_crud for individual inserts     */
/*  and dedicated Worker endpoints for batch operations.               */
/*                                                                     */
/*  Apply order (respects FK dependencies):                            */
/*    1. service_categories                                            */
/*    2. workflow_templates                                            */
/*    3. workflow_steps (per template)                                 */
/*    4. service_types (FK → categories, workflow_templates)           */
/*    5. workflow_step_transitions (FK → steps)                        */
/*    6. deadline_rules (FK → steps)                                   */
/*    7. step_task_templates (FK → steps, roles)                       */
/*    8. step_forms (FK → steps)                                       */
/*    9. roles                                                         */
/*   10. role_permissions (FK → roles, permissions)                    */
/*   11. document_templates                                            */
/*   12. services (FK → service_types)                                 */
/*   13. tenant_modules                                                */
/*   14. ocr_config (FK → steps - optional)                            */
/*   15. tenant config update                                          */
/*   16. Link service_types → default_template_id                      */
/*  16b. entity_definitions (optional)                                 */
/*   17. custom_fields (optional, FK → entity_definitions)             */
/*   18. agents (optional AI)                                          */
/*   19. playbooks (FK → agents)                                       */
/*   20. playbook_rules (FK → playbooks)                               */
/*   21. playbook_tables (FK → playbooks)                              */
/*   22. agent_states (FK → agents)                                    */
/*   23. agent_state_steps (FK → states, agents)                       */
/*   24. channel_bindings (FK → agents)                                */
/*   25. handoff_policies (FK → agents, playbooks)                     */
/*   26. automations (FK → agents)                                     */
/* ------------------------------------------------------------------ */

import type {
    PackWorkflowTemplate,
    TemplatePack,
} from "@/data/template-packs/types";
import { api } from "./api";
import { buildSearchParams, CRUD_ENDPOINT, normalizeCrudList } from "./crud";

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

/** Maps ref_key → generated UUID for cross-referencing during apply. */
type RefMap = Record<string, string>;

/** Result of applying a pack. */
export interface ApplyPackResult {
  success: boolean;
  tenantId: string;
  packKey: string;
  /** Counts of created entities per table */
  counts: Record<string, number>;
  /** Errors encountered (non-fatal — partial apply) */
  errors: string[];
}

/** Progress callback for UI feedback. */
export type ApplyProgressCallback = (step: string, progress: number) => void;

/* ================================================================== */
/*  Internal Helpers                                                   */
/* ================================================================== */

/** Extract a human-readable message from an API error. */
function describeError(err: unknown): string {
  if (typeof err === "string") return err;
  const axErr = err as any;
  const respData = axErr?.response?.data;
  if (respData) {
    if (typeof respData === "string" && respData.trim()) return respData.trim();
    if (typeof respData === "object") {
      const msg =
        respData?.message ??
        respData?.error ??
        respData?.detail ??
        JSON.stringify(respData);
      return typeof msg === "string" ? msg : JSON.stringify(msg);
    }
  }
  return axErr?.message ?? String(err);
}

/** Create a single row via api_crud and return the created row. */
async function crudCreate<T = Record<string, unknown>>(
  table: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table,
    payload,
  });
  const data = res.data;
  if (Array.isArray(data)) return data[0] as T;
  return (data?.data ?? data) as T;
}

/** Fetch all permission rows (global, no tenant_id). */
async function fetchAllPermissions(): Promise<{ id: string; code: string }[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "permissions",
  });
  return normalizeCrudList<{ id: string; code: string }>(res.data);
}

/**
 * Build a flat step ref map from all workflow templates in the pack.
 * Returns ref_key → ref_key (identity) for lookup purposes.
 */
function collectAllStepRefs(templates: PackWorkflowTemplate[]): Set<string> {
  const refs = new Set<string>();
  for (const t of templates) {
    for (const s of t.steps) {
      refs.add(s.ref_key);
    }
  }
  return refs;
}

/* ================================================================== */
/*  Apply Pack — Main Function                                         */
/* ================================================================== */

/**
 * Apply a template pack to a tenant.
 *
 * This function creates all entities in the correct FK order.
 * It is NOT idempotent — running twice will create duplicates.
 * Use `clearPackData()` first to reset a tenant's data.
 *
 * @param pack - The template pack to apply
 * @param tenantId - Target tenant UUID
 * @param onProgress - Optional progress callback
 */
export async function applyTemplatePack(
  pack: TemplatePack,
  tenantId: string,
  onProgress?: ApplyProgressCallback,
): Promise<ApplyPackResult> {
  const result: ApplyPackResult = {
    success: false,
    tenantId,
    packKey: pack.metadata.key,
    counts: {},
    errors: [],
  };

  const categoryRefs: RefMap = {};
  const workflowTemplateRefs: RefMap = {};
  const stepRefs: RefMap = {};
  const serviceTypeRefs: RefMap = {};
  const roleRefs: RefMap = {};
  const agentRefs: RefMap = {};
  const playbookRefs: RefMap = {};
  const agentStateRefs: RefMap = {};

  /* Determine if this pack has agent data */
  const hasAgents = (pack.agents?.length ?? 0) > 0;

  /* Auto-inject ai_automation module when pack has agents */
  if (hasAgents && !pack.modules.includes("ai_automation")) {
    pack.modules.push("ai_automation");
  }

  const totalSteps = 17 + (hasAgents ? 9 : 0);
  let currentStep = 0;

  const progress = (label: string) => {
    currentStep++;
    onProgress?.(label, currentStep / totalSteps);
  };

  try {
    /* -------------------------------------------------------------- */
    /*  1. Service Categories                                          */
    /* -------------------------------------------------------------- */
    progress("Criando categorias de serviço...");
    for (const cat of pack.service_categories) {
      try {
        const created = await crudCreate<{ id: string }>("service_categories", {
          tenant_id: tenantId,
          name: cat.name,
          description: cat.description ?? null,
          color: cat.color,
          icon: cat.icon,
          sort_order: cat.sort_order,
          is_active: cat.is_active,
        });
        if (created?.id) {
          categoryRefs[cat.ref_key] = created.id;
        }
        result.counts.service_categories =
          (result.counts.service_categories ?? 0) + 1;
      } catch (err) {
        result.errors.push(
          `service_categories[${cat.ref_key}]: ${describeError(err)}`,
        );
      }
    }

    // Re-fetch any category refs whose IDs weren't captured
    const missingCatRefs = pack.service_categories.filter(
      (c) => !categoryRefs[c.ref_key],
    );
    if (missingCatRefs.length > 0) {
      try {
        const catRes = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "service_categories",
          search_field1: "tenant_id",
          search_value1: tenantId,
          search_operator1: "equal",
        });
        const dbCats = normalizeCrudList<{ id: string; name: string }>(
          catRes.data,
        );
        for (const mc of missingCatRefs) {
          const match = dbCats.find((d) => d.name === mc.name);
          if (match) {
            categoryRefs[mc.ref_key] = match.id;
          }
        }
      } catch {
        // Best-effort
      }
    }

    /* -------------------------------------------------------------- */
    /*  2. Workflow Templates                                          */
    /* -------------------------------------------------------------- */
    progress("Criando templates de workflow...");
    for (const wf of pack.workflow_templates) {
      try {
        const created = await crudCreate<{ id: string }>("workflow_templates", {
          tenant_id: tenantId,
          name: wf.name,
        });
        if (created?.id) {
          workflowTemplateRefs[wf.ref_key] = created.id;
        }
        result.counts.workflow_templates =
          (result.counts.workflow_templates ?? 0) + 1;
      } catch (err) {
        result.errors.push(
          `workflow_templates[${wf.ref_key}]: ${describeError(err)}`,
        );
      }
    }

    // Re-fetch any workflow templates whose IDs weren't captured
    const missingWfRefs = pack.workflow_templates.filter(
      (wf) => !workflowTemplateRefs[wf.ref_key],
    );
    if (missingWfRefs.length > 0) {
      try {
        const wfRes = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "workflow_templates",
          search_field1: "tenant_id",
          search_value1: tenantId,
          search_operator1: "equal",
        });
        const dbWfs = normalizeCrudList<{ id: string; name: string }>(
          wfRes.data,
        );
        for (const mwf of missingWfRefs) {
          const match = dbWfs.find((d) => d.name === mwf.name);
          if (match) {
            workflowTemplateRefs[mwf.ref_key] = match.id;
          }
        }
      } catch {
        // Best-effort
      }
    }

    /* -------------------------------------------------------------- */
    /*  3. Workflow Steps                                               */
    /* -------------------------------------------------------------- */
    progress("Criando etapas de workflow...");
    for (const wf of pack.workflow_templates) {
      const templateId = workflowTemplateRefs[wf.ref_key];
      if (!templateId) continue;

      for (const step of wf.steps) {
        try {
          const created = await crudCreate<{ id: string }>("workflow_steps", {
            template_id: templateId,
            name: step.name,
            step_order: step.step_order,
            is_terminal: step.is_terminal,
            ocr_enabled: step.ocr_enabled ?? false,
            has_protocol: step.has_protocol ?? false,
          });
          if (created?.id) {
            stepRefs[step.ref_key] = created.id;
          }
          result.counts.workflow_steps =
            (result.counts.workflow_steps ?? 0) + 1;
        } catch (err) {
          result.errors.push(
            `workflow_steps[${step.ref_key}]: ${describeError(err)}`,
          );
        }
      }

      // If any step refs are missing, fetch them back from the DB
      const missingStepRefs = wf.steps.filter((s) => !stepRefs[s.ref_key]);
      if (missingStepRefs.length > 0) {
        try {
          const fetchRes = await api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "workflow_steps",
            search_field1: "template_id",
            search_value1: templateId,
            search_operator1: "equal",
          });
          const dbSteps = normalizeCrudList<{
            id: string;
            name: string;
            step_order: number;
          }>(fetchRes.data);
          for (const ms of missingStepRefs) {
            const match = dbSteps.find(
              (d) => d.name === ms.name && d.step_order === ms.step_order,
            );
            if (match) {
              stepRefs[ms.ref_key] = match.id;
            }
          }
        } catch {
          // Best-effort re-fetch
        }
      }
    }

    /* -------------------------------------------------------------- */
    /*  4. Service Types (needs category + workflow template refs)      */
    /* -------------------------------------------------------------- */
    progress("Criando tipos de serviço...");
    for (const st of pack.service_types) {
      try {
        const categoryId = categoryRefs[st.category_ref];
        const defaultTemplateId = st.workflow_ref
          ? workflowTemplateRefs[st.workflow_ref]
          : null;

        const created = await crudCreate<{ id: string }>("service_types", {
          tenant_id: tenantId,
          name: st.name,
          description: st.description ?? null,
          icon: st.icon,
          color: st.color,
          is_active: st.is_active,
          category_id: categoryId ?? null,
          entity_table: st.entity_table ?? null,
          default_template_id: defaultTemplateId ?? null,
        });
        if (created?.id) {
          serviceTypeRefs[st.ref_key] = created.id;
        }
        result.counts.service_types = (result.counts.service_types ?? 0) + 1;
      } catch (err) {
        result.errors.push(
          `service_types[${st.ref_key}]: ${describeError(err)}`,
        );
      }
    }

    // Re-fetch any service type refs whose IDs weren't captured
    const missingStRefs = pack.service_types.filter(
      (st) => !serviceTypeRefs[st.ref_key],
    );
    if (missingStRefs.length > 0) {
      try {
        const stRes = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "service_types",
          search_field1: "tenant_id",
          search_value1: tenantId,
          search_operator1: "equal",
        });
        const dbSts = normalizeCrudList<{ id: string; name: string }>(
          stRes.data,
        );
        for (const mst of missingStRefs) {
          const match = dbSts.find((d) => d.name === mst.name);
          if (match) {
            serviceTypeRefs[mst.ref_key] = match.id;
          }
        }
      } catch {
        // Best-effort
      }
    }

    /* -------------------------------------------------------------- */
    /*  5. Link workflow_templates ↔ service_types (bidirectional)      */
    /* -------------------------------------------------------------- */
    progress("Vinculando workflows aos tipos de serviço...");

    // 5a. From workflow side: wf.service_type_ref → set workflow_templates.service_type_id
    for (const wf of pack.workflow_templates) {
      if (!wf.service_type_ref) continue;
      const templateId = workflowTemplateRefs[wf.ref_key];
      const serviceTypeId = serviceTypeRefs[wf.service_type_ref];
      if (!templateId || !serviceTypeId) continue;

      try {
        await api.post(CRUD_ENDPOINT, {
          action: "update",
          table: "workflow_templates",
          payload: {
            id: templateId,
            service_type_id: serviceTypeId,
          },
        });
      } catch (err) {
        result.errors.push(
          `workflow_templates.link[${wf.ref_key}]: ${describeError(err)}`,
        );
      }
    }

    // 5b. From service type side: st.workflow_ref → set workflow_templates.service_type_id
    //     (covers the common case where service_type has workflow_ref but
    //      the workflow template doesn't have service_type_ref)
    for (const st of pack.service_types) {
      if (!st.workflow_ref) continue;
      const serviceTypeId = serviceTypeRefs[st.ref_key];
      const templateId = workflowTemplateRefs[st.workflow_ref];
      if (!serviceTypeId || !templateId) continue;

      try {
        await api.post(CRUD_ENDPOINT, {
          action: "update",
          table: "workflow_templates",
          payload: {
            id: templateId,
            service_type_id: serviceTypeId,
          },
        });
      } catch (err) {
        result.errors.push(
          `workflow_templates.link_reverse[${st.ref_key}]: ${describeError(err)}`,
        );
      }
    }

    /* -------------------------------------------------------------- */
    /*  6. Workflow Step Transitions                                    */
    /* -------------------------------------------------------------- */
    progress("Criando transições de workflow...");
    for (const wf of pack.workflow_templates) {
      for (const tr of wf.transitions) {
        const fromId = stepRefs[tr.from_step_ref];
        const toId = stepRefs[tr.to_step_ref];
        if (!fromId || !toId) {
          result.errors.push(
            `transition[${tr.from_step_ref}→${tr.to_step_ref}]: step ref not found`,
          );
          continue;
        }

        try {
          await crudCreate("workflow_step_transitions", {
            tenant_id: tenantId,
            from_step_id: fromId,
            to_step_id: toId,
            name: tr.name,
            description: tr.description ?? null,
            condition_json: tr.condition_json ?? {},
            is_active: true,
          });
          result.counts.workflow_step_transitions =
            (result.counts.workflow_step_transitions ?? 0) + 1;
        } catch (err) {
          result.errors.push(
            `transitions[${tr.from_step_ref}→${tr.to_step_ref}]: ${describeError(err)}`,
          );
        }
      }
    }

    /* -------------------------------------------------------------- */
    /*  7. Deadline Rules                                               */
    /* -------------------------------------------------------------- */
    progress("Criando regras de prazo...");
    for (const dr of pack.deadline_rules) {
      const stepId = stepRefs[dr.step_ref];
      if (!stepId) {
        result.errors.push(
          `deadline_rules[${dr.step_ref}]: step ref not found`,
        );
        continue;
      }

      try {
        await crudCreate("deadline_rules", {
          tenant_id: tenantId,
          step_id: stepId,
          days_to_complete: dr.days_to_complete,
          priority: dr.priority,
          notify_before_days: dr.notify_before_days,
          escalation_rule_json: dr.escalation_rule_json ?? {},
        });
        result.counts.deadline_rules = (result.counts.deadline_rules ?? 0) + 1;
      } catch (err) {
        result.errors.push(
          `deadline_rules[${dr.step_ref}]: ${describeError(err)}`,
        );
      }
    }

    /* -------------------------------------------------------------- */
    /*  8. Roles                                                       */
    /* -------------------------------------------------------------- */
    progress("Criando papéis de acesso...");
    for (const role of pack.roles) {
      try {
        const created = await crudCreate<{ id: string }>("roles", {
          tenant_id: tenantId,
          name: role.name,
        });
        if (created?.id) {
          roleRefs[role.ref_key] = created.id;
        }
        result.counts.roles = (result.counts.roles ?? 0) + 1;
      } catch (err) {
        result.errors.push(`roles[${role.ref_key}]: ${describeError(err)}`);
      }
    }

    // Re-fetch any role refs whose IDs weren't captured
    const missingRoleRefs = pack.roles.filter((r) => !roleRefs[r.ref_key]);
    if (missingRoleRefs.length > 0) {
      try {
        const rolesRes = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "roles",
          search_field1: "tenant_id",
          search_value1: tenantId,
          search_operator1: "equal",
        });
        const dbRoles = normalizeCrudList<{ id: string; name: string }>(
          rolesRes.data,
        );
        for (const mr of missingRoleRefs) {
          const match = dbRoles.find((d) => d.name === mr.name);
          if (match) {
            roleRefs[mr.ref_key] = match.id;
          }
        }
      } catch {
        // Best-effort
      }
    }

    /* -------------------------------------------------------------- */
    /*  9. Role Permissions                                            */
    /* -------------------------------------------------------------- */
    progress("Atribuindo permissões aos papéis...");
    const allPermissions = await fetchAllPermissions();
    const permissionMap = new Map(allPermissions.map((p) => [p.code, p.id]));

    for (const role of pack.roles) {
      const roleId = roleRefs[role.ref_key];
      if (!roleId) continue;

      for (const permCode of role.permissions) {
        const permId = permissionMap.get(permCode);
        if (!permId) {
          result.errors.push(
            `role_permissions[${role.ref_key}/${permCode}]: permission code not found`,
          );
          continue;
        }

        try {
          await crudCreate("role_permissions", {
            role_id: roleId,
            permission_id: permId,
          });
          result.counts.role_permissions =
            (result.counts.role_permissions ?? 0) + 1;
        } catch (err) {
          result.errors.push(
            `role_permissions[${role.ref_key}/${permCode}]: ${describeError(err)}`,
          );
        }
      }
    }

    /* -------------------------------------------------------------- */
    /*  10. Step Task Templates                                        */
    /* -------------------------------------------------------------- */
    progress("Criando templates de tarefas...");

    // Resolve role refs for task templates
    for (const task of pack.step_task_templates) {
      const stepId = stepRefs[task.step_ref];
      if (!stepId) {
        result.errors.push(
          `step_task_templates[${task.step_ref}/${task.title}]: step ref not found`,
        );
        continue;
      }

      const assignedRoleId = task.assigned_role_ref
        ? roleRefs[task.assigned_role_ref]
        : null;

      try {
        await crudCreate("step_task_templates", {
          tenant_id: tenantId,
          step_id: stepId,
          title: task.title,
          description: task.description ?? null,
          assigned_role: assignedRoleId ?? null,
          is_required: task.is_required,
          due_days: task.due_days ?? null,
          priority: task.priority,
          template_order: task.template_order,
          metadata_json: task.metadata_json ?? {},
        });
        result.counts.step_task_templates =
          (result.counts.step_task_templates ?? 0) + 1;
      } catch (err) {
        result.errors.push(
          `step_task_templates[${task.step_ref}/${task.title}]: ${describeError(err)}`,
        );
      }
    }

    /* -------------------------------------------------------------- */
    /*  11. Step Forms                                                  */
    /* -------------------------------------------------------------- */
    progress("Criando formulários de etapa...");
    for (const form of pack.step_forms) {
      const stepId = stepRefs[form.step_ref];
      if (!stepId) {
        result.errors.push(
          `step_forms[${form.step_ref}/${form.name}]: step ref not found`,
        );
        continue;
      }

      try {
        await crudCreate("step_forms", {
          tenant_id: tenantId,
          step_id: stepId,
          name: form.name,
          description: form.description ?? null,
          form_schema_json: form.form_schema_json,
          validation_rules_json: form.validation_rules_json ?? {},
          is_required: form.is_required,
          can_block_transition: form.can_block_transition ?? false,
        });
        result.counts.step_forms = (result.counts.step_forms ?? 0) + 1;
      } catch (err) {
        result.errors.push(
          `step_forms[${form.step_ref}/${form.name}]: ${describeError(err)}`,
        );
      }
    }

    /* -------------------------------------------------------------- */
    /*  12. Document Templates                                         */
    /* -------------------------------------------------------------- */
    progress("Criando modelos de documento...");
    for (const doc of pack.document_templates) {
      try {
        await crudCreate("document_templates", {
          tenant_id: tenantId,
          name: doc.name,
          description: doc.description ?? null,
          category: doc.category,
          content_html: doc.content_html,
          variables: doc.variables,
          header_html: doc.header_html ?? null,
          footer_html: doc.footer_html ?? null,
          page_config: doc.page_config ?? {},
          is_active: doc.is_active,
        });
        result.counts.document_templates =
          (result.counts.document_templates ?? 0) + 1;
      } catch (err) {
        result.errors.push(
          `document_templates[${doc.ref_key}]: ${describeError(err)}`,
        );
      }
    }

    /* -------------------------------------------------------------- */
    /*  13. Services Catalog                                           */
    /* -------------------------------------------------------------- */
    progress("Criando catálogo de serviços...");

    // Pre-fetch measurement_units so we can resolve unit_code → unit_id
    let unitCodeToId: Record<string, string> = {};
    try {
      const unitsRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "measurement_units",
      });
      const units = normalizeCrudList<{ id: string; code: string }>(
        unitsRes.data,
      );
      for (const u of units) {
        unitCodeToId[u.code] = u.id;
      }
    } catch {
      // measurement_units table may not exist — skip unit resolution
    }

    // Keep a map of service name → created id for composition resolution
    const serviceNameToId: Record<string, string> = {};

    for (const svc of pack.services) {
      const serviceTypeId = serviceTypeRefs[svc.type_ref];
      if (!serviceTypeId) {
        result.errors.push(
          `services[${svc.name}]: service_type ref '${svc.type_ref}' not found`,
        );
        continue;
      }

      try {
        // Build payload with optional PDV fields
        const payload: Record<string, unknown> = {
          tenant_id: tenantId,
          name: svc.name,
          service_type_id: serviceTypeId,
          config: svc.config ?? {},
          is_active: svc.is_active,
        };

        // PDV / catalog fields (only set when present)
        if (svc.item_kind) payload.item_kind = svc.item_kind;
        if (svc.description) payload.description = svc.description;
        if (svc.sell_price != null) payload.sell_price = svc.sell_price;
        if (svc.cost_price != null) payload.cost_price = svc.cost_price;
        if (svc.sku) payload.sku = svc.sku;
        if (svc.track_stock != null) payload.track_stock = svc.track_stock;
        if (svc.stock_quantity != null)
          payload.stock_quantity = svc.stock_quantity;
        if (svc.min_stock != null) payload.min_stock = svc.min_stock;
        if (svc.duration_minutes != null)
          payload.duration_minutes = svc.duration_minutes;
        if (svc.requires_scheduling != null)
          payload.requires_scheduling = svc.requires_scheduling;
        if (svc.requires_separation != null)
          payload.requires_separation = svc.requires_separation;
        if (svc.requires_delivery != null)
          payload.requires_delivery = svc.requires_delivery;
        if (svc.commission_percent != null)
          payload.commission_percent = svc.commission_percent;
        if (svc.is_composition != null)
          payload.is_composition = svc.is_composition;

        // Resolve unit_code → unit_id
        if (svc.unit_code && unitCodeToId[svc.unit_code]) {
          payload.unit_id = unitCodeToId[svc.unit_code];
        }

        const createRes = await crudCreate("services", payload);
        result.counts.services = (result.counts.services ?? 0) + 1;

        // Try to capture created ID for composition linking
        try {
          const created = normalizeCrudList<{ id: string }>(createRes);
          if (created.length > 0 && created[0].id) {
            serviceNameToId[svc.name] = created[0].id;
          }
        } catch {
          // ID capture is best-effort
        }
      } catch (err) {
        result.errors.push(`services[${svc.name}]: ${describeError(err)}`);
      }
    }

    // Create service_compositions for items with is_composition = true
    // (compositions reference child services by name within the same pack)
    // Note: compositions are created after all services so IDs are available
    for (const svc of pack.services) {
      if (!svc.is_composition || !svc.compositions?.length) continue;
      const parentId = serviceNameToId[svc.name];
      if (!parentId) continue;

      for (const comp of svc.compositions) {
        // comp.child_ref points to another PackService name in the same pack
        const childSvc = pack.services.find((s) => s.name === comp.child_ref);
        const childId = childSvc ? serviceNameToId[childSvc.name] : null;
        if (!childId) {
          result.errors.push(
            `composition[${svc.name}→${comp.child_ref}]: child not found`,
          );
          continue;
        }
        try {
          await crudCreate("service_compositions", {
            parent_service_id: parentId,
            child_service_id: childId,
            quantity: comp.quantity,
          });
        } catch (err) {
          result.errors.push(
            `composition[${svc.name}→${comp.child_ref}]: ${describeError(err)}`,
          );
        }
      }
    }

    /* -------------------------------------------------------------- */
    /*  14. Tenant Modules                                             */
    /* -------------------------------------------------------------- */
    progress("Ativando módulos...");

    // Pre-fetch existing modules for this tenant to avoid duplicate key errors
    let existingModuleKeys = new Set<string>();
    try {
      const existingModulesRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "tenant_modules",
        search_field1: "tenant_id",
        search_value1: tenantId,
        search_operator1: "equal",
      });
      const existingModules = normalizeCrudList<{
        id: string;
        module_key: string;
        enabled: boolean;
      }>(existingModulesRes.data);
      existingModuleKeys = new Set(existingModules.map((m) => m.module_key));
    } catch {
      // If we can't fetch, proceed with creates (may fail on duplicates)
    }

    for (const moduleKey of pack.modules) {
      if (existingModuleKeys.has(moduleKey)) {
        // Module already exists for this tenant — skip (count as success)
        result.counts.tenant_modules = (result.counts.tenant_modules ?? 0) + 1;
        continue;
      }
      try {
        await crudCreate("tenant_modules", {
          tenant_id: tenantId,
          module_key: moduleKey,
          enabled: true,
        });
        result.counts.tenant_modules = (result.counts.tenant_modules ?? 0) + 1;
      } catch (err) {
        result.errors.push(
          `tenant_modules[${moduleKey}]: ${describeError(err)}`,
        );
      }
    }

    /* -------------------------------------------------------------- */
    /*  15. OCR Configs (optional)                                     */
    /* -------------------------------------------------------------- */
    if (pack.ocr_configs && pack.ocr_configs.length > 0) {
      progress("Configurando OCR...");
      for (const ocr of pack.ocr_configs) {
        const stepId = ocr.step_ref ? stepRefs[ocr.step_ref] : null;

        try {
          await crudCreate("ocr_config", {
            tenant_id: tenantId,
            workflow_step_id: stepId ?? null,
            name: ocr.name,
            description: ocr.description ?? null,
            document_types: ocr.document_types,
            extract_features: ocr.extract_features,
            lang: ocr.lang ?? "por",
            is_active: ocr.is_active,
          });
          result.counts.ocr_config = (result.counts.ocr_config ?? 0) + 1;
        } catch (err) {
          result.errors.push(`ocr_config[${ocr.name}]: ${describeError(err)}`);
        }
      }
    } else {
      progress("OCR — nenhuma configuração...");
    }

    /* -------------------------------------------------------------- */
    /*  16. Tenant Config Update                                       */
    /* -------------------------------------------------------------- */
    progress("Atualizando configuração do tenant...");
    try {
      // Read current tenant config
      const tenantRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "tenants",
        search_field1: "id",
        search_value1: tenantId,
        search_operator1: "equal",
      });
      const tenants = normalizeCrudList<{
        id: string;
        config: Record<string, unknown>;
      }>(tenantRes.data);
      const tenant = tenants[0];

      if (tenant) {
        // Get first workflow template ID for the tenant's default
        const firstWfKey = pack.workflow_templates[0]?.ref_key;
        const firstWfId = firstWfKey ? workflowTemplateRefs[firstWfKey] : null;

        const currentConfig =
          typeof tenant.config === "object" && tenant.config
            ? tenant.config
            : {};

        const updatedConfig = {
          ...currentConfig,
          specialty: pack.tenant_config.specialty,
          agent_type: pack.tenant_config.agent_type,
          agent_name: pack.tenant_config.agent_name,
          show_price: pack.tenant_config.show_price,
          allow_payment: pack.tenant_config.allow_payment,
          template_pack: pack.metadata.key,
          template_pack_version: pack.metadata.version,
          template_pack_applied_at: new Date().toISOString(),
        };

        await api.post(CRUD_ENDPOINT, {
          action: "update",
          table: "tenants",
          payload: {
            id: tenantId,
            config: updatedConfig,
            ...(firstWfId ? { workflow_template_id: firstWfId } : {}),
          },
        });
        result.counts.tenant_config = 1;
      }
    } catch (err) {
      result.errors.push(`tenant_config: ${describeError(err)}`);
    }

    /* -------------------------------------------------------------- */
    /*  16b. Entity Definitions (optional, before custom fields)       */
    /* -------------------------------------------------------------- */
    const entityRefMap: RefMap = {};
    if (pack.entity_definitions && pack.entity_definitions.length > 0) {
      progress("Criando entidades personalizadas...");
      for (const ed of pack.entity_definitions) {
        try {
          const id = await crudCreate("entity_definitions", {
            tenant_id: tenantId,
            ref_key: ed.ref_key,
            name: ed.name,
            name_plural: ed.name_plural,
            description: ed.description ?? null,
            icon: ed.icon ?? "cube-outline",
            color: ed.color ?? "#6366f1",
            parent_table: ed.parent_table ?? null,
            parent_fk_field: ed.parent_fk_field ?? null,
            is_system: ed.is_system ?? true,
            module_key: ed.module_key ?? null,
            config: ed.config ? JSON.stringify(ed.config) : "{}",
            sort_order: ed.sort_order ?? 0,
          });
          if (id) entityRefMap[ed.ref_key] = id;
          result.counts.entity_definitions =
            (result.counts.entity_definitions ?? 0) + 1;
        } catch (err) {
          result.errors.push(
            `entity_definition[${ed.ref_key}]: ${describeError(err)}`,
          );
        }
      }
    }

    /* -------------------------------------------------------------- */
    /*  17. Custom Field Definitions (optional)                        */
    /* -------------------------------------------------------------- */
    if (pack.custom_fields && pack.custom_fields.length > 0) {
      progress("Aplicando campos customizados...");
      for (const cf of pack.custom_fields) {
        try {
          // Resolve entity_definition_id if target_table is an entity ref (entity::ref_key)
          let entityDefId: string | null = null;
          if (cf.target_table.startsWith("entity::")) {
            const entityRef = cf.target_table.replace("entity::", "");
            entityDefId = entityRefMap[entityRef] ?? null;
          }

          await crudCreate("custom_field_definitions", {
            tenant_id: tenantId,
            target_table: cf.target_table,
            field_key: cf.field_key,
            label: cf.label,
            placeholder: cf.placeholder ?? null,
            field_type: cf.field_type,
            required: cf.required ?? false,
            visible_in_list: cf.visible_in_list ?? false,
            visible_in_form: cf.visible_in_form ?? true,
            read_only: cf.read_only ?? false,
            section: cf.section ?? null,
            sort_order: cf.sort_order ?? 0,
            default_value: cf.default_value ?? null,
            options: cf.options ? JSON.stringify(cf.options) : null,
            validation_rules: cf.validation_rules
              ? JSON.stringify(cf.validation_rules)
              : null,
            mask_type: cf.mask_type ?? null,
            reference_config: cf.reference_config
              ? JSON.stringify(cf.reference_config)
              : null,
            show_when: cf.show_when ? JSON.stringify(cf.show_when) : null,
            is_system: true,
            pack_ref_key: cf.ref_key,
            ...(entityDefId ? { entity_definition_id: entityDefId } : {}),
          });
          result.counts.custom_fields = (result.counts.custom_fields ?? 0) + 1;
        } catch (err) {
          result.errors.push(
            `custom_field[${cf.ref_key}]: ${describeError(err)}`,
          );
        }
      }
    }

    /* ============================================================== */
    /*  AI AGENT ENTITIES (Steps 18-26, only if pack has agents)       */
    /* ============================================================== */

    if (hasAgents && pack.agents) {
      /* ------------------------------------------------------------ */
      /*  18. Agents                                                    */
      /* ------------------------------------------------------------ */
      progress("Criando agentes IA...");
      for (const agent of pack.agents) {
        try {
          const created = await crudCreate<{ id: string }>("agents", {
            tenant_id: tenantId,
            system_prompt: agent.system_prompt,
            model: agent.model,
            temperature: String(agent.temperature),
            max_tokens: String(agent.max_tokens),
            is_default: agent.is_default,
            is_active: agent.is_active,
            version: String(agent.version),
          });
          if (created?.id) {
            agentRefs[agent.ref_key] = created.id;
            result.counts.agents = (result.counts.agents ?? 0) + 1;
          }
        } catch (err) {
          result.errors.push(`agent[${agent.ref_key}]: ${describeError(err)}`);
        }
      }

      /* ------------------------------------------------------------ */
      /*  19. Playbooks                                                 */
      /* ------------------------------------------------------------ */
      if (pack.playbooks?.length) {
        progress("Criando playbooks...");
        for (const pb of pack.playbooks) {
          const agentId = agentRefs[pb.agent_ref];
          if (!agentId) {
            result.errors.push(
              `playbook[${pb.ref_key}]: agent_ref '${pb.agent_ref}' não encontrado`,
            );
            continue;
          }
          try {
            const created = await crudCreate<{ id: string }>(
              "agent_playbooks",
              {
                tenant_id: tenantId,
                agent_id: agentId,
                channel: pb.channel,
                name: pb.name,
                description: pb.description ?? null,
                behavior_source: pb.behavior_source,
                inherit_system_prompt: pb.inherit_system_prompt,
                state_machine_mode: pb.state_machine_mode,
                webhook_url: pb.webhook_url ?? null,
                operator_webhook_url: pb.operator_webhook_url ?? null,
                config_ui: pb.config_ui ? JSON.stringify(pb.config_ui) : null,
                is_active: pb.is_active,
              },
            );
            if (created?.id) {
              playbookRefs[pb.ref_key] = created.id;
              result.counts.playbooks = (result.counts.playbooks ?? 0) + 1;
            }
          } catch (err) {
            result.errors.push(
              `playbook[${pb.ref_key}]: ${describeError(err)}`,
            );
          }
        }
      }

      /* ------------------------------------------------------------ */
      /*  20. Playbook Rules                                            */
      /* ------------------------------------------------------------ */
      if (pack.playbook_rules?.length) {
        progress("Criando regras de playbook...");
        for (const rule of pack.playbook_rules) {
          const playbookId = playbookRefs[rule.playbook_ref];
          if (!playbookId) {
            result.errors.push(
              `playbook_rule[${rule.title}]: playbook_ref '${rule.playbook_ref}' não encontrado`,
            );
            continue;
          }
          try {
            await crudCreate("agent_playbook_rules", {
              tenant_id: tenantId,
              playbook_id: playbookId,
              rule_order: rule.rule_order,
              rule_type: rule.rule_type,
              title: rule.title,
              instruction: rule.instruction,
              severity: rule.severity,
              is_active: rule.is_active,
              metadata: rule.metadata ? JSON.stringify(rule.metadata) : null,
            });
            result.counts.playbook_rules =
              (result.counts.playbook_rules ?? 0) + 1;
          } catch (err) {
            result.errors.push(
              `playbook_rule[${rule.title}]: ${describeError(err)}`,
            );
          }
        }
      }

      /* ------------------------------------------------------------ */
      /*  21. Playbook Tables                                           */
      /* ------------------------------------------------------------ */
      if (pack.playbook_tables?.length) {
        progress("Criando tabelas de playbook...");
        for (const tbl of pack.playbook_tables) {
          const playbookId = playbookRefs[tbl.playbook_ref];
          if (!playbookId) {
            result.errors.push(
              `playbook_table[${tbl.table_name}]: playbook_ref '${tbl.playbook_ref}' não encontrado`,
            );
            continue;
          }
          try {
            await crudCreate("agent_playbook_tables", {
              tenant_id: tenantId,
              playbook_id: playbookId,
              table_name: tbl.table_name,
              access_mode: tbl.access_mode,
              is_required: tbl.is_required,
              purpose: tbl.purpose ?? null,
              query_guardrails: tbl.query_guardrails
                ? JSON.stringify(tbl.query_guardrails)
                : null,
              is_active: tbl.is_active,
            });
            result.counts.playbook_tables =
              (result.counts.playbook_tables ?? 0) + 1;
          } catch (err) {
            result.errors.push(
              `playbook_table[${tbl.table_name}]: ${describeError(err)}`,
            );
          }
        }
      }

      /* ------------------------------------------------------------ */
      /*  22. Agent States                                              */
      /* ------------------------------------------------------------ */
      if (pack.agent_states?.length) {
        progress("Criando estados do agente...");
        for (const state of pack.agent_states) {
          const agentId = agentRefs[state.agent_ref];
          if (!agentId) {
            result.errors.push(
              `agent_state[${state.ref_key}]: agent_ref '${state.agent_ref}' não encontrado`,
            );
            continue;
          }
          try {
            const created = await crudCreate<{ id: string }>("agent_states", {
              tenant_id: tenantId,
              agent_id: agentId,
              state_key: state.state_key,
              state_label: state.state_label,
              system_prompt: state.system_prompt,
              rules: state.rules ? JSON.stringify(state.rules) : null,
              tools: state.tools ? JSON.stringify(state.tools) : null,
              is_initial: state.is_initial,
              is_terminal: state.is_terminal,
            });
            if (created?.id) {
              agentStateRefs[state.ref_key] = created.id;
              result.counts.agent_states =
                (result.counts.agent_states ?? 0) + 1;
            }
          } catch (err) {
            result.errors.push(
              `agent_state[${state.ref_key}]: ${describeError(err)}`,
            );
          }
        }
      }

      /* ------------------------------------------------------------ */
      /*  23. Agent State Steps                                         */
      /* ------------------------------------------------------------ */
      if (pack.agent_state_steps?.length) {
        progress("Criando passos de estado...");
        for (const step of pack.agent_state_steps) {
          const agentId = agentRefs[step.agent_ref];
          const stateId = agentStateRefs[step.state_ref];
          if (!agentId || !stateId) {
            result.errors.push(
              `agent_state_step[${step.step_key}]: agent_ref ou state_ref não encontrado`,
            );
            continue;
          }
          try {
            await crudCreate("agent_state_steps", {
              tenant_id: tenantId,
              agent_id: agentId,
              state_id: stateId,
              step_key: step.step_key,
              step_label: step.step_label,
              step_order: step.step_order,
              instruction: step.instruction,
              expected_inputs: step.expected_inputs
                ? JSON.stringify(step.expected_inputs)
                : null,
              expected_outputs: step.expected_outputs
                ? JSON.stringify(step.expected_outputs)
                : null,
              allowed_tables: step.allowed_tables
                ? JSON.stringify(step.allowed_tables)
                : null,
              on_success_action: step.on_success_action ?? null,
              on_failure_action: step.on_failure_action ?? null,
              handoff_to_operator: step.handoff_to_operator,
              return_to_bot_allowed: step.return_to_bot_allowed,
              is_active: step.is_active,
            });
            result.counts.agent_state_steps =
              (result.counts.agent_state_steps ?? 0) + 1;
          } catch (err) {
            result.errors.push(
              `agent_state_step[${step.step_key}]: ${describeError(err)}`,
            );
          }
        }
      }

      /* ------------------------------------------------------------ */
      /*  24. Channel Bindings                                          */
      /* ------------------------------------------------------------ */
      if (pack.channel_bindings?.length) {
        progress("Criando bindings de canal...");
        for (const cb of pack.channel_bindings) {
          const agentId = agentRefs[cb.agent_ref];
          if (!agentId) {
            result.errors.push(
              `channel_binding[${cb.channel}]: agent_ref '${cb.agent_ref}' não encontrado`,
            );
            continue;
          }
          try {
            await crudCreate("agent_channel_bindings", {
              tenant_id: tenantId,
              agent_id: agentId,
              channel: cb.channel,
              webhook_url: cb.webhook_url ?? null,
              is_active: cb.is_active,
              config: cb.config ? JSON.stringify(cb.config) : null,
            });
            result.counts.channel_bindings =
              (result.counts.channel_bindings ?? 0) + 1;
          } catch (err) {
            result.errors.push(
              `channel_binding[${cb.channel}]: ${describeError(err)}`,
            );
          }
        }
      }

      /* ------------------------------------------------------------ */
      /*  25. Handoff Policies                                          */
      /* ------------------------------------------------------------ */
      if (pack.handoff_policies?.length) {
        progress("Criando políticas de handoff...");
        for (const hp of pack.handoff_policies) {
          const agentId = agentRefs[hp.agent_ref];
          if (!agentId) {
            result.errors.push(
              `handoff_policy[${hp.from_channel}→${hp.to_channel}]: agent_ref '${hp.agent_ref}' não encontrado`,
            );
            continue;
          }
          const playbookId = hp.playbook_ref
            ? (playbookRefs[hp.playbook_ref] ?? null)
            : null;
          try {
            await crudCreate("agent_handoff_policies", {
              tenant_id: tenantId,
              agent_id: agentId,
              playbook_id: playbookId,
              from_channel: hp.from_channel,
              to_channel: hp.to_channel,
              trigger_type: hp.trigger_type,
              trigger_config: hp.trigger_config
                ? JSON.stringify(hp.trigger_config)
                : null,
              pause_bot_while_operator: hp.pause_bot_while_operator,
              operator_can_return_to_bot: hp.operator_can_return_to_bot,
              return_to_state_key: hp.return_to_state_key ?? null,
              is_active: hp.is_active,
            });
            result.counts.handoff_policies =
              (result.counts.handoff_policies ?? 0) + 1;
          } catch (err) {
            result.errors.push(
              `handoff_policy[${hp.from_channel}→${hp.to_channel}]: ${describeError(err)}`,
            );
          }
        }
      }

      /* ------------------------------------------------------------ */
      /*  26. Automations                                               */
      /* ------------------------------------------------------------ */
      if (pack.automations?.length) {
        progress("Criando automações...");
        for (const auto of pack.automations) {
          const agentId = agentRefs[auto.agent_ref];
          if (!agentId) {
            result.errors.push(
              `automation[${auto.trigger}]: agent_ref '${auto.agent_ref}' não encontrado`,
            );
            continue;
          }
          try {
            await crudCreate("automations", {
              tenant_id: tenantId,
              agent_id: agentId,
              trigger: auto.trigger,
              action: auto.action,
              config: auto.config ? JSON.stringify(auto.config) : null,
            });
            result.counts.automations = (result.counts.automations ?? 0) + 1;
          } catch (err) {
            result.errors.push(
              `automation[${auto.trigger}]: ${describeError(err)}`,
            );
          }
        }
      }
    }

    result.success = result.errors.length === 0;
  } catch (err) {
    result.errors.push(`fatal: ${describeError(err)}`);
  }

  return result;
}

/* ================================================================== */
/*  Clear Pack Data                                                    */
/* ================================================================== */

/**
 * Soft-delete all pack-seeded data for a tenant.
 * This allows re-applying a pack from scratch.
 *
 * Tables cleared (in reverse dependency order):
 * custom_field_definitions, ocr_config, services, tenant_modules,
 * document_templates, step_forms, step_task_templates, deadline_rules,
 * workflow_step_transitions, workflow_steps (via templates),
 * service_types, service_categories, roles + role_permissions,
 * workflow_templates
 *
 * Does NOT delete: users, customers, service_orders, process data
 */
export async function clearPackData(tenantId: string): Promise<{
  success: boolean;
  deletedCounts: Record<string, number>;
  errors: string[];
}> {
  const deletedCounts: Record<string, number> = {};
  const errors: string[] = [];

  // 1. Clear agent-related tables first (reverse dependency order)
  const agentTables = [
    "automations",
    "agent_handoff_policies",
    "agent_channel_bindings",
    "agent_state_steps",
    "agent_states",
    "agent_playbook_tables",
    "agent_playbook_rules",
    "agent_playbooks",
    "agents",
  ];

  for (const table of agentTables) {
    try {
      const listRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table,
        ...buildSearchParams([{ field: "tenant_id", value: tenantId }]),
      });
      const rows = normalizeCrudList<{ id: string }>(listRes.data);
      let count = 0;
      for (const row of rows) {
        try {
          await api.post(CRUD_ENDPOINT, {
            action: "delete",
            table,
            payload: { id: row.id },
          });
          count++;
        } catch {
          // ignore individual delete failures
        }
      }
      if (count > 0) deletedCounts[table] = count;
    } catch {
      // table may not exist — skip silently
    }
  }

  // 2. Delegate remaining (non-agent) clearing to server endpoint
  try {
    const res = await api.post("/template-packs/clear", { tenantId });
    const data = res.data as {
      success: boolean;
      deletedCounts: Record<string, number>;
      errors: string[];
    };
    // Merge server counts
    for (const [table, count] of Object.entries(data.deletedCounts ?? {})) {
      deletedCounts[table] = (deletedCounts[table] ?? 0) + count;
    }
    if (data.errors?.length) errors.push(...data.errors);

    return {
      success: (data.success ?? false) && errors.length === 0,
      deletedCounts,
      errors,
    };
  } catch (err) {
    return {
      success: false,
      deletedCounts,
      errors: [`clearPackData: ${describeError(err)}`],
    };
  }
}

/* ================================================================== */
/*  Validation                                                         */
/* ================================================================== */

/**
 * Validate a template pack for structural consistency.
 * Checks that all ref_keys are unique and all cross-references resolve.
 */
export function validatePack(pack: TemplatePack): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Collect all ref_keys
  const categoryRefs = new Set(pack.service_categories.map((c) => c.ref_key));
  const serviceTypeRefs = new Set(pack.service_types.map((s) => s.ref_key));
  const workflowRefs = new Set(pack.workflow_templates.map((w) => w.ref_key));
  const stepRefs = collectAllStepRefs(pack.workflow_templates);
  const roleRefs = new Set(pack.roles.map((r) => r.ref_key));

  // Check for duplicate ref_keys
  const allRefs = [
    ...pack.service_categories.map((c) => c.ref_key),
    ...pack.service_types.map((s) => s.ref_key),
    ...pack.workflow_templates.map((w) => w.ref_key),
    ...pack.workflow_templates.flatMap((w) => w.steps.map((s) => s.ref_key)),
    ...pack.roles.map((r) => r.ref_key),
    ...pack.document_templates.map((d) => d.ref_key),
  ];
  const seen = new Set<string>();
  for (const ref of allRefs) {
    if (seen.has(ref)) errors.push(`Duplicate ref_key: ${ref}`);
    seen.add(ref);
  }

  // Validate service_types → category_ref
  for (const st of pack.service_types) {
    if (!categoryRefs.has(st.category_ref)) {
      errors.push(
        `service_type[${st.ref_key}].category_ref '${st.category_ref}' not found`,
      );
    }
    if (st.workflow_ref && !workflowRefs.has(st.workflow_ref)) {
      errors.push(
        `service_type[${st.ref_key}].workflow_ref '${st.workflow_ref}' not found`,
      );
    }
  }

  // Validate workflow transitions → step refs
  for (const wf of pack.workflow_templates) {
    if (wf.service_type_ref && !serviceTypeRefs.has(wf.service_type_ref)) {
      errors.push(
        `workflow[${wf.ref_key}].service_type_ref '${wf.service_type_ref}' not found`,
      );
    }
    for (const tr of wf.transitions) {
      if (!stepRefs.has(tr.from_step_ref)) {
        errors.push(
          `transition[${wf.ref_key}].from_step_ref '${tr.from_step_ref}' not found`,
        );
      }
      if (!stepRefs.has(tr.to_step_ref)) {
        errors.push(
          `transition[${wf.ref_key}].to_step_ref '${tr.to_step_ref}' not found`,
        );
      }
    }
  }

  // Validate deadline_rules → step refs
  for (const dr of pack.deadline_rules) {
    if (!stepRefs.has(dr.step_ref)) {
      errors.push(`deadline_rule.step_ref '${dr.step_ref}' not found`);
    }
  }

  // Validate step_task_templates → step refs + role refs
  for (const task of pack.step_task_templates) {
    if (!stepRefs.has(task.step_ref)) {
      errors.push(
        `step_task_template[${task.title}].step_ref '${task.step_ref}' not found`,
      );
    }
    if (task.assigned_role_ref && !roleRefs.has(task.assigned_role_ref)) {
      errors.push(
        `step_task_template[${task.title}].assigned_role_ref '${task.assigned_role_ref}' not found`,
      );
    }
  }

  // Validate step_forms → step refs
  for (const form of pack.step_forms) {
    if (!stepRefs.has(form.step_ref)) {
      errors.push(
        `step_form[${form.name}].step_ref '${form.step_ref}' not found`,
      );
    }
  }

  // Validate services → type refs
  for (const svc of pack.services) {
    if (!serviceTypeRefs.has(svc.type_ref)) {
      errors.push(`service[${svc.name}].type_ref '${svc.type_ref}' not found`);
    }
  }

  // Validate ocr_configs → step refs
  if (pack.ocr_configs) {
    for (const ocr of pack.ocr_configs) {
      if (ocr.step_ref && !stepRefs.has(ocr.step_ref)) {
        errors.push(
          `ocr_config[${ocr.name}].step_ref '${ocr.step_ref}' not found`,
        );
      }
    }
  }

  // Validate custom_fields — unique ref_keys + unique field_key per table
  if (pack.custom_fields) {
    const cfSeen = new Set<string>();
    const fieldKeysByTable = new Map<string, Set<string>>();
    const entityDefRefs = new Set(
      (pack.entity_definitions ?? []).map((e) => e.ref_key),
    );

    for (const cf of pack.custom_fields) {
      // ref_key uniqueness (also checked against global seen set)
      if (seen.has(cf.ref_key)) {
        errors.push(`Duplicate ref_key: ${cf.ref_key} (custom_field)`);
      }
      seen.add(cf.ref_key);

      if (cfSeen.has(cf.ref_key)) {
        errors.push(`Duplicate custom_field ref_key: ${cf.ref_key}`);
      }
      cfSeen.add(cf.ref_key);

      // field_key uniqueness per target_table
      if (!fieldKeysByTable.has(cf.target_table)) {
        fieldKeysByTable.set(cf.target_table, new Set());
      }
      const tableKeys = fieldKeysByTable.get(cf.target_table)!;
      if (tableKeys.has(cf.field_key)) {
        errors.push(
          `custom_field[${cf.ref_key}]: duplicate field_key '${cf.field_key}' for table '${cf.target_table}'`,
        );
      }
      tableKeys.add(cf.field_key);

      // Validate entity:: target_table references
      if (cf.target_table.startsWith("entity::")) {
        const entityRef = cf.target_table.replace("entity::", "");
        if (!entityDefRefs.has(entityRef)) {
          errors.push(
            `custom_field[${cf.ref_key}]: entity target '${entityRef}' not found in entity_definitions`,
          );
        }
      }

      // Validate required fields
      if (!cf.target_table) {
        errors.push(`custom_field[${cf.ref_key}]: missing target_table`);
      }
      if (!cf.field_key) {
        errors.push(`custom_field[${cf.ref_key}]: missing field_key`);
      }
      if (!cf.field_type) {
        errors.push(`custom_field[${cf.ref_key}]: missing field_type`);
      }
    }
  }

  // Validate entity_definitions — unique ref_keys
  if (pack.entity_definitions) {
    const edSeen = new Set<string>();
    for (const ed of pack.entity_definitions) {
      if (seen.has(ed.ref_key)) {
        errors.push(`Duplicate ref_key: ${ed.ref_key} (entity_definition)`);
      }
      seen.add(ed.ref_key);

      if (edSeen.has(ed.ref_key)) {
        errors.push(`Duplicate entity_definition ref_key: ${ed.ref_key}`);
      }
      edSeen.add(ed.ref_key);

      if (!ed.name) {
        errors.push(`entity_definition[${ed.ref_key}]: missing name`);
      }
    }
  }

  // ── Agent entity validation ──
  const agentRefSet = new Set<string>();
  const playbookRefSet = new Set<string>();
  const agentStateRefSet = new Set<string>();

  if (pack.agents) {
    for (const a of pack.agents) {
      if (seen.has(a.ref_key))
        errors.push(`Duplicate ref_key: ${a.ref_key} (agent)`);
      seen.add(a.ref_key);
      agentRefSet.add(a.ref_key);
    }
  }

  if (pack.playbooks) {
    for (const p of pack.playbooks) {
      if (seen.has(p.ref_key))
        errors.push(`Duplicate ref_key: ${p.ref_key} (playbook)`);
      seen.add(p.ref_key);
      playbookRefSet.add(p.ref_key);
      if (!agentRefSet.has(p.agent_ref)) {
        errors.push(
          `playbook[${p.ref_key}].agent_ref '${p.agent_ref}' not found`,
        );
      }
    }
  }

  if (pack.playbook_rules) {
    for (const r of pack.playbook_rules) {
      if (!playbookRefSet.has(r.playbook_ref)) {
        errors.push(
          `playbook_rule[${r.rule_type}].playbook_ref '${r.playbook_ref}' not found`,
        );
      }
    }
  }

  if (pack.playbook_tables) {
    for (const t of pack.playbook_tables) {
      if (!playbookRefSet.has(t.playbook_ref)) {
        errors.push(
          `playbook_table[${t.table_name}].playbook_ref '${t.playbook_ref}' not found`,
        );
      }
    }
  }

  if (pack.agent_states) {
    for (const s of pack.agent_states) {
      if (seen.has(s.ref_key))
        errors.push(`Duplicate ref_key: ${s.ref_key} (agent_state)`);
      seen.add(s.ref_key);
      agentStateRefSet.add(s.ref_key);
      if (!agentRefSet.has(s.agent_ref)) {
        errors.push(
          `agent_state[${s.ref_key}].agent_ref '${s.agent_ref}' not found`,
        );
      }
    }
  }

  if (pack.agent_state_steps) {
    for (const ss of pack.agent_state_steps) {
      if (!agentStateRefSet.has(ss.state_ref)) {
        errors.push(`agent_state_step.state_ref '${ss.state_ref}' not found`);
      }
      if (!agentRefSet.has(ss.agent_ref)) {
        errors.push(`agent_state_step.agent_ref '${ss.agent_ref}' not found`);
      }
    }
  }

  if (pack.channel_bindings) {
    for (const cb of pack.channel_bindings) {
      if (!agentRefSet.has(cb.agent_ref)) {
        errors.push(
          `channel_binding[${cb.channel}].agent_ref '${cb.agent_ref}' not found`,
        );
      }
    }
  }

  if (pack.handoff_policies) {
    for (let i = 0; i < pack.handoff_policies.length; i++) {
      const hp = pack.handoff_policies[i];
      if (!agentRefSet.has(hp.agent_ref)) {
        errors.push(
          `handoff_policy[${i}].agent_ref '${hp.agent_ref}' not found`,
        );
      }
      if (hp.playbook_ref && !playbookRefSet.has(hp.playbook_ref)) {
        errors.push(
          `handoff_policy[${i}].playbook_ref '${hp.playbook_ref}' not found`,
        );
      }
    }
  }

  if (pack.automations) {
    for (let i = 0; i < pack.automations.length; i++) {
      const auto = pack.automations[i];
      if (!agentRefSet.has(auto.agent_ref)) {
        errors.push(`automation[${i}].agent_ref '${auto.agent_ref}' not found`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
