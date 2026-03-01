/**
 * PermissionsContext — Centralized permission loading for the current user.
 *
 * Fetches user_tenants → role_permissions → permissions ONCE at app level.
 * All consumers of `usePermissions()` share the same cached result.
 *
 * Before this, every component calling usePermissions() independently fired
 * 2-3 API requests, causing N×3 redundant calls across the app.
 *
 * Placement: Inside AuthProvider (needs useAuth), outside AuthGate (AuthGate
 * consumes permissions for route guarding).
 */

import { api } from "@/services/api";
import { buildSearchParams, CRUD_ENDPOINT } from "@/services/crud";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "./AuthContext";
import { isUserAdmin } from "./auth.utils";
import { PERMISSIONS, type Permission } from "./permissions";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PermissionsContextType {
  permissions: string[];
  loading: boolean;
  hasPermission: (permission: Permission | Permission[]) => boolean;
  hasAnyPermission: (permissions: Permission[]) => boolean;
  hasAllPermissions: (permissions: Permission[]) => boolean;
  isAdmin: boolean;
  /** Force reload permissions from server */
  refresh: () => Promise<void>;
}

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

const PermissionsCtx = createContext<PermissionsContextType | undefined>(
  undefined,
);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const normalizeList = (data: unknown): any[] => {
  const body = data as any;
  const list = Array.isArray(data)
    ? data
    : (body?.data ?? body?.value ?? body?.items ?? []);
  return Array.isArray(list) ? list : [];
};

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export function PermissionsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    if (!user?.id) {
      setPermissions([]);
      setLoading(false);
      return;
    }

    // Admin shortcut: no DB query needed
    if (isUserAdmin(user)) {
      setPermissions([PERMISSIONS.ADMIN_FULL]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // 1. Fetch user_tenants for this user
      const userTenantsRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "user_tenants",
        ...buildSearchParams([{ field: "user_id", value: String(user.id) }]),
      });

      const userTenantsList = normalizeList(userTenantsRes.data);
      const userTenants = userTenantsList.filter(
        (ut: any) =>
          String(ut?.user_id ?? ut?.id_user ?? "") === String(user.id),
      );

      if (userTenants.length === 0) {
        setPermissions([]);
        setLoading(false);
        return;
      }

      // 2. Collect role_ids
      const roleIds = userTenants
        .map((ut: any) => ut?.role_id ?? ut?.id_role)
        .filter(Boolean);

      if (roleIds.length === 0) {
        setPermissions([]);
        setLoading(false);
        return;
      }

      // 3. Fetch role_permissions scoped by role_ids (avoids fetching ALL role_permissions)
      const rolePermissionsRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "role_permissions",
        ...buildSearchParams([
          { field: "role_id", value: roleIds.join(","), operator: "in" },
        ]),
      });

      const rolePermissionsList = normalizeList(rolePermissionsRes.data);
      // Client-side safety: re-verify role_id match
      const userRolePermissions = rolePermissionsList.filter((rp: any) =>
        roleIds.includes(String(rp?.role_id ?? rp?.id_role)),
      );

      const permissionIds = [
        ...new Set(
          userRolePermissions
            .map((rp: any) => rp?.permission_id ?? rp?.id_permission)
            .filter(Boolean),
        ),
      ];

      if (permissionIds.length === 0) {
        setPermissions([]);
        setLoading(false);
        return;
      }

      // 4. Fetch permissions scoped by IDs (avoids fetching ALL permissions)
      const permissionsRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "permissions",
        ...buildSearchParams([
          { field: "id", value: permissionIds.join(","), operator: "in" },
        ]),
      });

      const permissionsList = normalizeList(permissionsRes.data);
      // Client-side safety: re-verify ID match
      const userPermissionObjects = permissionsList.filter((p: any) =>
        permissionIds.includes(String(p?.id ?? p?.id_permission)),
      );

      const codes = userPermissionObjects
        .map((p: any) => p?.code ?? p?.permission_code ?? p?.codigo)
        .filter(Boolean);

      setPermissions(codes);
    } catch (err) {
      console.error("[PermissionsProvider] Failed to load permissions", err);
      setPermissions([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  // ---- Memoized permission checkers ----

  const hasPermission = useCallback(
    (permission: Permission | Permission[]): boolean => {
      if (permissions.includes(PERMISSIONS.ADMIN_FULL)) return true;
      if (Array.isArray(permission)) {
        return permission.every((p) => permissions.includes(p));
      }
      return permissions.includes(permission);
    },
    [permissions],
  );

  const hasAnyPermission = useCallback(
    (requiredPermissions: Permission[]): boolean => {
      if (permissions.includes(PERMISSIONS.ADMIN_FULL)) return true;
      return requiredPermissions.some((p) => permissions.includes(p));
    },
    [permissions],
  );

  const hasAllPermissions = useCallback(
    (requiredPermissions: Permission[]): boolean => {
      if (permissions.includes(PERMISSIONS.ADMIN_FULL)) return true;
      return requiredPermissions.every((p) => permissions.includes(p));
    },
    [permissions],
  );

  /**
   * B16 fix: Single source of truth for admin detection.
   * Admin users are detected in fetchPermissions() (line ~81) which injects
   * ADMIN_FULL into the permissions array. We derive isAdmin from that single
   * source — no need for a redundant isUserAdmin() call here.
   */
  const isAdmin = permissions.includes(PERMISSIONS.ADMIN_FULL);

  const value = useMemo<PermissionsContextType>(
    () => ({
      permissions,
      loading,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      isAdmin,
      refresh: fetchPermissions,
    }),
    [
      permissions,
      loading,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      isAdmin,
      fetchPermissions,
    ],
  );

  return (
    <PermissionsCtx.Provider value={value}>{children}</PermissionsCtx.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function usePermissionsContext(): PermissionsContextType {
  const ctx = useContext(PermissionsCtx);
  if (!ctx) {
    throw new Error(
      "usePermissionsContext must be used within a PermissionsProvider",
    );
  }
  return ctx;
}
