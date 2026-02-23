/**
 * ModuleGate — Redirects users away from routes belonging to disabled modules.
 *
 * This component runs inside ModulesProvider (app layout) and checks if the
 * current route belongs to a module that is disabled for the tenant.
 * If so, it redirects back to the services menu.
 *
 * Note: This only blocks direct URL access. Menu filtering already hides
 * the navigation entries (see home.tsx and servicos.tsx).
 */

import { ADMIN_PAGES } from "@/core/admin/admin-pages";
import {
    getAdminPageModule,
    getServiceRouteModule,
    MODULE_KEYS,
    type ModuleKey,
} from "@/core/modules/module-config";
import { useTenantModules } from "@/core/modules/ModulesContext";
import { usePathname, useRouter, useSegments } from "expo-router";
import { type ReactNode, useEffect } from "react";

interface Props {
  children: ReactNode;
}

export function ModuleGate({ children }: Props) {
  const { isModuleEnabled, loading } = useTenantModules();
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;

    const requiredModule = getRouteModule(segments, pathname);
    if (!requiredModule) return; // core or unknown — always allowed

    if (!isModuleEnabled(requiredModule)) {
      router.replace("/Servicos/servicos" as any);
    }
  }, [loading, isModuleEnabled, segments, pathname, router]);

  return <>{children}</>;
}

/**
 * Determines which module a given route requires.
 * Returns null for core routes (always allowed).
 */
function getRouteModule(
  segments: string[],
  pathname: string,
): ModuleKey | null {
  const isAdminRoute = segments.includes("Administrador");

  if (isAdminRoute) {
    // Find the admin page matching this route
    const adminRoutePath = segments
      .filter((s) => s !== "(app)" && s !== "Administrador")
      .join("/");

    const adminPage = ADMIN_PAGES.find(
      (page) =>
        page.route.replace("/Administrador/", "").toLowerCase() ===
        adminRoutePath.toLowerCase(),
    );

    if (adminPage) {
      const module = getAdminPageModule(adminPage.id);
      return module === MODULE_KEYS.CORE ? null : module;
    }

    // Sub-routes related to specific modules (not in ADMIN_PAGES)
    const subRouteModules: Record<string, ModuleKey> = {
      "cnpj-consulta": MODULE_KEYS.CORE,
      "company-members": MODULE_KEYS.CORE,
      "customer-properties": MODULE_KEYS.CORE,
      "template-editor": MODULE_KEYS.DOCUMENTS,
      ResumoAvaliacaoParceiro: MODULE_KEYS.PARTNERS,
      LogsAvaliacoes: MODULE_KEYS.PARTNERS,
      LogsAgendamentos: MODULE_KEYS.PARTNERS,
      FolgasParceiro: MODULE_KEYS.PARTNERS,
      ExecucoesServico: MODULE_KEYS.PARTNERS,
      DisponibilidadeParceiro: MODULE_KEYS.PARTNERS,
      agent_states: MODULE_KEYS.AI_AUTOMATION,
      automations: MODULE_KEYS.AI_AUTOMATION,
    };

    const lastSegment = segments[segments.length - 1];
    const subModule = subRouteModules[lastSegment];
    if (subModule && subModule !== MODULE_KEYS.CORE) return subModule;

    return null; // default to core
  }

  // Servicos routes
  if (segments.includes("Servicos")) {
    const module = getServiceRouteModule(pathname);
    return module === MODULE_KEYS.CORE ? null : module;
  }

  return null; // core routes
}
