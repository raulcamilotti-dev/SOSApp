/**
 * Workflow Service Types — Manage which service types are linked to each workflow template.
 *
 * Uses existing FK: service_types.default_template_id → workflow_templates(id)
 * No junction table needed — toggling updates the FK on service_types directly.
 *
 * Pattern analogous to partner-services.ts but simpler (no junction table).
 */

import { api } from "./api";
import { buildSearchParams, CRUD_ENDPOINT, normalizeCrudList } from "./crud";

/* ───────── Types ───────── */

export interface ServiceTypeWorkflowLink {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  category_id: string | null;
  is_active: boolean;
  default_template_id: string | null;
  /** True when this service type's default_template_id points to the target workflow */
  is_linked: boolean;
  /** When linked to a DIFFERENT workflow, stores that workflow's name for display */
  other_workflow_name: string | null;
}

/* ───────── Helpers ───────── */

/**
 * List all active service types for a tenant, annotated with link status to a specific workflow.
 * Also resolves the name of any "other" workflow a service type is currently linked to.
 */
export async function listServiceTypesForWorkflow(
  tenantId: string,
  workflowTemplateId: string,
): Promise<ServiceTypeWorkflowLink[]> {
  // Fetch service types and all workflows in parallel
  const [stRes, wtRes] = await Promise.all([
    api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "service_types",
      ...buildSearchParams([{ field: "tenant_id", value: tenantId }], {
        autoExcludeDeleted: true,
        sortColumn: "name",
      }),
    }),
    api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "workflow_templates",
      ...buildSearchParams([{ field: "tenant_id", value: tenantId }], {
        autoExcludeDeleted: true,
      }),
    }),
  ]);

  const serviceTypes = normalizeCrudList<Record<string, unknown>>(stRes.data);
  const workflows = normalizeCrudList<Record<string, unknown>>(wtRes.data);

  // Build a map of workflow ID → name for resolving "other" workflow names
  const workflowNameMap = new Map<string, string>();
  for (const wt of workflows) {
    const wtId = String(wt.id ?? "");
    if (wtId) workflowNameMap.set(wtId, String(wt.name ?? ""));
  }

  return serviceTypes
    .filter((st) => st.is_active !== false)
    .map((st) => {
      const currentTemplateId = String(st.default_template_id ?? "");
      const isLinked = currentTemplateId === workflowTemplateId;
      const hasOtherWorkflow =
        !isLinked && currentTemplateId && currentTemplateId !== "";

      return {
        id: String(st.id ?? ""),
        tenant_id: String(st.tenant_id ?? ""),
        name: String(st.name ?? ""),
        description: (st.description as string) ?? null,
        icon: (st.icon as string) ?? null,
        color: (st.color as string) ?? null,
        category_id: (st.category_id as string) ?? null,
        is_active: st.is_active !== false,
        default_template_id: currentTemplateId || null,
        is_linked: isLinked,
        other_workflow_name: hasOtherWorkflow
          ? (workflowNameMap.get(currentTemplateId) ?? null)
          : null,
      };
    });
}

/**
 * Link a service type to a workflow — sets service_types.default_template_id.
 * Also syncs workflow_templates.service_type_id when the workflow has no service_type_id yet.
 */
export async function linkServiceTypeToWorkflow(
  serviceTypeId: string,
  workflowTemplateId: string,
): Promise<void> {
  // Update service_types.default_template_id
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "service_types",
    payload: {
      id: serviceTypeId,
      default_template_id: workflowTemplateId,
    },
  });

  // Best-effort: also set workflow_templates.service_type_id if it's null
  try {
    const wtRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "workflow_templates",
      ...buildSearchParams([{ field: "id", value: workflowTemplateId }]),
    });
    const wt = normalizeCrudList<Record<string, unknown>>(wtRes.data)[0];
    if (wt && !wt.service_type_id) {
      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "workflow_templates",
        payload: {
          id: workflowTemplateId,
          service_type_id: serviceTypeId,
        },
      });
    }
  } catch {
    // Non-critical — workflow_templates.service_type_id is secondary
  }
}

/**
 * Unlink a service type from a workflow — clears service_types.default_template_id.
 */
export async function unlinkServiceTypeFromWorkflow(
  serviceTypeId: string,
): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "service_types",
    payload: {
      id: serviceTypeId,
      default_template_id: null,
    },
  });
}

/**
 * Toggle a service type's link to a workflow (like togglePartnerService).
 */
export async function toggleServiceTypeWorkflowLink(
  serviceTypeId: string,
  workflowTemplateId: string,
  active: boolean,
): Promise<void> {
  if (active) {
    await linkServiceTypeToWorkflow(serviceTypeId, workflowTemplateId);
  } else {
    await unlinkServiceTypeFromWorkflow(serviceTypeId);
  }
}

/**
 * Count how many service types are linked to a specific workflow.
 */
export async function countLinkedServiceTypes(
  tenantId: string,
  workflowTemplateId: string,
): Promise<number> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "service_types",
    ...buildSearchParams(
      [
        { field: "tenant_id", value: tenantId },
        { field: "default_template_id", value: workflowTemplateId },
      ],
      { autoExcludeDeleted: true },
    ),
  });
  return normalizeCrudList(res.data).filter(
    (r) => (r as any).is_active !== false,
  ).length;
}
