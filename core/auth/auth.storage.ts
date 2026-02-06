import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { User } from "./auth.types";

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

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
