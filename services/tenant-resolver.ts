/**
 * Tenant Resolver Service
 *
 * Resolves a tenant from domain context (slug, hostname, custom domain).
 * Used during login/register to auto-link users to the correct tenant.
 *
 * Resolution priority:
 *   1. slug match (subdomain-based, e.g. "cartorio" from cartorio.radul.com.br)
 *   2. custom_domains containment (e.g. "app.sosescritura.com.br")
 *   3. No match → user goes through normal onboarding flow
 *
 * When a tenant is resolved, the service can auto-create a user_tenants link
 * with the tenant's configured default client role.
 */

import type { TenantContextPayload } from "@/core/auth/tenant-context";
import { api } from "./api";
import { buildSearchParams, CRUD_ENDPOINT, normalizeCrudList } from "./crud";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ResolvedTenant {
  /** Tenant ID (UUID) */
  id: string;
  /** Tenant company name */
  company_name?: string;
  /** Slug used in subdomain routing */
  slug?: string;
  /** Custom domains list */
  custom_domains?: string[];
  /** Default role for auto-linked client users */
  default_client_role?: string;
}

export interface TenantResolutionResult {
  /** Whether a tenant was found */
  resolved: boolean;
  /** The resolved tenant, if any */
  tenant: ResolvedTenant | null;
  /** How it was resolved */
  method: "slug" | "custom_domain" | "none";
  /** Whether this is the platform root (app.radul.com.br) — no auto-link */
  isPlatformRoot: boolean;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Domains that are the platform root (new tenant signup, NOT a specific tenant) */
const PLATFORM_ROOT_HOSTS = new Set([
  "radul.com.br",
  "app.radul.com.br",
  "www.radul.com.br",
  "localhost",
  "localhost:8081",
  "localhost:19006",
]);

/**
 * B12 fix: Sanitize slug/hostname to prevent injection via query parameters.
 * Slug: only lowercase alphanumeric + hyphens, max 63 chars (DNS label limit).
 * Hostname: only valid hostname chars (alphanumeric, hyphens, dots, colon for port).
 */
const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]?$/;
const HOSTNAME_REGEX = /^[a-z0-9][a-z0-9.\-:]{0,253}[a-z0-9]$/;

function sanitizeSlug(raw: string): string {
  const cleaned = raw.replace(/[^a-z0-9-]/g, "").slice(0, 63);
  return SLUG_REGEX.test(cleaned) ? cleaned : "";
}

function sanitizeHostname(raw: string): string {
  const cleaned = raw.replace(/[^a-z0-9.\-:]/g, "").slice(0, 255);
  return HOSTNAME_REGEX.test(cleaned) ? cleaned : "";
}

/* ------------------------------------------------------------------ */
/*  Resolver                                                           */
/* ------------------------------------------------------------------ */

/**
 * Resolve a tenant from the current domain context.
 *
 * @param context — TenantContextPayload from buildTenantContextPayload()
 * @returns Resolution result with tenant info or null
 */
export async function resolveTenantFromContext(
  context: TenantContextPayload,
): Promise<TenantResolutionResult> {
  const hostname = sanitizeHostname(
    (context.hostname ?? context.host ?? "").toLowerCase().trim(),
  );
  const slug = sanitizeSlug(
    (context.tenant_slug ?? context.tenant_subdomain ?? "")
      .toLowerCase()
      .trim(),
  );

  // Check if this is the platform root (no tenant to resolve)
  if (!hostname || PLATFORM_ROOT_HOSTS.has(hostname)) {
    return {
      resolved: false,
      tenant: null,
      method: "none",
      isPlatformRoot: true,
    };
  }

  // 1. Try slug match (from subdomain detection)
  // 2. Try custom_domains match
  // B6 fix: Use dedicated /resolve-domain endpoint instead of fetching ALL tenants
  try {
    const res = await api.post("/resolve-domain", {
      slug: slug || undefined,
      hostname: hostname || undefined,
    });
    const data = res.data as {
      resolved: boolean;
      tenant: ResolvedTenant | null;
      method: "slug" | "custom_domain" | "none";
    };
    if (data.resolved && data.tenant) {
      return {
        resolved: true,
        tenant: data.tenant,
        method: data.method as "slug" | "custom_domain",
        isPlatformRoot: false,
      };
    }
  } catch {
    // Resolution failed — try legacy slug fallback
    if (slug) {
      try {
        const res = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "tenants",
          ...buildSearchParams([
            { field: "slug", value: slug, operator: "equal" },
          ]),
        });
        const tenants = normalizeCrudList<ResolvedTenant>(res.data).filter(
          (t) => !(t as any).deleted_at,
        );
        if (tenants.length > 0) {
          return {
            resolved: true,
            tenant: tenants[0],
            method: "slug",
            isPlatformRoot: false,
          };
        }
      } catch {
        // Continue to unresolved
      }
    }
  }

  // 3. No match — could be an unknown domain or platform root
  return {
    resolved: false,
    tenant: null,
    method: "none",
    isPlatformRoot: false,
  };
}

