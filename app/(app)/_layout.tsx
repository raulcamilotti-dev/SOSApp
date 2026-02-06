import { useAuth } from "@/core/auth/AuthContext";
import { AppFooter } from "@/core/layout/AppFooter";
import { AppHeader } from "@/core/layout/AppHeader";
import { Breadcrumbs } from "@/core/layout/Breadcrumbs";
import { useThemeColor } from "@/hooks/use-theme-color";
import { Redirect, Slot } from "expo-router";
import { View } from "react-native";

export default function AppLayout() {
  const { user, loading } = useAuth();
  const backgroundColor = useThemeColor({}, "background");

  // enquanto carrega auth (importante!)
  if (loading) {
    return null; // ou splash
  }

  // 🔐 GATE REAL
  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <View style={{ flex: 1, backgroundColor }}>
      <AppHeader />
      <Breadcrumbs />
      <View style={{ flex: 1, backgroundColor }}>
        <Slot />
      </View>

      <AppFooter />
    </View>
  );
}
