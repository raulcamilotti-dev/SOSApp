/**
 * usePermissions — thin wrapper over PermissionsContext.
 *
 * Before (slow): every component calling usePermissions() independently
 * fired 2-3 API requests to load user → role → permissions chain.
 * With 8 consumers, that meant up to 24 redundant API calls on navigation.
 *
 * After (fast): PermissionsProvider (mounted once at root layout) fetches
 * permissions a single time. This hook just consumes the shared context.
 *
 * All existing imports (`import { usePermissions } from "@/core/auth/usePermissions"`)
 * continue working — zero changes needed in consumer components.
 */

import { usePermissionsContext } from "./PermissionsContext";
import type { Permission } from "./permissions";

type UserPermissions = {
  permissions: string[];
  loading: boolean;
  hasPermission: (permission: Permission | Permission[]) => boolean;
  hasAnyPermission: (permissions: Permission[]) => boolean;
  hasAllPermissions: (permissions: Permission[]) => boolean;
  isAdmin: boolean;
};

export function usePermissions(): UserPermissions {
  const ctx = usePermissionsContext();
  return {
    permissions: ctx.permissions,
    loading: ctx.loading,
    hasPermission: ctx.hasPermission,
    hasAnyPermission: ctx.hasAnyPermission,
    hasAllPermissions: ctx.hasAllPermissions,
    isAdmin: ctx.isAdmin,
  };
}
