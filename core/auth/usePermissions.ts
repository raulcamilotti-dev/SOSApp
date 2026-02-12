import { useAuth } from "@/core/auth/AuthContext";
import { api } from "@/services/api";
import { useCallback, useEffect, useState } from "react";
import { PERMISSIONS, type Permission } from "./permissions";

const ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";

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

  useEffect(() => {
    if (!user?.id) {
      setPermissions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadUserPermissions() {
      try {
        setLoading(true);

        // 1. Buscar user_tenants do usuário
        const userTenantsRes = await api.post(ENDPOINT, {
          action: "list",
          table: "user_tenants",
        });

        const userTenantsList = Array.isArray(userTenantsRes.data)
          ? userTenantsRes.data
          : (userTenantsRes.data?.data ?? []);

        const userTenants = userTenantsList.filter(
          (ut: any) => String(ut?.user_id) === String(user.id),
        );

        if (userTenants.length === 0) {
          setPermissions([]);
          setLoading(false);
          return;
        }

        // 2. Coletar role_ids
        const roleIds = userTenants
          .map((ut: any) => ut?.role_id)
          .filter(Boolean);

        if (roleIds.length === 0) {
          setPermissions([]);
          setLoading(false);
          return;
        }

        // 3. Buscar role_permissions
        const rolePermissionsRes = await api.post(ENDPOINT, {
          action: "list",
          table: "role_permissions",
        });

        const rolePermissionsList = Array.isArray(rolePermissionsRes.data)
          ? rolePermissionsRes.data
          : (rolePermissionsRes.data?.data ?? []);

        const userRolePermissions = rolePermissionsList.filter((rp: any) =>
          roleIds.includes(String(rp?.role_id)),
        );

        const permissionIds = [
          ...new Set(
            userRolePermissions
              .map((rp: any) => rp?.permission_id)
              .filter(Boolean),
          ),
        ];

        if (permissionIds.length === 0) {
          setPermissions([]);
          setLoading(false);
          return;
        }

        // 4. Buscar permissões
        const permissionsRes = await api.post(ENDPOINT, {
          action: "list",
          table: "permissions",
        });

        const permissionsList = Array.isArray(permissionsRes.data)
          ? permissionsRes.data
          : (permissionsRes.data?.data ?? []);

        const userPermissionObjects = permissionsList.filter((p: any) =>
          permissionIds.includes(String(p?.id)),
        );

        const codes = userPermissionObjects
          .map((p: any) => p?.code)
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
  }, [user?.id]);

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

  const isAdmin = permissions.includes(PERMISSIONS.ADMIN_FULL);

  return {
    permissions,
    loading,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    isAdmin,
  };
}
