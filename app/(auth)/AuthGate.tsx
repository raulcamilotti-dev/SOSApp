import { ReactNode } from "react";
import { Redirect } from "expo-router";
import { useAuth } from "./useAuth";

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  return <>{children}</>;
}