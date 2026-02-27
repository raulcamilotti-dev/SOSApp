import { api } from "@/services/api";
import { executeQuery } from "@/services/schema";
import { buildSearchParams, CRUD_ENDPOINT } from "./crud";

const log = __DEV__ ? console.log : () => {};

export type OperatorChatMessage = {
  id: string;
  session_id: string;
  tipo: string;
  conteudo: string;
  update_message: string;
  nome_cliente: string | null;
};

export type OperatorConversation = {
  session_id: string;
  nome_cliente: string | null;
  tipo: string;
  conteudo: string;
  update_message: string;
};

export type AtendimentoControl = {
  session_id: string;
  ativo: boolean;
  updated_at: string;
};

const lastKnownRobotStatusBySession = new Map<string, boolean>();

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

const OPERATOR_CHAT_ENDPOINTS = {
  conversations: "https://n8n.sosescritura.com.br/webhook/conversations",
  conversationMessages:
    "https://n8n.sosescritura.com.br/webhook/conversations_session",
  stats: "https://n8n.sosescritura.com.br/webhook/conversations_stats",
  apiCrud: CRUD_ENDPOINT,
};

function logRequest(name: string, endpoint: string, payload?: unknown): void {
  log(`[OperatorChat] ${name} -> API ${endpoint}`);
  if (payload !== undefined) {
    log(`[OperatorChat] ${name} -> payload`, payload);
  }
}

function logQuery(name: string, query: string): void {
  log(`[OperatorChat] ${name} -> SQL`);
  log(query);
}

function logResult(name: string, rows: unknown): void {
  const count = Array.isArray(rows) ? rows.length : 0;
  log(`[OperatorChat] ${name} <- rows: ${count}`);
  if (Array.isArray(rows) && rows.length > 0) {
    log(`[OperatorChat] ${name} <- first row`, rows[0]);
  }
}

function logResponseShape(name: string, data: unknown): void {
  if (Array.isArray(data)) {
    log(`[OperatorChat] ${name} <- shape: array(${data.length})`);
    return;
  }

  if (!data || typeof data !== "object") {
    log(`[OperatorChat] ${name} <- shape:`, typeof data, data);
    return;
  }

  const object = data as Record<string, unknown>;
  const keys = Object.keys(object);
  log(`[OperatorChat] ${name} <- shape: object keys`, keys);

  const candidateKeys = [
    "rows",
    "data",
    "items",
    "result",
    "messages",
    "conversations",
    "value",
    "output",
  ] as const;

  for (const key of candidateKeys) {
    const value = object[key];
    if (Array.isArray(value)) {
      log(`[OperatorChat] ${name} <- ${key}: array(${value.length})`);
      continue;
    }

    if (value && typeof value === "object") {
      log(
        `[OperatorChat] ${name} <- ${key}: object keys`,
        Object.keys(value as Record<string, unknown>),
      );
    }
  }
}

function toBoolean(value: unknown, fallback = true): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "t", "yes", "y", "sim", "s"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "f", "no", "n", "nao", "não"].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

