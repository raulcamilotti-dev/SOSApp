import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { TenantOption, User } from "./auth.types";

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";
const TENANTS_KEY = "auth_available_tenants";
const SELECTED_TENANT_PREFIX = "auth_selected_tenant_";
const PROFILE_COMPLETE_PREFIX = "profile_complete_";

export async function saveToken(token: string | null) {
  try {
    if (token) {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
    } else {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    }
  } catch {
    if (token) {
      await AsyncStorage.setItem(TOKEN_KEY, token);
    } else {
      await AsyncStorage.removeItem(TOKEN_KEY);
    }
  }
}

export async function getToken() {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return AsyncStorage.getItem(TOKEN_KEY);
  }
}

export async function saveUser(user: User | null) {
  const json = user ? JSON.stringify(user) : null;
  try {
    if (json) {
      await SecureStore.setItemAsync(USER_KEY, json);
    } else {
      await SecureStore.deleteItemAsync(USER_KEY);
    }
    // Clean up legacy AsyncStorage entry if it exists
    try {
      await AsyncStorage.removeItem(USER_KEY);
    } catch {
      /* best-effort cleanup */
    }
  } catch {
    // Fallback for web / environments without SecureStore
    if (json) {
      await AsyncStorage.setItem(USER_KEY, json);
    } else {
      await AsyncStorage.removeItem(USER_KEY);
    }
  }
}

export async function getUser(): Promise<User | null> {
  try {
    const secure = await SecureStore.getItemAsync(USER_KEY);
    if (secure) return JSON.parse(secure);
  } catch {
    /* SecureStore unavailable — fall through to AsyncStorage */
  }
  // Fallback: check AsyncStorage (legacy or web)
  const raw = await AsyncStorage.getItem(USER_KEY);
  if (!raw) return null;
  const user: User = JSON.parse(raw);
  // Migrate legacy data to SecureStore on next read
  try {
    await SecureStore.setItemAsync(USER_KEY, raw);
    await AsyncStorage.removeItem(USER_KEY);
  } catch {
    /* best-effort migration */
  }
  return user;
}

export async function saveTenantOptions(tenants: TenantOption[]) {
  if (Array.isArray(tenants) && tenants.length > 0) {
    await AsyncStorage.setItem(TENANTS_KEY, JSON.stringify(tenants));
  } else {
    await AsyncStorage.removeItem(TENANTS_KEY);
  }
}

export async function getTenantOptions(): Promise<TenantOption[]> {
  const raw = await AsyncStorage.getItem(TENANTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TenantOption[]) : [];
  } catch {
    return [];
  }
}

export async function saveSelectedTenant(
  userId: string,
  tenantId: string | null,
) {
  const normalizedUserId = String(userId ?? "").trim();
  if (!normalizedUserId) return;

  const key = `${SELECTED_TENANT_PREFIX}${normalizedUserId}`;
  const normalizedTenantId = String(tenantId ?? "").trim();

  if (normalizedTenantId) {
    await AsyncStorage.setItem(key, normalizedTenantId);
  } else {
    await AsyncStorage.removeItem(key);
  }
}

export async function getSelectedTenant(
  userId: string,
): Promise<string | null> {
  const normalizedUserId = String(userId ?? "").trim();
  if (!normalizedUserId) return null;

  const key = `${SELECTED_TENANT_PREFIX}${normalizedUserId}`;
  const value = await AsyncStorage.getItem(key);
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

export async function setProfileCompleted(userId: string, completed: boolean) {
  const key = `${PROFILE_COMPLETE_PREFIX}${userId}`;
  if (completed) {
    await AsyncStorage.setItem(key, "1");
  } else {
    await AsyncStorage.removeItem(key);
  }
}

export async function getProfileCompleted(userId: string) {
  const key = `${PROFILE_COMPLETE_PREFIX}${userId}`;
  const value = await AsyncStorage.getItem(key);
  return value === "1";
}
