import { useAuth } from "@/core/auth/AuthContext";
import {
    deleteNotification,
    listNotifications,
    markAsRead,
    type Notification,
} from "@/services/notifications";
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";

interface NotificationsContextType {
  notifications: Notification[];
  unreadCount: number;
  refreshing: boolean;
  modalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  refresh: () => Promise<void>;
  markAsReadNotification: (id: string) => Promise<void>;
  deleteNotificationItem: (id: string) => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextType>(
  undefined!,
);

export function NotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await listNotifications(user.id, 50);
      setNotifications(data);

      // Derive unread count from the loaded list to avoid an extra API call
      const count = data.filter((n) => !n.is_read).length;
      setUnreadCount(count);
    } catch (error) {
      console.error("Erro ao carregar notificações:", error);
    }
  }, [user?.id]);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    setRefreshing(true);
    try {
      await fetchNotifications();
    } finally {
      setRefreshing(false);
    }
  }, [user?.id, fetchNotifications]);

  const markAsReadNotification = useCallback(
    async (id: string) => {
      try {
        await markAsRead(id, user?.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (error) {
        console.error("Erro ao marcar como lido:", error);
      }
    },
    [user?.id],
  );

  const deleteNotificationItem = useCallback(
    async (id: string) => {
      try {
        await deleteNotification(id, user?.id);
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      } catch (error) {
        console.error("Erro ao deletar notificação:", error);
      }
    },
    [user?.id],
  );

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // Atualiza a cada 30s
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const openModal = useCallback(() => {
    setModalOpen(true);
    refresh();
  }, [refresh]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        unreadCount,
        refreshing,
        modalOpen,
        openModal,
        closeModal,
        refresh,
        markAsReadNotification,
        deleteNotificationItem,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error(
      "useNotifications deve ser usado dentro de NotificationsProvider",
    );
  }
  return context;
}
