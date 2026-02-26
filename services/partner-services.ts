/**
 * Partner Services — Links partners to services they can perform.
 *
 * Tables: partner_services (id, tenant_id, partner_id, service_id, is_active,
 *         custom_price, custom_duration_minutes, notes, timestamps)
 *
 * Depends on: services/crud.ts, services/api.ts
 */

import { api } from "./api";
import { buildSearchParams, CRUD_ENDPOINT, normalizeCrudList } from "./crud";

/* ───────── Types ───────── */

export interface PartnerService {
  id: string;
  tenant_id: string;
  partner_id: string;
  service_id: string;
  is_active: boolean;
  custom_price?: number | null;
  custom_duration_minutes?: number | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

/* ───────── CRUD helpers ───────── */

/** List all partner_services for a given tenant (optionally filtered). */
export async function listPartnerServices(
  tenantId: string,
  filters?: { partnerId?: string; serviceId?: string },
): Promise<PartnerService[]> {
  const filterList: { field: string; value: string }[] = [
    { field: "tenant_id", value: tenantId },
  ];
  if (filters?.partnerId) {
    filterList.push({ field: "partner_id", value: filters.partnerId });
  }
  if (filters?.serviceId) {
    filterList.push({ field: "service_id", value: filters.serviceId });
  }

  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "partner_services",
    ...buildSearchParams(filterList, { autoExcludeDeleted: true }),
  });

  return normalizeCrudList<PartnerService>(res.data);
}

/** Get active service IDs for a specific partner. */
export async function getServicesForPartner(
  tenantId: string,
  partnerId: string,
): Promise<string[]> {
  const links = await listPartnerServices(tenantId, { partnerId });
  return links.filter((l) => l.is_active !== false).map((l) => l.service_id);
}

/** Get active partner IDs for a specific service. */
export async function getPartnersForService(
  tenantId: string,
  serviceId: string,
): Promise<string[]> {
  const links = await listPartnerServices(tenantId, { serviceId });
  return links.filter((l) => l.is_active !== false).map((l) => l.partner_id);
}

/** Create or reactivate a partner↔service link. */
export async function linkPartnerService(
  tenantId: string,
  partnerId: string,
  serviceId: string,
  opts?: {
    customPrice?: number | null;
    customDurationMinutes?: number | null;
    notes?: string | null;
  },
): Promise<PartnerService> {
  // Check if a soft-deleted or inactive record already exists
  const existing = await listAllIncludingDeleted(
    tenantId,
    partnerId,
    serviceId,
  );

  if (existing) {
    // Reactivate it
    const res = await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "partner_services",
      payload: {
        id: existing.id,
        is_active: true,
        deleted_at: null,
        custom_price: opts?.customPrice ?? existing.custom_price ?? null,
        custom_duration_minutes:
          opts?.customDurationMinutes ??
          existing.custom_duration_minutes ??
          null,
        notes: opts?.notes ?? existing.notes ?? null,
        updated_at: new Date().toISOString(),
      },
    });
    const list = normalizeCrudList<PartnerService>(res.data);
    return list[0] ?? ({ ...existing, is_active: true } as PartnerService);
  }

  // Create new
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "partner_services",
    payload: {
      tenant_id: tenantId,
      partner_id: partnerId,
      service_id: serviceId,
      is_active: true,
      custom_price: opts?.customPrice ?? null,
      custom_duration_minutes: opts?.customDurationMinutes ?? null,
      notes: opts?.notes ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  });

  const list = normalizeCrudList<PartnerService>(res.data);
  return (
    list[0] ?? {
      id: "",
      tenant_id: tenantId,
      partner_id: partnerId,
      service_id: serviceId,
      is_active: true,
    }
  );
}

/** Soft-delete (deactivate) a partner↔service link. */
export async function unlinkPartnerService(
  tenantId: string,
  partnerId: string,
  serviceId: string,
): Promise<void> {
  const links = await listPartnerServices(tenantId, { partnerId });
  const match = links.find((l) => l.service_id === serviceId);
  if (!match) return;

  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "partner_services",
    payload: {
      id: match.id,
      is_active: false,
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  });
}

/** Toggle a partner↔service link (create if missing, deactivate if active). */
export async function togglePartnerService(
  tenantId: string,
  partnerId: string,
  serviceId: string,
  active: boolean,
  opts?: {
    customPrice?: number | null;
    customDurationMinutes?: number | null;
    notes?: string | null;
  },
): Promise<void> {
  if (active) {
    await linkPartnerService(tenantId, partnerId, serviceId, opts);
  } else {
    await unlinkPartnerService(tenantId, partnerId, serviceId);
  }
}

/* ───────── Internal ───────── */

/** Fetch including soft-deleted records (for reactivation). */
async function listAllIncludingDeleted(
  tenantId: string,
  partnerId: string,
  serviceId: string,
): Promise<PartnerService | null> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "partner_services",
    ...buildSearchParams([
      { field: "tenant_id", value: tenantId },
      { field: "partner_id", value: partnerId },
      { field: "service_id", value: serviceId },
    ]),
  });

  const list = normalizeCrudList<PartnerService>(res.data);
  return list[0] ?? null;
}
