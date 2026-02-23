/**
 * Calendar Sync Service
 *
 * Gera feeds iCal (.ics) e URLs de assinatura para sincronizar
 * agenda e tarefas com calendários externos (Google, Outlook, Apple, etc.)
 */
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { Platform, Share } from "react-native";
import { api } from "./api";
import { buildSearchParams, CRUD_ENDPOINT, normalizeCrudList } from "./crud";

// ─── Tipos ──────────────────────────────────────────────────
export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: string; // ISO 8601
  end: string; // ISO 8601
  status?: string;
  location?: string;
  type: "appointment" | "task" | "deadline";
  priority?: "low" | "medium" | "high" | "urgent";
}

export interface CalendarSyncSettings {
  id?: string;
  user_id: string;
  tenant_id: string;
  sync_appointments: boolean;
  sync_tasks: boolean;
  sync_deadlines: boolean;
  default_reminder_minutes: number;
  is_active: boolean;
  last_synced?: string;
}

export type CalendarProvider = "google" | "outlook" | "apple" | "other";

// ─── Constantes ─────────────────────────────────────────────
const N8N_BASE = "https://n8n.sosescritura.com.br/webhook";
const FEED_PATH = "calendar-feed";

// ─── Token Management ───────────────────────────────────────

/** Busca o calendar_token do usuário */
export async function getCalendarToken(userId: string): Promise<string | null> {
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "users",
      ...buildSearchParams([{ field: "id", value: String(userId) }]),
    });
    const users = normalizeCrudList<any>(res.data);
    return users[0]?.calendar_token || null;
  } catch (err) {
    console.error("[CalendarSync] Erro ao buscar token:", err);
    return null;
  }
}

/** Valida formato UUID para prevenir SQL injection */
function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    str,
  );
}

/** Regenera o calendar_token (invalida URLs anteriores) */
export async function regenerateCalendarToken(
  userId: string,
): Promise<string | null> {
  if (!isValidUUID(userId)) {
    console.error("[CalendarSync] userId inválido:", userId);
    return null;
  }
  try {
    // Seguro: userId já validado como UUID
    const res = await api.post("api_dinamico", {
      sql: `UPDATE users SET calendar_token = gen_random_uuid() WHERE id = '${userId}' AND deleted_at IS NULL RETURNING calendar_token`,
    });
    const rows = res.data?.data || res.data?.value || res.data || [];
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row?.calendar_token || null;
  } catch (err) {
    console.error("[CalendarSync] Erro ao regenerar token:", err);
    return null;
  }
}

// ─── Sync Settings ──────────────────────────────────────────

/** Busca preferências de sincronização */
export async function getSyncSettings(
  userId: string,
): Promise<CalendarSyncSettings | null> {
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "calendar_sync_settings",
      ...buildSearchParams([{ field: "user_id", value: String(userId) }]),
    });
    const rows = normalizeCrudList<CalendarSyncSettings>(res.data);
    return rows[0] || null;
  } catch {
    return null;
  }
}

/** Cria ou atualiza preferências de sincronização */
export async function saveSyncSettings(
  settings: Partial<CalendarSyncSettings> & {
    user_id: string;
    tenant_id: string;
  },
): Promise<CalendarSyncSettings | null> {
  try {
    // Tenta buscar existente
    const existing = await getSyncSettings(settings.user_id);

    const action = existing ? "update" : "create";
    const payload = existing
      ? { ...settings, updated_at: new Date().toISOString() }
      : {
          ...settings,
          sync_appointments: settings.sync_appointments ?? true,
          sync_tasks: settings.sync_tasks ?? true,
          sync_deadlines: settings.sync_deadlines ?? true,
          default_reminder_minutes: settings.default_reminder_minutes ?? 30,
          is_active: settings.is_active ?? true,
        };

    const res = await api.post(CRUD_ENDPOINT, {
      action,
      table: "calendar_sync_settings",
      payload: existing ? { id: existing.id, ...payload } : payload,
    });

    return res.data?.data?.[0] || res.data?.value?.[0] || (payload as any);
  } catch (err) {
    console.error("[CalendarSync] Erro ao salvar preferências:", err);
    return null;
  }
}

// ─── URL Generators ─────────────────────────────────────────

/** Gera a URL base do feed iCal */
export function getFeedUrl(calendarToken: string): string {
  return `${N8N_BASE}/${FEED_PATH}?token=${calendarToken}`;
}

