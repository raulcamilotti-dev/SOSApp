import { AuthProvider } from "@/core/auth/AuthContext";
import { AuthGate } from "@/core/auth/AuthGate";
import { PermissionsProvider } from "@/core/auth/PermissionsContext";
import { TenantThemeProvider } from "@/core/context/TenantThemeContext";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { Slot } from "expo-router";
import { LogBox } from "react-native";

if (__DEV__) {
  LogBox.ignoreLogs([
    "props.pointerEvents is deprecated",
    '"shadow*" style props are deprecated',
  ]);
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts(Ionicons.font);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <AuthProvider>
      <PermissionsProvider>
        <TenantThemeProvider>
          <AuthGate>
            <Slot />
          </AuthGate>
        </TenantThemeProvider>
      </PermissionsProvider>
    </AuthProvider>
  );
}
