import axios from "axios";

/* ------------------------------------------------------------------ */
/*  N8N API Key for webhook authentication (Header Auth)               */
/*  Also used for the Cloudflare Worker (same key pattern)             */
/* ------------------------------------------------------------------ */

const N8N_API_KEY = process.env.EXPO_PUBLIC_N8N_API_KEY ?? "";

/**
 * API backend base URL — Cloudflare Worker (primary) or N8N webhook (fallback).
 * Must match the value in services/crud.ts.
 */
const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  "https://sos-api-crud.raulcamilotti-c44.workers.dev";

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000, // 30 second timeout to prevent infinite hangs
  headers: {
    "X-Api-Key": N8N_API_KEY,
  },
});

const TABLE_INFO_ENDPOINT = `${API_BASE}/tables_info`;
const CRUD_ENDPOINT_HINT = "/api_crud";
const SCHEMA_CACHE_TTL_MS = 5 * 60 * 1000;

type SchemaCacheEntry = {
  fetchedAt: number;
  columns: Set<string>;
};

const tableSchemaCache = new Map<string, SchemaCacheEntry>();

type ApiErrorSummary = {
  statusCode?: number;
  endpoint?: string;
  action?: string;
  table?: string;
  backendMessage?: string;
  message: string;
};

const parseRequestData = (raw: unknown): Record<string, unknown> => {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return typeof raw === "object" ? (raw as Record<string, unknown>) : {};
};

const normalizeList = <T>(data: unknown): T[] => {
  const body = data as any;
  const list = Array.isArray(data)
    ? data
    : (body?.data ?? body?.value ?? body?.items ?? []);
  return Array.isArray(list) ? (list as T[]) : [];
};

const isCrudEndpoint = (url?: string): boolean => {
  if (!url) return false;
  return url.includes(CRUD_ENDPOINT_HINT) || url.endsWith("/api_crud");
};

const isTableInfoEndpoint = (url?: string): boolean => {
  if (!url) return false;
  return url.includes("/webhook/tables_info") || url.endsWith("/tables_info");
};

const getTableColumns = async (
  table: string,
  headers: unknown,
): Promise<Set<string> | null> => {
  const normalizedTable = String(table ?? "").trim();
  if (!normalizedTable) return null;

  const now = Date.now();
  const cached = tableSchemaCache.get(normalizedTable);
  if (cached && now - cached.fetchedAt < SCHEMA_CACHE_TTL_MS) {
    return cached.columns;
  }

  try {
    const response = await api.post(
      TABLE_INFO_ENDPOINT,
      {
        table_name: normalizedTable,
        _cache_bust: now,
      },
      {
        headers: headers as any,
        __skipCrudSchemaFilter: true,
      } as any,
    );

    const rows = normalizeList<{ column_name?: string }>(response.data);
    const columns = new Set(
      rows.map((row) => String(row?.column_name ?? "").trim()).filter(Boolean),
    );

    if (columns.size > 0) {
      tableSchemaCache.set(normalizedTable, { fetchedAt: now, columns });
      return columns;
    }

    return null;
  } catch {
    return null;
  }
};

const extractBackendMessage = (data: unknown): string => {
  const body = data as any;
  if (typeof body === "string" && body.trim()) return body.trim();
  if (!body || typeof body !== "object") return "";

  const extractMessageValue = (value: unknown): string => {
    if (!value) return "";
    if (typeof value === "string") return value.trim();
    if (typeof value === "object") {
      const objectValue = value as any;
      const nested =
        objectValue?.message ??
        objectValue?.error ??
        objectValue?.detail ??
        objectValue?.reason;
      if (typeof nested === "string") return nested.trim();
      if (nested && typeof nested === "object") {
        const deep =
          nested?.message ?? nested?.error ?? nested?.detail ?? nested?.reason;
        if (typeof deep === "string") return deep.trim();
      }
    }
    return "";
  };

  const direct = body?.message ?? body?.error ?? body?.detail ?? body?.reason;
  const directMessage = extractMessageValue(direct);
  if (directMessage) return directMessage;

  if (Array.isArray(body) && body.length > 0) {
    const first = body[0] as any;
    const listMsg =
      first?.message ??
      first?.error ??
      first?.detail ??
      first?.reason ??
      first?.error?.message;
    const listMessage = extractMessageValue(listMsg);
    if (listMessage) return listMessage;
  }

  const nested =
    body?.data?.message ?? body?.data?.error ?? body?.data?.detail ?? "";
  const nestedMessage = extractMessageValue(nested);
  return nestedMessage || "";
};

const summarizeApiError = (error: unknown): ApiErrorSummary => {
  const fallback = "Falha na comunicação com a API";

  if (!axios.isAxiosError(error)) {
    return {
      backendMessage: (error as any)?.message,
      message: (error as any)?.message || fallback,
    };
  }

  const statusCode = error.response?.status;
  const endpoint =
    error.config?.url || error.response?.config?.url || error.request?.path;
  const requestData = parseRequestData(error.config?.data);
  const action = String(requestData?.action ?? "").trim() || undefined;
  const table = String(requestData?.table ?? "").trim() || undefined;
  const backendMessage = extractBackendMessage(error.response?.data);

  const contextParts = [
    statusCode ? `HTTP ${statusCode}` : null,
    endpoint ? `endpoint: ${endpoint}` : null,
    action ? `ação: ${action}` : null,
    table ? `tabela: ${table}` : null,
  ].filter(Boolean);

  const message = [
    contextParts.join(" | "),
    backendMessage || error.message || fallback,
  ]
    .filter(Boolean)
    .join(" — ");

  return {
    statusCode,
    endpoint,
    action,
    table,
    backendMessage,
    message,
  };
};

export function getApiErrorMessage(
  error: unknown,
  fallbackMessage = "Falha na operação",
): string {
  const summary = summarizeApiError(error);
  return summary.message || fallbackMessage;
}

api.interceptors.request.use(async (config) => {
  const requestConfig = config as any;
  if (requestConfig?.__skipCrudSchemaFilter) return config;
  if (isTableInfoEndpoint(config.url)) return config;
  if (!isCrudEndpoint(config.url)) return config;

  const requestData = parseRequestData(config.data);
  const action = String(requestData?.action ?? "")
    .trim()
    .toLowerCase();
  const table = String(requestData?.table ?? "").trim();
  const payload = requestData?.payload;

  if (!(action === "create" || action === "update")) return config;
  if (!table || !payload || typeof payload !== "object") return config;

  const columns = await getTableColumns(table, config.headers);
  if (!columns || columns.size === 0) return config;

  const payloadRecord = payload as Record<string, unknown>;
  const sanitizedPayload = Object.entries(payloadRecord).reduce<
    Record<string, unknown>
  >((acc, [key, value]) => {
    if (key === "id" || columns.has(key)) {
      acc[key] = value;
    }
    return acc;
  }, {});

  requestData.payload = sanitizedPayload;
  config.data = requestData;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const summary = summarizeApiError(error);
    if (__DEV__) {
      console.error("[API_ERROR]", {
        statusCode: summary.statusCode,
        endpoint: summary.endpoint,
        action: summary.action,
        table: summary.table,
        backendMessage: summary.backendMessage,
      });
    }
    (error as any).normalizedMessage = summary.message;
    return Promise.reject(error);
  },
);

export function setAuthToken(token: string | null) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

export { api, N8N_API_KEY };