/** Gera a URL webcal:// para assinatura */
export function getWebcalUrl(calendarToken: string): string {
  const httpUrl = getFeedUrl(calendarToken);
  return httpUrl.replace(/^https?:\/\//, "webcal://");
}

/**
 * Gera deep link para adicionar ao Google Calendar
 * O parâmetro cid precisa usar webcal:// para funcionar como assinatura
 * @see https://support.google.com/calendar/answer/37100
 */
export function getGoogleCalendarUrl(calendarToken: string): string {
  const webcalUrl = getWebcalUrl(calendarToken);
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;
}

/**
 * Gera deep link para adicionar ao Outlook
 * Usa webcal:// para que Outlook trate como assinatura (atualização automática)
 * @see https://support.microsoft.com/en-us/office/import-or-subscribe-to-a-calendar
 */
export function getOutlookUrl(calendarToken: string): string {
  const webcalUrl = getWebcalUrl(calendarToken);
  return `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(webcalUrl)}&name=SOS%20Escritura`;
}

/**
 * Gera deep link para adicionar ao Apple Calendar (iOS/macOS)
 * Usa o protocolo webcal:// que o Apple Calendar reconhece nativamente
 */
export function getAppleCalendarUrl(calendarToken: string): string {
  return getWebcalUrl(calendarToken);
}

/** Retorna a URL correta para o provedor */
export function getProviderUrl(
  provider: CalendarProvider,
  calendarToken: string,
): string {
  switch (provider) {
    case "google":
      return getGoogleCalendarUrl(calendarToken);
    case "outlook":
      return getOutlookUrl(calendarToken);
    case "apple":
      return getAppleCalendarUrl(calendarToken);
    default:
      return getWebcalUrl(calendarToken);
  }
}

// ─── Actions ────────────────────────────────────────────────

/**
 * Abre a URL de assinatura no navegador/app externo.
 * Retorna { ok, feedUrl } — se ok=false o chamador pode mostrar fallback.
 */
export async function subscribeToCalendar(
  provider: CalendarProvider,
  calendarToken: string,
): Promise<{ ok: boolean; feedUrl: string }> {
  const feedUrl = getFeedUrl(calendarToken);

  // Para "other" apenas copiamos a URL e retornamos
  if (provider === "other") {
    await Clipboard.setStringAsync(feedUrl);
    return { ok: true, feedUrl };
  }

  const url = getProviderUrl(provider, calendarToken);
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
      return { ok: true, feedUrl };
    }
    // Fallback: tenta abrir a URL webcal diretamente
    const webcal = getWebcalUrl(calendarToken);
    const canWebcal = await Linking.canOpenURL(webcal);
    if (canWebcal) {
      await Linking.openURL(webcal);
      return { ok: true, feedUrl };
    }
    // Nenhum handler — chamador vai mostrar fallback manual
    return { ok: false, feedUrl };
  } catch (err) {
    console.error("[CalendarSync] Erro ao abrir URL:", err);
    return { ok: false, feedUrl };
  }
}

/** Copia a URL do feed para a área de transferência */
export async function copyFeedUrl(calendarToken: string): Promise<void> {
  const url = getFeedUrl(calendarToken);
  await Clipboard.setStringAsync(url);
}

/** Compartilha a URL do feed via Share nativo */
export async function shareFeedUrl(calendarToken: string): Promise<void> {
  const url = getFeedUrl(calendarToken);
  await Share.share({
    message: `Minha agenda SOS Escritura: ${url}`,
    url: Platform.OS === "ios" ? url : undefined,
  });
}

// ─── iCal Generation (Client-side) ─────────────────────────

