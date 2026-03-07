import { useAuth } from "@/core/auth/AuthContext";
import {
    deleteNotification,
    getUnreadNotificationCount,
    listNotifications,
    markAsRead,
    type Notification,
} from "@/services/notifications";
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";

/**
 * B4 Fix — Polling optimization:
 * - Background polling (every 60s) only fetches the unread COUNT via
 *   server-side `countCrud` (1 lightweight SQL COUNT query).
 * - Full notification list is loaded only when:
 *   (a) the modal opens, or
 *   (b) the user explicitly pulls to refresh.
 * This eliminates fetching 50 full notification rows every 30s.
 */

const POLL_INTERVAL_MS = 60_000; // 60 seconds

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
  const listLoadedRef = useRef(false);

  /** Lightweight badge poll — only fetches COUNT, not full rows */
  const pollUnreadCount = useCallback(async () => {
    if (!user?.id) return;
    try {
      const count = await getUnreadNotificationCount(user.id);
      setUnreadCount(count);
    } catch {
      // silent — badge count is best-effort
    }
  }, [user?.id]);

  /** Full list fetch — used on modal open and explicit refresh */
  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await listNotifications(user.id, 50);
      setNotifications(data);
      // Derive count from loaded list to stay in sync
      const count = data.filter((n) => !n.is_read).length;
      setUnreadCount(count);
      listLoadedRef.current = true;
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

  // Initial load: fetch count immediately; full list loaded on first modal open
  useEffect(() => {
    pollUnreadCount();
    const interval = setInterval(pollUnreadCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [pollUnreadCount]);

  const openModal = useCallback(() => {
    setModalOpen(true);
    // Always load fresh list when modal opens
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
