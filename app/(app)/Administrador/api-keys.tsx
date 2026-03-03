/**
 * API Keys Admin Screen
 *
 * Manages public API keys for the tenant's API access.
 * Special create flow: key is generated server-side, plaintext shown ONCE.
 *
 * Uses CrudScreen for list/edit/delete, custom modal for create + key reveal.
 * Includes API info panel with base URL, headers, and default tables list.
 */

import { ThemedText } from "@/components/themed-text";
import {
    CrudScreen,
    type CrudFieldConfig,
    type CrudScreenHandle,
} from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { getApiErrorMessage } from "@/services/api";
import {
    createApiKey,
    deleteApiKey,
    formatEnvironment,
    formatKeyPrefix,
    formatScopes,
    listApiKeys,
    updateApiKey,
    type ApiKeyEnvironment,
    type ApiKeyScope,
} from "@/services/api-keys";
import * as Clipboard from "expo-clipboard";
import { useCallback, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    Platform,
    ScrollView,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

/* ------------------------------------------------------------------ */
/*  API Constants                                                      */
/* ------------------------------------------------------------------ */

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  "https://sos-api-crud.raulcamilotti-c44.workers.dev";

const API_PUBLIC_URL = `${API_BASE_URL}/v1`;

/**
 * Default allowed tables — mirrors DEFAULT_ALLOWED_TABLES in the worker.
 * When allowed_tables is empty ([]), all of these are accessible.
 */
const DEFAULT_ALLOWED_TABLES: readonly string[] = [
  "customers",
  "companies",
  "company_members",
  "properties",
  "service_orders",
  "service_order_context",
  "service_types",
  "service_categories",
  "services",
  "workflow_templates",
  "workflow_steps",
  "process_updates",
  "process_deadlines",
  "tasks",
  "invoices",
  "invoice_items",
  "payments",
  "quotes",
  "quote_items",
  "accounts_receivable",
  "accounts_payable",
  "partners",
  "partner_earnings",
  "document_templates",
  "generated_documents",
  "leads",
  "products",
  "product_categories",
  "stock_movements",
  "stock_locations",
  "purchase_orders",
  "purchase_order_items",
  "suppliers",
  "contracts",
  "contract_service_orders",
  "notifications",
  "custom_field_definitions",
  "custom_field_values",
];

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Row = Record<string, unknown>;

/* ------------------------------------------------------------------ */
/*  CRUD Functions                                                     */
/* ------------------------------------------------------------------ */

/**
 * List — uses dedicated service function (tenant-scoped, sorted, filtered).
 */
const listRows = async (tenantId?: string | null): Promise<Row[]> => {
  if (!tenantId) return [];
  const keys = await listApiKeys(tenantId);
  return keys as unknown as Row[];
};

/**
 * Update — uses dedicated service function (serializes JSONB arrays).
 */
const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) throw new Error("Id obrigatório para atualizar");
  return updateApiKey({
    id: String(payload.id),
    name: payload.name ? String(payload.name) : undefined,
    scopes: payload.scopes
      ? (parseJsonArray(payload.scopes) as ApiKeyScope[])
      : undefined,
    allowed_tables: payload.allowed_tables
      ? (parseJsonArray(payload.allowed_tables) as string[])
      : undefined,
    rate_limit_per_minute: payload.rate_limit_per_minute
      ? Number(payload.rate_limit_per_minute)
      : undefined,
    is_active:
      payload.is_active !== undefined ? Boolean(payload.is_active) : undefined,
    expires_at: payload.expires_at ? String(payload.expires_at) : undefined,
  });
};

/**
 * Delete — soft-delete via service function.
 */
const deleteRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) throw new Error("Id obrigatório para deletar");
  await deleteApiKey(String(payload.id));
  return {};
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Parse a value that may be a JSON string, an array, or a comma-separated string
 * into a string array.
 */