/* ------------------------------------------------------------------ */
/*  Auto-Link User to Tenant                                           */
/* ------------------------------------------------------------------ */

/**
 * Auto-link a user to a resolved tenant as a client.
 * Checks if the link already exists before creating.
 *
 * @param userId — User ID to link
 * @param tenantId — Tenant ID to link to
 * @param defaultRole — Default role name (e.g., "client")
 * @returns The tenant ID that was linked, or null if already linked
 */
export async function autoLinkUserToTenant(
  userId: string,
  tenantId: string,
  defaultRole?: string,
): Promise<{ linked: boolean; roleId: string | null }> {
  // 1. Check if user_tenants already exists for this pair
  try {
    const existingRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "user_tenants",
      ...buildSearchParams([
        { field: "user_id", value: userId },
        { field: "tenant_id", value: tenantId },
      ]),
    });
    const existing = normalizeCrudList<{ id: string; role_id?: string }>(
      existingRes.data,
    );
    if (existing.length > 0) {
      // Already linked — but still sync users table in case it's out of date
      const existingRoleId = existing[0].role_id ?? null;
      try {
        const userUpdate: Record<string, string> = {
          id: userId,
          tenant_id: tenantId,
        };
        if (existingRoleId) userUpdate.role_id = existingRoleId;
        await api.post(CRUD_ENDPOINT, {
          action: "update",
          table: "users",
          payload: userUpdate,
        });
      } catch {
        // Best-effort sync
      }
      return {
        linked: false,
        roleId: existingRoleId ? String(existingRoleId) : null,
      };
    }
  } catch {
    // If check fails, try to create anyway (create will fail on duplicate if there's a constraint)
  }

  // 2. Find the client role for this tenant
  let roleId: string | null = null;
  const roleName = defaultRole ?? "client";
  try {
    const rolesRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "roles",
      ...buildSearchParams([{ field: "tenant_id", value: tenantId }]),
    });
    const roles = normalizeCrudList<{ id: string; name: string }>(
      rolesRes.data,
    );

    // Try exact match first, then partial
    const exactMatch = roles.find(
      (r) => r.name?.toLowerCase() === roleName.toLowerCase(),
    );
    const partialMatch = roles.find((r) =>
      r.name?.toLowerCase().includes(roleName.toLowerCase()),
    );
    roleId = exactMatch?.id ?? partialMatch?.id ?? null;
  } catch {
    // Role assignment is best-effort
  }

  // 3. Create user_tenants link
  try {
    await api.post(CRUD_ENDPOINT, {
      action: "create",
      table: "user_tenants",
      payload: {
        user_id: userId,
        tenant_id: tenantId,
        role_id: roleId,
        is_active: true,
      },
    });
  } catch {
    // Link creation failed — user will go through normal flow
    return { linked: false, roleId: null };
  }

  // 4. Sync tenant_id and role_id on the users table
  //    This ensures admin screens (gestão de usuarios) show the correct tenant+role.
  try {
    const userUpdate: Record<string, string> = {
      id: userId,
      tenant_id: tenantId,
    };
    if (roleId) userUpdate.role_id = roleId;
    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "users",
      payload: userUpdate,
    });
  } catch {
    // Best-effort — user_tenants link was already created successfully
  }

  return { linked: true, roleId };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Parse custom_domains from various shapes into string[] */
function parseDomains(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((v) => String(v).toLowerCase().trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed
          .map((v: unknown) => String(v).toLowerCase().trim())
          .filter(Boolean);
      }
    } catch {
      // Not JSON — treat as single domain
      return value.trim() ? [value.toLowerCase().trim()] : [];
    }
  }
  return [];
}
