import { api, getApiErrorMessage } from "@/services/api";
import { validateCpf } from "@/services/brasil-api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
    normalizeCrudOne,
} from "@/services/crud";

export type ServiceProviderInviteStatus = "pending" | "linked" | "revoked";

export interface ServiceProviderInvite {
  id: string;
  tenant_id: string;
  role_id: string;
  cpf: string;
  status: ServiceProviderInviteStatus;
  invited_by?: string | null;
  linked_user_id?: string | null;
  linked_at?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

type RoleRow = {
  id: string;
  name?: string;
  tenant_id?: string;
  is_service_provider?: boolean;
};

type UserTenantRow = {
  id: string;
  user_id: string;
  tenant_id: string;
  role_id?: string | null;
  is_active?: boolean;
  deleted_at?: string | null;
};

const normalizeCpf = (cpf: string) => String(cpf ?? "").replace(/\D/g, "");

const isMissingInvitesTableError = (error: unknown): boolean => {
  const status = (error as any)?.response?.status;
  const message = getApiErrorMessage(error, "").toLowerCase();
  return (
    status === 400 &&
    message.includes("service_provider_invites") &&
    message.includes("does not exist")
  );
};

const missingInvitesTableMessage =
  "Tabela de terceirização não encontrada (service_provider_invites). Execute a migração desse módulo antes de usar convites de prestadores.";

const nowIso = () => new Date().toISOString();

const FORBIDDEN_ROLE_TOKENS = ["admin", "administrador", "super"];

const isPrivilegedRoleName = (name?: string | null): boolean => {
  const normalized = String(name ?? "")
    .toLowerCase()
    .trim();
  if (!normalized) return false;
  return (
    normalized.includes("admin") ||
    normalized.includes("administrador") ||
    normalized.includes("super") ||
    normalized.includes("gestor") ||
    normalized.includes("manager")
  );
};

const assertValidCpf = (cpf: string) => {
  const digits = normalizeCpf(cpf);
  if (!validateCpf(digits)) {
    throw new Error("CPF inválido para prestador terceirizado");
  }
  return digits;
};

const assertRoleName = (roleName: string) => {
  const normalized = String(roleName ?? "").trim();
  if (!normalized) {
    throw new Error("Nome do serviço é obrigatório");
  }
  const lower = normalized.toLowerCase();
  if (FORBIDDEN_ROLE_TOKENS.some((token) => lower.includes(token))) {
    throw new Error(
      'Nome do serviço inválido. Não use termos como "admin" ou "super".',
    );
  }
};

async function listRolesByTenant(tenantId: string): Promise<RoleRow[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "roles",
    ...buildSearchParams([{ field: "tenant_id", value: tenantId }]),
  });
  return normalizeCrudList<RoleRow>(res.data).filter(
    (r) => !(r as any).deleted_at,
  );
}

async function getRoleById(roleId: string): Promise<RoleRow | null> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "roles",
    ...buildSearchParams([{ field: "id", value: roleId }]),
  });
  const roles = normalizeCrudList<RoleRow>(res.data).filter(
    (r) => !(r as any).deleted_at,
  );
  return roles.find((r) => String(r.id) === String(roleId)) ?? null;
}

async function getUserByCpf(cpf: string): Promise<{ id: string } | null> {
  const digits = normalizeCpf(cpf);
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "users",
    ...buildSearchParams([{ field: "cpf", value: digits, operator: "equal" }]),
  });
  const users = normalizeCrudList<{ id: string; cpf?: string }>(
    res.data,
  ).filter((u) => normalizeCpf(String(u.cpf ?? "")) === digits);
  return users[0] ?? null;
}

async function getUserTenantLink(
  userId: string,
  tenantId: string,
): Promise<UserTenantRow | null> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "user_tenants",
    ...buildSearchParams(
      [
        { field: "user_id", value: userId },
        { field: "tenant_id", value: tenantId },
        { field: "deleted_at", value: "", operator: "is_null" },
      ],
      { combineType: "AND" },
    ),
  });

  const links = normalizeCrudList<UserTenantRow>(res.data);
  return links.find((row) => !row.deleted_at) ?? null;
}

