import { ThemedText } from "@/components/themed-text";
import { useNotifications } from "@/core/context/NotificationsContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
    Alert,
    Modal,
    RefreshControl,
    ScrollView,
    TouchableOpacity,
    View,
} from "react-native";

export function NotificationsModal() {
  const {
    notifications,
    unreadCount,
    refreshing,
    modalOpen,
    closeModal,
    refresh,
    markAsReadNotification,
    deleteNotificationItem,
  } = useNotifications();

  const primaryTextColor = useThemeColor({}, "text");
  const mutedTextColor = useThemeColor({}, "muted");
  const tintColor = useThemeColor({}, "tint");
  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const backgroundColor = useThemeColor({}, "background");

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

  const handleDeleteNotification = (id: string) => {
    Alert.alert("Confirmação", "Deseja remover esta notificação?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Remover",
        style: "destructive",
        onPress: () => deleteNotificationItem(id),
      },
    ]);
  };

  return (
    <Modal
      visible={modalOpen}
      animationType="fade"
      transparent
      statusBarTranslucent
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          justifyContent: "flex-end",
        }}
      >
        <TouchableOpacity
          style={{ flex: 1 }}
          onPress={closeModal}
          activeOpacity={1}
        />
        <View
          style={{
            backgroundColor,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: "85%",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.1,
            shadowRadius: 8,
            elevation: 10,
          }}
        >
          <View
            style={{
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: 8,
              borderBottomWidth: 1,
              borderBottomColor: borderColor,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <View>
              <ThemedText
                style={{
                  fontSize: 18,
                  fontWeight: "700",
                  color: primaryTextColor,
                }}
              >
                Notificações
              </ThemedText>
              <ThemedText
                style={{
                  fontSize: 12,
                  color: mutedTextColor,
                  marginTop: 2,
                }}
              >
                {unreadCount > 0
                  ? `${unreadCount} não lida${unreadCount > 1 ? "s" : ""}`
                  : "Tudo em dia"}
              </ThemedText>
            </View>
            <TouchableOpacity
              onPress={closeModal}
              style={{
                width: 32,
                height: 32,
                justifyContent: "center",
                alignItems: "center",
                borderRadius: 16,
                backgroundColor: tintColor + "20",
              }}
            >
              <ThemedText style={{ fontSize: 18, color: tintColor }}>
                ✕
              </ThemedText>
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: 12,
              paddingVertical: 12,
            }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={refresh} />
            }
          >
            {notifications.length === 0 ? (
              <View
                style={{
                  minHeight: 200,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <ThemedText
                  style={{
                    color: mutedTextColor,
                    fontSize: 14,
                    textAlign: "center",
                  }}
                >
                  Nenhuma notificação
                </ThemedText>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {notifications.map((notification) => (
                  <TouchableOpacity
                    key={notification.id}
                    onPress={async () => {
                      if (!notification.is_read) {
                        await markAsReadNotification(notification.id);
                      }
                    }}
                    style={{
                      backgroundColor: notification.is_read
                        ? cardColor
                        : tintColor + "15",
                      borderLeftWidth: 4,
                      borderLeftColor: notification.is_read
                        ? borderColor
                        : tintColor,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
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
                            fontSize: 13,
                            fontWeight: notification.is_read ? "500" : "700",
                            color: primaryTextColor,
                          }}
                        >
                          {notification.title}
                        </ThemedText>
                        <ThemedText
                          style={{
                            fontSize: 11,
                            color: mutedTextColor,
                            marginTop: 3,
                            lineHeight: 16,
                          }}
                          numberOfLines={2}
                        >
                          {notification.message}
                        </ThemedText>
                        <ThemedText
                          style={{
                            fontSize: 10,
                            color: mutedTextColor,
                            marginTop: 4,
                          }}
                        >
                          {formatDate(notification.created_at)}
                        </ThemedText>
                      </View>
                      <TouchableOpacity
                        onPress={() =>
                          handleDeleteNotification(notification.id)
                        }
                        style={{ marginLeft: 8, paddingVertical: 4 }}
                      >
                        <ThemedText
                          style={{
                            fontSize: 16,
                            color: tintColor,
                            opacity: 0.5,
                          }}
                        >
                          ✕
                        </ThemedText>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
