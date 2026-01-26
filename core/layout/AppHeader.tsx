import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useAuth } from '../auth/useAuth';
import { useRouter, usePathname } from 'expo-router';
import React from 'react';

export function AppHeader() {
  const { logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  function handleLogout() {
    logout();
    router.replace('/(auth)/login');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>SOS Escritura</Text>

      <Pressable onPress={handleLogout}>
        <Text style={styles.logout}>Sair</Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  logo: {
    fontSize: 16,
    fontWeight: '700',
  },
  logout: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '600',
  },
});
