import { useAuth } from "@/app/(auth)/AuthContext";
import { ActivityIndicator, View } from "react-native";

import { Redirect } from "expo-router";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/" />;
  }

  return <>{children}</>;
}
