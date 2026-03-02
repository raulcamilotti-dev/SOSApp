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
 * Radul platform admin detection.
 *
 * B13 fix: IDs moved from hardcoded values to environment variables.
 * The client-side check only controls UI visibility (menu filtering).
 * Actual authorization MUST be enforced server-side.
 *
 * When the backend sets `is_platform_admin: true` on the user object
 * during login, that takes precedence over any client-side ID matching.
 */
const RADUL_TENANT_IDS_RAW = (
  process.env.EXPO_PUBLIC_RADUL_TENANT_IDS ||
  "0bc867c7-082b-4d6f-a240-405f01b2941e,0999d528-0114-4399-a582-41d4ea96801f"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const RADUL_EMAILS_RAW = (
  process.env.EXPO_PUBLIC_RADUL_EMAILS ||
  "raul@radul.com.br,raulcamilotti@gmail.com"
)
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export const RADUL_TENANT_IDS = new Set(RADUL_TENANT_IDS_RAW);
export const RADUL_EMAILS = new Set(RADUL_EMAILS_RAW);

export function isRadulUser(user?: User | null): boolean {
  if (!user) return false;
  // Prefer server-set flag when available
  if ((user as any).is_platform_admin === true) return true;
  // Always fall through to email/tenant check — never short-circuit on false
  // because the DB value may be stale or incorrectly set.
  const tenantId = (user as any).tenant_id ?? (user as any).tenantId ?? "";
  const email = ((user as any).email ?? "").toLowerCase().trim();
  return RADUL_TENANT_IDS.has(String(tenantId)) || RADUL_EMAILS.has(email);
}

/**
 * Stable platform admin check that does NOT depend on tenant_id.
 * Used during tenant switching where the current tenant_id is about to change.
 * Checks is_platform_admin flag and email only — never tenant_id.
 */
export function isPlatformAdminStable(user?: User | null): boolean {
  if (!user) return false;
  if ((user as any).is_platform_admin === true) return true;
  // Always fall through to email check — never short-circuit on false
  const email = ((user as any).email ?? "").toLowerCase().trim();
  return RADUL_EMAILS.has(email);
}

export function isUserProfileComplete(user?: User | null): boolean {
  if (!user) return false;

  const cpf = (user.cpf ?? "").toString().trim();
  const phone = (user.phone ?? user.telefone ?? "").toString().trim();

  return cpf.length > 0 && phone.length > 0;
}
