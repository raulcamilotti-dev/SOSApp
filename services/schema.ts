import { api } from "@/services/api";
import * as SecureStore from "expo-secure-store";

const log = __DEV__ ? console.log : () => {};

export type TableInfoRow = {
  column_name: string;
  data_type: string;
  udt_name?: string | null;
  is_nullable?: string | null;
  column_default?: string | null;
  is_identity?: string | null;
  identity_generation?: string | null;
  is_generated?: string | null;
  referenced_table_name?: string | null;
  referenced_column_name?: string | null;
  [key: string]: unknown;
};

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  "https://sos-api-crud.raulcamilotti-c44.workers.dev";

const ENDPOINTS = {
  tables: `${API_BASE}/tables`,
  tableInfo: `${API_BASE}/tables_info`,
};

async function getAuthHeaders(): Promise<
  { Authorization: string } | undefined
> {
  try {
    const token = await SecureStore.getItemAsync("token");
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  } catch {
    return undefined;
  }
}

export async function listTables(): Promise<string[]> {
  log("[listTables] calling", ENDPOINTS.tables);
  try {
    const headers = await getAuthHeaders();
    log("[listTables] POST", ENDPOINTS.tables, "token?", !!headers);
    const response = await api.post(
      ENDPOINTS.tables,
      {},
      {
        headers,
      },
    );
    const data = response.data;
    const list = Array.isArray(data) ? data : (data?.data ?? []);
    return Array.isArray(list)
      ? list.map((item) =>
          typeof item === "string" ? item : String(item?.table_name ?? item),
        )
      : [];
  } catch (error) {
    if (error && typeof error === "object" && "response" in error) {
      const err = error as {
        response?: { status?: number; data?: unknown; headers?: unknown };
        message?: string;
      };
      log(
        "[listTables] POST error",
        err.message,
        err.response?.status,
        err.response?.data,
      );
    } else {
      log("[listTables] POST error", error);
    }
    try {
      const headers = await getAuthHeaders();
      log("[listTables] GET", ENDPOINTS.tables, "token?", !!headers);
      const response = await api.get(ENDPOINTS.tables, {
        headers,
      });
      const data = response.data;
      const list = Array.isArray(data) ? data : (data?.data ?? []);
      return Array.isArray(list)
        ? list.map((item) =>
            typeof item === "string" ? item : String(item?.table_name ?? item),
          )
        : [];
    } catch (error) {
      if (error && typeof error === "object" && "response" in error) {
        const err = error as {
          response?: { status?: number; data?: unknown; headers?: unknown };
          message?: string;
        };
        log(
          "[listTables] GET error",
          err.message,
          err.response?.status,
          err.response?.data,
        );
      } else {
        log("[listTables] GET error", error);
      }
      log("[listTables] fallback query_db");
      const fallback = await executeQuery(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;",
      );
      return Array.isArray(fallback.rows)
        ? fallback.rows
            .map((row) => String((row as { table_name?: unknown })?.table_name))
            .filter(Boolean)
        : [];
    }
  }
}

export async function getTableInfo(tableName: string): Promise<TableInfoRow[]> {
  // Tentar primeiro via N8N (com cache busting)
  try {
    const headers = await getAuthHeaders();
    const response = await api.post(
      ENDPOINTS.tableInfo,
      {
        table_name: tableName,
        _cache_bust: Date.now(), // Evitar cache
      },
      {
        headers,
      },
    );
    const data = response.data;
    const list = Array.isArray(data) ? data : (data?.data ?? []);
    const rows = Array.isArray(list) ? (list as TableInfoRow[]) : [];

    // Se N8N retornou dados, usar
    if (rows.length > 0) {
      return rows;
    }
  } catch {
    // Em caso de erro, usar fallback
  }

  // Fallback: consulta direta ao banco
  try {
    // Validate table name: only allow alphanumeric + underscores (prevent SQL injection)
    const safeTableName = tableName.replace(/[^a-zA-Z0-9_]/g, "");
    if (!safeTableName || safeTableName !== tableName) {
      console.warn("[getTableInfo] Invalid table name rejected:", tableName);
      return [];
    }
    const fallback = await executeQuery(
      "SELECT c.column_name, c.data_type, c.udt_name, c.is_nullable, c.column_default, c.is_identity, c.identity_generation, c.is_generated, ccu.table_name AS referenced_table_name, ccu.column_name AS referenced_column_name " +
        "FROM information_schema.columns c " +
        "LEFT JOIN information_schema.key_column_usage kcu " +
        "  ON c.table_schema = kcu.table_schema AND c.table_name = kcu.table_name AND c.column_name = kcu.column_name " +
        "LEFT JOIN information_schema.table_constraints tc " +
        "  ON kcu.constraint_schema = tc.constraint_schema AND kcu.constraint_name = tc.constraint_name AND tc.constraint_type = 'FOREIGN KEY' " +
        "LEFT JOIN information_schema.constraint_column_usage ccu " +
        "  ON tc.constraint_schema = ccu.constraint_schema AND tc.constraint_name = ccu.constraint_name " +
        `WHERE c.table_schema = 'public' AND c.table_name = '${safeTableName}' ` +
        "ORDER BY c.ordinal_position;",
    );
    const rows = Array.isArray(fallback.rows)
      ? (fallback.rows as TableInfoRow[])
      : [];
    return rows;
  } catch {
    return [];
  }
}

export type QueryResult = {
  rows: unknown[];
};

export async function executeQuery(query: string): Promise<QueryResult> {
  const headers = await getAuthHeaders();
  const res = await api.post(
    `${API_BASE}/api_dinamico`,
    { sql: query },
    {
      headers,
    },
  );

  const data = res.data ?? {};
  const rows =
    data.rows ?? data.data ?? data.result ?? (Array.isArray(data) ? data : []);
  return { rows };
}
