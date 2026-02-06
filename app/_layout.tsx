import { AuthProvider } from "@/core/auth/AuthContext";
import { AuthGate } from "@/core/auth/AuthGate";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { Slot } from "expo-router";

export default function RootLayout() {
  const [fontsLoaded] = useFonts(Ionicons.font);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <AuthProvider>
      <AuthGate>
        <Slot />
      </AuthGate>
    </AuthProvider>
  );
}