function parseCountValue(data: unknown): number {
  const readFromRow = (row: Record<string, unknown>): number => {
    const raw =
      row.conversas_hoje ??
      row.conversations_today ??
      row.total ??
      row.count ??
      row.value;
    const parsed = Number(raw ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  if (Array.isArray(data) && data.length > 0) {
    const first = data[0];
    if (first && typeof first === "object") {
      return readFromRow(first as Record<string, unknown>);
    }
  }

  if (data && typeof data === "object") {
    return readFromRow(data as Record<string, unknown>);
  }

  const parsed = Number(data ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseJsonSafe(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function normalizeRows(data: unknown): Record<string, unknown>[] {
  const parsedData = parseJsonSafe(data);

  const toRecordArray = (value: unknown): Record<string, unknown>[] => {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => parseJsonSafe(item))
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const record = item as Record<string, unknown>;
        const nested = parseJsonSafe(record.json);
        if (nested && typeof nested === "object") {
          return {
            ...record,
            ...(nested as Record<string, unknown>),
          };
        }
        return record;
      })
      .filter((item): item is Record<string, unknown> => Boolean(item));
  };

  const fromObjectDeep = (
    value: unknown,
    depth = 0,
  ): Record<string, unknown>[] => {
    if (!value || typeof value !== "object" || depth > 4) return [];
    if (Array.isArray(value)) return toRecordArray(value);

    const object = value as Record<string, unknown>;
    const candidateKeys = [
      "rows",
      "data",
      "items",
      "result",
      "messages",
      "conversations",
      "value",
      "output",
      "response",
      "payload",
      "body",
    ];

    for (const key of candidateKeys) {
      const nested = fromObjectDeep(parseJsonSafe(object[key]), depth + 1);
      if (nested.length > 0) return nested;
    }

    return [];
  };

  if (Array.isArray(parsedData)) {
    return toRecordArray(parsedData);
  }

  if (!parsedData || typeof parsedData !== "object") {
    return [];
  }

  const body = parsedData as {
    rows?: unknown;
    data?: unknown;
    value?: unknown;
    items?: unknown;
    result?: unknown;
    messages?: unknown;
    conversations?: unknown;
  };

  const list =
    body.rows ??
    body.data ??
    body.value ??
    body.items ??
    body.result ??
    body.messages ??
    body.conversations;

  const normalizedList = toRecordArray(list);
  if (normalizedList.length > 0) {
    return normalizedList;
  }

  const deepRows = fromObjectDeep(parsedData);
  if (deepRows.length > 0) {
    return deepRows;
  }

  if (list && typeof list === "object") {
    return [list as Record<string, unknown>];
  }

  const bodyRecord = body as unknown as Record<string, unknown>;
  if (bodyRecord.session_id || bodyRecord.sessionId || bodyRecord.telefone_wa) {
    return [bodyRecord];
  }

  return [];
}

function asString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function extractSessionIdFromRow(row: Record<string, unknown>): string {
  return asString(row.session_id ?? row.sessionId ?? row.telefone_wa);
}

function parseDateMs(value: unknown): number {
  const raw = asString(value);
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function pickMatchingControlRow(
  rows: Record<string, unknown>[],
  sessionId: string,
): Record<string, unknown> | undefined {
  const matches = rows.filter(
    (row) => extractSessionIdFromRow(row) === sessionId,
  );
  if (!matches.length) return undefined;

  return matches.sort((a, b) => {
    const timeA = parseDateMs(a.updated_at ?? a.created_at);
    const timeB = parseDateMs(b.updated_at ?? b.created_at);
    return timeB - timeA;
  })[0];
}

function getObjectValue(
  object: Record<string, unknown>,
  keys: string[],
): unknown {
  for (const key of keys) {
    const value = object[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function extractContent(raw: unknown): string {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return "";

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return extractContent(parsed);
    } catch {
      return trimmed;
    }
  }

  if (!raw || typeof raw !== "object") {
    return asString(raw);
  }

  const object = raw as Record<string, unknown>;
  const direct = getObjectValue(object, [
    "content",
    "conteudo",
    "text",
    "message",
    "body",
  ]);
  const directString = asString(direct);
  if (directString) return directString;

  const messageData = object.messageData;
  if (messageData && typeof messageData === "object") {
    const nested = getObjectValue(messageData as Record<string, unknown>, [
      "conversation",
      "text",
      "message",
      "body",
    ]);
    const nestedString = asString(nested);
    if (nestedString) return nestedString;
  }

  return "";
}

function parseConversationRow(
  row: Record<string, unknown>,
): OperatorConversation | null {
  const rowData =
    (parseJsonSafe(row.value) as Record<string, unknown> | undefined) ?? row;

  const sessionId = asString(
    rowData.session_id ?? rowData.sessionId ?? rowData.telefone_wa,
  );
  if (!sessionId) return null;

  const directContent = asString(
    rowData.conteudo ?? rowData.content ?? rowData.message,
  );
  const fallbackContent = extractContent(
    rowData.raw_message ?? rowData.message_payload,
  );

  return {
    session_id: sessionId,
    nome_cliente:
      asString(
        rowData.nome_cliente ?? rowData.nomeCliente ?? rowData.nome_wa,
      ) || null,
    tipo: asString(rowData.tipo ?? rowData.type) || "unknown",
    conteudo: directContent || fallbackContent,
    update_message: asString(
      rowData.update_message ?? rowData.updated_at ?? rowData.created_at,
    ),
  };
}

function parseMessageRow(
  row: Record<string, unknown>,
): OperatorChatMessage | null {
  const rowData =
    (parseJsonSafe(row.value) as Record<string, unknown> | undefined) ?? row;

  const sessionId = asString(
    rowData.session_id ?? rowData.sessionId ?? rowData.telefone_wa,
  );
  if (!sessionId) return null;

  const directContent = asString(
    rowData.conteudo ?? rowData.content ?? rowData.message,
  );
  const fallbackContent = extractContent(
    rowData.raw_message ?? rowData.message_payload,
  );

  return {
    id:
      asString(rowData.id) ||
      `${sessionId}-${asString(rowData.update_message ?? rowData.created_at) || Date.now()}`,
    session_id: sessionId,
    tipo: asString(rowData.tipo ?? rowData.type) || "unknown",
    conteudo: directContent || fallbackContent,
    update_message: asString(
      rowData.update_message ?? rowData.updated_at ?? rowData.created_at,
    ),
    nome_cliente:
      asString(
        rowData.nome_cliente ?? rowData.nomeCliente ?? rowData.nome_wa,
      ) || null,
  };
}

export async function listConversations(
  selectedSessionId?: string,
): Promise<OperatorConversation[]> {
  const payload = selectedSessionId
    ? {
        session_id: selectedSessionId,
        sessionId: selectedSessionId,
        telefone_wa: selectedSessionId,
      }
    : {};
  logRequest(
    "listConversations",
    OPERATOR_CHAT_ENDPOINTS.conversations,
    payload,
  );

  const response = await api.post(
    OPERATOR_CHAT_ENDPOINTS.conversations,
    payload,
  );
  const rows = response.data;
  logResponseShape("listConversations", rows);
  logResult("listConversations", rows);

  const normalized = normalizeRows(rows)
    .map(parseConversationRow)
    .filter((row): row is OperatorConversation => Boolean(row));

  const uniqueBySession = new Map<string, OperatorConversation>();
  for (const row of normalized) {
    const previous = uniqueBySession.get(row.session_id);
    if (!previous) {
      uniqueBySession.set(row.session_id, row);
      continue;
    }

    const previousTime = new Date(previous.update_message).getTime();
    const currentTime = new Date(row.update_message).getTime();
    if (currentTime >= previousTime) {
      uniqueBySession.set(row.session_id, row);
    }
  }

  return Array.from(uniqueBySession.values()).sort((a, b) => {
    const timeA = new Date(a.update_message).getTime();
    const timeB = new Date(b.update_message).getTime();
    return timeB - timeA;
  });
}

export async function listConversationMessages(
  sessionId: string,
): Promise<OperatorChatMessage[]> {
  const payload = {
    session_id: sessionId,
    sessionId,
    telefone_wa: sessionId,
  };
  logRequest(
    "listConversationMessages",
    OPERATOR_CHAT_ENDPOINTS.conversationMessages,
    payload,
  );

  const response = await api.post(
    OPERATOR_CHAT_ENDPOINTS.conversationMessages,
    payload,
  );
  const rows = response.data;
  logResponseShape("listConversationMessages", rows);
  logResult("listConversationMessages", rows);

  return normalizeRows(rows)
    .map(parseMessageRow)
    .filter((row): row is OperatorChatMessage => Boolean(row));
}

export async function countConversationsToday(
  selectedSessionId?: string,
): Promise<number> {
  const payload = selectedSessionId
    ? {
        session_id: selectedSessionId,
        sessionId: selectedSessionId,
        telefone_wa: selectedSessionId,
      }
    : {};
  logRequest("countConversationsToday", OPERATOR_CHAT_ENDPOINTS.stats, payload);

  const response = await api.post(OPERATOR_CHAT_ENDPOINTS.stats, payload);
  logResponseShape("countConversationsToday", response.data);
  const rows = normalizeRows(response.data);
  logResult("countConversationsToday", rows);

  const total = parseCountValue(rows.length > 0 ? rows : response.data);
  return Number.isFinite(total) ? total : 0;
}

export async function sendManualMessage(
  sessionId: string,
  message: string,
): Promise<void> {
  const query = `
INSERT INTO
  buffer_mensagens_manuais (session_id, message, synced, created_at, type)
VALUES
  (${sqlLiteral(sessionId)}, ${sqlLiteral(message)}, false, NOW(), 'manual');
`;

  logQuery("sendManualMessage", query);
  await executeQuery(query);
  log("[OperatorChat] sendManualMessage <- done");
}

export async function setAtendimentoRobotActive(
  sessionId: string,
  ativo: boolean,
): Promise<AtendimentoControl | null> {
  const normalizedSessionId = String(sessionId);

  const payload = {
    session_id: normalizedSessionId,
    ativo,
    updated_at: new Date().toISOString(),
  };

  const updateRequestBody = {
    action: "update",
    table: "controle_atendimento",
    ...buildSearchParams([{ field: "session_id", value: normalizedSessionId }]),
    payload,
  };

  logRequest(
    "setAtendimentoRobotActive:update",
    OPERATOR_CHAT_ENDPOINTS.apiCrud,
    updateRequestBody,
  );

  const updateResponse = await api.post(
    OPERATOR_CHAT_ENDPOINTS.apiCrud,
    updateRequestBody,
  );

  const updatedRows = normalizeRows(updateResponse.data);
  logResult("setAtendimentoRobotActive:update", updatedRows);
  const row = updatedRows[0] as
    | {
        session_id?: string;
        ativo?: boolean | string | number;
        updated_at?: string;
      }
    | undefined;

  const resolvedActive = toBoolean(row?.ativo, ativo);
  const resolvedSessionId = String(row?.session_id ?? normalizedSessionId);
  const resolvedUpdatedAt = String(row?.updated_at ?? new Date().toISOString());
  const result = {
    session_id: resolvedSessionId,
    ativo: resolvedActive,
    updated_at: resolvedUpdatedAt,
  };
  lastKnownRobotStatusBySession.set(normalizedSessionId, resolvedActive);
  return result;
}

export async function getAtendimentoRobotStatus(
  sessionId: string,
): Promise<boolean> {
  const normalizedSessionId = String(sessionId);
  logRequest("getAtendimentoRobotStatus", OPERATOR_CHAT_ENDPOINTS.apiCrud, {
    action: "list",
    table: "controle_atendimento",
    search_field1: "session_id",
    search_value1: normalizedSessionId,
  });

  const response = await api.post(OPERATOR_CHAT_ENDPOINTS.apiCrud, {
    action: "list",
    table: "controle_atendimento",
    ...buildSearchParams([{ field: "session_id", value: normalizedSessionId }]),
  });

  const rows = normalizeRows(response.data);
  logResult("getAtendimentoRobotStatus", rows);

  const matchedRow = pickMatchingControlRow(rows, normalizedSessionId) as
    | {
        ativo?: boolean | string | number | null;
      }
    | undefined;

  if (matchedRow) {
    const status = toBoolean(matchedRow.ativo, true);
    lastKnownRobotStatusBySession.set(normalizedSessionId, status);
    return status;
  }

  const cached = lastKnownRobotStatusBySession.get(normalizedSessionId);
  if (typeof cached === "boolean") {
    log(
      "[OperatorChat] getAtendimentoRobotStatus -> fallback cache for session",
      normalizedSessionId,
    );
    return cached;
  }

  return true;
}

/* ================================================================== */
/*  Dashboard Analytics                                                */
/* ================================================================== */

/** Full row shape for controle_atendimento dashboard analytics */
export type AtendimentoFullRow = {
  session_id: string;
  ativo: boolean;
  updated_at: string;
  current_state_key: string | null;
  paused_state_key: string | null;
  return_state_key: string | null;
  bot_paused: boolean;
  handoff_channel: string | null;
  handoff_updated_at: string | null;
};

/** State distribution for funnel/chart */
export type StateDistribution = {
  state_key: string;
  count: number;
  percentage: number;
};

/** Handoff analytics */
export type HandoffStats = {
  totalHandoffs: number;
  byChannel: Record<string, number>;
  botPausedCount: number;
  botActiveCount: number;
};

/** Time-based conversation stats */
export type ConversationTimeline = {
  label: string; // e.g. "10/06", "11/06"
  count: number;
};

/** Dashboard analytics summary */
export type DashboardAnalytics = {
  /** All controle_atendimento rows with full state data */
  sessions: AtendimentoFullRow[];
  /** Distribution of current_state_key values */
  stateDistribution: StateDistribution[];
  /** Handoff metrics */
  handoffStats: HandoffStats;
  /** Sessions updated in the last 24h */
  activeLast24h: number;
  /** Sessions updated in the last 7d */
  activeLast7d: number;
  /** Daily conversation counts for last 14 days */
  timeline: ConversationTimeline[];
  /** Average time between session updates (proxy for response time) */
  avgUpdateGapMinutes: number | null;
  /** Sessions with bot paused (waiting for human) */
  waitingForHuman: AtendimentoFullRow[];
};

/**
 * Fetch all controle_atendimento rows with full columns for analytics.
 */
export async function getAtendimentoFullRows(): Promise<AtendimentoFullRow[]> {
  try {
    const response = await api.post(OPERATOR_CHAT_ENDPOINTS.apiCrud, {
      action: "list",
      table: "controle_atendimento",
      ...buildSearchParams([]),
    });
    const rows = normalizeRows(response.data);
    return rows.map((row: any) => ({
      session_id: String(row.session_id ?? ""),
      ativo: toBoolean(row.ativo, true),
      updated_at: String(row.updated_at ?? ""),
      current_state_key: row.current_state_key
        ? String(row.current_state_key)
        : null,
      paused_state_key: row.paused_state_key
        ? String(row.paused_state_key)
        : null,
      return_state_key: row.return_state_key
        ? String(row.return_state_key)
        : null,
      bot_paused: toBoolean(row.bot_paused, false),
      handoff_channel: row.handoff_channel ? String(row.handoff_channel) : null,
      handoff_updated_at: row.handoff_updated_at
        ? String(row.handoff_updated_at)
        : null,
    }));
  } catch (err) {
    log("[OperatorChat] getAtendimentoFullRows error", err);
    return [];
  }
}

/**
 * Compute state distribution from sessions.
 */
export function computeStateDistribution(
  sessions: AtendimentoFullRow[],
): StateDistribution[] {
  const counts = new Map<string, number>();
  for (const s of sessions) {
    const key = s.current_state_key || "(sem estado)";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const total = sessions.length || 1;
  return Array.from(counts.entries())
    .map(([state_key, count]) => ({
      state_key,
      count,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Compute handoff statistics from sessions.
 */
export function computeHandoffStats(
  sessions: AtendimentoFullRow[],
): HandoffStats {
  const byChannel: Record<string, number> = {};
  let totalHandoffs = 0;
  let botPausedCount = 0;
  let botActiveCount = 0;

  for (const s of sessions) {
    if (s.bot_paused) {
      botPausedCount++;
    } else {
      botActiveCount++;
    }
    if (s.handoff_channel) {
      totalHandoffs++;
      byChannel[s.handoff_channel] = (byChannel[s.handoff_channel] ?? 0) + 1;
    }
  }

  return { totalHandoffs, byChannel, botPausedCount, botActiveCount };
}

/**
 * Build a 14-day conversation timeline from n8n_chat_histories.
 */
export async function getConversationTimeline(): Promise<
  ConversationTimeline[]
> {
  try {
    const sql = `
      SELECT
        TO_CHAR(DATE(update_message), 'DD/MM') AS label,
        DATE(update_message) AS dt,
        COUNT(DISTINCT session_id) AS count
      FROM n8n_chat_histories
      WHERE update_message >= NOW() - INTERVAL '14 days'
      GROUP BY DATE(update_message), TO_CHAR(DATE(update_message), 'DD/MM')
      ORDER BY dt ASC
    `;
    const result = await executeQuery(sql);
    return (result.rows as any[]).map((row) => ({
      label: String(row.label ?? ""),
      count: Number(row.count ?? 0),
    }));
  } catch (err) {
    log("[OperatorChat] getConversationTimeline error", err);
    return [];
  }
}

/**
 * Get message counts by type (received/sent/manual) for the last 7 days.
 */
export async function getMessageTypeBreakdown(): Promise<
  Record<string, number>
> {
  try {
    const sql = `
      SELECT
        COALESCE(tipo, 'unknown') AS tipo,
        COUNT(*) AS count
      FROM n8n_chat_histories
      WHERE update_message >= NOW() - INTERVAL '7 days'
      GROUP BY tipo
      ORDER BY count DESC
    `;
    const result = await executeQuery(sql);
    const breakdown: Record<string, number> = {};
    for (const row of result.rows as any[]) {
      breakdown[String(row.tipo ?? "unknown")] = Number(row.count ?? 0);
    }
    return breakdown;
  } catch (err) {
    log("[OperatorChat] getMessageTypeBreakdown error", err);
    return {};
  }
}

/**
 * Get peak hour distribution (0-23) for conversations in the last 7 days.
 */
export async function getPeakHours(): Promise<
  { hour: number; count: number }[]
> {
  try {
    const sql = `
      SELECT
        EXTRACT(HOUR FROM update_message AT TIME ZONE 'America/Sao_Paulo') AS hour,
        COUNT(DISTINCT session_id) AS count
      FROM n8n_chat_histories
      WHERE update_message >= NOW() - INTERVAL '7 days'
      GROUP BY EXTRACT(HOUR FROM update_message AT TIME ZONE 'America/Sao_Paulo')
      ORDER BY hour ASC
    `;
    const result = await executeQuery(sql);
    return (result.rows as any[]).map((row) => ({
      hour: Number(row.hour ?? 0),
      count: Number(row.count ?? 0),
    }));
  } catch (err) {
    log("[OperatorChat] getPeakHours error", err);
    return [];
  }
}

/**
 * Compute the full dashboard analytics.
 */
export async function getDashboardAnalytics(): Promise<DashboardAnalytics> {
  const [sessions, timeline] = await Promise.all([
    getAtendimentoFullRows(),
    getConversationTimeline(),
  ]);

  const stateDistribution = computeStateDistribution(sessions);
  const handoffStats = computeHandoffStats(sessions);

  const now = Date.now();
  const MS_24H = 24 * 60 * 60 * 1000;
  const MS_7D = 7 * 24 * 60 * 60 * 1000;

  const activeLast24h = sessions.filter((s) => {
    const t = new Date(s.updated_at).getTime();
    return !isNaN(t) && now - t < MS_24H;
  }).length;

  const activeLast7d = sessions.filter((s) => {
    const t = new Date(s.updated_at).getTime();
    return !isNaN(t) && now - t < MS_7D;
  }).length;

  // Compute average gap between updates as response time proxy
  const updateTimestamps = sessions
    .map((s) => new Date(s.updated_at).getTime())
    .filter((t) => !isNaN(t))
    .sort((a, b) => a - b);

  let avgUpdateGapMinutes: number | null = null;
  if (updateTimestamps.length >= 2) {
    let totalGap = 0;
    let gapCount = 0;
    for (let i = 1; i < updateTimestamps.length; i++) {
      const gap = updateTimestamps[i] - updateTimestamps[i - 1];
      if (gap > 0 && gap < MS_24H) {
        // ignore gaps > 24h (different days)
        totalGap += gap;
        gapCount++;
      }
    }
    if (gapCount > 0) {
      avgUpdateGapMinutes = Math.round(totalGap / gapCount / 60_000);
    }
  }

  const waitingForHuman = sessions.filter((s) => s.bot_paused && !s.ativo);

  return {
    sessions,
    stateDistribution,
    handoffStats,
    activeLast24h,
    activeLast7d,
    timeline,
    avgUpdateGapMinutes,
    waitingForHuman,
  };
}
