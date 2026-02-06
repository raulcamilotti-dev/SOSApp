import { useRouter, useSegments } from "expo-router";
import { ReactNode, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { isUserAdmin } from "./auth.utils";

type Props = {
  children: ReactNode;
};

export function AuthGate({ children }: Props) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  const inAuthGroup = segments[0] === "(auth)";
  const isAdmin = isUserAdmin(user);
  const adminOnlyRoutes = ["usersmanagement", "processo-advogado"];
  const isAdminRoute = segments.some((segment) =>
    adminOnlyRoutes.includes(segment),
  );

  useEffect(() => {
    if (loading) return;

    if (!user && !inAuthGroup) {
      router.replace("/(auth)/login");
    }

    if (user && inAuthGroup) {
      router.replace("/");
    }

    if (user && !isAdmin && isAdminRoute) {
      router.replace("/");
    }
  }, [user, loading, segments, inAuthGroup, router]);

  if (loading) return null;

  if (!user && !inAuthGroup) return null;

  return <>{children}</>;
}
