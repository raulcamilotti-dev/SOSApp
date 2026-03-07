import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
  getSetupWizardStatus,
  SETUP_CACHE_TTL_MS,
  SETUP_WIZARD_STEPS,
  type SetupStepStatus,
  type SetupWizardStatusComputed,
} from "@/services/setup-wizard-status";
import { Ionicons } from "@expo/vector-icons";
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

function statusLabel(status: SetupStepStatus): string {
  if (status === "completed") return "Concluido";
  if (status === "partial") return "Parcial";
  return "Pendente";
}

function statusColor(status: SetupStepStatus): string {
  if (status === "completed") return "#16a34a";
  if (status === "partial") return "#2563eb";
  return "#d97706";
}

export default function SetupWizardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const tenantId = String(user?.tenant_id ?? "");

  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<SetupWizardStatusComputed | null>(null);

  const load = useCallback(
    async (forceRefresh = false) => {
      if (!tenantId) {
        setStatus(null);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      try {
        const next = await getSetupWizardStatus(tenantId, { forceRefresh });
        setStatus(next);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tenantId],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const completionPct = useMemo(() => {
    if (!status) return 0;
    return Math.round((status.completedSteps / status.totalSteps) * 100);
  }, [status]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <Text style={{ fontSize: 24, fontWeight: "800", color: textColor }}>
            Assistente de Parametrizacao
          </Text>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={{ color: tintColor, fontWeight: "700", fontSize: 13 }}>
              Fechar
            </Text>
          </Pressable>
        </View>

        <Text style={{ color: mutedColor, marginBottom: 14, fontSize: 13 }}>
          Status carregado do snapshot do tenant (cache local de 24h).
        </Text>

        <View
          style={{
            borderWidth: 1,
            borderColor,
            borderRadius: 12,
            padding: 12,
            backgroundColor: cardColor,
            marginBottom: 14,
          }}
        >
          <Text style={{ color: textColor, fontSize: 15, fontWeight: "700" }}>
            Progresso geral: {status ? `${completionPct}%` : "0%"}
          </Text>
          <Text style={{ color: mutedColor, marginTop: 4, fontSize: 12 }}>
            {status
              ? `${status.completedSteps}/${status.totalSteps} passos concluidos`
              : "Nenhum status registrado ainda"}
          </Text>
          <Text style={{ color: mutedColor, marginTop: 4, fontSize: 12 }}>
            Atualiza automaticamente a cada {Math.round(SETUP_CACHE_TTL_MS / 3600000)}h.
          </Text>
        </View>

        <Pressable
          onPress={onRefresh}
          style={({ pressed }) => ({
            borderRadius: 10,
            borderWidth: 1,
            borderColor,
            backgroundColor: pressed ? tintColor + "12" : cardColor,
            paddingVertical: 10,
            paddingHorizontal: 12,
            marginBottom: 14,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          })}
        >
          <Ionicons name="refresh-outline" size={16} color={tintColor} />
          <Text style={{ color: tintColor, fontSize: 13, fontWeight: "700" }}>
            Atualizar snapshot agora
          </Text>
        </Pressable>

        {loading ? (
          <View style={{ paddingVertical: 30, alignItems: "center" }}>
            <ActivityIndicator color={tintColor} />
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {SETUP_WIZARD_STEPS.map((step, index) => {
              const stepStatus = status?.snapshot.steps[step.id]?.status ?? "pending";
              const color = statusColor(stepStatus);
              return (
                <Pressable
                  key={step.id}
                  onPress={() => router.push(step.route as any)}
                  style={({ pressed }) => ({
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 12,
                    backgroundColor: pressed ? color + "10" : cardColor,
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  })}
                >
                  <View
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 999,
                      backgroundColor: color + "20",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color, fontSize: 12, fontWeight: "800" }}>
                      {index + 1}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: textColor, fontSize: 14, fontWeight: "700" }}>
                      {step.title}
                    </Text>
                    <Text style={{ color: mutedColor, fontSize: 12, marginTop: 2 }}>
                      {step.description}
                    </Text>
                  </View>
                  <View
                    style={{
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: color + "66",
                      backgroundColor: color + "12",
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                    }}
                  >
                    <Text style={{ color, fontSize: 11, fontWeight: "700" }}>
                      {statusLabel(stepStatus)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
