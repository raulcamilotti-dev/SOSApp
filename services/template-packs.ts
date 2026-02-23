/* ------------------------------------------------------------------ */
/*  Template Pack — Apply Service                                      */
/*                                                                     */
/*  Applies a template pack to a tenant, creating all entities in the  */
/*  correct dependency order. Uses api_crud for individual inserts     */
/*  and api_dinamico for batch operations or permission lookups.       */
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
/* ------------------------------------------------------------------ */

import type {
    PackWorkflowTemplate,
    TemplatePack,
} from "@/data/template-packs/types";
import { api } from "./api";
import { CRUD_ENDPOINT, normalizeCrudList } from "./crud";

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

/** Execute raw SQL via api_dinamico. */
async function execSQL(sql: string): Promise<unknown[]> {
  const res = await api.post("api_dinamico", { sql });
  return Array.isArray(res.data) ? res.data : [];
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

  const totalSteps = 16;
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
 * ocr_config, services, tenant_modules, document_templates,
 * step_forms, step_task_templates, deadline_rules,
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
  const errors: string[] = [];
  const deletedCounts: Record<string, number> = {};
  const now = new Date().toISOString();

  const softDeleteTable = async (table: string, extraWhere = "") => {
    try {
      const sql = `UPDATE "${table}" SET deleted_at = '${now}' WHERE tenant_id = '${tenantId}' AND deleted_at IS NULL ${extraWhere}`;
      const res = await execSQL(sql);
      deletedCounts[table] = Array.isArray(res)
        ? ((res as { count?: number }[])[0]?.count ?? 0)
        : 0;
    } catch (err) {
      errors.push(`clear ${table}: ${describeError(err)}`);
    }
  };

  // Tables with tenant_id and deleted_at
  const tablesToClear = [
    "ocr_config",
    "services",
    "tenant_modules",
    "document_templates",
    "step_forms",
    "step_task_templates",
    "deadline_rules",
    "workflow_step_transitions",
    "service_types",
    "service_categories",
    "roles",
    "workflow_templates",
  ];

  for (const table of tablesToClear) {
    await softDeleteTable(table);
  }

  return { success: errors.length === 0, deletedCounts, errors };
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

  return { valid: errors.length === 0, errors };
}
