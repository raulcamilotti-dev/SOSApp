import { useAuth } from "@/core/auth/AuthContext";
import { isUserAdmin } from "@/core/auth/auth.utils";
import { api } from "@/services/api";
import {  buildSearchParams, CRUD_ENDPOINT } from "@/services/crud";
import { useCallback, useEffect, useState } from "react";
import { PERMISSIONS, type Permission } from "./permissions";

type UserPermissions = {
  permissions: string[];
  loading: boolean;
  hasPermission: (permission: Permission | Permission[]) => boolean;
  hasAnyPermission: (permissions: Permission[]) => boolean;
  hasAllPermissions: (permissions: Permission[]) => boolean;
  isAdmin: boolean;
};

/**
 * Hook para verificar permissões do usuário atual
 */
export function usePermissions(): UserPermissions {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const normalizeList = useCallback((data: unknown): any[] => {
    const body = data as any;
    const list = Array.isArray(data)
      ? data
      : (body?.data ?? body?.value ?? body?.items ?? []);
    return Array.isArray(list) ? list : [];
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setPermissions([]);
      setLoading(false);
      return;
    }

    // Fallback imediato: admin por perfil/flag sempre tem acesso total
    if (isUserAdmin(user)) {
      setPermissions([PERMISSIONS.ADMIN_FULL]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadUserPermissions() {
      try {
        setLoading(true);

        // 1. Buscar user_tenants do usuário
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

        // 2. Coletar role_ids
        const roleIds = userTenants
          .map((ut: any) => ut?.role_id ?? ut?.id_role)
          .filter(Boolean);

        if (roleIds.length === 0) {
          setPermissions([]);
          setLoading(false);
          return;
        }

        // 3. Buscar role_permissions
        const rolePermissionsRes = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "role_permissions",
        });

        const rolePermissionsList = normalizeList(rolePermissionsRes.data);

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

        // 4. Buscar permissões
        const permissionsRes = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "permissions",
        });

        const permissionsList = normalizeList(permissionsRes.data);

        const userPermissionObjects = permissionsList.filter((p: any) =>
          permissionIds.includes(String(p?.id ?? p?.id_permission)),
        );

        const codes = userPermissionObjects
          .map((p: any) => p?.code ?? p?.permission_code ?? p?.codigo)
          .filter(Boolean);

        if (cancelled) return;
        setPermissions(codes);
      } catch (err) {
        console.error("[usePermissions] Failed to load permissions", err);
        if (!cancelled) {
          setPermissions([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadUserPermissions();

    return () => {
      cancelled = true;
    };
  }, [normalizeList, user]);

  const hasPermission = useCallback(
    (permission: Permission | Permission[]): boolean => {
      // Admin tem tudo
      if (permissions.includes(PERMISSIONS.ADMIN_FULL)) {
        return true;
      }

      if (Array.isArray(permission)) {
        return permission.every((p) => permissions.includes(p));
      }

      return permissions.includes(permission);
    },
    [permissions],
  );

  const hasAnyPermission = useCallback(
    (requiredPermissions: Permission[]): boolean => {
      if (permissions.includes(PERMISSIONS.ADMIN_FULL)) {
        return true;
      }
      return requiredPermissions.some((p) => permissions.includes(p));
    },
    [permissions],
  );

  const hasAllPermissions = useCallback(
    (requiredPermissions: Permission[]): boolean => {
      if (permissions.includes(PERMISSIONS.ADMIN_FULL)) {
        return true;
      }
      return requiredPermissions.every((p) => permissions.includes(p));
    },
    [permissions],
  );

  const isAdmin =
    permissions.includes(PERMISSIONS.ADMIN_FULL) || isUserAdmin(user);

  return {
    permissions,
    loading,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    isAdmin,
  };
}
