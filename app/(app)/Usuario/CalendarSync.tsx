import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Platform,
    ScrollView,
    Share,
    Switch,
    TouchableOpacity,
    View,
} from "react-native";
import { ThemedText } from "../../../components/themed-text";
import { ThemedView } from "../../../components/themed-view";
import { useAuth } from "../../../core/auth/AuthContext";
import { useThemeColor } from "../../../hooks/use-theme-color";
import {
    CALENDAR_PROVIDERS,
    CalendarProvider,
    CalendarSyncSettings,
    copyFeedUrl,
    exportAllAsIcs,
    getCalendarToken,
    getFeedUrl,
    getSyncSettings,
    ProviderInfo,
    regenerateCalendarToken,
    saveSyncSettings,
    subscribeToCalendar,
} from "../../../services/calendar-sync";
import Colors from "../../theme/colors";

export default function CalendarSync() {
  const { user } = useAuth();
  const backgroundColor = useThemeColor({}, "background");
  const tintColor = useThemeColor({}, "tint");
  const mutedColor = useThemeColor({}, "muted");
  const cardBg = useThemeColor(
    { light: Colors.light.card, dark: Colors.dark.card },
    "card",
  );
  const borderColor = useThemeColor(
    { light: Colors.light.border, dark: Colors.dark.border },
    "border",
  );

  const [calendarToken, setCalendarToken] = useState<string | null>(null);
  const [settings, setSettings] = useState<CalendarSyncSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [subscribing, setSubscribing] = useState<CalendarProvider | null>(null);
  const [copied, setCopied] = useState(false);

  // ─── Carregar dados ───────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [token, syncSettings] = await Promise.all([
        getCalendarToken(user.id),
        getSyncSettings(user.id),
      ]);
      setCalendarToken(token);
      setSettings(syncSettings);
    } catch (err) {
      console.error("Erro ao carregar dados do calendário:", err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Handlers ─────────────────────────────────────────────

  const handleToggle = async (
    field: "sync_appointments" | "sync_tasks" | "sync_deadlines",
    value: boolean,
  ) => {
    if (!user?.id || !user?.tenant_id) return;
    const updated = {
      ...settings,
      user_id: user.id,
      tenant_id: user.tenant_id,
      [field]: value,
    } as CalendarSyncSettings;
    setSettings(updated);
    await saveSyncSettings(updated);
  };

  const handleSubscribe = async (provider: CalendarProvider) => {
    if (!calendarToken) {
      Alert.alert("Erro", "Token de calendário não encontrado.");
      return;
    }
    setSubscribing(provider);
    try {
      const success = await subscribeToCalendar(provider, calendarToken);
      if (!success) {
        Alert.alert(
          "Erro",
          "Não foi possível abrir o calendário. Copie a URL manualmente.",
        );
      }
    } catch {
      Alert.alert("Erro", "Falha ao abrir o calendário externo.");
    } finally {
      setSubscribing(null);
    }
  };

  const handleCopyUrl = async () => {
    if (!calendarToken) return;
    await copyFeedUrl(calendarToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShareUrl = async () => {
    if (!calendarToken) return;
    const url = getFeedUrl(calendarToken);
    await Share.share({
      message: `Minha agenda SOS Escritura: ${url}`,
      url: Platform.OS === "ios" ? url : undefined,
    });
  };

  const handleExport = async () => {
    if (!user?.id || !user?.tenant_id) return;
    setExporting(true);
    try {
      const icsContent = await exportAllAsIcs(
        user.id,
        user.tenant_id,
        settings,
      );
      // Em mobile: salva como arquivo .ics e compartilha; em web: download
      if (Platform.OS === "web") {
        const blob = new Blob([icsContent], { type: "text/calendar" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "sos-escritura-agenda.ics";
        a.click();
        URL.revokeObjectURL(url);
      } else {
        // Mobile: escreve arquivo temporário e compartilha como .ics
        const fs =
          require("expo-file-system") as typeof import("expo-file-system");
        const Sharing =
          require("expo-sharing") as typeof import("expo-sharing");
        const file = new fs.File(fs.Paths.cache, "sos-escritura-agenda.ics");
        file.write(icsContent);
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri, {
            mimeType: "text/calendar",
            dialogTitle: "Exportar Agenda SOS Escritura",
            UTI: "com.apple.ical.ics",
          });
        } else {
          // Fallback se Sharing não disponível
          await Share.share({
            message: icsContent,
            title: "SOS Escritura - Agenda",
          });
        }
      }
    } catch (err) {
      Alert.alert("Erro", "Falha ao exportar agenda.");
      console.error(err);
    } finally {
      setExporting(false);
    }
  };

  const handleRegenToken = () => {
    Alert.alert(
      "Regenerar Token",
      "Isso invalidará todas as assinaturas atuais. Os calendários externos precisarão ser reconfigurados. Deseja continuar?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Regenerar",
          style: "destructive",
          onPress: async () => {
            if (!user?.id) return;
            const newToken = await regenerateCalendarToken(user.id);
            if (newToken) {
              setCalendarToken(newToken);
              Alert.alert("Sucesso", "Token regenerado com sucesso.");
            } else {
              Alert.alert("Erro", "Falha ao regenerar token.");
            }
          },
        },
      ],
    );
  };

  // ─── Render ───────────────────────────────────────────────

  if (loading) {
    return (
      <ThemedView
        style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
      >
        <ActivityIndicator size="large" color={tintColor} />
        <ThemedText style={{ marginTop: 12 }}>
          Carregando configurações...
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor }}>
      <ThemedView style={{ padding: 20 }}>
        {/* Header */}
        <View style={{ alignItems: "center", marginBottom: 24 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: tintColor + "20",
              justifyContent: "center",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <Ionicons name="calendar" size={32} color={tintColor} />
          </View>
          <ThemedText type="title" style={{ textAlign: "center" }}>
            Sincronizar Calendário
          </ThemedText>
          <ThemedText
            style={{
              textAlign: "center",
              color: mutedColor,
              marginTop: 4,
              fontSize: 14,
            }}
          >
            Sincronize suas tarefas e agendamentos com seu calendário externo
          </ThemedText>
        </View>

        {/* O que sincronizar */}
        <SectionTitle
          icon="options"
          title="O que sincronizar"
          color={tintColor}
        />
        <View
          style={{
            backgroundColor: cardBg,
            borderRadius: 12,
            overflow: "hidden",
            marginBottom: 20,
          }}
        >
          <SyncToggle
            label="Agendamentos"
            description="Compromissos e serviços agendados"
            icon="calendar-outline"
            value={settings?.sync_appointments ?? true}
            onToggle={(v) => handleToggle("sync_appointments", v)}
            tintColor={tintColor}
            mutedColor={mutedColor}
            borderColor={borderColor}
          />
          <SyncToggle
            label="Tarefas"
            description="Tarefas atribuídas a você"
            icon="checkbox-outline"
            value={settings?.sync_tasks ?? true}
            onToggle={(v) => handleToggle("sync_tasks", v)}
            tintColor={tintColor}
            mutedColor={mutedColor}
            borderColor={borderColor}
          />
          <SyncToggle
            label="Prazos"
            description="Prazos de processos e workflows"
            icon="alarm-outline"
            value={settings?.sync_deadlines ?? true}
            onToggle={(v) => handleToggle("sync_deadlines", v)}
            tintColor={tintColor}
            mutedColor={mutedColor}
            borderColor={borderColor}
            isLast
          />
        </View>

        {/* Provedores */}
        <SectionTitle
          icon="cloud-upload"
          title="Assinar calendário"
          color={tintColor}
        />
        <ThemedText
          style={{ color: mutedColor, fontSize: 13, marginBottom: 12 }}
        >
          Escolha seu provedor para sincronizar automaticamente. O calendário
          será atualizado sempre que houver novos eventos.
        </ThemedText>

        {CALENDAR_PROVIDERS.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            cardBg={cardBg}
            mutedColor={mutedColor}
            loading={subscribing === provider.id}
            onPress={() => handleSubscribe(provider.id)}
          />
        ))}

        {/* URL do Feed */}
        {calendarToken && (
          <View style={{ marginTop: 8, marginBottom: 20 }}>
            <SectionTitle icon="link" title="URL do Feed" color={tintColor} />
            <View
              style={{
                backgroundColor: cardBg,
                borderRadius: 12,
                padding: 14,
              }}
            >
              <ThemedText
                style={{
                  fontSize: 12,
                  color: mutedColor,
                  fontFamily: Platform.OS === "web" ? "monospace" : "Courier",
                  marginBottom: 10,
                }}
                numberOfLines={2}
              >
                {getFeedUrl(calendarToken)}
              </ThemedText>
              <View
                style={{
                  flexDirection: "row",
                  gap: 8,
                }}
              >
                <TouchableOpacity
                  onPress={handleCopyUrl}
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: copied
                      ? "#10b981" + "20"
                      : tintColor + "15",
                    borderRadius: 8,
                    paddingVertical: 10,
                    gap: 6,
                  }}
                >
                  <Ionicons
                    name={copied ? "checkmark" : "copy"}
                    size={16}
                    color={copied ? "#10b981" : tintColor}
                  />
                  <ThemedText
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: copied ? "#10b981" : tintColor,
                    }}
                  >
                    {copied ? "Copiado!" : "Copiar URL"}
                  </ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleShareUrl}
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: tintColor + "15",
                    borderRadius: 8,
                    paddingVertical: 10,
                    gap: 6,
                  }}
                >
                  <Ionicons name="share-social" size={16} color={tintColor} />
                  <ThemedText
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: tintColor,
                    }}
                  >
                    Compartilhar
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Exportar */}
        <SectionTitle
          icon="download"
          title="Exportar agenda"
          color={tintColor}
        />
        <TouchableOpacity
          onPress={handleExport}
          disabled={exporting}
          style={{
            backgroundColor: tintColor,
            borderRadius: 12,
            paddingVertical: 16,
            alignItems: "center",
            marginBottom: 16,
            opacity: exporting ? 0.7 : 1,
          }}
        >
          {exporting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Ionicons name="download-outline" size={20} color="#fff" />
              <ThemedText
                style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}
              >
                Exportar como .ics
              </ThemedText>
            </View>
          )}
        </TouchableOpacity>
        <ThemedText
          style={{
            color: mutedColor,
            fontSize: 12,
            textAlign: "center",
            marginBottom: 16,
          }}
        >
          Baixa um arquivo .ics que pode ser importado em qualquer calendário
        </ThemedText>

        {/* Segurança */}
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: borderColor,
            paddingTop: 20,
            marginTop: 8,
          }}
        >
          <SectionTitle icon="shield" title="Segurança" color={tintColor} />
          <TouchableOpacity
            onPress={handleRegenToken}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#ff3b3020",
              borderRadius: 12,
              padding: 14,
              gap: 12,
              marginBottom: 40,
            }}
          >
            <Ionicons name="refresh" size={20} color="#ff3b30" />
            <View style={{ flex: 1 }}>
              <ThemedText style={{ fontWeight: "600", fontSize: 14 }}>
                Regenerar Token
              </ThemedText>
              <ThemedText
                style={{ fontSize: 12, color: mutedColor, marginTop: 2 }}
              >
                Invalida todas as assinaturas atuais
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#ff3b30" />
          </TouchableOpacity>
        </View>
      </ThemedView>
    </ScrollView>
  );
}

