import { api } from "./api";

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
  limit: number = 50,
  offset: number = 0,
): Promise<Notification[]> {
  const response = await api.post(
    "https://n8n.sosescritura.com.br/webhook/api_crud",
    {
      action: "list",
      table: "notifications",
      filters: {
        user_id: userId,
      },
      limit,
      offset,
      sort: [{ field: "created_at", order: "DESC" }],
    },
  );
  return response.data.data || [];
}

export async function getNotification(id: string): Promise<Notification> {
  const response = await api.post(
    "https://n8n.sosescritura.com.br/webhook/api_crud",
    {
      action: "read",
      table: "notifications",
      id,
    },
  );
  return response.data.data;
}

export async function createNotification(
  payload: CreateNotificationPayload,
): Promise<Notification> {
  const response = await api.post(
    "https://n8n.sosescritura.com.br/webhook/api_crud",
    {
      action: "create",
      table: "notifications",
      payload,
    },
  );
  return response.data.data;
}

export async function markAsRead(id: string): Promise<Notification> {
  const response = await api.post(
    "https://n8n.sosescritura.com.br/webhook/api_crud",
    {
      action: "update",
      table: "notifications",
      id,
      payload: {
        is_read: true,
        read_at: new Date().toISOString(),
      },
    },
  );
  return response.data.data;
}

export async function markAllAsRead(userId: string): Promise<void> {
  await api.post("https://n8n.sosescritura.com.br/webhook/api_crud", {
    action: "update_batch",
    table: "notifications",
    filters: {
      user_id: userId,
      is_read: false,
    },
    payload: {
      is_read: true,
      read_at: new Date().toISOString(),
    },
  });
}

export async function deleteNotification(id: string): Promise<void> {
  await api.post("https://n8n.sosescritura.com.br/webhook/api_crud", {
    action: "delete",
    table: "notifications",
    id,
  });
}

// Preferências de Notificação
export async function listNotificationPreferences(
  userId: string,
): Promise<NotificationPreference[]> {
  const response = await api.post(
    "https://n8n.sosescritura.com.br/webhook/api_crud",
    {
      action: "list",
      table: "notification_preferences",
      filters: {
        user_id: userId,
      },
    },
  );
  return response.data.data || [];
}

export async function getNotificationPreference(
  userId: string,
  type: NotificationType,
): Promise<NotificationPreference | null> {
  const response = await api.post(
    "https://n8n.sosescritura.com.br/webhook/api_crud",
    {
      action: "list",
      table: "notification_preferences",
      filters: {
        user_id: userId,
        notification_type: type,
      },
      limit: 1,
    },
  );
  const data = response.data.data || [];
  return data[0] || null;
}

export async function updateNotificationPreference(
  userId: string,
  type: NotificationType,
  payload: Omit<UpdateNotificationPreferencePayload, "notification_type">,
): Promise<NotificationPreference> {
  const existing = await getNotificationPreference(userId, type);

  if (existing) {
    const response = await api.post(
      "https://n8n.sosescritura.com.br/webhook/api_crud",
      {
        action: "update",
        table: "notification_preferences",
        id: existing.id,
        payload: {
          enabled:
            payload.enabled !== undefined ? payload.enabled : existing.enabled,
          channels: payload.channels || existing.channels,
        },
      },
    );
    return response.data.data;
  } else {
    // Create new preference if doesn't exist
    const response = await api.post(
      "https://n8n.sosescritura.com.br/webhook/api_crud",
      {
        action: "create",
        table: "notification_preferences",
        payload: {
          notification_type: type,
          enabled: payload.enabled !== false,
          channels: payload.channels || ["in_app"],
        },
      },
    );
    return response.data.data;
  }
}

export async function getUnreadNotificationCount(
  userId: string,
): Promise<number> {
  const response = await api.post(
    "https://n8n.sosescritura.com.br/webhook/api_crud",
    {
      action: "count",
      table: "notifications",
      filters: {
        user_id: userId,
        is_read: false,
      },
    },
  );
  return response.data.count || 0;
}
