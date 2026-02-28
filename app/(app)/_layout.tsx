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

/** Public path regex — must match the one in AuthGate.tsx */
const PUBLIC_PATH_REGEX = /^\/(loja|p|q|f|blog|lp)(\/|$)/;

export default function AppLayout() {
  const { user, loading } = useAuth();
  const backgroundColor = useThemeColor({}, "background");

  // enquanto carrega auth (importante!)
  if (loading) {
    return null;
  }

  // Don't render the authenticated app layout (header/footer/breadcrumbs)
  // when the browser URL is a public route. During expo-router group
  // resolution, this layout can briefly render for (public) routes —
  // returning null prevents flashing the authenticated chrome.
  if (
    typeof window !== "undefined" &&
    PUBLIC_PATH_REGEX.test(window.location.pathname)
  ) {
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
