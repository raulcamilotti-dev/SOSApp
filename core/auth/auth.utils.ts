import { User } from "./auth.types";

const ADMIN_ROLE_VALUES = new Set([
  "admin",
  "administrator",
  "adm",
  "superadmin",
  "root",
  "gestor",
]);

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

export function isUserAdmin(user?: User | null): boolean {
  if (!user) return false;

  const possibleRole =
    (user as any).role ??
    (user as any).perfil ??
    (user as any).type ??
    (user as any).user_type ??
    (user as any).userType;

  const normalizedRole = normalizeRole(possibleRole);
  if (normalizedRole && ADMIN_ROLE_VALUES.has(normalizedRole)) {
    return true;
  }

  const adminFlag =
    (user as any).is_admin ?? (user as any).isAdmin ?? (user as any).admin;
  const normalizedFlag = normalizeRole(adminFlag);

  return normalizedFlag === "admin";
}
