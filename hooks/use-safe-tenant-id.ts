/**
 * useSafeTenantId — Resolves the effective tenant_id with security enforcement.
 *
 * URL-based tenantId params are a common pattern for super-admin drill-down
 * (e.g., navigating from tenants.tsx into a specific tenant's data).
 * However, non-super-admin users MUST NOT be able to override their tenant_id
 * via URL manipulation.
 *
 * Rules:
 *  - Super-admin (isRadulUser): may use urlTenantId to view any tenant
 *  - Regular admin/user: ALWAYS returns user.tenant_id, ignoring URL param
 *
 * Usage:
 *   const params = useLocalSearchParams<{ tenantId?: string }>();
 *   const urlTenantId = Array.isArray(params.tenantId) ? params.tenantId[0] : params.tenantId;
 *   const { tenantId, isSuperAdmin } = useSafeTenantId(urlTenantId);
 */

import { useAuth } from "@/core/auth/AuthContext";
import { isRadulUser } from "@/core/auth/auth.utils";
import { useMemo } from "react";

export interface SafeTenantId {
  /** The effective tenant_id to use for all queries and writes */
  tenantId: string | undefined;
  /** Whether current user is a super-admin (platform root) */
  isSuperAdmin: boolean;
  /** Whether the URL param was accepted (true only for super-admin with valid URL param) */
  isUrlOverride: boolean;
}

export function useSafeTenantId(urlTenantId?: string): SafeTenantId {
  const { user } = useAuth();

  return useMemo(() => {
    const isSuperAdmin = isRadulUser(user);
    const authTenantId = user?.tenant_id as string | undefined;

    // Super-admin can override via URL param (for tenant drill-down)
    if (isSuperAdmin && urlTenantId) {
      return {
        tenantId: urlTenantId,
        isSuperAdmin: true,
        isUrlOverride: true,
      };
    }

    // Everyone else: always use auth tenant_id
    return {
      tenantId: authTenantId,
      isSuperAdmin,
      isUrlOverride: false,
    };
  }, [user, urlTenantId]);
}
