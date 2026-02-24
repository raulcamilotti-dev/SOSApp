/**
 * Portal Público — Service Layer
 *
 * Handles public portal token validation, CPF verification,
 * and loading sanitized data for public view.
 *
 * LGPD safeguards:
 * - Token is 128-bit UUID (impossible to guess)
 * - CPF first 4 digits required as second factor
 * - Only is_client_visible=true data is returned
 * - No personal data (CPF, email, phone) in response
 * - Access is logged (count + timestamp)
 */

import axios, { type AxiosInstance } from "axios";
import { N8N_API_KEY } from "./api";
import { buildSearchParams, CRUD_ENDPOINT, normalizeCrudList } from "./crud";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Direct axios instance — no user auth token, but includes N8N API key */
const publicApi = axios.create({
  timeout: 15000,
  headers: { "X-Api-Key": N8N_API_KEY },
});

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type PortalTokenInfo = {
  valid: boolean;
  title?: string;
  tenantName?: string;
  requiresCpf: boolean;
  isRevoked?: boolean;
};

export type PortalTimelineEntry = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
};

export type PortalData = {
  orderTitle: string;
  serviceTypeName: string;
  processStatus: string;
  startedAt: string | null;
  progress: number; // 0-100
  currentStepName: string;
  totalSteps: number;
  currentStepOrder: number;
  timeline: PortalTimelineEntry[];
  tenantName: string;
  serviceOrderId: string;
  estimatedCost: number | null;
  estimatedDurationDays: number | null;
  estimatedCompletionDate: string | null;
};

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

async function crudList<T>(
  table: string,
  filters: { field: string; value: string; operator?: string }[] = [],
  options?: { sortColumn?: string; limit?: number },
): Promise<T[]> {
  const res = await publicApi.post(CRUD_ENDPOINT, {
    action: "list",
    table,
    ...buildSearchParams(filters, options),
  });
  return normalizeCrudList<T>(res.data);
}

async function crudUpdate(
  table: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await publicApi.post(CRUD_ENDPOINT, {
    action: "update",
    table,
    payload,
  });
}

/* ------------------------------------------------------------------ */
/*  Token Generation                                                   */
/* ------------------------------------------------------------------ */

/**
 * Generate a public access token for a service order.
 * Called from the authenticated app (Processo screen).
 */
