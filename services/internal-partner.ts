import { api } from "@/services/api";
import {
  buildSearchParams,
  CRUD_ENDPOINT,
  normalizeCrudList,
} from "@/services/crud";

type PartnerRow = {
  id: string;
  tenant_id?: string | null;
  user_id?: string | null;
  display_name?: string | null;
  is_active?: boolean | null;
  deleted_at?: string | null;
};

type ServiceRow = {
  id: string;
  tenant_id?: string | null;
  is_active?: boolean | null;
  deleted_at?: string | null;
};

type PartnerServiceRow = {
  id: string;
  tenant_id?: string | null;
  partner_id?: string | null;
  service_id?: string | null;
  is_active?: boolean | null;
  deleted_at?: string | null;
};

async function listTenantPartners(tenantId: string): Promise<PartnerRow[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "partners",
    ...buildSearchParams([{ field: "tenant_id", value: tenantId }], {
      autoExcludeDeleted: true,
    }),
  });
  return normalizeCrudList<PartnerRow>(res.data).filter((p) => !p.deleted_at);
}

async function resolveAnyTenantUserId(tenantId: string): Promise<string | null> {
  const linksRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "user_tenants",
    ...buildSearchParams([{ field: "tenant_id", value: tenantId }], {
      sortColumn: "created_at ASC",
      autoExcludeDeleted: true,
    }),
  });
  const links = normalizeCrudList<{ user_id?: string | null }>(linksRes.data);
  const userId = String(links[0]?.user_id ?? "").trim();
  return userId || null;
}

async function createInternalPartner(
  tenantId: string,
  userId: string,
): Promise<string | null> {
  const createRes = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "partners",
    payload: {
      tenant_id: tenantId,
      user_id: userId,
      display_name: "Parceiro Interno",
      is_active: true,
      payout_enabled: false,
      is_internal: true,
    },
  });

  const created = normalizeCrudList<PartnerRow>(createRes.data)[0];
  return created?.id ? String(created.id) : null;
}

async function ensureInternalPartnerId(tenantId: string): Promise<string | null> {
  const partners = await listTenantPartners(tenantId);
  const active = partners.filter((p) => p.is_active !== false);
  if (active.length > 0) {
    return String(active[0].id);
  }

  const userId = await resolveAnyTenantUserId(tenantId);
  if (!userId) return null;
  return createInternalPartner(tenantId, userId);
}

async function ensurePartnerLinkedToAllActiveServices(
  tenantId: string,
  partnerId: string,
) {
  const [servicesRes, linksRes] = await Promise.all([
    api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "services",
      ...buildSearchParams([{ field: "tenant_id", value: tenantId }], {
        autoExcludeDeleted: true,
      }),
    }),
    api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "partner_services",
      ...buildSearchParams(
        [
          { field: "tenant_id", value: tenantId },
          { field: "partner_id", value: partnerId },
        ],
        { autoExcludeDeleted: true },
      ),
    }),
  ]);

  const services = normalizeCrudList<ServiceRow>(servicesRes.data).filter(
    (s) => !s.deleted_at && s.is_active !== false,
  );
  const links = normalizeCrudList<PartnerServiceRow>(linksRes.data).filter(
    (l) => !l.deleted_at,
  );

  const linksByService = new Map<string, PartnerServiceRow>();
  for (const link of links) {
    const sid = String(link.service_id ?? "");
    if (!sid) continue;
    if (!linksByService.has(sid)) linksByService.set(sid, link);
  }

  for (const service of services) {
    const serviceId = String(service.id ?? "");
    if (!serviceId) continue;
    const existing = linksByService.get(serviceId);
    if (!existing) {
      await api.post(CRUD_ENDPOINT, {
        action: "create",
        table: "partner_services",
        payload: {
          tenant_id: tenantId,
          partner_id: partnerId,
          service_id: serviceId,
          is_active: true,
        },
      });
      continue;
    }

    if (existing.is_active === false) {
      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "partner_services",
        payload: {
          id: existing.id,
          is_active: true,
          deleted_at: null,
        },
      });
    }
  }
}

/**
 * Guarantees each tenant has at least one active "internal" partner and that
 * this partner is linked to all active services.
 */
export async function ensureInternalPartnerReady(
  tenantId: string | null | undefined,
): Promise<{ partnerId: string | null; created: boolean }> {
  const tid = String(tenantId ?? "").trim();
  if (!tid) return { partnerId: null, created: false };

  const beforePartners = await listTenantPartners(tid);
  const hadActiveBefore = beforePartners.some((p) => p.is_active !== false);

  const partnerId = await ensureInternalPartnerId(tid);
  if (!partnerId) return { partnerId: null, created: false };

  await ensurePartnerLinkedToAllActiveServices(tid, partnerId);
  return { partnerId, created: !hadActiveBefore };
}

