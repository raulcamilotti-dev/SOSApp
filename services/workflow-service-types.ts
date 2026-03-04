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

/* ═══════════════════════════════════════════════════════
 * CAMPAIGNS — Same pattern as service types but for CRM scope.
 * campaigns.default_template_id → workflow_templates(id)
 * ═══════════════════════════════════════════════════════ */

export interface CampaignWorkflowLink {
  id: string;
  tenant_id: string;
  name: string;
  channel: string | null;
  status: string | null;
  default_template_id: string | null;
  /** True when this campaign's default_template_id points to the target workflow */
  is_linked: boolean;
  /** When linked to a DIFFERENT workflow, stores that workflow's name for display */
  other_workflow_name: string | null;
}

/**
 * List all campaigns for a tenant, annotated with link status to a specific workflow.
 */
export async function listCampaignsForWorkflow(
  tenantId: string,
  workflowTemplateId: string,
): Promise<CampaignWorkflowLink[]> {
  const [campRes, wtRes] = await Promise.all([
    api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "campaigns",
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

  const campaigns = normalizeCrudList<Record<string, unknown>>(campRes.data);
  const workflows = normalizeCrudList<Record<string, unknown>>(wtRes.data);

  const workflowNameMap = new Map<string, string>();
  for (const wt of workflows) {
    const wtId = String(wt.id ?? "");
    if (wtId) workflowNameMap.set(wtId, String(wt.name ?? ""));
  }

  return campaigns.map((c) => {
    const currentTemplateId = String(c.default_template_id ?? "");
    const isLinked = currentTemplateId === workflowTemplateId;
    const hasOtherWorkflow =
      !isLinked && currentTemplateId && currentTemplateId !== "";

    return {
      id: String(c.id ?? ""),
      tenant_id: String(c.tenant_id ?? ""),
      name: String(c.name ?? ""),
      channel: (c.channel as string) ?? null,
      status: (c.status as string) ?? null,
      default_template_id: currentTemplateId || null,
      is_linked: isLinked,
      other_workflow_name: hasOtherWorkflow
        ? (workflowNameMap.get(currentTemplateId) ?? null)
        : null,
    };
  });
}

/**
 * Link a campaign to a workflow — sets campaigns.default_template_id.
 */
export async function linkCampaignToWorkflow(
  campaignId: string,
  workflowTemplateId: string,
): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "campaigns",
    payload: {
      id: campaignId,
      default_template_id: workflowTemplateId,
    },
  });
}

/**
 * Unlink a campaign from a workflow — clears campaigns.default_template_id.
 */
export async function unlinkCampaignFromWorkflow(
  campaignId: string,
): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "campaigns",
    payload: {
      id: campaignId,
      default_template_id: null,
    },
  });
}

/**
 * Toggle a campaign's link to a workflow.
 */
export async function toggleCampaignWorkflowLink(
  campaignId: string,
  workflowTemplateId: string,
  active: boolean,
): Promise<void> {
  if (active) {
    await linkCampaignToWorkflow(campaignId, workflowTemplateId);
  } else {
    await unlinkCampaignFromWorkflow(campaignId);
  }
}

/**
 * Count how many campaigns are linked to a specific workflow.
 */
export async function countLinkedCampaigns(
  tenantId: string,
  workflowTemplateId: string,
): Promise<number> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "campaigns",
    ...buildSearchParams(
      [
        { field: "tenant_id", value: tenantId },
        { field: "default_template_id", value: workflowTemplateId },
      ],
      { autoExcludeDeleted: true },
    ),
  });
  return normalizeCrudList(res.data).length;
}

/* ═══════════════════════════════════════════════════════
 * SCOPE-AWARE GENERIC INTERFACE
 * Used by ServicosWorkflow.tsx to handle any scope uniformly.
 * ═══════════════════════════════════════════════════════ */

/** Unified entity type for the toggle screen — works for any scope */
export interface EntityWorkflowLink {
  id: string;
  tenant_id: string;
  name: string;
  subtitle: string | null;
  icon: string | null;
  color: string | null;
  default_template_id: string | null;
  is_linked: boolean;
  other_workflow_name: string | null;
}

