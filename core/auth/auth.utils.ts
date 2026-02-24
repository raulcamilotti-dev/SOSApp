import { User } from "./auth.types";

const ADMIN_ROLE_VALUES = new Set([
  "admin",
  "administrator",
  "adm",
  "superadmin",
  "root",
]);

const OPERATOR_ROLE_VALUES = new Set([
  "operador",
  "operador_interno",
  "operador_parceiro",
  "partner_operator",
  "oper",
  "gestor",
  "supervisor",
  "backoffice",
  "staff",
]);

export const USER_ROLE_SUGGESTIONS = {
  admin: Array.from(ADMIN_ROLE_VALUES),
  operator: Array.from(OPERATOR_ROLE_VALUES),
  client: ["user", "cliente", "customer", "guest"],
} as const;

function normalizeRole(value: unknown): string | null {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized.length ? normalized : null;
  }

  if (typeof value === "number") {
    return value === 1 ? "admin" : null;
  }

  if (typeof value === "boolean") {
    return value ? "admin" : null;
  }

  return null;
}

function resolveUserRole(user?: User | null): string | null {
  if (!user) return null;

  const possibleRole =
    (user as any).role ??
    (user as any).perfil ??
    (user as any).type ??
    (user as any).user_type ??
    (user as any).userType;

  return normalizeRole(possibleRole);
}

export function isUserAdmin(user?: User | null): boolean {
  const normalizedRole = resolveUserRole(user);
  if (normalizedRole && ADMIN_ROLE_VALUES.has(normalizedRole)) {
    return true;
  }

  if (!user) return false;

  const adminFlag =
    (user as any).is_admin ?? (user as any).isAdmin ?? (user as any).admin;
  const normalizedFlag = normalizeRole(adminFlag);

  return normalizedFlag === "admin";
}

export function isUserOperator(user?: User | null): boolean {
  const normalizedRole = resolveUserRole(user);
  if (!normalizedRole) return false;
  return OPERATOR_ROLE_VALUES.has(normalizedRole);
}

export function isInternalUser(user?: User | null): boolean {
  return isUserAdmin(user) || isUserOperator(user);
}

/**
 * Radul super-admin tenant IDs and emails.
 * Used for platform-wide super admin access.
 */
export const RADUL_TENANT_IDS = new Set([
  "0bc867c7-082b-4d6f-a240-405f01b2941e", // Radul Super Admin
  "0999d528-0114-4399-a582-41d4ea96801f", // SOS Escritura (legacy)
]);

export const RADUL_EMAILS = new Set([
  "raul@radul.com.br",
  "raulcamilotti@gmail.com",
]);

export function isRadulUser(user?: User | null): boolean {
  if (!user) return false;
  const tenantId = (user as any).tenant_id ?? (user as any).tenantId ?? "";
  const email = ((user as any).email ?? "").toLowerCase().trim();
  return RADUL_TENANT_IDS.has(String(tenantId)) || RADUL_EMAILS.has(email);
}

export function isUserProfileComplete(user?: User | null): boolean {
  if (!user) return false;

  const cpf = (user.cpf ?? "").toString().trim();
  const phone = (user.phone ?? user.telefone ?? "").toString().trim();

  return cpf.length > 0 && phone.length > 0;
}
