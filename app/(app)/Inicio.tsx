import { ADMIN_MODULE_CARDS } from "@/core/admin/admin-modules";
import { ADMIN_PAGES } from "@/core/admin/admin-pages";
import { isRadulUser } from "@/core/auth/auth.utils";
import { useAuth } from "@/core/auth/AuthContext";
import { usePermissions } from "@/core/auth/usePermissions";
import { getAdminPageModule } from "@/core/modules/module-config";
import { useTenantModules } from "@/core/modules/ModulesContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
  buildSearchParams,
  countCrud,
  CRUD_ENDPOINT,
  normalizeCrudList,
} from "@/services/crud";
import { api } from "@/services/api";
import {
  getSetupWizardStatus,
  type SetupWizardStatusComputed,
} from "@/services/setup-wizard-status";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";

type AdminPageItem = (typeof ADMIN_PAGES)[number];

type InicioMetrics = {
  activeClients: number;
  monthlySales: number;
  monthlyPayable: number;
  monthlyProcesses: number;
};

const FAVORITES_KEY = "inicio_quick_access_favorites";
const MAX_SHORTCUTS = 6;

const DEFAULT_METRICS: InicioMetrics = {
  activeClients: 0,
  monthlySales: 0,
  monthlyPayable: 0,
  monthlyProcesses: 0,
};

function toNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function InicioScreen() {
  const { user } = useAuth();
  const { hasAnyPermission } = usePermissions();
  const { isModuleEnabled, loading: modulesLoading } = useTenantModules();
  const isRadul = isRadulUser(user);
  const router = useRouter();

  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");

  const [metrics, setMetrics] = useState<InicioMetrics>(DEFAULT_METRICS);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [setupStatus, setSetupStatus] = useState<SetupWizardStatusComputed | null>(
    null,
  );

  const tenantId = user?.tenant_id ? String(user.tenant_id) : "";

  useEffect(() => {
    (async () => {
      try {
        const favs = await AsyncStorage.getItem(FAVORITES_KEY);
        if (favs) setFavoriteIds(JSON.parse(favs));
      } catch {
        // ignore
      } finally {
        setFavoritesLoaded(true);
      }
    })();
  }, []);

  const canAccessPage = useCallback(
    (page: AdminPageItem) => {
      if (page.superAdminOnly && !isRadul) return false;
      if (page.hidden) return false;
      if (
        !page.requiredAnyPermissions ||
        page.requiredAnyPermissions.length === 0
      ) {
        return true;
      }
      return hasAnyPermission(page.requiredAnyPermissions);
    },
    [hasAnyPermission, isRadul],
  );

  const allAccessiblePages = useMemo(() => {
    return ADMIN_PAGES.filter((page) => {
      if (!canAccessPage(page)) return false;
      const pageModule = getAdminPageModule(page.id);
      return isModuleEnabled(pageModule);
    });
  }, [canAccessPage, isModuleEnabled]);

  const shortcuts = useMemo(() => {
    if (!favoritesLoaded) return [];
    const byId = new Map<string, AdminPageItem>();
    for (const page of allAccessiblePages) {
      byId.set(page.id, page);
    }

    if (favoriteIds.length > 0) {
      return favoriteIds
        .map((id) => byId.get(id))
        .filter(Boolean)
        .slice(0, MAX_SHORTCUTS) as AdminPageItem[];
    }

    const metabase = allAccessiblePages.find((p) => p.id === "metabase");
    const others = allAccessiblePages.filter((p) => p.id !== "metabase");
    return (metabase ? [metabase, ...others] : others).slice(0, MAX_SHORTCUTS);
  }, [allAccessiblePages, favoriteIds, favoritesLoaded]);

  const getPageAccent = useCallback(
    (pageId: string) => {
      const module = ADMIN_MODULE_CARDS.find((m) => m.pageIds.includes(pageId));
      return module?.color ?? tintColor;
    },
    [tintColor],
  );

  const loadMetrics = useCallback(async () => {
    if (!tenantId) {
      setMetrics(DEFAULT_METRICS);
      setLoadingMetrics(false);
      setRefreshing(false);
      return;
    }

    setLoadingMetrics(true);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const activeCutoff = new Date(
      now.getTime() - 90 * 24 * 60 * 60 * 1000,
    ).toISOString();

    try {
      const [activeClients, receivablesRes, payablesRes, monthlyProcesses] =
        await Promise.all([
          countCrud(
            "customers",
            [
              { field: "tenant_id", value: tenantId },
              { field: "last_interaction_at", value: activeCutoff, operator: "gte" },
            ],
            { autoExcludeDeleted: true },
          ),
          api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "accounts_receivable",
            ...buildSearchParams(
              [
                { field: "tenant_id", value: tenantId },
                {
                  field: "status",
                  value: "cancelled",
                  operator: "not_equal",
                },
              ],
              { autoExcludeDeleted: true, limit: 10000 },
            ),
          }),
          api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "accounts_payable",
            ...buildSearchParams(
              [
                { field: "tenant_id", value: tenantId },
                {
                  field: "status",
                  value: "cancelled",
                  operator: "not_equal",
                },
              ],
              { autoExcludeDeleted: true, limit: 10000 },
            ),
          }),
          countCrud(
            "service_orders",
            [
              { field: "tenant_id", value: tenantId },
              {
                field: "created_at",
                value: monthStart.toISOString(),
                operator: "gte",
              },
              {
                field: "created_at",
                value: nextMonthStart.toISOString(),
                operator: "lt",
              },
            ],
            { autoExcludeDeleted: true },
          ),
        ]);

      const receivables = normalizeCrudList<Record<string, unknown>>(
        receivablesRes.data,
      );
      const payables = normalizeCrudList<Record<string, unknown>>(payablesRes.data);

      const salesTotal = receivables.reduce((sum, row) => {
        const date = String(
          row.competence_date ?? row.due_date ?? row.created_at ?? "",
        );
        if (!date || !date.startsWith(monthPeriod)) return sum;
        return sum + toNumber(row.amount);
      }, 0);

      const payableTotal = payables.reduce((sum, row) => {
        const date = String(
          row.competence_date ?? row.due_date ?? row.created_at ?? "",
        );
        if (!date || !date.startsWith(monthPeriod)) return sum;
        const openAmount = Math.max(
          0,
          toNumber(row.amount) - toNumber(row.amount_paid),
        );
        return sum + openAmount;
      }, 0);

      setMetrics({
        activeClients,
        monthlySales: salesTotal,
        monthlyPayable: payableTotal,
        monthlyProcesses,
      });
    } catch {
      setMetrics(DEFAULT_METRICS);
    } finally {
      setLoadingMetrics(false);
      setRefreshing(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (modulesLoading) return;
    loadMetrics();
  }, [loadMetrics, modulesLoading]);

  useEffect(() => {
    if (!tenantId) return;
    getSetupWizardStatus(tenantId).then(setSetupStatus).catch(() => {});
  }, [tenantId]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadMetrics();
  }, [loadMetrics]);

  const firstName =
    (user?.fullname ?? user?.name ?? "")?.split(" ")[0] || "Usuario";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        <View style={{ marginTop: 20, marginBottom: 16 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginBottom: 4,
            }}
          >
            <Text
              style={{
                fontSize: 26,
                fontWeight: "800",
                color: textColor,
              }}
            >
              Inicio
            </Text>
            <Pressable
              onPress={() => router.push("/Administrador/setup-wizard" as any)}
              style={({ pressed }) => {
                const isDone = setupStatus?.overallStatus === "completed";
                const baseColor = isDone ? "#16a34a" : "#d97706";
                return {
                  borderWidth: 1,
                  borderColor: baseColor + "55",
                  backgroundColor: pressed ? baseColor + "20" : baseColor + "14",
                  borderRadius: 999,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                };
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color:
                    setupStatus?.overallStatus === "completed"
                      ? "#15803d"
                      : "#b45309",
                }}
              >
                {setupStatus?.overallStatus === "completed"
                  ? "Configuracao concluida"
                  : setupStatus
                    ? `Config pendente ${setupStatus.completedSteps}/${setupStatus.totalSteps}`
                    : "Config pendente"}
              </Text>
            </Pressable>
          </View>
          <Text style={{ fontSize: 15, color: mutedColor }}>
            {firstName}, aqui esta o resumo do mes e seus atalhos.
          </Text>
        </View>

        <View style={{ marginBottom: 22 }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "700",
              color: tintColor,
              textTransform: "uppercase",
              letterSpacing: 0.8,
              marginBottom: 10,
            }}
          >
            Indicadores do Mes
          </Text>

          {loadingMetrics ? (
            <View
              style={{
                backgroundColor: cardColor,
                borderColor,
                borderWidth: 1,
                borderRadius: 12,
                paddingVertical: 18,
                alignItems: "center",
              }}
            >
              <ActivityIndicator color={tintColor} />
            </View>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {[
                {
                  label: "Clientes ativos",
                  value: String(metrics.activeClients),
                  icon: "people-outline" as const,
                },
                {
                  label: "Vendas no mes",
                  value: formatCurrency(metrics.monthlySales),
                  icon: "cash-outline" as const,
                },
                {
                  label: "Total a pagar no mes",
                  value: formatCurrency(metrics.monthlyPayable),
                  icon: "wallet-outline" as const,
                },
                {
                  label: "Processos no mes",
                  value: String(metrics.monthlyProcesses),
                  icon: "git-network-outline" as const,
                },
              ].map((item) => (
                <View
                  key={item.label}
                  style={{
                    width: "48.8%" as any,
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 12,
                    backgroundColor: cardColor,
                    padding: 12,
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      backgroundColor: tintColor + "18",
                      justifyContent: "center",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    <Ionicons name={item.icon} size={17} color={tintColor} />
                  </View>
                  <Text
                    style={{
                      fontSize: 20,
                      fontWeight: "800",
                      color: textColor,
                      marginBottom: 4,
                    }}
                    numberOfLines={1}
                  >
                    {item.value}
                  </Text>
                  <Text style={{ fontSize: 12, color: mutedColor }}>
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <Pressable
          onPress={() => router.push("/Administrador/metabase" as any)}
          style={({ pressed }) => ({
            borderWidth: 1,
            borderColor: pressed ? tintColor + "55" : borderColor,
            borderRadius: 12,
            backgroundColor: pressed ? tintColor + "10" : cardColor,
            paddingVertical: 14,
            paddingHorizontal: 14,
            marginBottom: 24,
          })}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: tintColor + "1C",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Ionicons name="bar-chart-outline" size={18} color={tintColor} />
              </View>
              <View>
                <Text style={{ fontSize: 16, fontWeight: "700", color: textColor }}>
                  Business Intelligence
                </Text>
                <Text style={{ fontSize: 12, color: mutedColor }}>
                  Abrir painel de BI (Metabase)
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={mutedColor} />
          </View>
        </Pressable>

        <View style={{ marginBottom: 10 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: tintColor,
                textTransform: "uppercase",
                letterSpacing: 0.8,
              }}
            >
              Atalhos personalizados
            </Text>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/Administrador/edit-favorites",
                  params: { scope: "inicio" },
                } as any)
              }
            >
              <Text style={{ color: tintColor, fontSize: 12, fontWeight: "600" }}>
                Editar
              </Text>
            </Pressable>
          </View>

          {shortcuts.length === 0 ? (
            <View
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 12,
                padding: 14,
                backgroundColor: cardColor,
              }}
            >
              <Text style={{ color: mutedColor, fontSize: 13 }}>
                Nenhum atalho selecionado.
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {shortcuts.map((page) => {
                const accent = getPageAccent(page.id);
                return (
                  <Pressable
                    key={page.id}
                    onPress={() => router.push(page.route as any)}
                    style={({ pressed }) => ({
                      width: "48.8%" as any,
                      borderWidth: 1,
                      borderColor: pressed ? accent + "55" : borderColor,
                      borderRadius: 12,
                      backgroundColor: pressed ? accent + "10" : cardColor,
                      paddingVertical: 12,
                      paddingHorizontal: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    })}
                  >
                    <View
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        backgroundColor: accent + "1C",
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <Ionicons name={page.icon} size={15} color={accent} />
                    </View>
                    <Text
                      style={{
                        flex: 1,
                        color: textColor,
                        fontSize: 13,
                        fontWeight: "600",
                      }}
                      numberOfLines={2}
                    >
                      {page.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}
