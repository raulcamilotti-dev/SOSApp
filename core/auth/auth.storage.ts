import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { User } from "./auth.types";

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";
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
  if (user) {
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    await AsyncStorage.removeItem(USER_KEY);
  }
}

export async function getUser(): Promise<User | null> {
  const raw = await AsyncStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
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
