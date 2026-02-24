/* ------------------------------------------------------------------ */
/*  Onboarding Service                                                 */
/*                                                                     */
/*  Creates a new tenant, links the user as admin, applies a template  */
/*  pack, and configures everything for a self-service signup.         */
/* ------------------------------------------------------------------ */

import type { PackSummary } from "@/data/template-packs";
import { getAllPackSummaries, getPackByKey } from "@/data/template-packs";
import { api } from "./api";
import { createSubdomainDNS } from "./cloudflare-dns";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
    normalizeCrudOne,
} from "./crud";
import { applyTemplatePack } from "./template-packs";

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

export interface OnboardingCompanyData {
  company_name: string;
  whatsapp_number: string;
  cnpj?: string;
  /** Display name for branding (auth screens, portal). Defaults to company_name. */
  brand_name?: string;
  /** Primary hex color for tenant branding. Defaults to Radul blue (#2563eb). */
  primary_color?: string;
  /** URL-safe slug for subdomain ({slug}.radul.com.br). Auto-generated if omitted. */
  slug?: string;
}

export interface OnboardingResult {
  success: boolean;
  tenantId: string;
  packApplied: boolean;
  errors: string[];
}

export type OnboardingStep = "company" | "vertical" | "applying" | "done";

export type OnboardingProgressCallback = (
  step: string,
  progress: number,
) => void;

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

/** Fetch admin role ID (first role with 'admin' in the name) or null. */
async function findAdminRoleId(tenantId: string): Promise<string | null> {
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "roles",
      ...buildSearchParams([{ field: "tenant_id", value: tenantId }]),
    });
    const roles = normalizeCrudList<{ id: string; name: string }>(res.data);
    const admin = roles.find((r) => r.name?.toLowerCase().includes("admin"));
    return admin?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Assign admin.full permission (and all other admin permissions) to a role.
 * Used when no template pack is applied during onboarding — ensures the
 * tenant creator can access the admin panel immediately.
 */
async function assignAdminFullPermission(roleId: string): Promise<void> {
  try {
    // Fetch all permissions from the DB
    const permRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "permissions",
    });
    const allPerms = normalizeCrudList<{
      id: string;
      code: string;
    }>(permRes.data);

    // Find admin.full permission
    const adminFullPerm = allPerms.find((p) => p.code === "admin.full");
    if (!adminFullPerm) return;

    // Check if already assigned
    const existingRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "role_permissions",
      ...buildSearchParams([
        { field: "role_id", value: roleId },
        { field: "permission_id", value: adminFullPerm.id },
      ]),
    });
    const existing = normalizeCrudList(existingRes.data);
    if (existing.length > 0) return; // already assigned

    // Assign admin.full
    await api.post(CRUD_ENDPOINT, {
      action: "create",
      table: "role_permissions",
      payload: { role_id: roleId, permission_id: adminFullPerm.id },
    });
  } catch {
    // Non-fatal — worst case user gets redirected to services page
  }
}

/**
 * Generate a URL-safe slug from a string.
 * Removes accents, lowercases, replaces spaces/special chars with hyphens.
 */
export function generateSlug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // non-alphanumeric → hyphen
    .replace(/^-+|-+$/g, "") // trim leading/trailing hyphens
    .slice(0, 60);
}

/* ================================================================== */
/*  Main Functions                                                     */
/* ================================================================== */

/**
 * Get available template packs for the onboarding UI.
 */
export function getAvailableVerticals(): PackSummary[] {
  return getAllPackSummaries();
}

/**
 * Create a new tenant with the given company data.
 * Returns the created tenant ID.
 */
export async function createTenant(
  data: OnboardingCompanyData,
): Promise<string> {
  const config: Record<string, unknown> = {};
  if (data.cnpj) {
    config.cnpj = data.cnpj.replace(/\D/g, "");
  }

  // Brand configuration — always save so auth screens can read it
  config.brand = {
    name: data.brand_name?.trim() || data.company_name.trim(),
    primary_color: data.primary_color?.trim() || "#2563eb",
  };

  // Generate slug: explicit > auto-generated from company name
  const slug = data.slug?.trim() || generateSlug(data.company_name);

  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "tenants",
    payload: {
      company_name: data.company_name.trim(),
      whatsapp_number: data.whatsapp_number.trim(),
      plan: "free",
      status: "active",
      slug,
      max_users: 2, // Free plan default — enforced by saas-billing
      extra_users_purchased: 0,
      price_per_extra_user: 29.9,
      config: JSON.stringify(config),
    },
  });

  const created = normalizeCrudOne<{ id: string }>(res.data);
  if (!created?.id) {
    throw new Error("Erro ao criar empresa. Tente novamente.");
  }
  return created.id;
}

