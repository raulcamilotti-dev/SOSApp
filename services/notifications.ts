import { api } from "./api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
    normalizeCrudOne,
} from "./crud";

export type NotificationType =
  | "new_process"
  | "process_update"
  | "document_requested"
  | "document_received"
  | "document_fulfilled"
  | "process_status_changed"
  | "appointment_scheduled"
  | "appointment_reminder"
  | "general_alert";

export type NotificationChannel = "in_app" | "android" | "ios" | "email";

export interface Notification {
  id: string;
  tenant_id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  related_table?: string | null;
  related_id?: string | null;
  is_read: boolean;
  data?: Record<string, any> | null;
  created_at: string;
  read_at?: string | null;
  deleted_at?: string | null;
}

export interface NotificationPreference {
  id: string;
  tenant_id: string;
  user_id: string;
  notification_type: NotificationType;
  enabled: boolean;
  channels: NotificationChannel[];
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface CreateNotificationPayload {
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  related_table?: string;
  related_id?: string;
  data?: Record<string, any>;
}

export interface UpdateNotificationPreferencePayload {
  notification_type: NotificationType;
  enabled?: boolean;
  channels?: NotificationChannel[];
}

// Notificações
export async function listNotifications(
  userId: string,
  _limit: number = 50,
  _offset: number = 0,
): Promise<Notification[]> {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "notifications",
    ...buildSearchParams([{ field: "user_id", value: userId }], {
      sortColumn: "created_at",
    }),
  });
  const all = normalizeCrudList<Notification>(response.data);
  // client-side fallback in case server-side filter is ignored
  return all
    .filter((n) => n.user_id === userId && !n.deleted_at)
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
}

export async function getNotification(id: string): Promise<Notification> {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "notifications",
    ...buildSearchParams([{ field: "id", value: id }]),
  });
  const all = normalizeCrudList<Notification>(response.data);
  const found = all.find((n) => n.id === id);
  if (!found) throw new Error("Notificação não encontrada");
  return found;
}

export async function createNotification(
  payload: CreateNotificationPayload,
): Promise<Notification> {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "notifications",
    payload,
  });
  return normalizeCrudOne<Notification>(response.data);
}

export async function markAsRead(
  id: string,
  userId?: string,
): Promise<Notification> {
  // B5 fix: Verify ownership before updating — fetch the notification first
  if (userId) {
    const checkRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "notifications",
      ...buildSearchParams([
        { field: "id", value: id },
        { field: "user_id", value: userId },
      ]),
    });
    const match = normalizeCrudList<Notification>(checkRes.data);
    if (match.length === 0) {
      throw new Error("Notificação não encontrada ou sem permissão");
    }
  }

  const response = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "notifications",
    payload: {
      id,
      is_read: true,
      read_at: new Date().toISOString(),
    },
  });
  return normalizeCrudOne<Notification>(response.data);
}

export async function markAllAsRead(userId: string): Promise<void> {
  // List all unread notifications for this user and mark each as read
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "notifications",
    ...buildSearchParams([{ field: "user_id", value: userId }]),
  });
  const all = normalizeCrudList<Notification>(response.data);
  // client-side fallback filter
  const unread = all.filter(
    (n) => n.user_id === userId && !n.is_read && !n.deleted_at,
  );
  // Parallel batch update (max 10 concurrent to avoid overload)
  const batchSize = 10;
  for (let i = 0; i < unread.length; i += batchSize) {
    const batch = unread.slice(i, i + batchSize);
    await Promise.all(
      batch.map((n) =>
        api.post(CRUD_ENDPOINT, {
          action: "update",
          table: "notifications",
          payload: {
            id: n.id,
            is_read: true,
            read_at: new Date().toISOString(),
          },
        }),
      ),
    );
  }
}

export async function deleteNotification(
  id: string,
  userId?: string,
): Promise<void> {
  // B5 fix: Verify ownership before deleting
  if (userId) {
    const checkRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "notifications",
      ...buildSearchParams([
        { field: "id", value: id },
        { field: "user_id", value: userId },
      ]),
    });
    const match = normalizeCrudList<Notification>(checkRes.data);
    if (match.length === 0) {
      throw new Error("Notificação não encontrada ou sem permissão");
    }
  }

  await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "notifications",
    payload: { id },
  });
}

// Preferências de Notificação
export async function listNotificationPreferences(
  userId: string,
): Promise<NotificationPreference[]> {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "notification_preferences",
    ...buildSearchParams([{ field: "user_id", value: userId }]),
  });
  const all = normalizeCrudList<NotificationPreference>(response.data);
  // client-side fallback filter
  return all.filter((p) => p.user_id === userId && !p.deleted_at);
}

export async function getNotificationPreference(
  userId: string,
  type: NotificationType,
): Promise<NotificationPreference | null> {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "notification_preferences",
    ...buildSearchParams(
      [
        { field: "user_id", value: userId },
        { field: "notification_type", value: type },
      ],
      { combineType: "AND" },
    ),
  });
  const all = normalizeCrudList<NotificationPreference>(response.data);
  // client-side fallback filter
  return (
    all.find(
      (p) =>
        p.user_id === userId && p.notification_type === type && !p.deleted_at,
    ) ?? null
  );
}

export async function updateNotificationPreference(
  userId: string,
  type: NotificationType,
  payload: Omit<UpdateNotificationPreferencePayload, "notification_type">,
  tenantId?: string,
): Promise<NotificationPreference> {
  const existing = await getNotificationPreference(userId, type);

  if (existing) {
    const response = await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "notification_preferences",
      payload: {
        id: existing.id,
        enabled:
          payload.enabled !== undefined ? payload.enabled : existing.enabled,
        channels: payload.channels || existing.channels,
      },
    });
    return normalizeCrudOne<NotificationPreference>(response.data);
  } else {
    if (!tenantId) {
      throw new Error(
        "tenant_id é obrigatório para criar preferência de notificação",
      );
    }
    // Create new preference if doesn't exist
    const response = await api.post(CRUD_ENDPOINT, {
      action: "create",
      table: "notification_preferences",
      payload: {
        user_id: userId,
        tenant_id: tenantId,
        notification_type: type,
        enabled: payload.enabled !== false,
        channels: payload.channels || ["in_app"],
      },
    });
    return normalizeCrudOne<NotificationPreference>(response.data);
  }
}

export async function getUnreadNotificationCount(
  userId: string,
): Promise<number> {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "notifications",
    ...buildSearchParams([{ field: "user_id", value: userId }]),
  });
  const all = normalizeCrudList<Notification>(response.data);
  // client-side fallback filter
  return all.filter((n) => n.user_id === userId && !n.is_read && !n.deleted_at)
    .length;
}
