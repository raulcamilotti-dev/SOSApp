import { useAuth } from "@/core/auth/AuthContext";
import { GuidedTourProvider } from "@/core/context/GuidedTourContext";
import { NotificationsProvider } from "@/core/context/NotificationsContext";
import { AppFooter } from "@/core/layout/AppFooter";
import { AppHeader } from "@/core/layout/AppHeader";
import { Breadcrumbs } from "@/core/layout/Breadcrumbs";
import { NotificationsModal } from "@/core/layout/NotificationsModal";
import { ModuleGate } from "@/core/modules/ModuleGate";
import { ModulesProvider } from "@/core/modules/ModulesContext";
import { GuidedTourOverlay } from "@/core/tour/GuidedTourOverlay";
import { useThemeColor } from "@/hooks/use-theme-color";
import { Redirect, Slot } from "expo-router";
import { View } from "react-native";

export default function AppLayout() {
  const { user, loading } = useAuth();
  const backgroundColor = useThemeColor({}, "background");

  // enquanto carrega auth (importante!)
  if (loading) {
    return null;
  }

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <ModulesProvider>
      <ModuleGate>
        <NotificationsProvider>
          <GuidedTourProvider>
            <View style={{ flex: 1, backgroundColor }}>
              <AppHeader />
              <Breadcrumbs />
              <View style={{ flex: 1, backgroundColor }}>
                <Slot />
              </View>
              <AppFooter />
              <NotificationsModal />
              <GuidedTourOverlay />
            </View>
          </GuidedTourProvider>
        </NotificationsProvider>
      </ModuleGate>
    </ModulesProvider>
  );
}