async function ensureTenantRoleForUser(params: {
  userId: string;
  tenantId: string;
  serviceRoleId: string;
}): Promise<"created" | "updated" | "preserved" | "unchanged"> {
  const existing = await getUserTenantLink(params.userId, params.tenantId);
  if (!existing) {
    await api.post(CRUD_ENDPOINT, {
      action: "create",
      table: "user_tenants",
      payload: {
        user_id: params.userId,
        tenant_id: params.tenantId,
        role_id: params.serviceRoleId,
        is_active: true,
        created_at: nowIso(),
      },
    });
    return "created";
  }

  const existingRoleId = String(existing.role_id ?? "").trim();
  if (!existingRoleId) {
    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "user_tenants",
      payload: {
        id: existing.id,
        role_id: params.serviceRoleId,
        is_active: true,
      },
    });
    return "updated";
  }

  if (existingRoleId === params.serviceRoleId) {
    return "unchanged";
  }

  const existingRole = await getRoleById(existingRoleId);
  if (isPrivilegedRoleName(existingRole?.name)) {
    return "preserved";
  }

  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "user_tenants",
    payload: {
      id: existing.id,
      role_id: params.serviceRoleId,
      is_active: true,
    },
  });
  return "updated";
}

async function resolveDefaultClientRoleId(
  tenantId: string,
): Promise<string | null> {
  const tenantRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "tenants",
    ...buildSearchParams([{ field: "id", value: tenantId }]),
  });

  const tenant = normalizeCrudList<{
    id: string;
    default_client_role?: string;
  }>(tenantRes.data)[0];
  const desiredRoleName = String(
    tenant?.default_client_role ?? "cliente",
  ).trim();
  const desiredLower = desiredRoleName.toLowerCase();

  const roles = await listRolesByTenant(tenantId);
  const exact = roles.find(
    (role) =>
      String(role.name ?? "")
        .toLowerCase()
        .trim() === desiredLower,
  );
  if (exact?.id) return String(exact.id);

  const partial = roles.find((role) =>
    String(role.name ?? "")
      .toLowerCase()
      .includes(desiredLower),
  );
  return partial?.id ? String(partial.id) : null;
}

async function getInviteById(
  inviteId: string,
  tenantId?: string,
): Promise<ServiceProviderInvite | null> {
  const filters = [{ field: "id", value: inviteId }] as {
    field: string;
    value: string;
    operator?: string;
  }[];
  if (tenantId) {
    filters.push({ field: "tenant_id", value: tenantId });
  }
  filters.push({ field: "deleted_at", value: "", operator: "is_null" });

  let res: { data: unknown };
  try {
    res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "service_provider_invites",
      ...buildSearchParams(filters, { combineType: "AND" }),
    });
  } catch (error) {
    if (isMissingInvitesTableError(error)) {
      throw new Error(missingInvitesTableMessage);
    }
    throw error;
  }

  const invites = normalizeCrudList<ServiceProviderInvite>(res.data);
  return invites.find((invite) => !invite.deleted_at) ?? null;
}

export async function listServiceProviderInvites(params: {
  roleId: string;
  tenantId: string;
}): Promise<ServiceProviderInvite[]> {
  let res: { data: unknown };
  try {
    res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "service_provider_invites",
      ...buildSearchParams(
        [
          { field: "tenant_id", value: params.tenantId },
          { field: "role_id", value: params.roleId },
          { field: "deleted_at", value: "", operator: "is_null" },
        ],
        { combineType: "AND", sortColumn: "created_at DESC" },
      ),
    });
  } catch (error) {
    if (isMissingInvitesTableError(error)) {
      if (__DEV__) {
        console.warn(
          "[ServiceProviders] Tabela service_provider_invites ausente; retornando lista vazia.",
        );
      }
      return [];
    }
    throw error;
  }
  return normalizeCrudList<ServiceProviderInvite>(res.data).filter(
    (invite) => !invite.deleted_at,
  );
}

