import { useRouter, useSegments } from "expo-router";
import { ReactNode, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { isUserAdmin, isUserProfileComplete } from "./auth.utils";

type Props = {
  children: ReactNode;
};

export function AuthGate({ children }: Props) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  const inAuthGroup = segments[0] === "(auth)";
  const isAdmin = isUserAdmin(user);
  const isProfileComplete = isUserProfileComplete(user);
  const adminOnlyRoutes = ["Administrador"];
  const isAdminRoute = segments.some((segment) =>
    adminOnlyRoutes.includes(segment),
  );
  const isProfileCompletionRoute = segments.some(
    (segment) => segment === "complete-profile",
  );

  useEffect(() => {
    if (loading) return;

    if (!user && !inAuthGroup) {
      router.replace("/(auth)/login");
    }

    if (user && inAuthGroup) {
      if (!isProfileComplete) {
        router.replace("/(app)/Usuario/complete-profile");
        return;
      }

      router.replace("/");
    }

    if (user && !isProfileComplete && !isProfileCompletionRoute) {
      router.replace("/(app)/Usuario/complete-profile");
      return;
    }

    if (user && !isAdmin && isAdminRoute) {
      router.replace("/");
    }
  }, [
    user,
    loading,
    segments,
    inAuthGroup,
    router,
    isAdmin,
    isAdminRoute,
    isProfileComplete,
    isProfileCompletionRoute,
  ]);

  if (loading) return null;

  if (!user && !inAuthGroup) return null;

  return <>{children}</>;
}
