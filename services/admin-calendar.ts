/**
 * Admin Calendar Service
 *
 * Agrega todos os eventos (tarefas, agendamentos, prazos) de todos os
 * usuários do tenant para visualização administrativa do calendário.
 */
import { api } from "./api";
import { buildSearchParams, CRUD_ENDPOINT, normalizeCrudList } from "./crud";

// ─── Types ──────────────────────────────────────────────────

export interface AdminCalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: string; // ISO 8601
  end?: string;
  type: "task" | "appointment" | "deadline";
  status?: string;
  priority?: string;
  /** Nome do usuário responsável / parceiro / cliente */
  userName?: string;
  userId?: string;
  /** Metadados extras dependendo do tipo */
  meta?: Record<string, unknown>;
}

export interface AdminCalendarUser {
  id: string;
  fullname: string;
  email?: string;
  role?: string;
}

// ─── Helpers ────────────────────────────────────────────────

/** Validates UUID format to prevent SQL injection */
function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    str,
  );
}

const COLORS_BY_TYPE: Record<string, string> = {
  task: "#3b82f6", // blue
  appointment: "#8b5cf6", // purple
  deadline: "#ef4444", // red
};

export function getEventColor(type: string): string {
  return COLORS_BY_TYPE[type] || "#6b7280";
}

// ─── Data Fetching ──────────────────────────────────────────

/** Busca todos os agendamentos (service_appointments) do tenant */
async function fetchAllAppointments(
  tenantId: string,
): Promise<AdminCalendarEvent[]> {
  if (!isValidUUID(tenantId)) {
    console.error("[AdminCalendar] tenantId inválido:", tenantId);
    return [];
  }
  try {
    // Busca agendamentos + nomes de parceiro, cliente e serviço via SQL
    const res = await api.post("api_dinamico", {
      sql: `
        SELECT
          sa.id,
          sa.notes,
          sa.scheduled_start,
          sa.scheduled_end,
          sa.status,
          sa.partner_id,
          sa.customer_id,
          p.display_name AS partner_name,
          pu.fullname AS partner_user_name,
          c.name AS customer_name,
          cu.fullname AS customer_user_name,
          s.name AS service_name
        FROM service_appointments sa
        LEFT JOIN partners p ON p.id = sa.partner_id
        LEFT JOIN users pu ON pu.id = p.user_id
        LEFT JOIN customers c ON c.id = sa.customer_id
        LEFT JOIN users cu ON cu.id = c.user_id
        LEFT JOIN services s ON s.id = sa.service_id
        WHERE sa.tenant_id = '${tenantId}'
          AND sa.deleted_at IS NULL
          AND sa.status != 'cancelled'
        ORDER BY sa.scheduled_start DESC
      `,
    });

    const rows = normalizeCrudList<any>(res.data);
    return rows.map((r) => ({
      id: r.id,
      title: r.service_name || r.notes || "Agendamento",
      description: [
        r.partner_name && `Parceiro: ${r.partner_name}`,
        r.customer_name && `Cliente: ${r.customer_name}`,
        r.notes && `Obs: ${r.notes}`,
        `Status: ${r.status}`,
      ]
        .filter(Boolean)
        .join("\n"),
      start: r.scheduled_start,
      end: r.scheduled_end,
      type: "appointment" as const,
      status: r.status,
      userName:
        r.customer_user_name ||
        r.customer_name ||
        r.partner_user_name ||
        r.partner_name ||
        "–",
      userId: undefined,
      meta: {
        partner_name: r.partner_name,
        customer_name: r.customer_name,
        service_name: r.service_name,
      },
    }));
  } catch (err) {
    console.error("[AdminCalendar] Erro ao buscar agendamentos:", err);
    return [];
  }
}

