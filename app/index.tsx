import { Redirect } from 'expo-router';
import { useAuth } from '@/app/(auth)/AuthContext';

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) return null;

  // 🔐 NÃO LOGADO → LOGIN
  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  // ✅ LOGADO → HOME
  return <Redirect href="/(app)/home" />;
}
