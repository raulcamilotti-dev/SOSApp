import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
    deleteNotification,
    listNotifications,
    markAllAsRead,
    markAsRead,
    type Notification,
} from "@/services/notifications";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    RefreshControl,
    ScrollView,
    TouchableOpacity,
    View,
} from "react-native";
import { styles } from "../../theme/styles";

interface NotificationItemProps {
  notification: Notification;
  onPress: (notification: Notification) => void;
  onDelete: (id: string) => void;
}

const NotificationItem = ({
  notification,
  onPress,
  onDelete,
}: NotificationItemProps) => {
  const tintColor = useThemeColor({}, "tint");
  const mutedTextColor = useThemeColor({}, "muted");
  const primaryTextColor = useThemeColor({}, "text");
  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Agora";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;

    return date.toLocaleDateString("pt-BR");
  };

  return (
    <TouchableOpacity
      onPress={() => onPress(notification)}
      style={{
        backgroundColor: notification.is_read ? cardColor : tintColor + "15",
        borderLeftWidth: 4,
        borderLeftColor: notification.is_read ? borderColor : tintColor,
        paddingHorizontal: 12,
        paddingVertical: 12,
        marginBottom: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <View style={{ flex: 1 }}>
          <ThemedText
            style={{
              fontSize: 14,
              fontWeight: notification.is_read ? "500" : "700",
              color: primaryTextColor,
            }}
          >
            {notification.title}
          </ThemedText>
          <ThemedText
            style={{
              fontSize: 12,
              color: mutedTextColor,
              marginTop: 4,
              lineHeight: 18,
            }}
          >
            {notification.message}
          </ThemedText>
          <ThemedText
            style={{
              fontSize: 11,
              color: mutedTextColor,
              marginTop: 6,
            }}
          >
            {formatDate(notification.created_at)}
          </ThemedText>
        </View>
        <TouchableOpacity
          onPress={() => onDelete(notification.id)}
          style={{ marginLeft: 8 }}
        >
          <ThemedText style={{ fontSize: 18, color: tintColor }}>✕</ThemedText>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

export default function NotificationsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedNotification, setSelectedNotification] =
    useState<Notification | null>(null);

  const primaryTextColor = useThemeColor({}, "text");
  const mutedTextColor = useThemeColor({}, "muted");
  const tintColor = useThemeColor({}, "tint");
  const cardColor = useThemeColor({}, "card");

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await listNotifications(user.id, 100);
      setNotifications(data);
    } catch (error) {
      console.error("Erro ao carregar notificações:", error);
      Alert.alert("Erro", "Falha ao carregar notificações");
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchNotifications().finally(() => setLoading(false));
    }, [fetchNotifications]),
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  };

  const handleNotificationPress = async (notification: Notification) => {
    if (!notification.is_read) {
      try {
        await markAsRead(notification.id);
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notification.id ? { ...n, is_read: true } : n,
          ),
        );
      } catch (error) {
        console.error("Erro ao marcar como lido:", error);
      }
    }
    setSelectedNotification(notification);
  };

  const handleDeleteNotification = async (id: string) => {
    Alert.alert("Confirmação", "Deseja remover esta notificação?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Remover",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteNotification(id);
            setNotifications((prev) => prev.filter((n) => n.id !== id));
            if (selectedNotification?.id === id) {
              setSelectedNotification(null);
            }
          } catch (error) {
            console.error("Erro ao remover notificação:", error);
            Alert.alert("Erro", "Falha ao remover notificação");
          }
        },
      },
    ]);
  };

  const handleMarkAllAsRead = async () => {
    if (!user?.id) return;
    try {
      await markAllAsRead(user.id);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (error) {
      console.error("Erro ao marcar tudo como lido:", error);
      Alert.alert("Erro", "Falha ao marcar como lido");
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

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
    <ScrollView
      contentContainerStyle={{ padding: 16 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {selectedNotification ? (
        <ThemedView
          style={[
            styles.processCard,
            { backgroundColor: cardColor, marginBottom: 16 },
          ]}
        >
          <TouchableOpacity onPress={() => setSelectedNotification(null)}>
            <ThemedText
              style={{ color: tintColor, fontSize: 12, marginBottom: 8 }}
            >
              ← Voltar
            </ThemedText>
          </TouchableOpacity>
          <ThemedText
            style={{
              fontSize: 18,
              fontWeight: "700",
              color: primaryTextColor,
            }}
          >
            {selectedNotification.title}
          </ThemedText>
          <ThemedText
            style={{
              fontSize: 12,
              color: mutedTextColor,
              marginTop: 12,
              lineHeight: 20,
            }}
          >
            {selectedNotification.message}
          </ThemedText>
          {selectedNotification.data && (
            <View
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTopWidth: 1,
                borderTopColor: tintColor + "20",
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
                Detalhes
              </ThemedText>
              <ThemedText
                style={{
                  fontSize: 11,
                  color: mutedTextColor,
                  fontFamily: "monospace",
                }}
              >
                {JSON.stringify(selectedNotification.data, null, 2)}
              </ThemedText>
            </View>
          )}
        </ThemedView>
      ) : (
        <>
          <ThemedView style={styles.processCard}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <View style={{ flex: 1 }}>
                <ThemedText
                  style={[styles.processTitle, { color: primaryTextColor }]}
                >
                  Notificações
                </ThemedText>
                <ThemedText
                  style={[styles.processSubtitle, { color: mutedTextColor }]}
                >
                  {unreadCount > 0
                    ? `${unreadCount} não lida${unreadCount > 1 ? "s" : ""}`
                    : "Sem notificações não lidas"}
                </ThemedText>
              </View>
              <TouchableOpacity
                onPress={() => router.push("/Notificacoes/Preferencias")}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  backgroundColor: tintColor + "20",
                  borderRadius: 6,
                }}
              >
                <ThemedText
                  style={{
                    fontSize: 12,
                    color: tintColor,
                    fontWeight: "600",
                  }}
                >
                  ⚙️ Preferências
                </ThemedText>
              </TouchableOpacity>
            </View>
            {unreadCount > 0 && (
              <TouchableOpacity
                onPress={handleMarkAllAsRead}
                style={{ marginTop: 8 }}
              >
                <ThemedText
                  style={{ color: tintColor, fontSize: 12, fontWeight: "600" }}
                >
                  Marcar tudo como lido
                </ThemedText>
              </TouchableOpacity>
            )}
          </ThemedView>

          {notifications.length === 0 ? (
            <ThemedText
              style={{
                color: mutedTextColor,
                marginTop: 12,
                textAlign: "center",
              }}
            >
              Nenhuma notificação
            </ThemedText>
          ) : (
            <View style={{ marginTop: 12 }}>
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onPress={handleNotificationPress}
                  onDelete={handleDeleteNotification}
                />
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}
