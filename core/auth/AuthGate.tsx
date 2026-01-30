import { ReactNode, useEffect } from "react";
import { useRouter, useSegments } from "expo-router";
import { useAuth } from "./AuthContext";



type Props = {
  children: ReactNode;
};

export function AuthGate({ children }: Props) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  const inAuthGroup = segments[0] === "(auth)";

  useEffect(() => {
    if (loading) return;

    if (!user && !inAuthGroup) {
      router.replace("/(auth)/login");
    }

    if (user && inAuthGroup) {
      router.replace("/");
    }
  }, [user, loading, segments, inAuthGroup, router]);

  if (loading) return null;

  if (!user && !inAuthGroup) return null;

  return <>{children}</>;
}
