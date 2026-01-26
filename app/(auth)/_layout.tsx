import { Slot } from "expo-router";
import { AuthProvider } from "../(auth)/AuthContext";

export default function AppLayout() {
  return (
    <AuthProvider>
      <Slot />
    </AuthProvider>
  );
}