export async function addServiceProviderCPFs(params: {
  roleId: string;
  tenantId: string;
  cpfs: string[];
  invitedBy: string;
}): Promise<ServiceProviderInvite[]> {
  const normalizedCpfs = Array.from(
    new Set((params.cpfs ?? []).map(assertValidCpf).filter(Boolean)),
  );

  const invites: ServiceProviderInvite[] = [];
  for (const cpf of normalizedCpfs) {
    let existingRes: { data: unknown };
    try {
      existingRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "service_provider_invites",
        ...buildSearchParams(
          [
            { field: "tenant_id", value: params.tenantId },
            { field: "role_id", value: params.roleId },
            { field: "cpf", value: cpf, operator: "equal" },
            { field: "deleted_at", value: "", operator: "is_null" },
          ],
          { combineType: "AND" },
        ),
      });
    } catch (error) {
      if (isMissingInvitesTableError(error)) {
        throw new Error(missingInvitesTableMessage);
      }
      throw error;
    }

    const existing = normalizeCrudList<ServiceProviderInvite>(
      existingRes.data,
    ).find((invite) => !invite.deleted_at);

    if (existing) {
      invites.push(existing);
      continue;
    }

    const user = await getUserByCpf(cpf);
    if (user?.id) {
      await ensureTenantRoleForUser({
        userId: user.id,
        tenantId: params.tenantId,
        serviceRoleId: params.roleId,
      });
    }

    let createdRes: { data: unknown };
    try {
      createdRes = await api.post(CRUD_ENDPOINT, {
        action: "create",
        table: "service_provider_invites",
        payload: {
          tenant_id: params.tenantId,
          role_id: params.roleId,
          cpf,
          status: user?.id ? "linked" : "pending",
          invited_by: params.invitedBy,
          linked_user_id: user?.id ?? null,
          linked_at: user?.id ? nowIso() : null,
          created_at: nowIso(),
          updated_at: nowIso(),
        },
      });
    } catch (error) {
      if (isMissingInvitesTableError(error)) {
        throw new Error(missingInvitesTableMessage);
      }
      throw error;
    }

    invites.push(normalizeCrudOne<ServiceProviderInvite>(createdRes.data));
  }

  return invites;
}

export async function createServiceProviderRole(params: {
  tenantId: string;
  roleName: string;
  permissionIds: string[];
  cpfs: string[];
  invitedBy: string;
}): Promise<{ roleId: string; invites: ServiceProviderInvite[] }> {
  assertRoleName(params.roleName);

  const roleNameNormalized = String(params.roleName).trim();
  const roles = await listRolesByTenant(params.tenantId);
  const duplicate = roles.find(
    (role) =>
      String(role.name ?? "")
        .toLowerCase()
        .trim() === roleNameNormalized.toLowerCase(),
  );
  if (duplicate?.id) {
    throw new Error(`Já existe uma role com o nome "${roleNameNormalized}".`);
  }

  const roleRes = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "roles",
    payload: {
      tenant_id: params.tenantId,
      name: roleNameNormalized,
      is_service_provider: true,
      created_at: nowIso(),
    },
  });

  const role = normalizeCrudOne<{ id: string }>(roleRes.data);
  const roleId = String(role?.id ?? "").trim();
  if (!roleId) {
    throw new Error("Não foi possível criar role de terceirização.");
  }

  const permissionIds = Array.from(
    new Set(
      (params.permissionIds ?? [])
        .map((id) => String(id).trim())
        .filter(Boolean),
    ),
  );
  for (const permissionId of permissionIds) {
    try {
      await api.post(CRUD_ENDPOINT, {
        action: "create",
        table: "role_permissions",
        payload: {
          role_id: roleId,
          permission_id: permissionId,
          created_at: nowIso(),
        },
      });
    } catch {
      // Idempotente: ignora duplicados/erros pontuais de permissão
    }
  }

  const invites = await addServiceProviderCPFs({
    roleId,
    tenantId: params.tenantId,
    cpfs: params.cpfs,
    invitedBy: params.invitedBy,
  });

  return { roleId, invites };
}