/** Busca todas as tarefas do tenant com nome do responsável */
async function fetchAllTasks(tenantId: string): Promise<AdminCalendarEvent[]> {
  if (!isValidUUID(tenantId)) return [];
  try {
    const res = await api.post("api_dinamico", {
      sql: `
        SELECT
          t.id,
          t.title,
          t.description,
          t.status,
          t.priority,
          t.start_date,
          t.due_date,
          t.created_at,
          t.assigned_to,
          u.fullname AS assigned_name
        FROM tasks t
        LEFT JOIN users u ON u.id = t.assigned_to
        WHERE t.tenant_id = '${tenantId}'
          AND t.deleted_at IS NULL
        ORDER BY COALESCE(t.due_date, t.start_date, t.created_at) DESC
      `,
    });

    const rows = normalizeCrudList<any>(res.data);
    return rows.map((r) => ({
      id: r.id,
      title: r.title || "Tarefa",
      description: [
        r.description,
        r.assigned_name && `Responsável: ${r.assigned_name}`,
        `Prioridade: ${r.priority || "normal"}`,
      ]
        .filter(Boolean)
        .join("\n"),
      start: r.start_date || r.due_date || r.created_at,
      end:
        r.due_date ||
        (r.start_date
          ? new Date(new Date(r.start_date).getTime() + 3600000).toISOString()
          : undefined),
      type: "task" as const,
      status: r.status,
      priority: r.priority,
      userName: r.assigned_name || "Sem responsável",
      userId: r.assigned_to,
    }));
  } catch (err) {
    console.error("[AdminCalendar] Erro ao buscar tarefas:", err);
    return [];
  }
}

/** Busca todos os prazos (process_deadlines) do tenant */
async function fetchAllDeadlines(
  tenantId: string,
): Promise<AdminCalendarEvent[]> {
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "process_deadlines",
      ...buildSearchParams([{ field: "tenant_id", value: String(tenantId) }]),
    });

    const rows = normalizeCrudList<any>(res.data);
    return rows
      .filter((r: any) => !r.deleted_at && r.deadline_date)
      .map((r) => ({
        id: r.id,
        title: r.description || "Prazo",
        description: `Prazo do processo`,
        start: r.deadline_date,
        end: r.deadline_date,
        type: "deadline" as const,
        status: r.status,
        priority: "high",
        userName: undefined,
        userId: undefined,
      }));
  } catch (err) {
    console.error("[AdminCalendar] Erro ao buscar prazos:", err);
    return [];
  }
}

/** Busca todos os usuários do tenant (para filtros) */
export async function fetchTenantUsers(
  tenantId: string,
): Promise<AdminCalendarUser[]> {
  if (!isValidUUID(tenantId)) return [];
  try {
    const res = await api.post("api_dinamico", {
      sql: `
        SELECT u.id, u.fullname, u.email, u.role
        FROM users u
        INNER JOIN user_tenants ut ON ut.user_id = u.id AND ut.deleted_at IS NULL
        WHERE ut.tenant_id = '${tenantId}'
          AND u.deleted_at IS NULL
        ORDER BY u.fullname
      `,
    });
    return normalizeCrudList<AdminCalendarUser>(res.data);
  } catch {
    return [];
  }
}

/** Busca todos os eventos agregados do tenant */
export async function fetchAllCalendarEvents(
  tenantId: string,
): Promise<AdminCalendarEvent[]> {
  const [appointments, tasks, deadlines] = await Promise.all([
    fetchAllAppointments(tenantId),
    fetchAllTasks(tenantId),
    fetchAllDeadlines(tenantId),
  ]);

  return [...appointments, ...tasks, ...deadlines].sort((a, b) => {
    const da = a.start ? new Date(a.start).getTime() : 0;
    const db = b.start ? new Date(b.start).getTime() : 0;
    return da - db;
  });
}

// ─── Date Helpers ───────────────────────────────────────────

/** Retorna as datas do início e fim do mês */
export function getMonthRange(year: number, month: number) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59);
  return { start, end };
}

/** Retorna as datas do início e fim da semana (dom-sáb) */
export function getWeekRange(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const start = new Date(d);
  start.setDate(d.getDate() - day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** Agrupa eventos por data (YYYY-MM-DD) */
export function groupEventsByDate(
  events: AdminCalendarEvent[],
): Record<string, AdminCalendarEvent[]> {
  const groups: Record<string, AdminCalendarEvent[]> = {};
  for (const event of events) {
    if (!event.start) continue;
    const dateKey = event.start.substring(0, 10); // YYYY-MM-DD
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(event);
  }
  return groups;
}

/** Filtra eventos por período */
export function filterEventsByRange(
  events: AdminCalendarEvent[],
  start: Date,
  end: Date,
): AdminCalendarEvent[] {
  const startMs = start.getTime();
  const endMs = end.getTime();
  return events.filter((e) => {
    if (!e.start) return false;
    const eventMs = new Date(e.start).getTime();
    return eventMs >= startMs && eventMs <= endMs;
  });
}

/** Nome dos meses em PT-BR */
export const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export const WEEKDAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const WEEKDAY_NAMES_SHORT = ["D", "S", "T", "Q", "Q", "S", "S"];