/**
 * Link a user to a tenant with admin privileges.
 */
export async function linkUserToTenant(
  userId: string,
  tenantId: string,
  roleId?: string | null,
): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "user_tenants",
    payload: {
      user_id: userId,
      tenant_id: tenantId,
      role_id: roleId ?? null,
      is_active: true,
    },
  });
}

/**
 * Full onboarding flow:
 *  1. Create tenant
 *  2. Link user as admin
 *  3. Apply template pack (if selected)
 *  4. Find/assign admin role
 *
 * @returns OnboardingResult with tenant ID and status
 */
export async function runOnboarding(
  userId: string,
  companyData: OnboardingCompanyData,
  packKey: string | null,
  onProgress?: OnboardingProgressCallback,
): Promise<OnboardingResult> {
  const errors: string[] = [];

  // Step 1 — Create tenant
  onProgress?.("Criando sua empresa...", 0.1);
  const tenantId = await createTenant(companyData);

  // Step 1b — Create DNS subdomain (best-effort, never blocks onboarding)
  const slug =
    companyData.slug?.trim() || generateSlug(companyData.company_name);
  if (slug) {
    onProgress?.("Configurando subdomínio...", 0.15);
    try {
      await createSubdomainDNS(slug);
    } catch (dnsErr) {
      console.warn(
        "[onboarding] DNS subdomain creation failed (non-blocking):",
        dnsErr,
      );
    }
  }

  // Step 2 — Link user to tenant
  onProgress?.("Vinculando seu usuário...", 0.2);
  await linkUserToTenant(userId, tenantId);

  // Step 3 — Apply template pack
  let packApplied = false;
  if (packKey) {
    const pack = getPackByKey(packKey);
    if (pack) {
      onProgress?.("Aplicando configurações do setor...", 0.3);
      try {
        const result = await applyTemplatePack(
          pack,
          tenantId,
          (step, progress) => {
            // Map pack progress (0-1) to our range (0.3 - 0.85)
            const mappedProgress = 0.3 + progress * 0.55;
            onProgress?.(step, mappedProgress);
          },
        );
        packApplied = result.success;
        if (result.errors.length) {
          errors.push(...result.errors);
        }
      } catch (err) {
        errors.push(
          `Erro ao aplicar template: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  // Step 4 — Ensure admin role exists and assign it to the creator
  onProgress?.("Finalizando permissões...", 0.9);
  try {
    let adminRoleId = await findAdminRoleId(tenantId);

    // If no admin role exists (e.g., no pack was applied), create one
    if (!adminRoleId) {
      try {
        const createRes = await api.post(CRUD_ENDPOINT, {
          action: "create",
          table: "roles",
          payload: { tenant_id: tenantId, name: "Administrador" },
        });
        const created = normalizeCrudOne<{ id: string }>(createRes.data);
        adminRoleId = created?.id ?? null;
      } catch {
        // If role creation fails, we'll still continue
      }
    }

    if (adminRoleId) {
      // Update the user_tenants row with the admin role
      const utRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "user_tenants",
        ...buildSearchParams([
          { field: "user_id", value: userId },
          { field: "tenant_id", value: tenantId },
        ]),
      });
      const utRows = normalizeCrudList<{ id: string }>(utRes.data);
      if (utRows[0]?.id) {
        await api.post(CRUD_ENDPOINT, {
          action: "update",
          table: "user_tenants",
          payload: { id: utRows[0].id, role_id: adminRoleId },
        });
      }

      // Ensure admin.full permission is assigned to the admin role
      // (template packs handle this themselves, but if no pack was applied we need to do it)
      if (!packApplied) {
        await assignAdminFullPermission(adminRoleId);
      }

      // Also update users.role to 'admin' so the shortcut in isUserAdmin works
      try {
        await api.post(CRUD_ENDPOINT, {
          action: "update",
          table: "users",
          payload: { id: userId, role: "admin" },
        });
      } catch {
        // Non-fatal — permissions chain still works via user_tenants
      }
    }
  } catch {
    // Non-fatal — user still has access
    errors.push(
      "Não foi possível atribuir role de administrador automaticamente.",
    );
  }

  onProgress?.("Pronto!", 1.0);

  return {
    success: true,
    tenantId,
    packApplied,
    errors,
  };
}