export async function revokeServiceProvider(params: {
  inviteId: string;
  tenantId: string;
}): Promise<void> {
  const invite = await getInviteById(params.inviteId, params.tenantId);
  if (!invite) {
    throw new Error("Convite de prestador não encontrado.");
  }

  const userId = String(invite.linked_user_id ?? "").trim();
  if (userId) {
    const defaultRoleId = await resolveDefaultClientRoleId(params.tenantId);
    if (defaultRoleId) {
      const userTenant = await getUserTenantLink(userId, params.tenantId);
      if (userTenant?.id) {
        await api.post(CRUD_ENDPOINT, {
          action: "update",
          table: "user_tenants",
          payload: {
            id: userTenant.id,
            role_id: defaultRoleId,
            is_active: true,
          },
        });
      }
    }
  }

  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "service_provider_invites",
    payload: {
      id: invite.id,
      status: "revoked",
      updated_at: nowIso(),
    },
  });
}

export async function reactivateServiceProvider(params: {
  inviteId: string;
  tenantId: string;
}): Promise<void> {
  const invite = await getInviteById(params.inviteId, params.tenantId);
  if (!invite) {
    throw new Error("Convite de prestador não encontrado.");
  }

  const linkedUserId =
    String(invite.linked_user_id ?? "").trim() ||
    String((await getUserByCpf(invite.cpf))?.id ?? "").trim();

  if (linkedUserId) {
    await ensureTenantRoleForUser({
      userId: linkedUserId,
      tenantId: params.tenantId,
      serviceRoleId: invite.role_id,
    });
  }

  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "service_provider_invites",
    payload: {
      id: invite.id,
      status: linkedUserId ? "linked" : "pending",
      linked_user_id: linkedUserId || null,
      linked_at: linkedUserId ? nowIso() : null,
      updated_at: nowIso(),
    },
  });
}

export async function removePendingInvite(inviteId: string): Promise<void> {
  const invite = await getInviteById(inviteId);
  if (!invite) {
    throw new Error("Convite não encontrado.");
  }
  if (invite.status !== "pending") {
    throw new Error("Apenas convites pendentes podem ser removidos.");
  }

  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "service_provider_invites",
    payload: {
      id: invite.id,
      deleted_at: nowIso(),
      updated_at: nowIso(),
    },
  });
}

export async function tryAutoLinkServiceProviders(
  userId: string,
  cpf: string,
): Promise<number> {
  try {
    const digits = normalizeCpf(cpf);
    if (!userId || !digits || digits.length !== 11) return 0;

    const invitesRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "service_provider_invites",
      ...buildSearchParams(
        [
          { field: "cpf", value: digits, operator: "equal" },
          { field: "status", value: "pending", operator: "equal" },
          { field: "deleted_at", value: "", operator: "is_null" },
        ],
        { combineType: "AND" },
      ),
    });

    const pendingInvites = normalizeCrudList<ServiceProviderInvite>(
      invitesRes.data,
    ).filter((invite) => !invite.deleted_at && invite.status === "pending");

    let linkedCount = 0;
    for (const invite of pendingInvites) {
      await ensureTenantRoleForUser({
        userId,
        tenantId: invite.tenant_id,
        serviceRoleId: invite.role_id,
      });

      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "service_provider_invites",
        payload: {
          id: invite.id,
          status: "linked",
          linked_user_id: userId,
          linked_at: nowIso(),
          updated_at: nowIso(),
        },
      });
      linkedCount += 1;
    }

    return linkedCount;
  } catch (error) {
    if (__DEV__) {
      console.warn(
        "[ServiceProviders] Auto-link falhou:",
        getApiErrorMessage(error),
      );
    }
    return 0;
  }
}

export function isServiceProviderRole(role: {
  is_service_provider?: boolean;
}): boolean {
  return role?.is_service_provider === true;
}
