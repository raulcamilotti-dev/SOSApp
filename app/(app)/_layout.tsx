import { useAuth } from "@/core/auth/AuthContext";
import { NotificationsProvider } from "@/core/context/NotificationsContext";
import { AppFooter } from "@/core/layout/AppFooter";
import { AppHeader } from "@/core/layout/AppHeader";
import { Breadcrumbs } from "@/core/layout/Breadcrumbs";
import { NotificationsModal } from "@/core/layout/NotificationsModal";
import { useThemeColor } from "@/hooks/use-theme-color";
import { Redirect, Slot, usePathname, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";

export default function AppLayout() {
  const { user, loading } = useAuth();
  const backgroundColor = useThemeColor({}, "background");
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    router.replace(pathname as any);
    setTimeout(() => setRefreshing(false), 300);
  }, [router, pathname]);

  // enquanto carrega auth (importante!)
  if (loading) {
    return null; // ou splash
  }

  // 🔐 GATE REAL
  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <NotificationsProvider>
      <View style={{ flex: 1, backgroundColor }}>
        <AppHeader />
        <Breadcrumbs />
        <ScrollView
          style={{ flex: 1, backgroundColor }}
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          showsVerticalScrollIndicator={false}
        >
          <Slot />
        </ScrollView>

        <AppFooter />
        <NotificationsModal />
      </View>
    </NotificationsProvider>
  );
}