// ─── Sub-componentes ──────────────────────────────────────

function SectionTitle({
  icon,
  title,
  color,
}: {
  icon: string;
  title: string;
  color: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 10,
      }}
    >
      <Ionicons name={icon as any} size={18} color={color} />
      <ThemedText style={{ fontSize: 16, fontWeight: "700" }}>
        {title}
      </ThemedText>
    </View>
  );
}

function SyncToggle({
  label,
  description,
  icon,
  value,
  onToggle,
  tintColor,
  mutedColor,
  borderColor,
  isLast = false,
}: {
  label: string;
  description: string;
  icon: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  tintColor: string;
  mutedColor: string;
  borderColor: string;
  isLast?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        padding: 14,
        gap: 12,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: borderColor,
      }}
    >
      <Ionicons name={icon as any} size={20} color={tintColor} />
      <View style={{ flex: 1 }}>
        <ThemedText style={{ fontSize: 14, fontWeight: "600" }}>
          {label}
        </ThemedText>
        <ThemedText style={{ fontSize: 12, color: mutedColor, marginTop: 1 }}>
          {description}
        </ThemedText>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: borderColor, true: tintColor + "60" }}
        thumbColor={value ? tintColor : "#f4f3f4"}
      />
    </View>
  );
}

function ProviderCard({
  provider,
  cardBg,
  mutedColor,
  loading,
  onPress,
}: {
  provider: ProviderInfo;
  cardBg: string;
  mutedColor: string;
  loading: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={loading}
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: cardBg,
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
        gap: 12,
        opacity: loading ? 0.7 : 1,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          backgroundColor: provider.color + "18",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {loading ? (
          <ActivityIndicator color={provider.color} size="small" />
        ) : (
          <Ionicons
            name={provider.icon as any}
            size={22}
            color={provider.color}
          />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText style={{ fontSize: 15, fontWeight: "600" }}>
          {provider.name}
        </ThemedText>
        <ThemedText style={{ fontSize: 12, color: mutedColor, marginTop: 2 }}>
          {provider.description}
        </ThemedText>
      </View>
      <Ionicons name="open-outline" size={18} color={mutedColor} />
    </TouchableOpacity>
  );
}
