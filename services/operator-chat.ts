import { api } from "@/services/api";
import { executeQuery } from "@/services/schema";
import { buildSearchParams, CRUD_ENDPOINT } from "./crud";

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
  console.log(`[OperatorChat] ${name} -> API ${endpoint}`);
  if (payload !== undefined) {
    console.log(`[OperatorChat] ${name} -> payload`, payload);
  }
}

function logQuery(name: string, query: string): void {
  console.log(`[OperatorChat] ${name} -> SQL`);
  console.log(query);
}

function logResult(name: string, rows: unknown): void {
  const count = Array.isArray(rows) ? rows.length : 0;
  console.log(`[OperatorChat] ${name} <- rows: ${count}`);
  if (Array.isArray(rows) && rows.length > 0) {
    console.log(`[OperatorChat] ${name} <- first row`, rows[0]);
  }
}

function logResponseShape(name: string, data: unknown): void {
  if (Array.isArray(data)) {
    console.log(`[OperatorChat] ${name} <- shape: array(${data.length})`);
    return;
  }

  if (!data || typeof data !== "object") {
    console.log(`[OperatorChat] ${name} <- shape:`, typeof data, data);
    return;
  }

  const object = data as Record<string, unknown>;
  const keys = Object.keys(object);
  console.log(`[OperatorChat] ${name} <- shape: object keys`, keys);

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
      console.log(`[OperatorChat] ${name} <- ${key}: array(${value.length})`);
      continue;
    }

    if (value && typeof value === "object") {
      console.log(
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
  console.log("[OperatorChat] sendManualMessage <- done");
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
    console.log(
      "[OperatorChat] getAtendimentoRobotStatus -> fallback cache for session",
      normalizedSessionId,
    );
    return cached;
  }

  return true;
}
