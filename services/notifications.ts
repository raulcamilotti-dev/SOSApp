import { api } from "./api";
import {
    API_DINAMICO,
    buildSearchParams,
    countCrud,
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

// ─────────────────────────────────────────────────────────────────
// Notificações
// ─────────────────────────────────────────────────────────────────

/**
 * List notifications for a user with server-side filtering, sorting,
 * and pagination. Fixes B1/B6: uses auto_exclude_deleted + server-side
 * sort DESC instead of client-side filtering/sorting.
 */
export async function listNotifications(
  userId: string,
  limit: number = 50,
  offset: number = 0,
): Promise<Notification[]> {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "notifications",
    ...buildSearchParams([{ field: "user_id", value: userId }], {
      sortColumn: "created_at DESC",
      autoExcludeDeleted: true,
    }),
    limit,
    offset,
  });
  return normalizeCrudList<Notification>(response.data);
}

export async function getNotification(id: string): Promise<Notification> {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "notifications",
    ...buildSearchParams([{ field: "id", value: id }], {
      autoExcludeDeleted: true,
    }),
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
  // Verify ownership before updating
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

/**
 * Mark ALL unread notifications as read for a user in a single SQL UPDATE.
 * Fixes B2: replaces N individual UPDATE requests with 1 api_dinamico call.
 */
export async function markAllAsRead(userId: string): Promise<void> {
  await api.post(API_DINAMICO, {
    sql: `UPDATE notifications SET is_read = true, read_at = NOW() WHERE user_id = '${userId}' AND is_read = false AND deleted_at IS NULL`,
  });
}

export async function deleteNotification(
  id: string,
  userId?: string,
): Promise<void> {
  // Verify ownership before deleting
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

// ─────────────────────────────────────────────────────────────────
// Preferências de Notificação
// ─────────────────────────────────────────────────────────────────

export async function listNotificationPreferences(
  userId: string,
): Promise<NotificationPreference[]> {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "notification_preferences",
    ...buildSearchParams([{ field: "user_id", value: userId }], {
      autoExcludeDeleted: true,
    }),
  });
  return normalizeCrudList<NotificationPreference>(response.data);
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
      { combineType: "AND", autoExcludeDeleted: true },
    ),
  });
  const all = normalizeCrudList<NotificationPreference>(response.data);
  return all[0] ?? null;
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

/**
 * Get unread notification count using server-side COUNT.
 * Fixes B3: uses countCrud with is_read=false filter instead of
 * loading ALL notifications and counting client-side.
 */
export async function getUnreadNotificationCount(
  userId: string,
): Promise<number> {
  return countCrud(
    "notifications",
    [
      { field: "user_id", value: userId },
      { field: "is_read", value: "false" },
    ],
    { combineType: "AND", autoExcludeDeleted: true },
  );
}