function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch {
        /* fall through */
      }
    }
    // Comma-separated fallback
    return trimmed
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function formatDate(value: unknown): string {
  if (!value) return "-";
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ------------------------------------------------------------------ */
/*  Fields                                                             */
/* ------------------------------------------------------------------ */

const fields: CrudFieldConfig<Row>[] = [
  {
    key: "name",
    label: "Nome",
    type: "text",
    required: true,
    placeholder: "Ex: Integração ERP, Dashboard BI",
  },
  {
    key: "key_prefix",
    label: "Chave",
    type: "text",
    readOnly: true,
    visibleInForm: false,
  },
  {
    key: "environment",
    label: "Ambiente",
    type: "select",
    options: [
      { label: "Produção", value: "live" },
      { label: "Teste", value: "test" },
    ],
    readOnly: true, // Can't change environment after creation
  },
  {
    key: "scopes",
    label: "Permissões",
    type: "json",
    placeholder: '["read"] ou ["read", "write"]',
    jsonTemplate: ["read"] as unknown as Record<string, unknown>,
  },
  {
    key: "allowed_tables",
    label: "Tabelas Permitidas",
    type: "json",
    placeholder: "[] = todas permitidas por padrão",
    jsonTemplate: [] as unknown as Record<string, unknown>,
    visibleInList: false,
    section: "Configuração de Acesso",
  },
  {
    key: "rate_limit_per_minute",
    label: "Limite por Minuto",
    type: "number",
    placeholder: "60",
    section: "Configuração de Acesso",
  },
  {
    key: "expires_at",
    label: "Expira em",
    type: "date",
    section: "Configuração de Acesso",
    visibleInList: false,
  },
  {
    key: "is_active",
    label: "Ativo",
    type: "boolean",
  },
  {
    key: "last_used_at",
    label: "Último Uso",
    type: "datetime",
    readOnly: true,
    visibleInForm: false,
  },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ApiKeysScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const userId = user?.id;

  const controlRef = useRef<CrudScreenHandle | null>(null);

  // Theme
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const cardColor = useThemeColor({}, "card");
  const tintColor = useThemeColor({}, "tint");
  const inputBg = useThemeColor({}, "input");
  const bgColor = useThemeColor({}, "background");

  // Create modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createEnv, setCreateEnv] = useState<ApiKeyEnvironment>("live");
  const [createScopes, setCreateScopes] = useState<ApiKeyScope[]>(["read"]);
  const [createRateLimit, setCreateRateLimit] = useState("60");
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Key reveal modal state
  const [revealKey, setRevealKey] = useState<string | null>(null);
  const [revealName, setRevealName] = useState<string>("");
  const [copied, setCopied] = useState(false);

  /* ── Load ── */
  const loadItems = useMemo(() => () => listRows(tenantId), [tenantId]);

  /* ── Create flow ── */
  const openCreateModal = useCallback(() => {
    setCreateName("");
    setCreateEnv("live");
    setCreateScopes(["read"]);
    setCreateRateLimit("60");
    setCreateError(null);
    setCreateSaving(false);
    setCreateModalOpen(true);
  }, []);

  const toggleScope = useCallback((scope: ApiKeyScope) => {
    setCreateScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }, []);

  const handleCreate = useCallback(async () => {
    if (!tenantId || !userId) {
      setCreateError("Sessão inválida. Faça login novamente.");
      return;
    }
    if (!createName.trim()) {
      setCreateError("Informe um nome para a chave.");
      return;
    }
    if (createScopes.length === 0) {
      setCreateError("Selecione ao menos uma permissão.");
      return;
    }

    setCreateSaving(true);
    setCreateError(null);

    try {
      const result = await createApiKey(tenantId, userId, {
        name: createName.trim(),
        environment: createEnv,
        scopes: createScopes,
        rate_limit_per_minute: parseInt(createRateLimit, 10) || 60,
      });

      // Close create modal
      setCreateModalOpen(false);

      // Open reveal modal with the plaintext key
      setRevealKey(result.plaintext_key);
      setRevealName(createName.trim());
      setCopied(false);

      // Reload list
      controlRef.current?.reload();
    } catch (err) {
      setCreateError(getApiErrorMessage(err, "Falha ao criar chave de API."));
    } finally {
      setCreateSaving(false);
    }
  }, [tenantId, userId, createName, createEnv, createScopes, createRateLimit]);

  const copyKey = useCallback(async () => {
    if (!revealKey) return;
    try {
      await Clipboard.setStringAsync(revealKey);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, [revealKey]);

  const closeReveal = useCallback(() => {
    setRevealKey(null);
    setRevealName("");
    setCopied(false);
  }, []);

  /* ── Dummy createItem — never actually called (we use onAddPress) ── */
  const dummyCreate = useCallback(async () => {
    throw new Error("Use o botão de criar");
  }, []);

  /* ── API Info panel state ── */
  const [infoPanelOpen, setInfoPanelOpen] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [curlCopied, setCurlCopied] = useState(false);

  const copyApiUrl = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(API_PUBLIC_URL);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    } catch {
      /* best effort */
    }
  }, []);

  const copyCurlExample = useCallback(async () => {
    const curl = `curl -H "X-Api-Key: SUA_CHAVE_AQUI" \\\n  "${API_PUBLIC_URL}/customers"`;
    try {
      await Clipboard.setStringAsync(curl);
      setCurlCopied(true);
      setTimeout(() => setCurlCopied(false), 2000);
    } catch {
      /* best effort */
    }
  }, []);

  /* ── Custom field renderer for allowed_tables and scopes ── */
  const renderCustomField = useCallback(
    (
      field: CrudFieldConfig<Row>,
      value: string,
      onChange: (v: string) => void,
      _formState: Record<string, string>,
    ) => {
      // ── Scopes: chip selector instead of raw JSON ──
      if (field.key === "scopes") {
        const current = parseJsonArray(value || "[]") as ApiKeyScope[];
        const scopeOptions: {
          key: ApiKeyScope;
          label: string;
          desc: string;
        }[] = [
          { key: "read", label: "📖 Leitura", desc: "GET" },
          { key: "write", label: "✏️ Escrita", desc: "POST/PUT" },
          { key: "delete", label: "🗑️ Exclusão", desc: "DELETE" },
        ];

        const toggleScopeInEdit = (scope: ApiKeyScope) => {
          const next = current.includes(scope)
            ? current.filter((s) => s !== scope)
            : [...current, scope];
          if (next.length === 0) return; // must have at least one
          onChange(JSON.stringify(next));
        };

        return (
          <View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 2 }}>
              {scopeOptions.map((s) => {
                const selected = current.includes(s.key);
                return (
                  <TouchableOpacity
                    key={s.key}
                    onPress={() => toggleScopeInEdit(s.key)}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      paddingHorizontal: 8,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: selected ? tintColor : borderColor,
                      backgroundColor: selected ? tintColor + "1A" : inputBg,
                      alignItems: "center",
                    }}
                  >
                    <ThemedText
                      style={{
                        color: selected ? tintColor : textColor,
                        fontWeight: selected ? "700" : "400",
                        fontSize: 13,
                      }}
                    >
                      {s.label}
                    </ThemedText>
                    <ThemedText
                      style={{ color: mutedColor, fontSize: 10, marginTop: 2 }}
                    >
                      {s.desc}
                    </ThemedText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      }

      // ── Allowed Tables: explanation + default tables list ──
      if (field.key === "allowed_tables") {
        const current = parseJsonArray(value || "[]");
        const hasCustomTables = current.length > 0;

        return (
          <View>
            {/* Explanation */}
            <View
              style={{
                backgroundColor: tintColor + "0D",
                borderRadius: 8,
                padding: 12,
                marginTop: 2,
                marginBottom: 10,
                borderWidth: 1,
                borderColor: tintColor + "25",
              }}
            >
              <ThemedText
                style={{
                  fontSize: 12,
                  color: textColor,
                  fontWeight: "600",
                  marginBottom: 4,
                }}
              >
                {hasCustomTables
                  ? `🔒 Restrito a ${current.length} tabela(s)`
                  : "🌐 Acesso a todas as tabelas padrão"}
              </ThemedText>
              <ThemedText
                style={{ fontSize: 11, color: mutedColor, lineHeight: 16 }}
              >
                {hasCustomTables
                  ? "Esta chave tem acesso apenas às tabelas listadas abaixo. Edite o JSON para alterar."
                  : `Quando vazio ([ ]), a chave tem acesso a todas as ${DEFAULT_ALLOWED_TABLES.length} tabelas de negócio padrão. Para restringir, adicione nomes de tabelas específicas.`}
              </ThemedText>
            </View>

            {/* Custom tables JSON editor (when restricted) */}
            {hasCustomTables ? (
              <View>
                <TextInput
                  value={value}
                  onChangeText={onChange}
                  placeholder='["customers", "invoices"]'
                  placeholderTextColor={mutedColor}
                  multiline
                  style={{
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    backgroundColor: inputBg,
                    color: textColor,
                    minHeight: 60,
                    fontFamily: Platform.OS === "web" ? "monospace" : "Courier",
                    fontSize: 12,
                  }}
                />
                <TouchableOpacity
                  onPress={() => onChange("[]")}
                  style={{ marginTop: 6 }}
                >
                  <ThemedText
                    style={{
                      fontSize: 11,
                      color: tintColor,
                      fontWeight: "600",
                    }}
                  >
                    ↩ Restaurar acesso a todas as tabelas padrão
                  </ThemedText>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                {/* Show the default tables list */}
                <ThemedText
                  style={{
                    fontSize: 11,
                    color: mutedColor,
                    fontWeight: "600",
                    marginBottom: 6,
                  }}
                >
                  Tabelas acessíveis por padrão ({DEFAULT_ALLOWED_TABLES.length}
                  ):
                </ThemedText>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 4,
                    marginBottom: 8,
                  }}
                >
                  {DEFAULT_ALLOWED_TABLES.map((table) => (
                    <View
                      key={table}
                      style={{
                        backgroundColor: bgColor,
                        borderRadius: 4,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderWidth: 1,
                        borderColor: borderColor + "80",
                      }}
                    >
                      <ThemedText
                        style={{
                          fontSize: 10,
                          color: mutedColor,
                          fontFamily:
                            Platform.OS === "web" ? "monospace" : "Courier",
                        }}
                      >
                        {table}
                      </ThemedText>
                    </View>
                  ))}
                </View>
                <TouchableOpacity
                  onPress={() =>
                    onChange(JSON.stringify(["customers"], null, 2))
                  }
                  style={{ marginTop: 2 }}
                >
                  <ThemedText
                    style={{
                      fontSize: 11,
                      color: tintColor,
                      fontWeight: "600",
                    }}
                  >
                    🔒 Restringir a tabelas específicas
                  </ThemedText>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      }

      // All other fields: use default CrudScreen rendering
      return null;
    },
    [bgColor, borderColor, inputBg, mutedColor, textColor, tintColor],
  );

  /* ── API Info Panel Component ── */
  const apiInfoPanel = useMemo(
    () => (
      <View style={{ width: "100%" }}>
        <TouchableOpacity
          onPress={() => setInfoPanelOpen((p) => !p)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingVertical: 8,
            paddingHorizontal: 12,
            backgroundColor: tintColor + "10",
            borderRadius: 8,
            borderWidth: 1,
            borderColor: tintColor + "25",
          }}
        >
          <ThemedText style={{ fontSize: 14 }}>
            {infoPanelOpen ? "📘" : "📗"}
          </ThemedText>
          <ThemedText
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: tintColor,
              flex: 1,
            }}
          >
            {infoPanelOpen ? "Ocultar" : "Ver"} informações da API
          </ThemedText>
          <ThemedText style={{ color: tintColor, fontSize: 16 }}>
            {infoPanelOpen ? "▲" : "▼"}
          </ThemedText>
        </TouchableOpacity>

        {infoPanelOpen ? (
          <View
            style={{
              marginTop: 8,
              backgroundColor: cardColor,
              borderRadius: 10,
              borderWidth: 1,
              borderColor,
              padding: 16,
            }}
          >
            {/* Base URL */}
            <View style={{ marginBottom: 14 }}>
              <ThemedText
                style={{
                  fontSize: 11,
                  color: mutedColor,
                  fontWeight: "600",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 4,
                }}
              >
                URL Base da API
              </ThemedText>
              <TouchableOpacity
                onPress={copyApiUrl}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  backgroundColor: bgColor,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: borderColor + "80",
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                }}
              >
                <ThemedText
                  style={{
                    flex: 1,
                    fontSize: 12,
                    color: textColor,
                    fontFamily: Platform.OS === "web" ? "monospace" : "Courier",
                  }}
                  selectable
                >
                  {API_PUBLIC_URL}
                </ThemedText>
                <ThemedText style={{ fontSize: 12, color: tintColor }}>
                  {urlCopied ? "✓" : "📋"}
                </ThemedText>
              </TouchableOpacity>
            </View>

            {/* Required Headers */}
            <View style={{ marginBottom: 14 }}>
              <ThemedText
                style={{
                  fontSize: 11,
                  color: mutedColor,
                  fontWeight: "600",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 4,
                }}
              >
                Headers Obrigatórios
              </ThemedText>
              <View
                style={{
                  backgroundColor: bgColor,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: borderColor + "80",
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  gap: 4,
                }}
              >
                <ThemedText
                  style={{
                    fontSize: 12,
                    color: textColor,
                    fontFamily: Platform.OS === "web" ? "monospace" : "Courier",
                  }}
                  selectable
                >
                  X-Api-Key: rk_live_...
                </ThemedText>
              </View>
              <ThemedText
                style={{ fontSize: 10, color: mutedColor, marginTop: 3 }}
              >
                Substitua pelo valor completo da sua chave de API
              </ThemedText>
            </View>

            {/* Endpoints */}
            <View style={{ marginBottom: 14 }}>
              <ThemedText
                style={{
                  fontSize: 11,
                  color: mutedColor,
                  fontWeight: "600",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 6,
                }}
              >
                Endpoints Disponíveis
              </ThemedText>
              {[
                { method: "GET", path: "/v1", desc: "Info da API" },
                {
                  method: "GET",
                  path: "/v1/:tabela",
                  desc: "Listar registros",
                },
                {
                  method: "GET",
                  path: "/v1/:tabela/:id",
                  desc: "Buscar por ID",
                },
                {
                  method: "GET",
                  path: "/v1/:tabela/count",
                  desc: "Contagem",
                },
                {
                  method: "GET",
                  path: "/v1/:tabela/schema",
                  desc: "Colunas",
                },
              ].map((ep) => (
                <View
                  key={ep.path}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 4,
                  }}
                >
                  <View
                    style={{
                      backgroundColor: "#16a34a20",
                      borderRadius: 4,
                      paddingHorizontal: 5,
                      paddingVertical: 1,
                      minWidth: 36,
                      alignItems: "center",
                    }}
                  >
                    <ThemedText
                      style={{
                        fontSize: 9,
                        fontWeight: "700",
                        color: "#16a34a",
                      }}
                    >
                      {ep.method}
                    </ThemedText>
                  </View>
                  <ThemedText
                    style={{
                      fontSize: 11,
                      color: textColor,
                      fontFamily:
                        Platform.OS === "web" ? "monospace" : "Courier",
                      flex: 1,
                    }}
                  >
                    {ep.path}
                  </ThemedText>
                  <ThemedText style={{ fontSize: 10, color: mutedColor }}>
                    {ep.desc}
                  </ThemedText>
                </View>
              ))}
            </View>

            {/* Curl Example */}
            <View style={{ marginBottom: 6 }}>
              <ThemedText
                style={{
                  fontSize: 11,
                  color: mutedColor,
                  fontWeight: "600",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 4,
                }}
              >
                Exemplo cURL
              </ThemedText>
              <TouchableOpacity
                onPress={copyCurlExample}
                style={{
                  backgroundColor: bgColor,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: borderColor + "80",
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 8,
                }}
              >
                <ThemedText
                  style={{
                    flex: 1,
                    fontSize: 11,
                    color: textColor,
                    fontFamily: Platform.OS === "web" ? "monospace" : "Courier",
                    lineHeight: 18,
                  }}
                  selectable
                >
                  {`curl -H "X-Api-Key: SUA_CHAVE" \\\n  "${API_PUBLIC_URL}/customers"`}
                </ThemedText>
                <ThemedText style={{ fontSize: 12, color: tintColor }}>
                  {curlCopied ? "✓" : "📋"}
                </ThemedText>
              </TouchableOpacity>
            </View>

            {/* Filters */}
            <View style={{ marginTop: 8 }}>
              <ThemedText
                style={{
                  fontSize: 11,
                  color: mutedColor,
                  fontWeight: "600",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 4,
                }}
              >
                Filtros (query params)
              </ThemedText>
              <ThemedText
                style={{
                  fontSize: 10,
                  color: mutedColor,
                  lineHeight: 16,
                }}
              >
                ?limit=20&offset=0&sort=created_at:desc{"\n"}
                ?name__ilike=%termo%&is_active=true{"\n"}
                Operadores: __gt, __gte, __lt, __lte, __ilike, __not, __in,
                __is_null
              </ThemedText>
            </View>
          </View>
        ) : null}
      </View>
    ),
    [
      bgColor,
      borderColor,
      cardColor,
      copyApiUrl,
      copyCurlExample,
      curlCopied,
      infoPanelOpen,
      mutedColor,
      textColor,
      tintColor,
      urlCopied,
    ],
  );

  /* ── Render ── */
  return (
    <View style={{ flex: 1 }}>
      <CrudScreen<Row>
        title="Chaves de API"
        subtitle="Gerencie o acesso à API pública REST do seu tenant"
        searchPlaceholder="Buscar chave..."
        searchFields={["name", "key_prefix", "environment"]}
        fields={fields}
        loadItems={loadItems}
        createItem={dummyCreate}
        updateItem={updateRow}
        deleteItem={deleteRow}
        getId={(item) => String(item.id ?? "")}
        getTitle={(item) => String(item.name ?? "Sem nome")}
        getDetails={(item) => [
          {
            label: "Chave",
            value: item.key_prefix
              ? formatKeyPrefix(String(item.key_prefix))
              : "-",
          },
          {
            label: "Ambiente",
            value: item.environment
              ? formatEnvironment(item.environment as ApiKeyEnvironment)
              : "-",
          },
          {
            label: "Permissões",
            value: item.scopes
              ? formatScopes(parseJsonArray(item.scopes) as ApiKeyScope[])
              : "-",
          },
          {
            label: "Limite/min",
            value: String(item.rate_limit_per_minute ?? "60"),
          },
          {
            label: "Status",
            value: item.is_active === false ? "Inativo" : "Ativo",
          },
          {
            label: "Último Uso",
            value: formatDate(item.last_used_at),
          },
        ]}
        onAddPress={openCreateModal}
        addButtonLabel="+ Nova Chave"
        controlRef={controlRef}
        headerActions={apiInfoPanel}
        renderCustomField={renderCustomField}
        renderItemActions={(item) => (
          <View style={{ flexDirection: "row", gap: 6 }}>
            {item.is_active !== false ? (
              <TouchableOpacity
                onPress={async () => {
                  await updateRow({ id: String(item.id), is_active: false });
                  controlRef.current?.reload();
                }}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 6,
                  backgroundColor: "#dc262615",
                }}
              >
                <ThemedText
                  style={{ color: "#dc2626", fontWeight: "600", fontSize: 11 }}
                >
                  Revogar
                </ThemedText>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={async () => {
                  await updateRow({ id: String(item.id), is_active: true });
                  controlRef.current?.reload();
                }}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 6,
                  backgroundColor: tintColor + "15",
                }}
              >
                <ThemedText
                  style={{ color: tintColor, fontWeight: "600", fontSize: 11 }}
                >
                  Reativar
                </ThemedText>
              </TouchableOpacity>
            )}
          </View>
        )}
      />

      {/* ═══ CREATE MODAL ═══ */}
      <Modal
        transparent
        visible={createModalOpen}
        animationType="slide"
        onRequestClose={() => setCreateModalOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: cardColor,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 20,
              maxHeight: "85%",
            }}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <View>
                <ThemedText
                  style={{ fontSize: 20, fontWeight: "700", color: textColor }}
                >
                  Nova Chave de API
                </ThemedText>
                <ThemedText
                  style={{ fontSize: 13, color: mutedColor, marginTop: 4 }}
                >
                  A chave será exibida apenas uma vez
                </ThemedText>
              </View>
              <TouchableOpacity
                onPress={() => setCreateModalOpen(false)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: borderColor + "60",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <ThemedText style={{ color: mutedColor, fontSize: 16 }}>
                  ✕
                </ThemedText>
              </TouchableOpacity>
            </View>

            <ScrollView>
              {/* Name */}
              <View style={{ marginBottom: 16 }}>
                <ThemedText style={{ fontSize: 12, color: mutedColor }}>
                  Nome *
                </ThemedText>
                <TextInput
                  value={createName}
                  onChangeText={setCreateName}
                  placeholder="Ex: Integração ERP, Dashboard BI"
                  placeholderTextColor={mutedColor}
                  style={{
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    backgroundColor: inputBg,
                    color: textColor,
                    marginTop: 6,
                  }}
                />
              </View>

              {/* Environment */}
              <View style={{ marginBottom: 16 }}>
                <ThemedText style={{ fontSize: 12, color: mutedColor }}>
                  Ambiente
                </ThemedText>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                  {(["live", "test"] as const).map((env) => (
                    <TouchableOpacity
                      key={env}
                      onPress={() => setCreateEnv(env)}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor:
                          createEnv === env ? tintColor : borderColor,
                        backgroundColor:
                          createEnv === env ? tintColor + "1A" : inputBg,
                        alignItems: "center",
                      }}
                    >
                      <ThemedText
                        style={{
                          color: createEnv === env ? tintColor : textColor,
                          fontWeight: createEnv === env ? "700" : "400",
                        }}
                      >
                        {env === "live" ? "🔴 Produção" : "🟡 Teste"}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Scopes */}
              <View style={{ marginBottom: 16 }}>
                <ThemedText style={{ fontSize: 12, color: mutedColor }}>
                  Permissões *
                </ThemedText>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                  {(
                    [
                      {
                        key: "read" as const,
                        label: "📖 Leitura",
                        desc: "GET",
                      },
                      {
                        key: "write" as const,
                        label: "✏️ Escrita",
                        desc: "POST/PUT",
                      },
                      {
                        key: "delete" as const,
                        label: "🗑️ Exclusão",
                        desc: "DELETE",
                      },
                    ] as const
                  ).map((scope) => {
                    const selected = createScopes.includes(scope.key);
                    return (
                      <TouchableOpacity
                        key={scope.key}
                        onPress={() => toggleScope(scope.key)}
                        style={{
                          flex: 1,
                          paddingVertical: 10,
                          paddingHorizontal: 8,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: selected ? tintColor : borderColor,
                          backgroundColor: selected
                            ? tintColor + "1A"
                            : inputBg,
                          alignItems: "center",
                        }}
                      >
                        <ThemedText
                          style={{
                            color: selected ? tintColor : textColor,
                            fontWeight: selected ? "700" : "400",
                            fontSize: 13,
                          }}
                        >
                          {scope.label}
                        </ThemedText>
                        <ThemedText
                          style={{
                            color: mutedColor,
                            fontSize: 10,
                            marginTop: 2,
                          }}
                        >
                          {scope.desc}
                        </ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Rate limit */}
              <View style={{ marginBottom: 16 }}>
                <ThemedText style={{ fontSize: 12, color: mutedColor }}>
                  Limite de requisições por minuto
                </ThemedText>
                <TextInput
                  value={createRateLimit}
                  onChangeText={(t) => setCreateRateLimit(t.replace(/\D/g, ""))}
                  placeholder="60"
                  placeholderTextColor={mutedColor}
                  keyboardType="number-pad"
                  style={{
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    backgroundColor: inputBg,
                    color: textColor,
                    marginTop: 6,
                  }}
                />
              </View>
            </ScrollView>

            {/* Error */}
            {createError ? (
              <ThemedText
                style={{ color: "#dc2626", marginTop: 8, fontSize: 13 }}
              >
                {createError}
              </ThemedText>
            ) : null}

            {/* Actions */}
            <View
              style={{
                flexDirection: "row",
                gap: 8,
                marginTop: 16,
                justifyContent: "flex-end",
              }}
            >
              <TouchableOpacity
                onPress={() => setCreateModalOpen(false)}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor,
                }}
              >
                <ThemedText style={{ color: textColor, fontWeight: "600" }}>
                  Cancelar
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCreate}
                disabled={createSaving}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 20,
                  borderRadius: 8,
                  backgroundColor: createSaving ? mutedColor : tintColor,
                  flexDirection: "row",
                  gap: 6,
                  alignItems: "center",
                }}
              >
                {createSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : null}
                <ThemedText style={{ color: "#fff", fontWeight: "700" }}>
                  {createSaving ? "Criando..." : "Criar Chave"}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ═══ KEY REVEAL MODAL ═══ */}
      <Modal
        transparent
        visible={!!revealKey}
        animationType="fade"
        onRequestClose={closeReveal}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: cardColor,
              borderRadius: 16,
              padding: 24,
              maxWidth: 500,
              alignSelf: "center",
              width: "100%",
            }}
          >
            {/* Header */}
            <View style={{ alignItems: "center", marginBottom: 20 }}>
              <ThemedText style={{ fontSize: 32, marginBottom: 8 }}>
                🔑
              </ThemedText>
              <ThemedText
                style={{
                  fontSize: 18,
                  fontWeight: "700",
                  color: textColor,
                  textAlign: "center",
                }}
              >
                Chave Criada com Sucesso
              </ThemedText>
              <ThemedText
                style={{
                  fontSize: 13,
                  color: mutedColor,
                  textAlign: "center",
                  marginTop: 4,
                }}
              >
                {revealName}
              </ThemedText>
            </View>

            {/* Warning */}
            <View
              style={{
                backgroundColor: "#fef3c7",
                borderRadius: 8,
                padding: 12,
                marginBottom: 16,
              }}
            >
              <ThemedText
                style={{
                  color: "#92400e",
                  fontSize: 12,
                  fontWeight: "600",
                  textAlign: "center",
                }}
              >
                ⚠️ Copie esta chave agora. Ela não será exibida novamente.
              </ThemedText>
            </View>

            {/* Key display */}
            <View
              style={{
                backgroundColor: bgColor,
                borderRadius: 8,
                borderWidth: 1,
                borderColor,
                padding: 14,
                marginBottom: 16,
              }}
            >
              <ThemedText
                style={{
                  fontFamily: Platform.OS === "web" ? "monospace" : "Courier",
                  fontSize: 13,
                  color: textColor,
                  lineHeight: 20,
                }}
                selectable
              >
                {revealKey}
              </ThemedText>
            </View>

            {/* Copy button */}
            <TouchableOpacity
              onPress={copyKey}
              style={{
                paddingVertical: 12,
                paddingHorizontal: 20,
                borderRadius: 8,
                backgroundColor: copied ? "#16a34a" : tintColor,
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <ThemedText style={{ color: "#fff", fontWeight: "700" }}>
                {copied ? "✓ Copiado!" : "📋 Copiar Chave"}
              </ThemedText>
            </TouchableOpacity>

            {/* Close */}
            <TouchableOpacity
              onPress={closeReveal}
              style={{
                paddingVertical: 10,
                alignItems: "center",
              }}
            >
              <ThemedText style={{ color: mutedColor, fontWeight: "600" }}>
                Fechar
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