/** Formata data para iCal (YYYYMMDDTHHMMSSZ) */
function toICalDate(isoDate: string): string {
  return new Date(isoDate)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/** Escapa texto para iCal */
function escapeIcal(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** Gera conteúdo .ics a partir de eventos */
export function generateIcsContent(
  events: CalendarEvent[],
  calendarName = "SOS Escritura",
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SOS Escritura//Calendar//PT-BR",
    `X-WR-CALNAME:${escapeIcal(calendarName)}`,
    "X-WR-TIMEZONE:America/Sao_Paulo",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    // Timezone definition
    "BEGIN:VTIMEZONE",
    "TZID:America/Sao_Paulo",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:-0300",
    "TZOFFSETTO:-0300",
    "TZNAME:BRT",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  for (const event of events) {
    const uid = `${event.id}@sosescritura.com.br`;
    const now = toICalDate(new Date().toISOString());

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART;TZID=America/Sao_Paulo:${toICalDate(event.start)}`);
    lines.push(`DTEND;TZID=America/Sao_Paulo:${toICalDate(event.end)}`);
    lines.push(`SUMMARY:${escapeIcal(event.summary)}`);

    if (event.description) {
      lines.push(`DESCRIPTION:${escapeIcal(event.description)}`);
    }
    if (event.location) {
      lines.push(`LOCATION:${escapeIcal(event.location)}`);
    }

    // Categoria baseada no tipo
    const categories: Record<string, string> = {
      appointment: "Agendamento",
      task: "Tarefa",
      deadline: "Prazo",
    };
    lines.push(`CATEGORIES:${categories[event.type] || "Geral"}`);

    // Prioridade iCal (1=alta, 5=normal, 9=baixa)
    if (event.priority) {
      const priorityMap: Record<string, number> = {
        urgent: 1,
        high: 2,
        medium: 5,
        low: 9,
      };
      lines.push(`PRIORITY:${priorityMap[event.priority] || 5}`);
    }

    // Status
    if (event.status) {
      const statusMap: Record<string, string> = {
        scheduled: "CONFIRMED",
        confirmed: "CONFIRMED",
        in_progress: "CONFIRMED",
        completed: "CANCELLED",
        cancelled: "CANCELLED",
        todo: "TENTATIVE",
        pending: "TENTATIVE",
      };
      lines.push(`STATUS:${statusMap[event.status] || "CONFIRMED"}`);
    }

    // Alarme padrão (30 min antes)
    lines.push("BEGIN:VALARM");
    lines.push("TRIGGER:-PT30M");
    lines.push("ACTION:DISPLAY");
    lines.push(`DESCRIPTION:${escapeIcal(event.summary)}`);
    lines.push("END:VALARM");

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

// ─── Data Fetching ──────────────────────────────────────────

/** Helper: resolve service names for a batch of appointments */
async function resolveServiceNames(rows: any[]): Promise<Map<string, string>> {
  const ids = [
    ...new Set(rows.map((r) => String(r.service_id ?? "")).filter(Boolean)),
  ];
  if (ids.length === 0) return new Map();

  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "services",
      ...buildSearchParams(
        ids.length === 1
          ? [{ field: "id", value: ids[0], operator: "equal" }]
          : [{ field: "id", value: ids.join(","), operator: "in" }],
      ),
    });
    const list = normalizeCrudList<any>(res.data);
    const map = new Map<string, string>();
    for (const s of list) {
      if (s.id && s.name) map.set(String(s.id), String(s.name));
    }
    return map;
  } catch {
    return new Map();
  }
}

/** Busca agendamentos onde o usuário é parceiro */
export async function fetchPartnerAppointments(
  userId: string,
): Promise<CalendarEvent[]> {
  try {
    // Busca o partner vinculado ao user
    const partnerRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "partners",
      ...buildSearchParams([{ field: "user_id", value: String(userId) }]),
    });
    const partners = normalizeCrudList<any>(partnerRes.data);
    const partner = partners[0];
    if (!partner?.id) return [];

    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "service_appointments",
      ...buildSearchParams([
        { field: "partner_id", value: String(partner.id) },
      ]),
    });
    const rows = normalizeCrudList<any>(res.data);

    const active = rows.filter(
      (r: any) => r.status !== "cancelled" && !r.deleted_at,
    );
    const serviceNames = await resolveServiceNames(active);

    return active.map((r: any) => ({
      id: r.id,
      summary:
        serviceNames.get(String(r.service_id ?? "")) ||
        r.notes ||
        "Agendamento",
      description: `Status: ${r.status}`,
      start: r.scheduled_start,
      end: r.scheduled_end,
      status: r.status,
      type: "appointment" as const,
    }));
  } catch {
    return [];
  }
}

/** Busca agendamentos onde o usuário é cliente */
export async function fetchCustomerAppointments(
  userId: string,
): Promise<CalendarEvent[]> {
  try {
    const customerRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "customers",
      ...buildSearchParams([{ field: "user_id", value: String(userId) }]),
    });
    const customers = normalizeCrudList<any>(customerRes.data);
    const customer = customers[0];
    if (!customer?.id) return [];

    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "service_appointments",
      ...buildSearchParams([
        { field: "customer_id", value: String(customer.id) },
      ]),
    });
    const rows = normalizeCrudList<any>(res.data);

    const active = rows.filter(
      (r: any) => r.status !== "cancelled" && !r.deleted_at,
    );
    const serviceNames = await resolveServiceNames(active);

    return active.map((r: any) => ({
      id: r.id,
      summary:
        serviceNames.get(String(r.service_id ?? "")) ||
        r.notes ||
        "Agendamento",
      description: `Status: ${r.status}`,
      start: r.scheduled_start,
      end: r.scheduled_end,
      status: r.status,
      type: "appointment" as const,
    }));
  } catch {
    return [];
  }
}

/** Busca tarefas do usuário e converte para CalendarEvent[] */
export async function fetchTasks(userId: string): Promise<CalendarEvent[]> {
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "tasks",
      ...buildSearchParams([{ field: "assigned_to", value: String(userId) }]),
    });
    const rows = normalizeCrudList<any>(res.data);

    return rows
      .filter(
        (r: any) =>
          !["done", "completed", "cancelled"].includes(r.status) &&
          !r.deleted_at,
      )
      .map((r: any) => ({
        id: r.id,
        summary: r.title || "Tarefa",
        description: r.description || `Prioridade: ${r.priority || "normal"}`,
        start: r.start_date || r.due_date || r.created_at,
        end:
          r.due_date ||
          new Date(
            new Date(r.start_date || r.created_at).getTime() + 3600000,
          ).toISOString(),
        status: r.status,
        type: "task" as const,
        priority: r.priority,
      }));
  } catch {
    return [];
  }
}

/** Busca prazos (process_deadlines) e converte para CalendarEvent[] */
export async function fetchDeadlines(
  tenantId: string,
): Promise<CalendarEvent[]> {
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "process_deadlines",
      ...buildSearchParams([{ field: "tenant_id", value: String(tenantId) }]),
    });
    const rows = normalizeCrudList<any>(res.data);

    return rows
      .filter((r: any) => !r.deleted_at && r.deadline_date)
      .map((r: any) => ({
        id: r.id,
        summary: r.description || "Prazo",
        description: `Prazo do processo`,
        start: r.deadline_date,
        end: r.deadline_date,
        status: r.status,
        type: "deadline" as const,
        priority: "high" as const,
      }));
  } catch {
    return [];
  }
}

/** Busca todos os eventos e gera conteúdo .ics */
export async function exportAllAsIcs(
  userId: string,
  tenantId: string,
  settings?: CalendarSyncSettings | null,
): Promise<string> {
  const [partnerAppts, customerAppts, tasks, deadlines] = await Promise.all([
    settings?.sync_appointments !== false
      ? fetchPartnerAppointments(userId)
      : Promise.resolve([]),
    settings?.sync_appointments !== false
      ? fetchCustomerAppointments(userId)
      : Promise.resolve([]),
    settings?.sync_tasks !== false ? fetchTasks(userId) : Promise.resolve([]),
    settings?.sync_deadlines !== false
      ? fetchDeadlines(tenantId)
      : Promise.resolve([]),
  ]);

  // Deduplica caso o usuário seja parceiro E cliente no mesmo agendamento
  const apptMap = new Map<string, CalendarEvent>();
  for (const a of [...partnerAppts, ...customerAppts]) {
    if (!apptMap.has(a.id)) apptMap.set(a.id, a);
  }
  const allEvents = [...apptMap.values(), ...tasks, ...deadlines];
  return generateIcsContent(allEvents);
}

// ─── Provider Info ──────────────────────────────────────────

export interface ProviderInfo {
  id: CalendarProvider;
  name: string;
  icon: string; // Ionicons name
  color: string;
  description: string;
}

export const CALENDAR_PROVIDERS: ProviderInfo[] = [
  {
    id: "google",
    name: "Google Calendar",
    icon: "logo-google",
    color: "#4285F4",
    description: "Sincroniza automaticamente com sua conta Google",
  },
  {
    id: "outlook",
    name: "Outlook / Hotmail",
    icon: "mail",
    color: "#0078D4",
    description: "Sincroniza com Outlook.com e Microsoft 365",
  },
  {
    id: "apple",
    name: "Apple Calendar",
    icon: "logo-apple",
    color: "#333333",
    description: "Sincroniza com iCal no iPhone, iPad e Mac",
  },
  {
    id: "other",
    name: "Outro (URL iCal)",
    icon: "calendar",
    color: "#FF9500",
    description: "Copie a URL para usar em qualquer app de calendário",
  },
];
