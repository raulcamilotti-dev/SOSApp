import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
  listNotificationPreferences,
  updateNotificationPreference,
  type NotificationChannel,
  type NotificationType,
} from "@/services/notifications";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Switch,
  TouchableOpacity,
  View,
} from "react-native";
import { styles } from "../../theme/styles";

interface NotificationTypeConfig {
  id: NotificationType;
  label: string;
  description: string;
}

const NOTIFICATION_TYPES: NotificationTypeConfig[] = [
  {
    id: "new_process",
    label: "Novo Processo",
    description: "Quando um novo processo é criado",
  },
  {
    id: "process_update",
    label: "Atualização de Processo",
    description: "Quando há atualizações no processo",
  },
  {
    id: "document_requested",
    label: "Documento Solicitado",
    description: "Quando documentos são solicitados",
  },
  {
    id: "document_received",
    label: "Documento Recebido",
    description: "Quando um documento é recebido",
  },
  {
    id: "appointment_scheduled",
    label: "Agendamento Confirmado",
    description: "Quando uma consulta é agendada",
  },
  {
    id: "appointment_reminder",
    label: "Lembrete de Agendamento",
    description: "Lembretes antes de consultas",
  },
];

const NOTIFICATION_CHANNELS: { id: NotificationChannel; label: string }[] = [
  { id: "in_app", label: "Dentro do App" },
  { id: "email", label: "Email" },
  { id: "android", label: "Android" },
  { id: "ios", label: "iOS" },
];

export default function NotificationPreferencesScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState<Map<NotificationType, any>>(
    new Map(),
  );

  const primaryTextColor = useThemeColor({}, "text");
  const mutedTextColor = useThemeColor({}, "muted");
  const tintColor = useThemeColor({}, "tint");
  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const borderTopColor = useThemeColor({}, "border");

  const fetchPreferences = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await listNotificationPreferences(user.id);
      const map = new Map();
      data.forEach((pref) => {
        map.set(pref.notification_type, pref);
      });
      setPreferences(map);
    } catch (error) {
      console.error("Erro ao carregar preferências:", error);
      Alert.alert("Erro", "Falha ao carregar preferências");
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchPreferences().finally(() => setLoading(false));
    }, [fetchPreferences]),
  );

  const handleToggleEnabled = async (type: NotificationType) => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const current = preferences.get(type);
      const newEnabled = current ? !current.enabled : false;
      const channels = current?.channels || ["in_app"];

      const updated = await updateNotificationPreference(
        user.id,
        type,
        {
          enabled: newEnabled,
          channels,
        },
        user.tenant_id ?? undefined,
      );

      setPreferences((prev) => new Map(prev).set(type, updated));
    } catch (error) {
      console.error("Erro ao atualizar preferência:", error);
      Alert.alert("Erro", "Falha ao atualizar preferência");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleChannel = async (
    type: NotificationType,
    channel: NotificationChannel,
  ) => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const current = preferences.get(type);
      let channels = current?.channels || ["in_app"];

      if (channels.includes(channel)) {
        channels = channels.filter((c) => c !== channel);
      } else {
        channels = [...channels, channel];
      }

      // Se nenhum canal está selecionado, desabilita a notificação
      const enabled = channels.length > 0;

      const updated = await updateNotificationPreference(
        user.id,
        type,
        {
          enabled,
          channels,
        },
        user.tenant_id ?? undefined,
      );

      setPreferences((prev) => new Map(prev).set(type, updated));
    } catch (error) {
      console.error("Erro ao atualizar canal:", error);
      Alert.alert("Erro", "Falha ao atualizar canal");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ThemedView
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <ThemedView style={styles.processCard}>
        <ThemedText style={[styles.processTitle, { color: primaryTextColor }]}>
          Preferências de Notificações
        </ThemedText>
        <ThemedText style={[styles.processSubtitle, { color: mutedTextColor }]}>
          Escolha como quer receber notificações
        </ThemedText>
      </ThemedView>

      <View style={{ marginTop: 12, gap: 12 }}>
        {NOTIFICATION_TYPES.map((type) => {
          const pref = preferences.get(type.id);
          const enabled = pref?.enabled ?? true;
          const channels = pref?.channels || ["in_app"];

          return (
            <ThemedView
              key={type.id}
              style={{
                backgroundColor: cardColor,
                borderWidth: 1,
                borderColor,
                borderRadius: 12,
                padding: 12,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <View style={{ flex: 1 }}>
                  <ThemedText
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: primaryTextColor,
                    }}
                  >
                    {type.label}
                  </ThemedText>
                  <ThemedText
                    style={{
                      fontSize: 12,
                      color: mutedTextColor,
                      marginTop: 2,
                    }}
                  >
                    {type.description}
                  </ThemedText>
                </View>
                <Switch
                  value={enabled}
                  onValueChange={() => handleToggleEnabled(type.id)}
                  disabled={saving}
                />
              </View>

              {enabled && (
                <View
                  style={{
                    marginTop: 12,
                    paddingTop: 12,
                    borderTopWidth: 1,
                    borderTopColor,
                  }}
                >
                  <ThemedText
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: primaryTextColor,
                      marginBottom: 8,
                    }}
                  >
                    Canais
                  </ThemedText>
                  <View style={{ gap: 8 }}>
                    {NOTIFICATION_CHANNELS.map((channel) => (
                      <TouchableOpacity
                        key={channel.id}
                        onPress={() => handleToggleChannel(type.id, channel.id)}
                        disabled={saving}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingHorizontal: 8,
                          paddingVertical: 6,
                          borderRadius: 6,
                          backgroundColor: channels.includes(channel.id)
                            ? tintColor + "20"
                            : "transparent",
                        }}
                      >
                        <View
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: 3,
                            borderWidth: 2,
                            borderColor: channels.includes(channel.id)
                              ? tintColor
                              : mutedTextColor,
                            backgroundColor: channels.includes(channel.id)
                              ? tintColor
                              : "transparent",
                            marginRight: 8,
                            justifyContent: "center",
                            alignItems: "center",
                          }}
                        >
                          {channels.includes(channel.id) && (
                            <ThemedText
                              style={{
                                fontSize: 12,
                                color: "white",
                                fontWeight: "bold",
                              }}
                            >
                              ✓
                            </ThemedText>
                          )}
                        </View>
                        <ThemedText
                          style={{
                            fontSize: 12,
                            color: primaryTextColor,
                          }}
                        >
                          {channel.label}
                        </ThemedText>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </ThemedView>
          );
        })}
      </View>

      <ThemedView
        style={{
          marginTop: 16,
          padding: 12,
          backgroundColor: tintColor + "10",
          borderRadius: 8,
        }}
      >
        <ThemedText
          style={{ fontSize: 12, color: primaryTextColor, lineHeight: 18 }}
        >
          💡 Dica: Selecione pelos menos um canal para cada tipo de notificação
          que deseja receber. Se deselecionar todos os canais, a notificação
          será desativada automaticamente.
        </ThemedText>
      </ThemedView>
    </ScrollView>
  );
}
