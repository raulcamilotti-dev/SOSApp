// /core/auth/auth.storage.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthUser } from './auth.types';

const STORAGE_KEY = '@sos_escritura_user';

export async function saveUser(user: AuthUser) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export async function getUser(): Promise<AuthUser | null> {
  const data = await AsyncStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : null;
}

export async function clearUser() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
