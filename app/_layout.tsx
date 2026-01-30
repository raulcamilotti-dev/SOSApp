import { Slot } from "expo-router";
import { AuthProvider } from "@/core/auth/AuthContext";
import { AuthGate } from "@/core/auth/AuthGate";

export default function RootLayout() {
  return (
    <AuthProvider>
      <AuthGate>
        <Slot />
      </AuthGate>
    </AuthProvider>
  );
}
