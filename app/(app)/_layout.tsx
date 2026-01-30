import { Redirect, Slot } from "expo-router";
import { View } from "react-native";
import { useAuth } from "@/core/auth/AuthContext";
import { AppHeader } from "@/core/layout/AppHeader";
import { AppFooter } from "@/core/layout/AppFooter";
import { Breadcrumbs } from "@/core/layout/Breadcrumbs";

export default function AppLayout() {
  const { user, loading } = useAuth();

  // enquanto carrega auth (importante!)
  if (loading) {
    return null; // ou splash
  }

  // 🔐 GATE REAL
  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <View style={{ flex: 1 }}>
      <AppHeader />
<Breadcrumbs />
      <View style={{ flex: 1 }}>
        <Slot />
      </View>

      <AppFooter />
    </View>
  );
}