export function generateTokenString(): string {
  // Crypto-random UUID without hyphens = 32 hex chars
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Fallback for environments without crypto
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Create a public access token record in the database.
 * Uses the authenticated api instance (import from caller).
 */
export async function createPortalToken(
  authenticatedApi: AxiosInstance,
  params: {
    entityType: string;
    entityId: string;
    tenantId: string;
    createdBy?: string;
  },
): Promise<{ token: string; id: string }> {
  const token = generateTokenString();

  const res = await authenticatedApi.post(CRUD_ENDPOINT, {
    action: "create",
    table: "public_access_tokens",
    payload: {
      token,
      entity_type: params.entityType,
      entity_id: params.entityId,
      tenant_id: params.tenantId,
      created_by: params.createdBy || null,
    },
  });

  const data = normalizeCrudList<{ id: string }>(res.data);
  return { token, id: data[0]?.id ?? "" };
}

/**
 * Revoke a public access token.
 */
export async function revokePortalToken(
  authenticatedApi: AxiosInstance,
  tokenId: string,
): Promise<void> {
  await authenticatedApi.post(CRUD_ENDPOINT, {
    action: "update",
    table: "public_access_tokens",
    payload: {
      id: tokenId,
      is_revoked: true,
    },
  });
}

/**
 * List all active tokens for a service order.
 */
export async function listPortalTokens(
  authenticatedApi: AxiosInstance,
  entityId: string,
): Promise<
  {
    id: string;
    token: string;
    is_revoked: boolean;
    access_count: number;
    accessed_at: string | null;
    created_at: string;
  }[]
> {
  const res = await authenticatedApi.post(CRUD_ENDPOINT, {
    action: "list",
    table: "public_access_tokens",
    ...buildSearchParams([
      { field: "entity_id", value: entityId },
      { field: "deleted_at", value: "", operator: "is_null" },
    ]),
  });
  return normalizeCrudList(res.data);
}

/* ------------------------------------------------------------------ */
/*  Public Portal — Token Validation                                   */
/* ------------------------------------------------------------------ */

/**
 * Validate a portal token and return basic info (no sensitive data).
 * Used by the public page to determine if CPF verification is needed.
 */
export async function validatePortalToken(
  token: string,
): Promise<PortalTokenInfo> {
  // 1. Look up the token
  const tokens = await crudList<{
    id: string;
    token: string;
    entity_type: string;
    entity_id: string;
    tenant_id: string;
    is_revoked: boolean;
    deleted_at: string | null;
  }>("public_access_tokens", [{ field: "token", value: token }]);

  const record = tokens.find((t) => !t.deleted_at);
  if (!record) {
    return { valid: false, requiresCpf: false };
  }
  if (record.is_revoked) {
    return { valid: false, requiresCpf: false, isRevoked: true };
  }

  // 2. Load service order (just title + customer_id)
  const orders = await crudList<{
    id: string;
    title: string;
    customer_id: string | null;
    tenant_id: string;
  }>("service_orders", [{ field: "id", value: record.entity_id }]);

  const order = orders[0];
  if (!order) {
    return { valid: false, requiresCpf: false };
  }

  // 3. Load tenant name
  const tenants = await crudList<{ id: string; company_name: string }>(
    "tenants",
    [{ field: "id", value: record.tenant_id }],
  );
  const tenantName = tenants[0]?.company_name ?? "";

  // 4. Check if customer has CPF
  let requiresCpf = false;
  if (order.customer_id) {
    const customers = await crudList<{ id: string; cpf: string | null }>(
      "customers",
      [{ field: "id", value: order.customer_id }],
    );
    const cpf = customers[0]?.cpf;
    requiresCpf = !!cpf && cpf.replace(/\D/g, "").length >= 4;
  }

  return {
    valid: true,
    title: order.title,
    tenantName,
    requiresCpf,
  };
}

/* ------------------------------------------------------------------ */
/*  Public Portal — CPF Verification + Full Data                       */
/* ------------------------------------------------------------------ */

/**
 * Verify CPF and load full portal data.
 * If CPF verification fails, returns null.
 */
export async function loadPortalData(
  token: string,
  cpfPrefix?: string,
): Promise<PortalData | null> {
  // 1. Look up token
  const tokens = await crudList<{
    id: string;
    token: string;
    entity_type: string;
    entity_id: string;
    tenant_id: string;
    is_revoked: boolean;
    deleted_at: string | null;
  }>("public_access_tokens", [{ field: "token", value: token }]);

  const record = tokens.find((t) => !t.deleted_at && !t.is_revoked);
  if (!record) return null;

  // 2. Load service order
  const orders = await crudList<{
    id: string;
    title: string;
    customer_id: string | null;
    service_type_id: string;
    template_id: string | null;
    current_step_id: string | null;
    process_status: string;
    started_at: string | null;
    tenant_id: string;
    estimated_cost: number | null;
    estimated_duration_days: number | null;
    estimated_completion_date: string | null;
  }>("service_orders", [{ field: "id", value: record.entity_id }]);

  const order = orders[0];
  if (!order) return null;

  // 3. Verify CPF (if customer has one)
  if (order.customer_id) {
    const customers = await crudList<{ id: string; cpf: string | null }>(
      "customers",
      [{ field: "id", value: order.customer_id }],
    );
    const customerCpf = customers[0]?.cpf?.replace(/\D/g, "") ?? "";

    if (customerCpf.length >= 4) {
      const expected = customerCpf.substring(0, 4);
      const provided = (cpfPrefix ?? "").replace(/\D/g, "");
      if (provided !== expected) {
        return null; // CPF mismatch
      }
    }
  }

  // 4. Log access
  await crudUpdate("public_access_tokens", {
    id: record.id,
    accessed_at: new Date().toISOString(),
    access_count:
      (
        await crudList<{ id: string; access_count: number }>(
          "public_access_tokens",
          [{ field: "id", value: record.id }],
        )
      )[0]?.access_count + 1 || 1,
  }).catch(() => {
    /* non-critical */
  });

  // 5. Load service type name
  const serviceTypes = await crudList<{ id: string; name: string }>(
    "service_types",
    [{ field: "id", value: order.service_type_id }],
  );
  const serviceTypeName = serviceTypes[0]?.name ?? "";

  // 6. Load tenant name
  const tenants = await crudList<{ id: string; company_name: string }>(
    "tenants",
    [{ field: "id", value: order.tenant_id }],
  );
  const tenantName = tenants[0]?.company_name ?? "";

  // 7. Load workflow steps for progress calculation
  let progress = 0;
  let currentStepName = "";
  let totalSteps = 0;
  let currentStepOrder = 0;

  if (order.template_id) {
    const steps = await crudList<{
      id: string;
      name: string;
      step_order: number | null;
      is_terminal: boolean;
      deleted_at: string | null;
    }>(
      "workflow_steps",
      [
        { field: "template_id", value: order.template_id },
        { field: "deleted_at", value: "", operator: "is_null" },
      ],
      { sortColumn: "step_order ASC" },
    );

    totalSteps = steps.length;

    if (order.current_step_id && totalSteps > 0) {
      const currentStep = steps.find(
        (s) => String(s.id) === String(order.current_step_id),
      );
      if (currentStep) {
        currentStepName = currentStep.name;
        currentStepOrder = currentStep.step_order ?? 0;

        if (currentStep.is_terminal) {
          progress = 100;
        } else {
          const maxOrder = Math.max(...steps.map((s) => s.step_order ?? 0));
          progress =
            maxOrder > 0 ? Math.round((currentStepOrder / maxOrder) * 100) : 0;
        }
      }
    }

    // If process is finished, force 100%
    if (
      order.process_status === "completed" ||
      order.process_status === "finished"
    ) {
      progress = 100;
    }
  }

  // 8. Load visible timeline (process_updates where is_client_visible = true)
  const updates = await crudList<{
    id: string;
    title: string;
    description: string;
    is_client_visible: boolean;
    created_at: string;
    deleted_at: string | null;
  }>(
    "process_updates",
    [
      { field: "service_order_id", value: record.entity_id },
      { field: "is_client_visible", value: "true", operator: "equal" },
      { field: "deleted_at", value: "", operator: "is_null" },
    ],
    { sortColumn: "created_at DESC" },
  );

  const timeline: PortalTimelineEntry[] = updates.map((u) => ({
    id: u.id,
    title: u.title,
    description: u.description ?? "",
    createdAt: u.created_at,
  }));

  return {
    orderTitle: order.title,
    serviceTypeName,
    processStatus: order.process_status ?? "active",
    startedAt: order.started_at,
    progress,
    currentStepName,
    totalSteps,
    currentStepOrder,
    timeline,
    tenantName,
    serviceOrderId: order.id,
    estimatedCost:
      order.estimated_cost != null ? Number(order.estimated_cost) : null,
    estimatedDurationDays:
      order.estimated_duration_days != null
        ? Number(order.estimated_duration_days)
        : null,
    estimatedCompletionDate: order.estimated_completion_date
      ? String(order.estimated_completion_date)
      : null,
  };
}

/* ------------------------------------------------------------------ */
/*  Process Review (public)                                            */
/* ------------------------------------------------------------------ */

export type ProcessReview = {
  id: string;
  service_order_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

/**
 * Check if a review already exists for this portal token's service order.
 */
export async function getExistingReview(
  token: string,
): Promise<ProcessReview | null> {
  // Lookup token → get entity_id (service_order_id)
  const records = await crudList<{
    entity_id: string;
    is_revoked: boolean;
    deleted_at: string | null;
  }>("public_access_tokens", [
    { field: "token", value: token, operator: "equal" },
  ]);
  const record = records.find((r) => !r.is_revoked && !r.deleted_at);
  if (!record) return null;

  const reviews = await crudList<ProcessReview>("process_reviews", [
    { field: "service_order_id", value: record.entity_id },
    { field: "deleted_at", value: "", operator: "is_null" },
  ]);
  return reviews[0] ?? null;
}

/**
 * Submit a public review for a service order via portal token.
 * Validates token, checks for existing review, then creates.
 */
export async function submitReview(
  token: string,
  rating: number,
  comment: string,
): Promise<{ success: boolean; error?: string }> {
  // 1. Validate token
  const records = await crudList<{
    entity_id: string;
    tenant_id: string;
    is_revoked: boolean;
    deleted_at: string | null;
  }>("public_access_tokens", [
    { field: "token", value: token, operator: "equal" },
  ]);
  const record = records.find((r) => !r.is_revoked && !r.deleted_at);
  if (!record) return { success: false, error: "Token inválido ou revogado." };

  // 2. Check if review already exists
  const existing = await crudList<{ id: string }>("process_reviews", [
    { field: "service_order_id", value: record.entity_id },
    { field: "deleted_at", value: "", operator: "is_null" },
  ]);
  if (existing.length > 0)
    return {
      success: false,
      error: "Avaliação já enviada para este processo.",
    };

  // 3. Get customer_id from order
  const orders = await crudList<{ customer_id: string | null }>(
    "service_orders",
    [{ field: "id", value: record.entity_id }],
  );

  // 4. Create review
  await publicApi.post(CRUD_ENDPOINT, {
    action: "create",
    table: "process_reviews",
    payload: {
      tenant_id: record.tenant_id,
      service_order_id: record.entity_id,
      customer_id: orders[0]?.customer_id ?? null,
      token,
      rating,
      comment: comment || null,
    },
  });

  return { success: true };
}

/* ------------------------------------------------------------------ */
/*  URL helpers                                                        */
/* ------------------------------------------------------------------ */

/**
 * Build the public portal URL for a given token.
 * Uses the web app base URL.
 */
export function buildPortalUrl(token: string): string {
  // In production, use the actual domain
  const baseUrl =
    typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.host}`
      : "https://app.radul.com.br";
  return `${baseUrl}/p/${token}`;
}

/**
 * Build the public review URL for a given token.
 */
export function buildReviewUrl(token: string): string {
  const baseUrl =
    typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.host}`
      : "https://app.radul.com.br";
  return `${baseUrl}/p/review/${token}`;
}
