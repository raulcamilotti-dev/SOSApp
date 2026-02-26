import { api, getApiErrorMessage } from "@/services/api";
import { buildSearchParams, CRUD_ENDPOINT } from "@/services/crud";
import {
    DEFAULT_ROLE_PERMISSIONS,
    getAllPermissions,
    PERMISSION_METADATA,
} from "./permissions";

/**
 * Sincroniza permissões do código com o banco de dados.
 * Cria permissões que não existem ainda.
 */
export async function syncPermissions(): Promise<{
  created: number;
  existing: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let created = 0;
  let existing = 0;

  try {
    // 1. Buscar permissões existentes
    const response = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "permissions",
    });

    const existingPermissions = Array.isArray(response.data)
      ? response.data
      : (response.data?.data ?? []);

    const existingCodes = new Set(
      existingPermissions.map((p: any) => p?.code).filter(Boolean),
    );

    // 2. Criar permissões faltantes
    const allPermissions = getAllPermissions();

    for (const permissionCode of allPermissions) {
      if (existingCodes.has(permissionCode)) {
        existing++;
        continue;
      }

      try {
        const metadata = PERMISSION_METADATA[permissionCode];
        await api.post(CRUD_ENDPOINT, {
          action: "create",
          table: "permissions",
          payload: {
            code: permissionCode,
            description: metadata?.description ?? permissionCode,
          },
        });
        created++;
      } catch (err) {
        errors.push(
          `Falha ao criar permissão ${permissionCode}: ${getApiErrorMessage(err)}`,
        );
      }
    }

    return { created, existing, errors };
  } catch (err) {
    errors.push(`Falha ao sincronizar permissões: ${getApiErrorMessage(err)}`);
    return { created, existing, errors };
  }
}

/**
 * Atribui permissões padrão a um role recém-criado
 */
export async function assignDefaultPermissionsToRole(
  roleId: string,
  roleName: string,
): Promise<{ assigned: number; errors: string[] }> {
  const errors: string[] = [];
  let assigned = 0;

  try {
    // Normalizar nome do role
    const normalizedRoleName = roleName.toLowerCase().trim();

    // Buscar permissões padrão
    let permissionsToAssign =
      DEFAULT_ROLE_PERMISSIONS[normalizedRoleName] ?? [];

    // Se não encontrou padrão exato, tentar match parcial
    if (permissionsToAssign.length === 0) {
      if (normalizedRoleName.includes("admin")) {
        permissionsToAssign = DEFAULT_ROLE_PERMISSIONS.admin;
      } else if (
        normalizedRoleName.includes("manager") ||
        normalizedRoleName.includes("gestor")
      ) {
        permissionsToAssign = DEFAULT_ROLE_PERMISSIONS.manager;
      } else if (
        normalizedRoleName.includes("parceiro") ||
        normalizedRoleName.includes("partner")
      ) {
        permissionsToAssign = DEFAULT_ROLE_PERMISSIONS.operador_parceiro;
      } else if (
        normalizedRoleName.includes("client") ||
        normalizedRoleName.includes("cliente")
      ) {
        permissionsToAssign = DEFAULT_ROLE_PERMISSIONS.client;
      }
    }

    if (permissionsToAssign.length === 0) {
      return { assigned: 0, errors: [] };
    }

    // 1. Buscar IDs das permissões
    const permissionsRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "permissions",
    });

    const permissionsList = Array.isArray(permissionsRes.data)
      ? permissionsRes.data
      : (permissionsRes.data?.data ?? []);

    const permissionMap = new Map<string, string>();
    permissionsList.forEach((p: any) => {
      if (p?.code && p?.id) {
        permissionMap.set(String(p.code), String(p.id));
      }
    });

    // 2. Verificar atribuições existentes
    const rolePermissionsRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "role_permissions",
      ...buildSearchParams([{ field: "role_id", value: String(roleId) }]),
    });

    const existingAssignments = Array.isArray(rolePermissionsRes.data)
      ? rolePermissionsRes.data
      : (rolePermissionsRes.data?.data ?? []);

    const existingSet = new Set(
      existingAssignments
        .filter((rp: any) => String(rp?.role_id) === String(roleId))
        .map((rp: any) => String(rp?.permission_id)),
    );

    // 3. Criar atribuições faltantes
    for (const permissionCode of permissionsToAssign) {
      const permissionId = permissionMap.get(permissionCode);
      if (!permissionId) {
        errors.push(`Permissão não encontrada: ${permissionCode}`);
        continue;
      }

      if (existingSet.has(permissionId)) {
        continue;
      }

      try {
        await api.post(CRUD_ENDPOINT, {
          action: "create",
          table: "role_permissions",
          payload: {
            role_id: roleId,
            permission_id: permissionId,
          },
        });
        assigned++;
      } catch (err) {
        errors.push(
          `Falha ao atribuir ${permissionCode}: ${getApiErrorMessage(err)}`,
        );
      }
    }

    return { assigned, errors };
  } catch (err) {
    errors.push(
      `Falha ao atribuir permissões padrão: ${getApiErrorMessage(err)}`,
    );
    return { assigned, errors };
  }
}
