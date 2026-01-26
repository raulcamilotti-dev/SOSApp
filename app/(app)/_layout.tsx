import { Stack, Redirect } from 'expo-router';
import { useAuth } from 'app/(auth)/AuthContext';


export default function AppLayout() {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