/** Scope configuration for the entity-workflow linking screen */
export interface ScopeEntityConfig {
  /** Title for the screen header */
  title: string;
  /** Subtitle prefix (e.g. "Campanhas", "Tipos de Serviço") */
  entityLabel: string;
  /** Singular entity name for confirmation dialogs */
  entitySingular: string;
  /** Search placeholder */
  searchPlaceholder: string;
  /** Empty state message */
  emptyMessage: string;
  /** Load entities annotated with link status */
  load: (
    tenantId: string,
    workflowTemplateId: string,
  ) => Promise<EntityWorkflowLink[]>;
  /** Toggle entity link */
  toggle: (
    entityId: string,
    workflowTemplateId: string,
    active: boolean,
  ) => Promise<void>;
}

/** Convert ServiceTypeWorkflowLink to generic EntityWorkflowLink */
function serviceTypeToEntity(st: ServiceTypeWorkflowLink): EntityWorkflowLink {
  return {
    id: st.id,
    tenant_id: st.tenant_id,
    name: st.name,
    subtitle: st.description,
    icon: st.icon,
    color: st.color,
    default_template_id: st.default_template_id,
    is_linked: st.is_linked,
    other_workflow_name: st.other_workflow_name,
  };
}

/** Convert CampaignWorkflowLink to generic EntityWorkflowLink */
function campaignToEntity(c: CampaignWorkflowLink): EntityWorkflowLink {
  return {
    id: c.id,
    tenant_id: c.tenant_id,
    name: c.name,
    subtitle: [c.channel, c.status].filter(Boolean).join(" · ") || null,
    icon: null,
    color: null,
    default_template_id: c.default_template_id,
    is_linked: c.is_linked,
    other_workflow_name: c.other_workflow_name,
  };
}

/**
 * Get scope configuration for the entity-workflow linking screen.
 * Returns null for scopes that don't have entity linking (e.g. administrative).
 */
export function getScopeEntityConfig(scope: string): ScopeEntityConfig | null {
  switch (scope) {
    case "operational":
      return {
        title: "Tipos de Serviço do Workflow",
        entityLabel: "Tipos de Serviço",
        entitySingular: "tipo de serviço",
        searchPlaceholder: "Buscar tipos de serviço...",
        emptyMessage: "Nenhum tipo de serviço cadastrado.",
        load: async (tenantId, workflowTemplateId) => {
          const list = await listServiceTypesForWorkflow(
            tenantId,
            workflowTemplateId,
          );
          return list.map(serviceTypeToEntity);
        },
        toggle: toggleServiceTypeWorkflowLink,
      };

    case "stock":
      return {
        title: "Tipos de Produto do Workflow",
        entityLabel: "Tipos de Produto",
        entitySingular: "tipo de produto",
        searchPlaceholder: "Buscar tipos de produto...",
        emptyMessage: "Nenhum tipo de produto cadastrado.",
        load: async (tenantId, workflowTemplateId) => {
          const list = await listServiceTypesForWorkflow(
            tenantId,
            workflowTemplateId,
          );
          return list.map(serviceTypeToEntity);
        },
        toggle: toggleServiceTypeWorkflowLink,
      };

    case "crm":
      return {
        title: "Campanhas do Workflow",
        entityLabel: "Campanhas",
        entitySingular: "campanha",
        searchPlaceholder: "Buscar campanhas...",
        emptyMessage: "Nenhuma campanha cadastrada.",
        load: async (tenantId, workflowTemplateId) => {
          const list = await listCampaignsForWorkflow(
            tenantId,
            workflowTemplateId,
          );
          return list.map(campaignToEntity);
        },
        toggle: toggleCampaignWorkflowLink,
      };

    case "administrative":
    default:
      return null;
  }
}

/**
 * Count linked entities for a workflow, scope-aware.
 * Returns 0 for scopes that don't support entity linking.
 */
export async function countLinkedEntities(
  tenantId: string,
  workflowTemplateId: string,
  scope: string,
): Promise<number> {
  switch (scope) {
    case "operational":
    case "stock":
      return countLinkedServiceTypes(tenantId, workflowTemplateId);
    case "crm":
      return countLinkedCampaigns(tenantId, workflowTemplateId);
    default:
      return 0;
  }
}
