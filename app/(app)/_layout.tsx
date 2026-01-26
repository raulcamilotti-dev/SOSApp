import { Stack, Redirect } from 'expo-router';
// eslint-disable-next-line import/no-unresolved
import { useAuth } from '@/app/(auth)/useAuth';
import React from 'react';



export default function AppLayout() {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
