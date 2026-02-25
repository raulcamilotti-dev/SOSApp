import { styles } from "@/app/theme/styles";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { JsonEditor } from "@/components/ui/JsonEditor";
import { useAuth } from "@/core/auth/AuthContext";
import { isUserAdmin } from "@/core/auth/auth.utils";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
  AI_AGENT_ENDPOINT,
  buildAiInsightMessage,
  extractAiInsightText,
  UNIVERSAL_AI_INSIGHT_PROMPT,
} from "@/services/ai-insights";
import { api, getApiErrorMessage } from "@/services/api";
import { getTableInfo, type TableInfoRow } from "@/services/schema";
import DateTimePickerMobile from "@react-native-community/datetimepicker";
import { useIsFocused } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";
import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

export type CrudFieldType =
  | "text"
  | "multiline"
  | "json"
  | "reference"
  | "boolean"
  | "select"
  | "date"
  | "datetime"
  | "currency"
  | "number"
  | "email"
  | "phone"
  | "url"
  | "masked";

type CrudSelectOption = {
  label: string;
  value: string;
};

export type CrudFieldConfig<T> = {
  key: keyof T & string;
  label: string;
  placeholder?: string;
  type?: CrudFieldType;
  options?: CrudSelectOption[];
  required?: boolean;
  visibleInList?: boolean;
  visibleInForm?: boolean;
  readOnly?: boolean;
  /** Custom field-level validation. Return error message string on failure, null on success. */
  validate?: (
    value: string,
    formState: Record<string, string>,
  ) => string | null;
  /** Conditional visibility. Return false to hide this field from the form. */
  showWhen?: (formState: Record<string, string>) => boolean;
  /** Section/group header for organizing fields in the form. */
  section?: string;
  /** Mask preset for type="masked": "cpf" | "cnpj" | "cep" | "phone" | "cpf_cnpj" */
  maskType?: "cpf" | "cnpj" | "cep" | "phone" | "cpf_cnpj";
  /** Default template object for type="json" fields. Used to pre-populate structure on create. */
  jsonTemplate?: Record<string, unknown>;
  referenceTable?: string;
  referenceLabelField?: string;
  referenceIdField?: string;
  referenceSearchField?: string;
  resolveReferenceLabelInList?: boolean;
  referenceFilter?: (
    item: Record<string, unknown>,
    state: Record<string, string>,
  ) => boolean;
  referenceLabelFormatter?: (
    item: Record<string, unknown>,
    defaultLabel: string,
    state: Record<string, string>,
  ) => string;
};

type DetailItem = { label: string; value: string };
type ReferenceOption = { id: string; label: string; raw: any };
type QuickCreateReturnTarget =
  | { scope: "form"; fieldKey: string }
  | { scope: "quick"; fieldKey: string };
type QuickCreateSnapshot = {
  field: CrudFieldConfig<any>;
  fields: CrudFieldConfig<any>[];
  loading: boolean;
  state: Record<string, string>;
  referenceLabels: Record<string, string>;
  returnTarget: QuickCreateReturnTarget;
};

const REFERENCE_ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";

/** Imperative handle for CrudScreen — use via controlRef prop */
export type CrudScreenHandle = {
  /** Open the create modal with pre-filled form data */
  openCreateWithData: (data: Record<string, string>) => void;
  /** Reload the items list */
  reload: () => void;
};

type Props<T> = {
  title: string;
  subtitle?: string;
  searchPlaceholder?: string;
  searchFields?: string[];
  fields: CrudFieldConfig<T>[];
  loadItems: () => Promise<T[]>;
  /** Optional paginated loader — when provided, CrudScreen uses server-side pagination
   *  instead of loading all items at once. Screens that don't pass this prop keep working as-is. */
  paginatedLoadItems?: (params: {
    limit: number;
    offset: number;
  }) => Promise<T[]>;
  /** Items per page when using paginatedLoadItems (default: 20) */
  pageSize?: number;
  createItem: (payload: Partial<T>) => Promise<unknown>;
  updateItem: (
    payload: Partial<T> & { id?: string | null },
  ) => Promise<unknown>;
  deleteItem?: (
    payload: Partial<T> & { id?: string | null },
  ) => Promise<unknown>;
  getId: (item: T) => string;
  getTitle: (item: T) => string;
  getDetails?: (item: T) => DetailItem[];
  renderItemActions?: (item: T) => ReactNode;
  /** Optional custom renderer for specific form fields.
   *  Return a ReactNode to replace the default input, or null/undefined to use the default. */
  renderCustomField?: (
    field: CrudFieldConfig<T>,
    value: string,
    onChange: (value: string) => void,
    formState: Record<string, string>,
    setFormState: React.Dispatch<React.SetStateAction<Record<string, string>>>,
  ) => ReactNode | null | undefined;
  /** Hide the default "Adicionar" button (use controlRef.openCreateWithData instead) */
  hideAddButton?: boolean;
  /** Custom label for the FAB add button (default: "+ Adicionar") */
  addButtonLabel?: string;
  /** Custom handler for the FAB add button (overrides default create form) */
  onAddPress?: () => void;
  /** Custom action buttons rendered next to (or replacing) the header buttons */
  headerActions?: ReactNode;
  /** Mutable ref to receive imperative handle (openCreateWithData, reload) */
  controlRef?: React.MutableRefObject<CrudScreenHandle | null>;
};

/* ───────────── Date / Currency / Number formatting helpers ───────────── */

const PT_BR_LOCALE = "pt-BR";

/** Parse an ISO or date-like string into a Date object, or null on failure */
const parseDate = (value: unknown): Date | null => {
  if (!value) return null;
  const str = String(value).trim();
  if (!str || str === "-") return null;
  const date = new Date(str);
  return isNaN(date.getTime()) ? null : date;
};

/** Format a date value to dd/mm/aaaa */
const formatDateBR = (value: unknown): string => {
  const date = parseDate(value);
  if (!date) return "-";
  return date.toLocaleDateString(PT_BR_LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
};

/** Format a datetime value to dd/mm/aaaa HH:mm */
const formatDateTimeBR = (value: unknown): string => {
  const date = parseDate(value);
  if (!date) return "-";
  return date.toLocaleString(PT_BR_LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
};

/** Format a numeric value as BRL currency (R$ 1.234,56) */
const formatCurrencyBR = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "-";
  const num =
    typeof value === "number"
      ? value
      : parseFloat(
          String(value)
            .replace(/[^\d.,-]/g, "")
            .replace(",", "."),
        );
  if (isNaN(num)) return "-";
  return num.toLocaleString(PT_BR_LOCALE, {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
};

/** Format a generic number for display */
const formatNumberBR = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "-";
  const num = typeof value === "number" ? value : parseFloat(String(value));
  if (isNaN(num)) return "-";
  return num.toLocaleString(PT_BR_LOCALE);
};

/** Parse a BRL currency string to numeric string for storage (e.g., "R$ 1.234,56" → "1234.56") */
const parseCurrencyInput = (text: string): string => {
  const trimmed = text.trim();
  // If it's already a plain numeric value (e.g., "259.70" from DB), return as-is
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed;
  // Otherwise parse BRL format: remove R$, spaces, thousand dots, convert decimal comma
  const cleaned = trimmed
    .replace(/[R$\s]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  return cleaned;
};

/* ───────────── Mask formatting helpers ───────────── */

export type MaskPreset = "cpf" | "cnpj" | "cep" | "phone" | "cpf_cnpj";

/** Apply a mask pattern to a digits-only string */
const applyMask = (digits: string, maskType: MaskPreset): string => {
  const d = digits.replace(/\D/g, "");
  switch (maskType) {
    case "cpf":
      // 000.000.000-00
      return d
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
        .slice(0, 14);
    case "cnpj":
      // 00.000.000/0000-00
      return d
        .replace(/(\d{2})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1/$2")
        .replace(/(\d{4})(\d{1,2})$/, "$1-$2")
        .slice(0, 18);
    case "cpf_cnpj":
      // Auto-detect: ≤11 digits → CPF, >11 → CNPJ
      return d.length <= 11 ? applyMask(d, "cpf") : applyMask(d, "cnpj");
    case "cep":
      // 00000-000
      return d.replace(/(\d{5})(\d{1,3})$/, "$1-$2").slice(0, 9);
    case "phone":
      // (00) 00000-0000 or (00) 0000-0000
      if (d.length <= 10) {
        return d
          .replace(/(\d{2})(\d)/, "($1) $2")
          .replace(/(\d{4})(\d{1,4})$/, "$1-$2");
      }
      return d
        .replace(/(\d{2})(\d)/, "($1) $2")
        .replace(/(\d{5})(\d{1,4})$/, "$1-$2")
        .slice(0, 15);
    default:
      return d;
  }
};

/** Get max digit length for a mask type */
const maskMaxDigits = (maskType: MaskPreset): number => {
  switch (maskType) {
    case "cpf":
      return 11;
    case "cnpj":
      return 14;
    case "cpf_cnpj":
      return 14;
    case "cep":
      return 8;
    case "phone":
      return 11;
    default:
      return 20;
  }
};

/** Format a value based on field type for display in cards/details */
const formatValueByType = (
  value: unknown,
  fieldType?: CrudFieldType,
  maskType?: MaskPreset,
): string => {
  switch (fieldType) {
    case "date":
      return formatDateBR(value);
    case "datetime":
      return formatDateTimeBR(value);
    case "currency":
      return formatCurrencyBR(value);
    case "number":
      return formatNumberBR(value);
    case "masked":
      if (maskType && value) return applyMask(String(value), maskType);
      return formatValue(value);
    default:
      return formatValue(value);
  }
};

/** Convert a Date to YYYY-MM-DD string for inputs and API */
const dateToISODate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/** Convert a Date to ISO string for API submission */
const dateToISOString = (date: Date): string => date.toISOString();

const formatValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export const SYSTEM_COLUMNS = new Set([
  "id",
  "created_at",
  "updated_at",
  "deleted_at",
]);

const AUDIT_COLUMNS = new Set(["created_at", "updated_at", "deleted_at"]);

export const humanizeLabel = (column: string) =>
  column
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const toIsoNow = () => new Date().toISOString();

const SENSITIVE_KEY_REGEX =
  /(password|token|authorization|secret|cookie|session|api[_-]?key|bearer)/i;

const parseRequestBody = (raw: unknown): Record<string, unknown> => {
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

const sanitizeForDiagnostic = (value: unknown, depth = 0): unknown => {
  if (value === null || value === undefined) return value;
  if (depth > 6) return "[max-depth]";

  if (Array.isArray(value)) {
    return value
      .slice(0, 120)
      .map((item) => sanitizeForDiagnostic(item, depth + 1));
  }

  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const entries = Object.entries(source).slice(0, 200);
    return entries.reduce<Record<string, unknown>>((acc, [key, current]) => {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        acc[key] = "[redacted]";
        return acc;
      }
      acc[key] = sanitizeForDiagnostic(current, depth + 1);
      return acc;
    }, {});
  }

  if (typeof value === "string") {
    if (value.length > 4000) {
      return `${value.slice(0, 4000)}...[truncated]`;
    }
    return value;
  }

  return value;
};

const getLogicalCrudError = (result: unknown): string | null => {
  const body = result as any;
  if (!body || typeof body !== "object") return null;

  const failed =
    body?.success === false ||
    body?.ok === false ||
    String(body?.status ?? "").toLowerCase() === "error" ||
    String(body?.result ?? "").toLowerCase() === "error";

  if (!failed) return null;

  const message = body?.message || body?.error || body?.detail;
  return message ? String(message) : "Falha na operação";
};

const isTruthyString = (value: string) => {
  const normalized = value.trim().toLowerCase();
  return ["true", "1", "yes", "sim", "ativo"].includes(normalized);
};

const shouldTreatAsBooleanField = (field: CrudFieldConfig<any>) => {
  if (field.type === "boolean") return true;
  const key = String(field.key ?? "").toLowerCase();
  return (
    key === "active" ||
    key === "is_active" ||
    key === "required" ||
    key === "enabled" ||
    key === "disabled" ||
    key.startsWith("is_") ||
    key.startsWith("has_") ||
    key.startsWith("can_") ||
    key.startsWith("should_") ||
    key.startsWith("allow_") ||
    key.startsWith("enable_") ||
    key.startsWith("disable_") ||
    key.endsWith("_enabled") ||
    key.endsWith("_disabled") ||
    key.endsWith("_flag")
  );
};

const getBooleanOptionLabels = (field: CrudFieldConfig<any>) => {
  const key = String(field.key ?? "").toLowerCase();
  if (key === "active" || key === "is_active") {
    return { trueLabel: "Ativo", falseLabel: "Inativo" };
  }
  return { trueLabel: "Sim", falseLabel: "Não" };
};

const getFriendlyLabelByField = (field: CrudFieldConfig<any>) => {
  const key = String(field.key ?? "").toLowerCase();
  const reference = String(field.referenceTable ?? "").toLowerCase();

  if (key === "tenant_id" || key === "id_tenant" || reference === "tenants") {
    return "Tenants";
  }

  if (key === "user_id" || key === "id_user" || reference === "users") {
    return "Usuário";
  }

  if (key === "role_id" || key === "id_role" || reference === "roles") {
    return "Role";
  }

  if (key === "is_active" || key === "active") {
    return "Ativo";
  }

  return field.label || humanizeLabel(key);
};

const getFriendlyLabelByKey = (
  key: string,
  fields?: CrudFieldConfig<any>[],
) => {
  const match = (fields ?? []).find((field) => field.key === key);
  if (match) return getFriendlyLabelByField(match);

  const lower = String(key).toLowerCase();
  if (lower === "tenant_id" || lower === "id_tenant") return "Tenants";
  if (lower === "user_id" || lower === "id_user") return "Usuário";
  if (lower === "role_id" || lower === "id_role") return "Role";
  if (lower === "is_active" || lower === "active") return "Ativo";
  return humanizeLabel(key);
};

const formatBooleanValueByField = (
  field: CrudFieldConfig<any>,
  value: unknown,
) => {
  if (value === null || value === undefined || value === "") return "-";

  const labels = getBooleanOptionLabels(field);
  if (typeof value === "boolean") {
    return value ? labels.trueLabel : labels.falseLabel;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "sim", "ativo"].includes(normalized)) {
    return labels.trueLabel;
  }
  if (["false", "0", "no", "não", "nao", "inativo"].includes(normalized)) {
    return labels.falseLabel;
  }

  return formatValue(value);
};

const normalizeBooleanField = <T extends Record<string, unknown>>(
  field: CrudFieldConfig<T>,
): CrudFieldConfig<T> => {
  if (!shouldTreatAsBooleanField(field)) return field;
  return {
    ...field,
    type: "boolean" as CrudFieldType,
  };
};

const normalizeCrudField = <T extends Record<string, unknown>>(
  field: CrudFieldConfig<T>,
): CrudFieldConfig<T> => {
  const normalizedBoolean = normalizeBooleanField(field);
  const normalizedLabel = getFriendlyLabelByField(normalizedBoolean);
  return {
    ...normalizedBoolean,
    label: normalizedLabel,
    placeholder:
      normalizedBoolean.placeholder && normalizedBoolean.placeholder.trim()
        ? normalizedBoolean.placeholder
        : normalizedLabel,
  };
};

const formatRecordDetails = (record: any, fields?: CrudFieldConfig<any>[]) => {
  if (!record || typeof record !== "object") {
    return [] as { key: string; value: string }[];
  }

  const fieldMap = new Map((fields ?? []).map((field) => [field.key, field]));

  return Object.keys(record)
    .filter((key) => !SYSTEM_COLUMNS.has(key))
    .map((key) => {
      const field = fieldMap.get(key);
      const resolvedField = field ? normalizeCrudField(field) : null;
      const value =
        resolvedField?.type === "boolean"
          ? formatBooleanValueByField(resolvedField, record[key])
          : formatValue(record[key]);

      return { key, value };
    });
};

const formatItemSummary = (item: Record<string, unknown>) => {
  if (!item) return "";
  const keys = Object.keys(item)
    .filter((key) =>
      ["name", "title", "description", "fullname", "company_name"].includes(
        key,
      ),
    )
    .slice(0, 3);
  if (!keys.length) return "";
  return keys.map((key) => String(item[key] ?? "")).join(" · ");
};

const deriveReferenceLabel = (
  item: any,
  explicitLabelField?: string,
): string => {
  if (!item || typeof item !== "object") return "";
  const explicit = explicitLabelField
    ? String(item?.[explicitLabelField] ?? "")
    : "";
  if (explicit.trim()) return explicit.trim();

  const summary = formatItemSummary(item as Record<string, unknown>).trim();
  if (summary) return summary;

  // Fallback: first non-system string-ish field
  const firstKey = Object.keys(item).find(
    (key) => !SYSTEM_COLUMNS.has(key) && item?.[key] != null,
  );
  return firstKey ? String(item[firstKey] ?? "").trim() : "";
};

export const convertTableInfoToFields = (
  tableInfo: TableInfoRow[],
): CrudFieldConfig<any>[] => {
  return tableInfo
    .filter((column) => !SYSTEM_COLUMNS.has(column.column_name))
    .map((column) => {
      let type: CrudFieldType = "text";
      let referenceTable: string | undefined;
      let referenceLabelField: string | undefined;
      let referenceSearchField: string | undefined;

      const columnKey = String(column.column_name ?? "").toLowerCase();
      const dataType = String(column.data_type ?? "").toLowerCase();
      const udtName = String(column.udt_name ?? "").toLowerCase();
      const isTenantForeignKey =
        columnKey === "tenant_id" || columnKey === "id_tenant";

      if (column.referenced_table_name) {
        type = "reference";
        referenceTable = column.referenced_table_name;
        if (referenceTable === "tenants") {
          referenceLabelField = "company_name";
          referenceSearchField = "company_name";
        } else if (referenceTable === "users") {
          referenceLabelField = "fullname";
          referenceSearchField = "fullname";
        } else {
          referenceLabelField = "name";
          referenceSearchField = column.referenced_column_name ?? "id";
        }
      } else if (dataType === "boolean") {
        type = "boolean";
      } else if (
        dataType === "timestamp with time zone" ||
        dataType === "timestamp without time zone" ||
        udtName === "timestamptz" ||
        udtName === "timestamp"
      ) {
        // Smart: timestamps → datetime
        type = "datetime";
      } else if (
        dataType === "date" ||
        udtName === "date" ||
        columnKey.endsWith("_date") ||
        columnKey === "date" ||
        columnKey === "birth_date" ||
        columnKey === "due_date"
      ) {
        type = "date";
      } else if (
        (dataType === "numeric" ||
          udtName === "numeric" ||
          udtName === "float8" ||
          udtName === "float4") &&
        (columnKey.endsWith("_amount") ||
          columnKey.endsWith("_value") ||
          columnKey.endsWith("_price") ||
          columnKey.endsWith("_cost") ||
          columnKey.endsWith("_total") ||
          columnKey.endsWith("_fee") ||
          columnKey.endsWith("_rate") ||
          columnKey === "amount" ||
          columnKey === "price" ||
          columnKey === "value" ||
          columnKey === "total" ||
          columnKey === "subtotal" ||
          columnKey === "discount")
      ) {
        type = "currency";
      } else if (
        dataType === "integer" ||
        dataType === "bigint" ||
        dataType === "smallint" ||
        dataType === "numeric" ||
        dataType === "real" ||
        dataType === "double precision" ||
        udtName === "int4" ||
        udtName === "int8" ||
        udtName === "int2" ||
        udtName === "float4" ||
        udtName === "float8" ||
        udtName === "numeric"
      ) {
        type = "number";
      } else if (
        columnKey === "email" ||
        columnKey === "email_address" ||
        columnKey.endsWith("_email")
      ) {
        type = "email";
      } else if (
        columnKey === "cpf" ||
        columnKey === "cnpj" ||
        columnKey === "cpf_cnpj" ||
        columnKey.endsWith("_cpf") ||
        columnKey.endsWith("_cnpj")
      ) {
        type = "masked";
      } else if (
        columnKey === "cep" ||
        columnKey === "postal_code" ||
        columnKey === "zip_code" ||
        columnKey.endsWith("_cep")
      ) {
        type = "masked";
      } else if (
        columnKey === "phone" ||
        columnKey === "telefone" ||
        columnKey === "celular" ||
        columnKey === "whatsapp" ||
        columnKey.endsWith("_phone") ||
        columnKey.endsWith("_telefone")
      ) {
        type = "phone";
      } else if (
        columnKey === "url" ||
        columnKey === "website" ||
        columnKey === "link" ||
        columnKey.endsWith("_url") ||
        columnKey.endsWith("_link")
      ) {
        type = "url";
      } else if (
        dataType === "text" ||
        dataType === "json" ||
        dataType === "jsonb" ||
        dataType === "character varying"
      ) {
        type = dataType === "jsonb" ? "json" : "multiline";
      }

      // Derive maskType for auto-detected masked fields
      let maskType: MaskPreset | undefined;
      if (type === "masked") {
        if (columnKey === "cpf" || columnKey.endsWith("_cpf")) {
          maskType = "cpf";
        } else if (columnKey === "cnpj" || columnKey.endsWith("_cnpj")) {
          maskType = "cnpj";
        } else if (columnKey === "cpf_cnpj") {
          maskType = "cpf_cnpj";
        } else if (
          columnKey === "cep" ||
          columnKey === "postal_code" ||
          columnKey === "zip_code" ||
          columnKey.endsWith("_cep")
        ) {
          maskType = "cep";
        }
      }

      return {
        key: column.column_name,
        label:
          referenceTable === "tenants" && isTenantForeignKey
            ? "Tenants"
            : humanizeLabel(column.column_name),
        type,
        maskType,
        placeholder:
          referenceTable === "tenants" && isTenantForeignKey
            ? "Tenants"
            : humanizeLabel(column.column_name),
        required: column.is_nullable === "NO" && !column.column_default,
        visibleInForm: true,
        referenceTable,
        referenceLabelField,
        referenceIdField: column.referenced_column_name ?? "id",
        referenceSearchField:
          referenceSearchField ?? column.referenced_column_name ?? "id",
      } satisfies CrudFieldConfig<any>;
    });
};

const buildCacheKey = (table: string | undefined, id: string) =>
  table ? `${table}:${id}` : id;

export function CrudScreen<T extends Record<string, unknown>>({
  title,
  subtitle,
  searchPlaceholder,
  searchFields,
  fields,
  loadItems,
  paginatedLoadItems,
  pageSize: propPageSize,
  createItem,
  updateItem,
  deleteItem,
  getId,
  getTitle,
  getDetails,
  renderItemActions,
  renderCustomField,
  hideAddButton,
  addButtonLabel,
  onAddPress,
  headerActions,
  controlRef,
}: Props<T>) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<T[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formState, setFormState] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [referenceModalField, setReferenceModalField] =
    useState<CrudFieldConfig<any> | null>(null);
  const [referenceOptions, setReferenceOptions] = useState<ReferenceOption[]>(
    [],
  );
  const [referenceSearch, setReferenceSearch] = useState("");
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [referenceLabels, setReferenceLabels] = useState<
    Record<string, string>
  >({});

  // Contador de nível de profundidade para z-index dinâmico
  const [modalDepth, setModalDepth] = useState(0);
  const [referenceCache, setReferenceCache] = useState<Record<string, string>>(
    {},
  );
  const [referenceModalContext, setReferenceModalContext] = useState<
    "form" | "quick"
  >("form");
  const [activeQuickFieldKey, setActiveQuickFieldKey] = useState<string | null>(
    null,
  );
  const [quickCreateModalOpen, setQuickCreateModalOpen] = useState(false);
  const [quickCreateField, setQuickCreateField] =
    useState<CrudFieldConfig<any> | null>(null);
  const [quickCreateFields, setQuickCreateFields] = useState<
    CrudFieldConfig<any>[]
  >([]);
  const [quickCreateFieldsLoading, setQuickCreateFieldsLoading] =
    useState(false);
  const [quickCreateState, setQuickCreateState] = useState<
    Record<string, string>
  >({});
  const [quickCreateReferenceLabels, setQuickCreateReferenceLabels] = useState<
    Record<string, string>
  >({});
  const [quickCreateSaving, setQuickCreateSaving] = useState(false);
  const [quickCreateError, setQuickCreateError] = useState<string | null>(null);
  const [quickCreateReturnTarget, setQuickCreateReturnTarget] =
    useState<QuickCreateReturnTarget | null>(null);
  const [quickCreateStack, setQuickCreateStack] = useState<
    QuickCreateSnapshot[]
  >([]);
  const [referenceDetailModalOpen, setReferenceDetailModalOpen] =
    useState(false);
  const [referenceDetailData, setReferenceDetailData] = useState<any>(null);
  const [referenceDetailLoading, setReferenceDetailLoading] = useState(false);
  const [referenceDetailError, setReferenceDetailError] = useState<
    string | null
  >(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilterKey, setActiveFilterKey] = useState<string>("__all");
  const [formErrorDiagnostic, setFormErrorDiagnostic] = useState<string | null>(
    null,
  );
  const [diagnosticCopyStatus, setDiagnosticCopyStatus] = useState<
    string | null
  >(null);
  const [aiInsights, setAiInsights] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Date picker state (mobile) — shared between main form and quick create
  const [datePickerField, setDatePickerField] = useState<string | null>(null);
  const [datePickerMode, setDatePickerMode] = useState<"date" | "datetime">(
    "date",
  );
  const [datePickerValue, setDatePickerValue] = useState<Date>(new Date());
  const [datePickerTarget, setDatePickerTarget] = useState<"form" | "quick">(
    "form",
  );

  // Ref to track which reference cache keys have been attempted (prevents duplicate batch fetches)
  const attemptedRefsRef = useRef<Set<string>>(new Set());
  const referenceTenantScopeCacheRef = useRef<Map<string, boolean>>(new Map());

  const tableSupportsTenantScope = useCallback(async (table?: string) => {
    const normalizedTable = String(table ?? "")
      .trim()
      .toLowerCase();
    if (!normalizedTable) return false;

    if (
      normalizedTable === "tenants" ||
      normalizedTable === "permissions" ||
      normalizedTable === "role_permissions"
    ) {
      return false;
    }

    const cached = referenceTenantScopeCacheRef.current.get(normalizedTable);
    if (typeof cached === "boolean") {
      return cached;
    }

    try {
      const info = await getTableInfo(normalizedTable);
      const hasTenantId = info.some(
        (column) => String(column.column_name ?? "") === "tenant_id",
      );
      referenceTenantScopeCacheRef.current.set(normalizedTable, hasTenantId);
      return hasTenantId;
    } catch {
      referenceTenantScopeCacheRef.current.set(normalizedTable, false);
      return false;
    }
  }, []);

  const shouldApplyTenantIsolationToReference = useCallback(
    async (table?: string) => {
      if (!user?.tenant_id) return false;
      if (String(user?.role ?? "").toLowerCase() === "superadmin") {
        return false;
      }
      return tableSupportsTenantScope(table);
    },
    [tableSupportsTenantScope, user?.role, user?.tenant_id],
  );

  // Pagination state (only active when paginatedLoadItems is provided)
  const pageSize = propPageSize ?? 20;
  const isPaginated = !!paginatedLoadItems;
  const [paginationOffset, setPaginationOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const { width } = useWindowDimensions();

  const isFocused = useIsFocused();
  const isAdminUser = useMemo(() => isUserAdmin(user), [user]);

  const formFields = useMemo(
    () =>
      fields.filter(
        (field) =>
          field.visibleInForm !== false &&
          field.key !== "id" &&
          !AUDIT_COLUMNS.has(String(field.key)),
      ),
    [fields],
  );
  const normalizedFields = useMemo(
    () => fields.map((field) => normalizeCrudField(field)),
    [fields],
  );
  const normalizedFormFields = useMemo(
    () => formFields.map((field) => normalizeCrudField(field)),
    [formFields],
  );
  const formFieldKeys = useMemo(
    () => new Set(formFields.map((field) => field.key)),
    [formFields],
  );

  const textColor = useThemeColor({}, "text");
  const mutedTextColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const cardColor = useThemeColor({}, "card");
  const tintColor = useThemeColor({}, "tint");
  const inputBackground = useThemeColor({}, "input");
  const onTintTextColor = useThemeColor({}, "background");
  const modalBackdrop = "rgba(0, 0, 0, 0.55)";
  const responsiveSpacing = useMemo(() => {
    if (width < 360) {
      return {
        screenPadding: 12,
        cardGap: 8,
        headerGap: 10,
        actionsGap: 8,
        sectionGap: 10,
        titleRightPadding: 2,
        actionMinWidth: 78,
        actionPaddingHorizontal: 10,
        actionDirection: "column" as const,
      };
    }

    if (width < 768) {
      return {
        screenPadding: 16,
        cardGap: 12,
        headerGap: 16,
        actionsGap: 10,
        sectionGap: 14,
        titleRightPadding: 4,
        actionMinWidth: 86,
        actionPaddingHorizontal: 12,
        actionDirection: "row" as const,
      };
    }

    if (width < 1200) {
      return {
        screenPadding: 20,
        cardGap: 14,
        headerGap: 18,
        actionsGap: 12,
        sectionGap: 16,
        titleRightPadding: 8,
        actionMinWidth: 100,
        actionPaddingHorizontal: 14,
        actionDirection: "row" as const,
      };
    }

    return {
      screenPadding: 24,
      cardGap: 16,
      headerGap: 20,
      actionsGap: 14,
      sectionGap: 18,
      titleRightPadding: 8,
      actionMinWidth: 112,
      actionPaddingHorizontal: 16,
      actionDirection: "row" as const,
    };
  }, [width]);

  const buildDiagnosticReport = useCallback(
    (
      operation: string,
      error: unknown,
      payload?: Record<string, unknown>,
      fallbackMessage = "Falha na operação",
    ) => {
      const errorLike = (error ?? {}) as any;
      const configData = parseRequestBody(errorLike?.config?.data);
      const requestPayload =
        payload ??
        (typeof configData?.payload === "object"
          ? (configData.payload as Record<string, unknown>)
          : undefined);

      const report = {
        generated_at: new Date().toISOString(),
        app: "SOS Escritura",
        source: "CrudScreen",
        operation,
        screen_title: title,
        modal_mode: modalMode,
        editing_id: editingId,
        platform: Platform.OS,
        actor: {
          user_id: user?.id ?? null,
          role: user?.role ?? null,
          tenant_id: user?.tenant_id ?? null,
          email: user?.email ?? null,
        },
        ui: {
          form_error_message: getApiErrorMessage(error, fallbackMessage),
          search_query: searchQuery || null,
          active_filter_key: activeFilterKey,
        },
        request: {
          endpoint: errorLike?.config?.url ?? null,
          method: errorLike?.config?.method ?? null,
          action: String(configData?.action ?? "").trim() || null,
          table: String(configData?.table ?? "").trim() || null,
          payload: sanitizeForDiagnostic(requestPayload ?? null),
          raw_data: sanitizeForDiagnostic(configData),
        },
        response: {
          status: errorLike?.response?.status ?? null,
          status_text: errorLike?.response?.statusText ?? null,
          data: sanitizeForDiagnostic(errorLike?.response?.data ?? null),
        },
        exception: {
          message: errorLike?.message ?? null,
          normalized_message: errorLike?.normalizedMessage ?? null,
          stack: errorLike?.stack ?? null,
        },
        form_state: sanitizeForDiagnostic(formState),
      };

      return [
        "=== SOSAPP CRUD ERROR DIAGNOSTIC ===",
        JSON.stringify(report, null, 2),
      ].join("\n");
    },
    [
      activeFilterKey,
      editingId,
      formState,
      modalMode,
      searchQuery,
      title,
      user?.email,
      user?.id,
      user?.role,
      user?.tenant_id,
    ],
  );

  const copyDiagnostic = useCallback(async () => {
    if (!formErrorDiagnostic) return;
    try {
      await Clipboard.setStringAsync(formErrorDiagnostic);
      setDiagnosticCopyStatus("Diagnóstico copiado");
    } catch {
      setDiagnosticCopyStatus("Falha ao copiar diagnóstico");
    }
  }, [formErrorDiagnostic]);

  const fetchReferenceLabel = useCallback(
    async (field: CrudFieldConfig<any>, id: string) => {
      if (!field.referenceTable) {
        return "";
      }
      const cacheKey = buildCacheKey(field.referenceTable, id);
      if (referenceCache[cacheKey]) {
        return referenceCache[cacheKey];
      }
      // Mark as attempted so batch doesn't re-fetch
      attemptedRefsRef.current.add(cacheKey);
      try {
        const idField = field.referenceIdField ?? "id";
        const requestPayload: Record<string, unknown> = {
          action: "list",
          table: field.referenceTable,
          search_field1: idField,
          search_value1: id,
          search_operator1: "equal",
        };

        const applyTenantIsolation =
          await shouldApplyTenantIsolationToReference(field.referenceTable);

        if (applyTenantIsolation) {
          requestPayload.search_field2 = "tenant_id";
          requestPayload.search_value2 = String(user?.tenant_id ?? "");
          requestPayload.search_operator2 = "equal";
          requestPayload.combine_type = "AND";
        }

        const response = await api.post(REFERENCE_ENDPOINT, requestPayload);
        const data = response.data;
        const list = Array.isArray(data) ? data : (data?.data ?? []);
        const exactMatch = Array.isArray(list)
          ? list.find((item) => String(item?.[idField] ?? "") === id)
          : null;
        const fallback =
          Array.isArray(list) && list.length > 0 ? list[0] : null;
        const label = deriveReferenceLabel(
          exactMatch ?? fallback,
          field.referenceLabelField,
        );
        if (label) {
          setReferenceCache((prev) => ({ ...prev, [cacheKey]: label }));
        }
        return label;
      } catch {
        return "";
      }
    },
    [referenceCache, shouldApplyTenantIsolationToReference, user?.tenant_id],
  );

  const getCachedReferenceLabel = useCallback(
    (field: CrudFieldConfig<any>, value: unknown) => {
      if (!value) return "";
      const id = String(value);
      const cacheKey = buildCacheKey(field.referenceTable, id);
      return referenceCache[cacheKey] ?? "";
    },
    [referenceCache],
  );

  /* ── Batch reference resolution (replaces N+1 individual fetches) ── */
  const batchResolveReferences = useCallback(
    async (currentFields: CrudFieldConfig<any>[], currentItems: T[]) => {
      // Group unique IDs by (referenceTable, referenceIdField)
      const groups = new Map<
        string,
        {
          table: string;
          idField: string;
          labelField?: string;
          ids: Set<string>;
        }
      >();

      currentFields
        .filter((f) => f.type === "reference" && f.referenceTable)
        .forEach((field) => {
          const table = field.referenceTable!;
          const idField = field.referenceIdField ?? "id";
          const groupKey = `${table}:${idField}`;

          if (!groups.has(groupKey)) {
            groups.set(groupKey, {
              table,
              idField,
              labelField: field.referenceLabelField,
              ids: new Set(),
            });
          }

          const group = groups.get(groupKey)!;
          currentItems.forEach((item) => {
            const value = item[field.key];
            if (value) {
              const id = String(value);
              const cacheKey = buildCacheKey(table, id);
              // Skip if already attempted (cached or pending)
              if (!attemptedRefsRef.current.has(cacheKey)) {
                group.ids.add(id);
              }
            }
          });
        });

      // Mark all as attempted to prevent duplicate fetches
      groups.forEach((group) => {
        group.ids.forEach((id) => {
          attemptedRefsRef.current.add(buildCacheKey(group.table, id));
        });
      });

      // Fetch each group in parallel (1 request per reference table)
      const newCacheEntries: Record<string, string> = {};

      await Promise.all(
        Array.from(groups.values())
          .filter((group) => group.ids.size > 0)
          .map(async (group) => {
            try {
              const applyTenantIsolation =
                await shouldApplyTenantIsolationToReference(group.table);
              const idsArray = Array.from(group.ids);
              // Chunk large ID lists (max 50 per request to avoid overly long queries)
              const CHUNK_SIZE = 50;
              for (let i = 0; i < idsArray.length; i += CHUNK_SIZE) {
                const chunk = idsArray.slice(i, i + CHUNK_SIZE);
                const requestPayload: Record<string, unknown> = {
                  action: "list",
                  table: group.table,
                  search_field1: group.idField,
                  search_value1: chunk.join(","),
                  search_operator1: "in",
                };

                if (applyTenantIsolation) {
                  requestPayload.search_field2 = "tenant_id";
                  requestPayload.search_value2 = String(user?.tenant_id ?? "");
                  requestPayload.search_operator2 = "equal";
                  requestPayload.combine_type = "AND";
                }

                const response = await api.post(
                  REFERENCE_ENDPOINT,
                  requestPayload,
                );

                const data = response.data;
                const list = Array.isArray(data) ? data : (data?.data ?? []);
                if (Array.isArray(list)) {
                  list.forEach((record) => {
                    const id = String(record?.[group.idField] ?? "");
                    if (!id) return;
                    const label = deriveReferenceLabel(
                      record,
                      group.labelField,
                    );
                    if (label) {
                      newCacheEntries[buildCacheKey(group.table, id)] = label;
                    }
                  });
                }
              }
            } catch {
              // Silently fail — labels will show as raw IDs
            }
          }),
      );

      if (Object.keys(newCacheEntries).length > 0) {
        setReferenceCache((prev) => ({ ...prev, ...newCacheEntries }));
      }
    },
    [shouldApplyTenantIsolationToReference, user?.tenant_id],
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (isPaginated && paginatedLoadItems) {
        // Paginated mode: load first page
        setPaginationOffset(0);
        setHasMore(true);
        const list = await paginatedLoadItems({ limit: pageSize, offset: 0 });
        const normalized = Array.isArray(list) ? list : [];
        setItems(normalized);
        setHasMore(normalized.length >= pageSize);
        setPaginationOffset(normalized.length);
      } else {
        // Legacy mode: load everything at once
        const list = await loadItems();
        setItems(Array.isArray(list) ? list : []);
      }
    } catch (error) {
      setError(getApiErrorMessage(error, "Falha ao carregar dados"));
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isPaginated, loadItems, paginatedLoadItems, pageSize]);

  const loadMore = useCallback(async () => {
    if (!isPaginated || !paginatedLoadItems || !hasMore || loadingMore) return;
    try {
      setLoadingMore(true);
      const list = await paginatedLoadItems({
        limit: pageSize,
        offset: paginationOffset,
      });
      const normalized = Array.isArray(list) ? list : [];
      if (normalized.length > 0) {
        setItems((prev) => [...prev, ...normalized]);
        setPaginationOffset((prev) => prev + normalized.length);
      }
      setHasMore(normalized.length >= pageSize);
    } catch (error) {
      setError(getApiErrorMessage(error, "Falha ao carregar mais dados"));
    } finally {
      setLoadingMore(false);
    }
  }, [
    isPaginated,
    paginatedLoadItems,
    hasMore,
    loadingMore,
    pageSize,
    paginationOffset,
  ]);

  useEffect(() => {
    if (isFocused) {
      load();
    }
  }, [isFocused, load]);

  // Batch resolve all reference labels for the list (1 request per reference table instead of N×M)
  useEffect(() => {
    if (!items.length) return;
    batchResolveReferences(fields, items);
  }, [items, fields, batchResolveReferences]);

  useEffect(() => {
    if (!modalOpen) return;
    const referenceFields = formFields.filter(
      (field) => field.type === "reference" && field.referenceTable,
    );
    referenceFields.forEach((field) => {
      const value = formState[field.key];
      if (!value) return;
      fetchReferenceLabel(field, String(value)).then((label) => {
        setReferenceLabels((prev) => {
          if (!label || prev[field.key] === label) return prev;
          return { ...prev, [field.key]: label };
        });
      });
    });
  }, [fetchReferenceLabel, formFields, formState, modalOpen]);

  useEffect(() => {
    if (!quickCreateModalOpen) return;
    const referenceFields = quickCreateFields.filter(
      (field) => field.type === "reference" && field.referenceTable,
    );
    referenceFields.forEach((field) => {
      const value = quickCreateState[field.key];
      if (!value) return;
      fetchReferenceLabel(field, String(value)).then((label) => {
        setQuickCreateReferenceLabels((prev) => {
          if (!label || prev[field.key] === label) return prev;
          return { ...prev, [field.key]: label };
        });
      });
    });
  }, [
    fetchReferenceLabel,
    quickCreateFields,
    quickCreateModalOpen,
    quickCreateState,
  ]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const resetForm = useCallback(() => {
    const nextState: Record<string, string> = {};
    formFields.forEach((field) => {
      if (field.type === "json" && field.jsonTemplate) {
        nextState[field.key] = JSON.stringify(field.jsonTemplate, null, 2);
      } else {
        nextState[field.key] = "";
      }
    });
    setFormState(nextState);
    setReferenceLabels({});
    setFormError(null);
    setFormErrorDiagnostic(null);
    setDiagnosticCopyStatus(null);
    setEditingId(null);
  }, [formFields]);

  const openCreate = useCallback(() => {
    setModalMode("create");
    resetForm();
    setModalOpen(true);
  }, [resetForm]);

  /** Open create modal with pre-filled data (used via controlRef) */
  const openCreateWithData = useCallback(
    (data: Record<string, string>) => {
      setModalMode("create");
      const nextState: Record<string, string> = {};
      formFields.forEach((field) => {
        if (data[field.key]) {
          nextState[field.key] = data[field.key];
        } else if (field.type === "json" && field.jsonTemplate) {
          nextState[field.key] = JSON.stringify(field.jsonTemplate, null, 2);
        } else {
          nextState[field.key] = "";
        }
      });
      setFormState(nextState);
      setReferenceLabels({});
      setFormError(null);
      setFormErrorDiagnostic(null);
      setDiagnosticCopyStatus(null);
      setEditingId(null);
      setModalOpen(true);
    },
    [formFields],
  );

  // Expose imperative handle via controlRef
  useEffect(() => {
    if (controlRef) {
      controlRef.current = { openCreateWithData, reload: load };
    }
  }, [controlRef, openCreateWithData, load]);

  const openEdit = useCallback(
    (item: T) => {
      const nextState: Record<string, string> = {};
      const nextLabels: Record<string, string> = {};
      normalizedFormFields.forEach((field) => {
        const value = item[field.key];
        if (field.type === "json") {
          if (value) {
            nextState[field.key] = JSON.stringify(value, null, 2);
          } else if (field.jsonTemplate) {
            nextState[field.key] = JSON.stringify(field.jsonTemplate, null, 2);
          } else {
            nextState[field.key] = "";
          }
        } else if (field.type === "reference") {
          nextState[field.key] = value ? String(value) : "";
          const label = value ? getCachedReferenceLabel(field, value) : "";
          nextLabels[field.key] = label;
        } else {
          nextState[field.key] =
            value === null || value === undefined ? "" : String(value);
        }
      });
      setFormState(nextState);
      setReferenceLabels(nextLabels);
      setFormError(null);
      setFormErrorDiagnostic(null);
      setDiagnosticCopyStatus(null);
      setModalMode("edit");
      setEditingId(getId(item));
      setModalOpen(true);
    },
    [normalizedFormFields, getCachedReferenceLabel, getId],
  );
  const loadReferenceOptions = useCallback(
    async (
      field: CrudFieldConfig<any>,
      searchValue: string,
      context: "form" | "quick" = "form",
    ) => {
      if (!field.referenceTable) {
        setReferenceError("Configuração de referência inválida.");
        setReferenceOptions([]);
        return;
      }

      setReferenceLoading(true);
      setReferenceError(null);

      try {
        const searchField = field.referenceSearchField;
        const requestPayload: Record<string, unknown> = {
          action: "list",
          table: field.referenceTable,
        };

        let nextFilterIndex = 1;
        if (searchValue && searchField) {
          requestPayload[`search_field${nextFilterIndex}`] = searchField;
          requestPayload[`search_value${nextFilterIndex}`] = searchValue;
          requestPayload[`search_operator${nextFilterIndex}`] = "equal";
          nextFilterIndex += 1;
        }

        const applyTenantIsolation =
          await shouldApplyTenantIsolationToReference(field.referenceTable);
        if (applyTenantIsolation) {
          requestPayload[`search_field${nextFilterIndex}`] = "tenant_id";
          requestPayload[`search_value${nextFilterIndex}`] = String(
            user?.tenant_id ?? "",
          );
          requestPayload[`search_operator${nextFilterIndex}`] = "equal";
          requestPayload.combine_type = "AND";
        }

        const response = await api.post(REFERENCE_ENDPOINT, requestPayload);
        const data = response.data;
        const list = Array.isArray(data) ? data : (data?.data ?? []);
        const idField = field.referenceIdField ?? "id";
        const state = context === "quick" ? quickCreateState : formState;
        const filteredList = Array.isArray(list)
          ? list.filter((item) => {
              if (!field.referenceFilter) return true;
              try {
                return field.referenceFilter(
                  item as Record<string, unknown>,
                  state,
                );
              } catch {
                return true;
              }
            })
          : [];
        const options = Array.isArray(list)
          ? filteredList
              .map((item) => ({
                id: String(item?.[idField] ?? item?.id ?? ""),
                label: (() => {
                  const defaultLabel = deriveReferenceLabel(
                    item,
                    field.referenceLabelField,
                  );
                  if (!field.referenceLabelFormatter) return defaultLabel;
                  try {
                    return field.referenceLabelFormatter(
                      item as Record<string, unknown>,
                      defaultLabel,
                      state,
                    );
                  } catch {
                    return defaultLabel;
                  }
                })(),
                raw: item,
              }))
              .filter((opt) => opt.id)
          : [];
        setReferenceOptions(options);
      } catch (error) {
        setReferenceError(
          getApiErrorMessage(error, "Falha ao carregar dados."),
        );
        setReferenceOptions([]);
      } finally {
        setReferenceLoading(false);
      }
    },
    [
      formState,
      quickCreateState,
      shouldApplyTenantIsolationToReference,
      user?.tenant_id,
    ],
  );

  const openReferenceModal = useCallback(
    (field: CrudFieldConfig<any>, context: "form" | "quick") => {
      setReferenceModalContext(context);
      setActiveQuickFieldKey(context === "quick" ? field.key : null);
      setReferenceModalField(field);
      setReferenceSearch("");
      setReferenceOptions([]);
      setReferenceError(null);
      setModalDepth((prev) => prev + 1); // Incrementar profundidade
      loadReferenceOptions(field, "", context);
    },
    [loadReferenceOptions],
  );

  const openQuickCreate = useCallback(
    async (field: CrudFieldConfig<any>) => {
      if (!field.referenceTable) {
        setReferenceError("Configuração de referência inválida.");
        return;
      }

      const nextReturnTarget: QuickCreateReturnTarget | null =
        referenceModalContext === "form"
          ? { scope: "form", fieldKey: field.key }
          : activeQuickFieldKey
            ? { scope: "quick", fieldKey: activeQuickFieldKey }
            : null;

      if (!nextReturnTarget) {
        setReferenceError("Contexto de criação inválido.");
        return;
      }

      if (quickCreateModalOpen && quickCreateField && quickCreateReturnTarget) {
        setQuickCreateStack((prev) => [
          ...prev,
          {
            field: quickCreateField,
            fields: quickCreateFields,
            loading: quickCreateFieldsLoading,
            state: quickCreateState,
            referenceLabels: quickCreateReferenceLabels,
            returnTarget: quickCreateReturnTarget,
          },
        ]);
      }

      setReferenceModalField(null);
      setModalDepth((prev) => Math.max(0, prev - 1));

      setQuickCreateModalOpen(true);
      setQuickCreateField(field);
      setQuickCreateReturnTarget(nextReturnTarget);
      setQuickCreateFields([]);
      setQuickCreateFieldsLoading(true);
      setQuickCreateState({});
      setQuickCreateReferenceLabels({});
      setQuickCreateError(null);

      try {
        const info = await getTableInfo(field.referenceTable);
        // Filter out system/auto-fill fields that the user should not fill manually
        const QUICK_CREATE_AUTO_KEYS = new Set(["tenant_id", "created_by"]);
        const nextFields = convertTableInfoToFields(info).filter(
          (f) => !QUICK_CREATE_AUTO_KEYS.has(f.key),
        );
        setQuickCreateFields(nextFields);
        const nextState: Record<string, string> = {};
        nextFields.forEach((f) => {
          nextState[f.key] = "";
        });
        setQuickCreateState(nextState);
      } catch {
        setQuickCreateError("Não foi possível carregar campos.");
        setQuickCreateFields([]);
      } finally {
        setQuickCreateFieldsLoading(false);
      }
    },
    [
      activeQuickFieldKey,
      quickCreateField,
      quickCreateFields,
      quickCreateFieldsLoading,
      quickCreateModalOpen,
      quickCreateReferenceLabels,
      quickCreateReturnTarget,
      quickCreateState,
      referenceModalContext,
    ],
  );

  const closeQuickCreate = useCallback(() => {
    if (quickCreateStack.length > 0) {
      const snapshot = quickCreateStack[quickCreateStack.length - 1];
      setQuickCreateStack((prev) => prev.slice(0, -1));
      setQuickCreateField(snapshot.field);
      setQuickCreateFields(snapshot.fields);
      setQuickCreateFieldsLoading(snapshot.loading);
      setQuickCreateState(snapshot.state);
      setQuickCreateReferenceLabels(snapshot.referenceLabels);
      setQuickCreateReturnTarget(snapshot.returnTarget);
      setQuickCreateError(null);
      return;
    }

    setQuickCreateModalOpen(false);
    setQuickCreateField(null);
    setQuickCreateFields([]);
    setQuickCreateFieldsLoading(false);
    setQuickCreateState({});
    setQuickCreateReferenceLabels({});
    setQuickCreateError(null);
    setQuickCreateReturnTarget(null);
  }, [quickCreateStack]);

  const handleQuickCreateSave = useCallback(async () => {
    if (!quickCreateField?.referenceTable || !quickCreateReturnTarget) {
      setQuickCreateError("Registro inválido.");
      return;
    }

    const quickPayloadFields = quickCreateFields.map((field) =>
      normalizeBooleanField(field),
    );

    const payload: Record<string, unknown> = {};
    for (const field of quickPayloadFields) {
      if (field.readOnly) continue;
      const rawValue = quickCreateState[field.key] ?? "";
      const trimmedValue = rawValue.trim();
      if (field.required && !trimmedValue) {
        setQuickCreateError(`Informe ${field.label.toLowerCase()}.`);
        return;
      }
      if (field.type === "json") {
        if (!trimmedValue) {
          payload[field.key] = null;
          continue;
        }
        try {
          payload[field.key] = JSON.parse(rawValue);
        } catch {
          setQuickCreateError(`Configuração inválida em ${field.label}.`);
          return;
        }
      } else if (field.type === "boolean") {
        payload[field.key] = trimmedValue ? isTruthyString(trimmedValue) : null;
      } else if (field.type === "currency") {
        if (!trimmedValue) {
          payload[field.key] = 0;
        } else {
          const numericStr = parseCurrencyInput(trimmedValue);
          const num = parseFloat(numericStr);
          payload[field.key] = isNaN(num) ? 0 : num;
        }
      } else if (field.type === "number") {
        if (!trimmedValue) {
          payload[field.key] = 0;
        } else {
          const num = parseFloat(trimmedValue.replace(",", "."));
          payload[field.key] = isNaN(num) ? 0 : num;
        }
      } else if (field.type === "date") {
        if (!trimmedValue) {
          payload[field.key] = null;
        } else {
          const parsed = parseDate(trimmedValue);
          payload[field.key] = parsed ? dateToISODate(parsed) : trimmedValue;
        }
      } else if (field.type === "datetime") {
        if (!trimmedValue) {
          payload[field.key] = null;
        } else {
          const parsed = parseDate(trimmedValue);
          payload[field.key] = parsed ? dateToISOString(parsed) : trimmedValue;
        }
      } else {
        payload[field.key] = trimmedValue ? trimmedValue : null;
      }
    }

    // Auto-fill system fields that were hidden from the form
    // The api.ts schema interceptor strips columns that don't exist on the table
    if (!payload.tenant_id) payload.tenant_id = user?.tenant_id ?? null;
    if (!payload.created_at) payload.created_at = toIsoNow();
    if (!payload.updated_at) payload.updated_at = toIsoNow();
    if (!payload.created_by) payload.created_by = user?.id ?? null;

    try {
      setQuickCreateSaving(true);
      setQuickCreateError(null);
      const response = await api.post(REFERENCE_ENDPOINT, {
        action: "create",
        table: quickCreateField.referenceTable,
        payload,
      });
      const data = response.data;
      const base = Array.isArray(data) ? data[0] : (data?.data?.[0] ?? data);
      const createdId = String(base?.id ?? "");
      const createdLabel = quickCreateField.referenceLabelField
        ? String(base?.[quickCreateField.referenceLabelField] ?? "")
        : formatItemSummary(base as Record<string, unknown>);
      const finalLabel = createdLabel || createdId || "(novo)";

      if (createdId) {
        const cacheKey = buildCacheKey(
          quickCreateField.referenceTable,
          createdId,
        );
        setReferenceCache((prev) => ({ ...prev, [cacheKey]: finalLabel }));
      }

      if (quickCreateStack.length > 0) {
        const snapshot = quickCreateStack[quickCreateStack.length - 1];
        setQuickCreateStack((prev) => prev.slice(0, -1));
        setQuickCreateField(snapshot.field);
        setQuickCreateFields(snapshot.fields);
        setQuickCreateFieldsLoading(snapshot.loading);
        setQuickCreateReturnTarget(snapshot.returnTarget);
        setQuickCreateState((prev) => {
          const next = { ...snapshot.state };
          next[quickCreateReturnTarget.fieldKey] = createdId;
          return next;
        });
        setQuickCreateReferenceLabels((prev) => {
          const next = { ...snapshot.referenceLabels };
          next[quickCreateReturnTarget.fieldKey] = finalLabel;
          return next;
        });
        setQuickCreateError(null);
      } else {
        if (quickCreateReturnTarget.scope === "form") {
          setFormState((prev) => ({
            ...prev,
            [quickCreateReturnTarget.fieldKey]: createdId,
          }));
          setReferenceLabels((prev) => ({
            ...prev,
            [quickCreateReturnTarget.fieldKey]: finalLabel,
          }));
        }
        closeQuickCreate();
      }
    } catch (error) {
      setQuickCreateError(
        getApiErrorMessage(error, "Não foi possível salvar."),
      );
    } finally {
      setQuickCreateSaving(false);
    }
  }, [
    closeQuickCreate,
    quickCreateField,
    quickCreateFields,
    quickCreateReturnTarget,
    quickCreateStack,
    quickCreateState,
    user?.id,
    user?.tenant_id,
  ]);

  const handleSave = useCallback(async () => {
    const payloadFields =
      modalMode === "create" ? normalizedFields : normalizedFormFields;
    const payload: Record<string, unknown> = {};
    for (const field of payloadFields) {
      if (field.readOnly) {
        continue;
      }
      // Skip fields hidden by showWhen
      if (field.showWhen && !field.showWhen(formState)) {
        continue;
      }
      const rawValue = formState[field.key] ?? "";
      const trimmedValue = rawValue.trim();
      if (formFieldKeys.has(field.key) && field.required && !trimmedValue) {
        setFormError(`Informe ${field.label.toLowerCase()}.`);
        setFormErrorDiagnostic(null);
        setDiagnosticCopyStatus(null);
        return;
      }
      // Custom field validation
      if (field.validate && trimmedValue) {
        const validationError = field.validate(trimmedValue, formState);
        if (validationError) {
          setFormError(validationError);
          setFormErrorDiagnostic(null);
          setDiagnosticCopyStatus(null);
          return;
        }
      }
      if (field.type === "json") {
        if (!trimmedValue) {
          payload[field.key] = null;
          continue;
        }
        try {
          payload[field.key] = JSON.parse(rawValue);
        } catch {
          setFormError(`Configuração inválida em ${field.label}.`);
          setFormErrorDiagnostic(null);
          setDiagnosticCopyStatus(null);
          return;
        }
      } else if (field.type === "boolean") {
        payload[field.key] = trimmedValue ? isTruthyString(trimmedValue) : null;
      } else if (field.type === "currency") {
        // Parse BRL currency string to numeric value
        if (!trimmedValue) {
          payload[field.key] = 0;
        } else {
          const numericStr = parseCurrencyInput(trimmedValue);
          const num = parseFloat(numericStr);
          payload[field.key] = isNaN(num) ? 0 : num;
        }
      } else if (field.type === "number") {
        if (!trimmedValue) {
          payload[field.key] = 0;
        } else {
          const num = parseFloat(trimmedValue.replace(",", "."));
          payload[field.key] = isNaN(num) ? 0 : num;
        }
      } else if (field.type === "date") {
        // Store as ISO date string (YYYY-MM-DD) or null
        if (!trimmedValue) {
          payload[field.key] = null;
        } else {
          const parsed = parseDate(trimmedValue);
          payload[field.key] = parsed ? dateToISODate(parsed) : trimmedValue;
        }
      } else if (field.type === "datetime") {
        // Store as full ISO string or null
        if (!trimmedValue) {
          payload[field.key] = null;
        } else {
          const parsed = parseDate(trimmedValue);
          payload[field.key] = parsed ? dateToISOString(parsed) : trimmedValue;
        }
      } else {
        payload[field.key] = trimmedValue ? trimmedValue : null;
      }
    }

    if (modalMode === "edit" && !editingId) {
      setFormError("Registro inválido para edição.");
      setFormErrorDiagnostic(null);
      setDiagnosticCopyStatus(null);
      return;
    }

    if (modalMode === "create") {
      delete payload.id;
    }

    try {
      setSaving(true);
      setFormError(null);
      setFormErrorDiagnostic(null);
      setDiagnosticCopyStatus(null);
      const tableFieldKeys = new Set(
        normalizedFields.map((field) => field.key),
      );

      if (modalMode === "create") {
        const createPayload = { ...payload } as Record<string, unknown>;
        if (tableFieldKeys.has("created_at")) {
          createPayload.created_at = toIsoNow();
        }
        if (tableFieldKeys.has("updated_at")) {
          createPayload.updated_at = toIsoNow();
        }
        if (tableFieldKeys.has("created_by")) {
          createPayload.created_by = user?.id ?? null;
        }

        const result = await createItem(createPayload as Partial<T>);
        const logicalError = getLogicalCrudError(result);
        if (logicalError) throw new Error(logicalError);
      } else {
        const updatePayload = {
          ...payload,
          id: editingId,
        } as Record<string, unknown>;
        if (tableFieldKeys.has("updated_at")) {
          updatePayload.updated_at = toIsoNow();
        }

        const result = await updateItem(
          updatePayload as Partial<T> & { id?: string | null },
        );
        const logicalError = getLogicalCrudError(result);
        if (logicalError) throw new Error(logicalError);
      }
      setModalOpen(false);
      resetForm();
      load();
    } catch (error) {
      setFormError(`Não foi possível salvar. ${getApiErrorMessage(error)}`);
      setFormErrorDiagnostic(
        buildDiagnosticReport(
          modalMode === "create" ? "create" : "update",
          error,
          payload,
          "Não foi possível salvar.",
        ),
      );
      setDiagnosticCopyStatus(null);
    } finally {
      setSaving(false);
    }
  }, [
    buildDiagnosticReport,
    normalizedFields,
    normalizedFormFields,
    formState,
    formFieldKeys,
    modalMode,
    createItem,
    updateItem,
    editingId,
    load,
    resetForm,
    user?.id,
  ]);

  const handleSoftDelete = useCallback(
    (id: string) => {
      if (!deleteItem && !updateItem) return;

      const supportsDeletedAt = normalizedFields.some(
        (field) => field.key === "deleted_at",
      );
      const supportsUpdatedAt = normalizedFields.some(
        (field) => field.key === "updated_at",
      );

      const executeDelete = async () => {
        try {
          setSaving(true);

          if (supportsDeletedAt) {
            const softDeletePayload: Record<string, unknown> = {
              id,
              deleted_at: toIsoNow(),
            };
            if (supportsUpdatedAt) {
              softDeletePayload.updated_at = toIsoNow();
            }
            await updateItem(
              softDeletePayload as Partial<T> & { id?: string | null },
            );
          } else if (deleteItem) {
            await deleteItem({ id } as Partial<T> & { id?: string | null });
          } else {
            throw new Error("Soft delete não suportado para esta tabela");
          }

          setModalOpen(false);
          resetForm();
          load();
        } catch (error) {
          if (supportsDeletedAt && deleteItem) {
            try {
              await deleteItem({ id } as Partial<T> & {
                id?: string | null;
              });
              setModalOpen(false);
              resetForm();
              load();
            } catch (deleteError) {
              setFormError(
                getApiErrorMessage(deleteError, "Não foi possível excluir."),
              );
              setFormErrorDiagnostic(
                buildDiagnosticReport(
                  "delete_fallback",
                  deleteError,
                  { id },
                  "Não foi possível excluir.",
                ),
              );
              setDiagnosticCopyStatus(null);
            }
          } else {
            setFormError(
              getApiErrorMessage(error, "Não foi possível excluir."),
            );
            setFormErrorDiagnostic(
              buildDiagnosticReport(
                "delete",
                error,
                { id },
                "Não foi possível excluir.",
              ),
            );
            setDiagnosticCopyStatus(null);
          }
        } finally {
          setSaving(false);
        }
      };

      // Use window.confirm on web, Alert.alert on native
      if (Platform.OS === "web") {
        if (window.confirm("Deseja excluir este registro?")) {
          executeDelete();
        }
      } else {
        Alert.alert("Confirmar exclusão", "Deseja excluir este registro?", [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Excluir",
            style: "destructive",
            onPress: executeDelete,
          },
        ]);
      }
    },
    [
      buildDiagnosticReport,
      deleteItem,
      load,
      normalizedFields,
      resetForm,
      updateItem,
    ],
  );

  useEffect(() => {
    if (!referenceModalField) return;
    loadReferenceOptions(
      referenceModalField,
      referenceSearch.trim(),
      referenceModalContext,
    );
  }, [
    referenceModalContext,
    referenceModalField,
    referenceSearch,
    loadReferenceOptions,
  ]);

  const openReferenceDetail = useCallback(
    async (field: CrudFieldConfig<any>, referenceId: string) => {
      if (!field.referenceTable) {
        setReferenceDetailError("Configuração de referência inválida.");
        return;
      }

      setReferenceDetailLoading(true);
      setReferenceDetailError(null);
      setReferenceDetailModalOpen(true);
      setModalDepth((prev) => prev + 1);

      try {
        const idField = field.referenceIdField ?? "id";
        const response = await api.post(REFERENCE_ENDPOINT, {
          action: "list",
          table: field.referenceTable,
          search_field1: idField,
          search_value1: referenceId,
          search_operator1: "equal",
        });
        const data = response.data;
        const list = Array.isArray(data) ? data : (data?.data ?? []);
        const exactMatch = Array.isArray(list)
          ? list.find((row) => String(row?.[idField] ?? "") === referenceId)
          : null;
        const item = exactMatch || (Array.isArray(list) ? list[0] : null);
        if (item) {
          setReferenceDetailData(item);
        } else {
          setReferenceDetailError("Registro não encontrado.");
        }
      } catch (error) {
        setReferenceDetailError(
          getApiErrorMessage(error, "Falha ao carregar dados."),
        );
      } finally {
        setReferenceDetailLoading(false);
      }
    },
    [],
  );

  const closeReferenceDetail = useCallback(() => {
    setReferenceDetailModalOpen(false);
    setReferenceDetailData(null);
    setReferenceDetailLoading(false);
    setReferenceDetailError(null);
    setModalDepth((prev) => Math.max(0, prev - 1));
  }, []);

  const detailValueIsReference = useCallback(
    (detailLabel: string): CrudFieldConfig<any> | null => {
      return (
        fields.find((f) => {
          const normalized = normalizeCrudField(f);
          return (
            normalized.type === "reference" &&
            getFriendlyLabelByField(normalized) === detailLabel
          );
        }) ?? null
      );
    },
    [fields],
  );

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => getTitle(a).localeCompare(getTitle(b)));
  }, [items, getTitle]);

  const filterOptions = useMemo(() => {
    const configuredKeys =
      searchFields && searchFields.length
        ? searchFields
        : normalizedFields
            .filter(
              (field) => field.visibleInList !== false && field.key !== "id",
            )
            .map((field) => field.key);

    const uniqueKeys = Array.from(new Set(configuredKeys));
    return [
      { key: "__all", label: "Todos" },
      ...uniqueKeys.map((key) => ({
        key,
        label: getFriendlyLabelByKey(key, fields),
      })),
    ];
  }, [fields, normalizedFields, searchFields]);

  useEffect(() => {
    const hasActiveKey = filterOptions.some(
      (option) => option.key === activeFilterKey,
    );
    if (!hasActiveKey) {
      setActiveFilterKey("__all");
    }
  }, [activeFilterKey, filterOptions]);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return sortedItems;

    const normalizedFieldMap = new Map(
      normalizedFields.map((field) => [field.key, field]),
    );

    const configuredKeys = filterOptions
      .filter((option) => option.key !== "__all")
      .map((option) => option.key);

    const matchesQuery = (item: T, key: string) => {
      const value = item[key as keyof T];
      if (value === null || value === undefined) return false;

      const field = normalizedFieldMap.get(key);
      const candidates: string[] = [];

      if (field?.type === "reference") {
        const cachedLabel = getCachedReferenceLabel(field, value);
        if (cachedLabel) candidates.push(cachedLabel);
      }

      if (field?.type === "boolean") {
        candidates.push(formatBooleanValueByField(field, value));
      } else if (
        field?.type === "date" ||
        field?.type === "datetime" ||
        field?.type === "currency" ||
        field?.type === "number" ||
        field?.type === "masked"
      ) {
        // Add both formatted and raw values for search
        candidates.push(formatValueByType(value, field.type, field.maskType));
        candidates.push(formatValue(value));
      } else {
        candidates.push(formatValue(value));
      }

      if (typeof value === "object") {
        try {
          candidates.push(JSON.stringify(value));
        } catch {
          candidates.push(String(value));
        }
      }

      return candidates.some((candidate) =>
        String(candidate ?? "")
          .toLowerCase()
          .includes(query),
      );
    };

    return sortedItems.filter((item) => {
      const keysToSearch =
        activeFilterKey === "__all"
          ? configuredKeys.length
            ? configuredKeys
            : Object.keys(item)
          : [activeFilterKey];

      return keysToSearch.some((key) => matchesQuery(item, key));
    });
  }, [
    activeFilterKey,
    filterOptions,
    getCachedReferenceLabel,
    normalizedFields,
    searchQuery,
    sortedItems,
  ]);

  const detailsFromFields = useCallback(
    (item: T): DetailItem[] => {
      const configured = fields.filter(
        (field) => field.visibleInList !== false && field.key !== "id",
      );
      const configuredKeys = new Set(configured.map((field) => field.key));
      const extraKeys = Object.keys(item).filter(
        (key) => key !== "id" && !configuredKeys.has(key),
      );

      const orderedFields: CrudFieldConfig<any>[] = [
        ...configured.map((field) => normalizeCrudField(field)),
        ...extraKeys.map(
          (key) =>
            ({
              key,
              label: getFriendlyLabelByKey(key, fields),
              type: "text" as CrudFieldType,
              visibleInList: true,
            }) satisfies CrudFieldConfig<any>,
        ),
      ];

      return orderedFields.map((field) => ({
        label: getFriendlyLabelByField(field),
        value:
          field.type === "reference"
            ? getCachedReferenceLabel(field, item[field.key]) || "-"
            : field.type === "boolean"
              ? formatBooleanValueByField(field, item[field.key])
              : formatValueByType(item[field.key], field.type, field.maskType),
      }));
    },
    [fields, getCachedReferenceLabel],
  );

  const generateAiInsights = useCallback(async () => {
    try {
      setAiLoading(true);
      setAiError(null);

      const sampleItems = filteredItems.slice(0, 20).map((item) => {
        const id = getId(item);
        const details = (
          getDetails ? getDetails(item) : detailsFromFields(item)
        )
          .slice(0, 8)
          .map((detail) => ({
            label: detail.label,
            value: detail.value,
          }));

        return {
          id,
          title: getTitle(item),
          details,
        };
      });

      const activeFilterLabel =
        filterOptions.find((option) => option.key === activeFilterKey)?.label ??
        "Todos";

      const contextPayload = {
        screen: {
          title,
          subtitle: subtitle ?? null,
          generated_at: new Date().toISOString(),
        },
        actor: {
          user_id: user?.id ?? null,
          role: user?.role ?? null,
          tenant_id: user?.tenant_id ?? null,
        },
        filters: {
          search_query: searchQuery || null,
          active_filter_key: activeFilterKey,
          active_filter_label: activeFilterLabel,
        },
        dataset: {
          total_items: items.length,
          filtered_items: filteredItems.length,
          sample_size: sampleItems.length,
          sample_items: sampleItems,
        },
      };

      const message = buildAiInsightMessage(
        contextPayload,
        "Contexto de listagem CRUD com foco no que exige atenção imediata.",
      );

      const response = await api.post(AI_AGENT_ENDPOINT, {
        source: "crud_screen_insights",
        prompt: UNIVERSAL_AI_INSIGHT_PROMPT,
        message,
        context: contextPayload,
        user_id: user?.id ?? null,
        tenant_id: user?.tenant_id ?? null,
      });

      const insightText = extractAiInsightText(response.data);
      if (!insightText) {
        throw new Error("A IA não retornou conteúdo para exibir");
      }

      setAiInsights(insightText);
    } catch (error) {
      setAiError(getApiErrorMessage(error, "Falha ao consultar a IA"));
      setAiInsights(null);
    } finally {
      setAiLoading(false);
    }
  }, [
    activeFilterKey,
    detailsFromFields,
    filterOptions,
    filteredItems,
    getDetails,
    getId,
    getTitle,
    items.length,
    searchQuery,
    subtitle,
    title,
    user?.id,
    user?.role,
    user?.tenant_id,
  ]);

  if (loading) {
    return (
      <ThemedView
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <ActivityIndicator size="large" />
        <ThemedText style={{ marginTop: 12 }}>Carregando...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          padding: responsiveSpacing.screenPadding,
          paddingBottom: responsiveSpacing.screenPadding + 80,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* ── Compact inline header ── */}
        <View style={{ marginBottom: 8 }}>
          <ThemedText
            style={{ fontSize: 18, fontWeight: "700", color: textColor }}
          >
            {title}
          </ThemedText>
          {subtitle ? (
            <ThemedText
              style={{ fontSize: 12, color: mutedTextColor, marginTop: 2 }}
            >
              {subtitle}
            </ThemedText>
          ) : null}
          {headerActions ? (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
              {headerActions}
            </View>
          ) : null}
        </View>

        {error ? (
          <ThemedText style={{ color: tintColor, marginBottom: 8 }}>
            {error}
          </ThemedText>
        ) : null}

        {/* ── Search input (no card, no filter chips) ── */}
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={searchPlaceholder || "Pesquisar"}
          placeholderTextColor={mutedTextColor}
          style={{
            borderWidth: 1,
            borderColor,
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 10,
            backgroundColor: inputBackground,
            color: textColor,
            fontSize: 14,
            marginBottom: responsiveSpacing.cardGap,
          }}
        />

        {/* ── AI Insights ── */}
        {(aiInsights || aiError) && (
          <ThemedView
            style={[
              styles.processCard,
              {
                marginTop: responsiveSpacing.cardGap,
                borderColor,
                backgroundColor: cardColor,
              },
            ]}
          >
            <ThemedText
              style={{ color: textColor, fontSize: 13, fontWeight: "700" }}
            >
              Insights da IA
            </ThemedText>
            {aiError ? (
              <ThemedText
                style={{
                  color: tintColor,
                  marginTop: responsiveSpacing.sectionGap,
                }}
              >
                {aiError}
              </ThemedText>
            ) : null}
            {aiInsights ? (
              <ThemedText
                style={{
                  color: textColor,
                  marginTop: responsiveSpacing.sectionGap,
                  fontSize: 12,
                }}
              >
                {aiInsights}
              </ThemedText>
            ) : null}
          </ThemedView>
        )}

        {filteredItems.length === 0 && !error ? (
          <ThemedText style={{ color: mutedTextColor, marginTop: 12 }}>
            Nenhum registro encontrado.
          </ThemedText>
        ) : null}

        {filteredItems.map((item) => {
          const details = getDetails
            ? getDetails(item)
            : detailsFromFields(item);
          const dynamicReferenceShortcuts = normalizedFields.filter((field) => {
            if (field.type !== "reference") return false;
            if (field.visibleInList === false) return false;
            const value = item[field.key];
            return (
              value !== null && value !== undefined && String(value).trim()
            );
          });
          const hasCustomActions = Boolean(renderItemActions);
          const hasAnyShortcuts =
            dynamicReferenceShortcuts.length > 0 || hasCustomActions;

          return (
            <ThemedView
              key={getId(item)}
              style={[
                styles.processCard,
                {
                  marginTop: 12,
                  borderColor: borderColor,
                  backgroundColor: cardColor,
                },
              ]}
            >
              <ThemedText
                style={{ fontSize: 16, fontWeight: "600", color: textColor }}
              >
                {getTitle(item)}
              </ThemedText>
              <TouchableOpacity
                onPress={() => openEdit(item)}
                style={{ marginTop: 8 }}
              >
                <ThemedText style={{ color: tintColor, fontWeight: "600" }}>
                  Editar
                </ThemedText>
              </TouchableOpacity>
              <View style={{ marginTop: 6, gap: 4 }}>
                {details.map((detail) => {
                  const refField = detailValueIsReference(detail.label);
                  const isRefValue =
                    refField && detail.value && detail.value !== "-";
                  return (
                    <View key={`${getId(item)}-${detail.label}`}>
                      {isRefValue ? (
                        <TouchableOpacity
                          onPress={() => {
                            if (
                              refField &&
                              detail.value &&
                              detail.value !== "-"
                            ) {
                              const fieldValue = item[refField.key];
                              if (fieldValue) {
                                openReferenceDetail(
                                  refField,
                                  String(fieldValue),
                                );
                              }
                            }
                          }}
                          style={{ paddingVertical: 2 }}
                        >
                          <ThemedText
                            style={{
                              fontSize: 12,
                              color: tintColor,
                              textDecorationLine: "underline",
                            }}
                          >
                            {detail.label}: {detail.value || "-"}
                          </ThemedText>
                        </TouchableOpacity>
                      ) : (
                        <ThemedText
                          style={{ fontSize: 12, color: mutedTextColor }}
                        >
                          {detail.label}: {detail.value || "-"}
                        </ThemedText>
                      )}
                    </View>
                  );
                })}
              </View>

              {hasAnyShortcuts ? (
                <View style={{ marginTop: 10 }}>
                  <ThemedText
                    style={{
                      fontSize: 12,
                      color: mutedTextColor,
                      fontWeight: "600",
                    }}
                  >
                    Atalhos
                  </ThemedText>

                  {dynamicReferenceShortcuts.length > 0 ? (
                    <View
                      style={{
                        marginTop: 8,
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: 8,
                      }}
                    >
                      {dynamicReferenceShortcuts.map((field) => {
                        const value = item[field.key];
                        const referenceId = String(value ?? "");
                        const label =
                          getCachedReferenceLabel(field, value) ||
                          String(field.label || field.key);

                        return (
                          <TouchableOpacity
                            key={`${getId(item)}-shortcut-${field.key}`}
                            onPress={() =>
                              openReferenceDetail(field, referenceId)
                            }
                            style={{
                              borderWidth: 1,
                              borderColor,
                              borderRadius: 999,
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                            }}
                          >
                            <ThemedText
                              style={{
                                color: tintColor,
                                fontWeight: "700",
                                fontSize: 12,
                              }}
                            >
                              {field.label}: {label}
                            </ThemedText>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : null}

                  {renderItemActions ? (
                    <View
                      style={{
                        marginTop: dynamicReferenceShortcuts.length ? 8 : 6,
                      }}
                    >
                      {renderItemActions(item)}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </ThemedView>
          );
        })}

        {/* Pagination: "Carregar mais" button */}
        {isPaginated && hasMore && filteredItems.length > 0 && !searchQuery ? (
          <TouchableOpacity
            onPress={loadMore}
            disabled={loadingMore}
            style={{
              marginTop: 12,
              marginBottom: 8,
              paddingVertical: 14,
              paddingHorizontal: 20,
              backgroundColor: loadingMore ? mutedTextColor : tintColor,
              borderRadius: 10,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 8,
              opacity: loadingMore ? 0.7 : 1,
            }}
          >
            {loadingMore ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : null}
            <ThemedText
              style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}
            >
              {loadingMore ? "Carregando..." : "Carregar mais"}
            </ThemedText>
          </TouchableOpacity>
        ) : null}

        {isPaginated && !hasMore && items.length > 0 && !searchQuery ? (
          <ThemedText
            style={{
              color: mutedTextColor,
              textAlign: "center",
              marginTop: 12,
              fontSize: 13,
            }}
          >
            Todos os {items.length} registros carregados.
          </ThemedText>
        ) : null}

        <Modal
          transparent
          visible={modalOpen}
          animationType="slide"
          onRequestClose={() => setModalOpen(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: modalBackdrop,
                justifyContent: "center",
                padding: 16,
              }}
            >
              <View
                style={{
                  backgroundColor: cardColor,
                  borderRadius: 12,
                  padding: 16,
                  maxHeight: "90%",
                }}
              >
                <ThemedText style={[styles.processTitle, { color: textColor }]}>
                  {modalMode === "create" ? "Novo" : "Editar"}
                </ThemedText>

                <ScrollView
                  style={{ marginTop: 12 }}
                  contentContainerStyle={{ paddingBottom: 8 }}
                >
                  {normalizedFormFields.map((field, fieldIndex) => {
                    // Conditional visibility
                    if (field.showWhen && !field.showWhen(formState)) {
                      return null;
                    }

                    // Section header: render when section changes from previous visible field
                    let sectionHeader: ReactNode = null;
                    if (field.section) {
                      // Find previous visible field
                      let prevSection: string | undefined;
                      for (let i = fieldIndex - 1; i >= 0; i--) {
                        const prev = normalizedFormFields[i];
                        if (prev.showWhen && !prev.showWhen(formState))
                          continue;
                        prevSection = prev.section;
                        break;
                      }
                      if (field.section !== prevSection) {
                        sectionHeader = (
                          <View
                            key={`section-${field.key}`}
                            style={{
                              marginTop: fieldIndex === 0 ? 0 : 16,
                              marginBottom: 8,
                              borderBottomWidth: 1,
                              borderBottomColor: borderColor,
                              paddingBottom: 6,
                            }}
                          >
                            <ThemedText
                              style={{
                                fontSize: 14,
                                fontWeight: "700",
                                color: textColor,
                              }}
                            >
                              {field.section}
                            </ThemedText>
                          </View>
                        );
                      }
                    }

                    const customNode = renderCustomField
                      ? renderCustomField(
                          field as CrudFieldConfig<T>,
                          formState[field.key] ?? "",
                          (text: string) =>
                            setFormState((prev) => ({
                              ...prev,
                              [field.key]: text,
                            })),
                          formState,
                          setFormState,
                        )
                      : null;

                    const fieldInputStyle = {
                      borderWidth: 1,
                      borderColor,
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      backgroundColor: inputBackground,
                      color: textColor,
                      marginTop: 6,
                    } as const;

                    const renderFieldInput = () => {
                      if (customNode != null) {
                        return (
                          <View style={{ marginTop: 6 }}>{customNode}</View>
                        );
                      }

                      if (field.type === "reference") {
                        return (
                          <TouchableOpacity
                            onPress={() => openReferenceModal(field, "form")}
                            style={{ ...fieldInputStyle, paddingVertical: 12 }}
                          >
                            <ThemedText style={{ color: textColor }}>
                              {referenceLabels[field.key] ||
                                (formState[field.key]
                                  ? getCachedReferenceLabel(
                                      field,
                                      formState[field.key],
                                    )
                                  : "") ||
                                (formState[field.key] ? "Selecionado" : "") ||
                                field.placeholder ||
                                "Selecionar"}
                            </ThemedText>
                          </TouchableOpacity>
                        );
                      }

                      if (field.type === "boolean") {
                        const labels = getBooleanOptionLabels(field);
                        return (
                          <View
                            style={{
                              flexDirection: "row",
                              gap: 8,
                              marginTop: 6,
                            }}
                          >
                            <TouchableOpacity
                              onPress={() =>
                                !field.readOnly &&
                                setFormState((prev) => ({
                                  ...prev,
                                  [field.key]: "true",
                                }))
                              }
                              style={{
                                ...fieldInputStyle,
                                backgroundColor:
                                  formState[field.key] === "true"
                                    ? tintColor + "1A"
                                    : inputBackground,
                                opacity: field.readOnly ? 0.6 : 1,
                              }}
                            >
                              <ThemedText style={{ color: textColor }}>
                                {labels.trueLabel}
                              </ThemedText>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() =>
                                !field.readOnly &&
                                setFormState((prev) => ({
                                  ...prev,
                                  [field.key]: "false",
                                }))
                              }
                              style={{
                                ...fieldInputStyle,
                                backgroundColor:
                                  formState[field.key] === "false"
                                    ? tintColor + "1A"
                                    : inputBackground,
                                opacity: field.readOnly ? 0.6 : 1,
                              }}
                            >
                              <ThemedText style={{ color: textColor }}>
                                {labels.falseLabel}
                              </ThemedText>
                            </TouchableOpacity>
                          </View>
                        );
                      }

                      if (field.type === "select" && field.options?.length) {
                        return (
                          <View
                            style={{
                              flexDirection: "row",
                              flexWrap: "wrap",
                              gap: 8,
                              marginTop: 6,
                            }}
                          >
                            {field.options.map((option) => {
                              const selected =
                                String(formState[field.key] ?? "") ===
                                option.value;
                              return (
                                <TouchableOpacity
                                  key={`${field.key}-${option.value}`}
                                  onPress={() =>
                                    !field.readOnly &&
                                    setFormState((prev) => ({
                                      ...prev,
                                      [field.key]: option.value,
                                    }))
                                  }
                                  style={{
                                    ...fieldInputStyle,
                                    backgroundColor: selected
                                      ? tintColor + "1A"
                                      : inputBackground,
                                    opacity: field.readOnly ? 0.6 : 1,
                                  }}
                                >
                                  <ThemedText style={{ color: textColor }}>
                                    {option.label}
                                  </ThemedText>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        );
                      }

                      if (field.type === "date" || field.type === "datetime") {
                        const currentValue = formState[field.key] ?? "";
                        const displayValue =
                          field.type === "date"
                            ? formatDateBR(currentValue)
                            : formatDateTimeBR(currentValue);
                        const showDisplay =
                          currentValue && displayValue !== "-";

                        if (Platform.OS === "web") {
                          // Compute the native input value (ISO format)
                          const nativeInputValue = currentValue
                            ? field.type === "date"
                              ? (() => {
                                  const d = parseDate(currentValue);
                                  return d ? dateToISODate(d) : currentValue;
                                })()
                              : (() => {
                                  const d = parseDate(currentValue);
                                  return d
                                    ? d.toISOString().slice(0, 16)
                                    : currentValue;
                                })()
                            : "";

                          return (
                            <View style={{ marginTop: 6 }}>
                              <View
                                style={{
                                  position: "relative",
                                  flexDirection: "row",
                                  alignItems: "center",
                                }}
                              >
                                {/* Human-readable date display */}
                                <View
                                  style={{
                                    ...fieldInputStyle,
                                    marginTop: 0,
                                    flex: 1,
                                    flexDirection: "row",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    paddingVertical: 12,
                                  }}
                                  pointerEvents="none"
                                >
                                  <ThemedText
                                    style={{
                                      fontSize: 14,
                                      color: showDisplay
                                        ? textColor
                                        : mutedTextColor,
                                    }}
                                  >
                                    {showDisplay
                                      ? displayValue
                                      : (field.placeholder ?? field.label)}
                                  </ThemedText>
                                  <ThemedText
                                    style={{
                                      fontSize: 16,
                                      color: mutedTextColor,
                                      marginLeft: 8,
                                    }}
                                  >
                                    📅
                                  </ThemedText>
                                </View>
                                {/* Invisible native date input overlay for picker */}
                                {!field.readOnly &&
                                  createElement("input", {
                                    type:
                                      field.type === "date"
                                        ? "date"
                                        : "datetime-local",
                                    value: nativeInputValue,
                                    onChange: (e: any) => {
                                      const val = e.target?.value ?? "";
                                      setFormState(
                                        (prev: Record<string, string>) => ({
                                          ...prev,
                                          [field.key]: val,
                                        }),
                                      );
                                    },
                                    style: {
                                      position: "absolute" as const,
                                      top: 0,
                                      left: 0,
                                      right: 0,
                                      bottom: 0,
                                      width: "100%",
                                      height: "100%",
                                      opacity: 0.01,
                                      cursor: "pointer",
                                      border: "none",
                                      background: "transparent",
                                      fontSize: 16,
                                      zIndex: 10,
                                      pointerEvents: "auto" as const,
                                    },
                                  })}
                              </View>
                            </View>
                          );
                        }

                        // Mobile: show current value as tappable button + DateTimePicker
                        return (
                          <View style={{ marginTop: 6 }}>
                            <TouchableOpacity
                              onPress={() => {
                                if (field.readOnly) return;
                                setDatePickerTarget("form");
                                setDatePickerField(field.key);
                                setDatePickerMode(
                                  field.type === "date" ? "date" : "datetime",
                                );
                                const parsed = parseDate(currentValue);
                                setDatePickerValue(parsed ?? new Date());
                              }}
                              style={{
                                ...fieldInputStyle,
                                paddingVertical: 12,
                                marginTop: 0,
                                opacity: field.readOnly ? 0.6 : 1,
                              }}
                            >
                              <ThemedText
                                style={{
                                  color: showDisplay
                                    ? textColor
                                    : mutedTextColor,
                                }}
                              >
                                {showDisplay
                                  ? displayValue
                                  : (field.placeholder ?? field.label)}
                              </ThemedText>
                            </TouchableOpacity>
                          </View>
                        );
                      }

                      if (field.type === "currency") {
                        const rawVal = formState[field.key] ?? "";
                        return (
                          <View style={{ marginTop: 6 }}>
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                              }}
                            >
                              <ThemedText
                                style={{
                                  color: mutedTextColor,
                                  marginRight: 4,
                                  fontSize: 14,
                                }}
                              >
                                R$
                              </ThemedText>
                              <TextInput
                                value={rawVal}
                                onChangeText={(text) => {
                                  // Allow only digits, comma, dot
                                  const cleaned = text.replace(/[^\d.,]/g, "");
                                  setFormState((prev) => ({
                                    ...prev,
                                    [field.key]: cleaned,
                                  }));
                                }}
                                placeholder="0,00"
                                placeholderTextColor={mutedTextColor}
                                keyboardType="decimal-pad"
                                editable={!field.readOnly}
                                style={{
                                  ...fieldInputStyle,
                                  flex: 1,
                                  marginTop: 0,
                                }}
                              />
                            </View>
                            {rawVal ? (
                              <ThemedText
                                style={{
                                  fontSize: 11,
                                  color: mutedTextColor,
                                  marginTop: 4,
                                }}
                              >
                                {formatCurrencyBR(parseCurrencyInput(rawVal))}
                              </ThemedText>
                            ) : null}
                          </View>
                        );
                      }

                      if (field.type === "masked" && field.maskType) {
                        const rawDigits = (formState[field.key] ?? "").replace(
                          /\D/g,
                          "",
                        );
                        const maxLen = maskMaxDigits(field.maskType);
                        return (
                          <TextInput
                            value={applyMask(rawDigits, field.maskType)}
                            onChangeText={(text) => {
                              const digits = text
                                .replace(/\D/g, "")
                                .slice(0, maxLen);
                              setFormState((prev) => ({
                                ...prev,
                                [field.key]: digits,
                              }));
                            }}
                            placeholder={field.placeholder ?? field.label}
                            placeholderTextColor={mutedTextColor}
                            keyboardType="number-pad"
                            maxLength={
                              applyMask("9".repeat(maxLen), field.maskType)
                                .length
                            }
                            editable={!field.readOnly}
                            style={fieldInputStyle}
                          />
                        );
                      }

                      if (field.type === "number") {
                        return (
                          <TextInput
                            value={formState[field.key] ?? ""}
                            onChangeText={(text) => {
                              const cleaned = text.replace(/[^\d.,-]/g, "");
                              setFormState((prev) => ({
                                ...prev,
                                [field.key]: cleaned,
                              }));
                            }}
                            placeholder={field.placeholder ?? field.label}
                            placeholderTextColor={mutedTextColor}
                            keyboardType="decimal-pad"
                            editable={!field.readOnly}
                            style={fieldInputStyle}
                          />
                        );
                      }

                      if (field.type === "json") {
                        return (
                          <JsonEditor
                            value={formState[field.key] ?? ""}
                            onChange={(text) =>
                              setFormState((prev) => ({
                                ...prev,
                                [field.key]: text,
                              }))
                            }
                            placeholder={field.placeholder ?? field.label}
                            readOnly={field.readOnly}
                            textColor={textColor}
                            mutedColor={mutedTextColor}
                            borderColor={borderColor}
                            bgColor={cardColor}
                            inputBgColor={inputBackground}
                            tintColor={tintColor}
                          />
                        );
                      }

                      // email / phone / url — use appropriate keyboard
                      const keyboardType =
                        field.type === "email"
                          ? ("email-address" as const)
                          : field.type === "phone"
                            ? ("phone-pad" as const)
                            : field.type === "url"
                              ? ("url" as const)
                              : ("default" as const);

                      return (
                        <TextInput
                          value={formState[field.key] ?? ""}
                          onChangeText={(text) =>
                            setFormState((prev) => ({
                              ...prev,
                              [field.key]: text,
                            }))
                          }
                          placeholder={field.placeholder ?? field.label}
                          placeholderTextColor={mutedTextColor}
                          multiline={field.type === "multiline"}
                          keyboardType={keyboardType}
                          autoCapitalize={
                            field.type === "email" || field.type === "url"
                              ? "none"
                              : undefined
                          }
                          autoComplete={
                            field.type === "email"
                              ? "email"
                              : field.type === "phone"
                                ? "tel"
                                : undefined
                          }
                          editable={!field.readOnly}
                          style={{
                            ...fieldInputStyle,
                            minHeight:
                              field.type === "multiline" ? 90 : undefined,
                            textAlignVertical:
                              field.type === "multiline" ? "top" : "auto",
                          }}
                        />
                      );
                    };

                    return (
                      <View key={field.key}>
                        {sectionHeader}
                        <View style={{ marginBottom: 12 }}>
                          <ThemedText
                            style={{ fontSize: 12, color: mutedTextColor }}
                          >
                            {field.label}
                            {field.required ? " *" : ""}
                          </ThemedText>
                          {renderFieldInput()}
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>

                {formError ? (
                  <ThemedText style={{ color: tintColor, marginTop: 8 }}>
                    {formError}
                  </ThemedText>
                ) : null}

                {formError && formErrorDiagnostic && isAdminUser ? (
                  <View style={{ marginTop: 8, gap: 6 }}>
                    <TouchableOpacity
                      onPress={copyDiagnostic}
                      style={{
                        alignSelf: "flex-start",
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor,
                        backgroundColor: inputBackground,
                      }}
                    >
                      <ThemedText
                        style={{ color: textColor, fontWeight: "600" }}
                      >
                        Copiar diagnóstico
                      </ThemedText>
                    </TouchableOpacity>
                    {diagnosticCopyStatus ? (
                      <ThemedText
                        style={{ fontSize: 12, color: mutedTextColor }}
                      >
                        {diagnosticCopyStatus}
                      </ThemedText>
                    ) : null}
                  </View>
                ) : null}

                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    marginTop: 12,
                    justifyContent: "flex-end",
                  }}
                >
                  <TouchableOpacity
                    onPress={() => {
                      setModalOpen(false);
                      resetForm();
                    }}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor,
                      backgroundColor: cardColor,
                    }}
                  >
                    <ThemedText style={{ color: textColor, fontWeight: "600" }}>
                      Cancelar
                    </ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSave}
                    disabled={saving}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      borderRadius: 6,
                      backgroundColor: saving ? mutedTextColor : tintColor,
                    }}
                  >
                    <ThemedText
                      style={{ color: onTintTextColor, fontWeight: "700" }}
                    >
                      {saving ? "Salvando..." : "Salvar"}
                    </ThemedText>
                  </TouchableOpacity>
                  {modalMode === "edit" && editingId && deleteItem ? (
                    <TouchableOpacity
                      onPress={() => handleSoftDelete(editingId)}
                      disabled={saving}
                      style={{
                        paddingVertical: 10,
                        paddingHorizontal: 14,
                        borderRadius: 6,
                        backgroundColor: "#dc2626",
                        opacity: saving ? 0.5 : 1,
                      }}
                    >
                      <ThemedText
                        style={{ color: onTintTextColor, fontWeight: "700" }}
                      >
                        Excluir
                      </ThemedText>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* DateTimePicker Modal for mobile */}
        {Platform.OS !== "web" && datePickerField ? (
          <Modal
            transparent
            visible={!!datePickerField}
            animationType="fade"
            onRequestClose={() => setDatePickerField(null)}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: modalBackdrop,
                justifyContent: "flex-end",
              }}
            >
              <View
                style={{
                  backgroundColor: cardColor,
                  borderTopLeftRadius: 16,
                  borderTopRightRadius: 16,
                  padding: 16,
                  paddingBottom: 32,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: 12,
                  }}
                >
                  <TouchableOpacity onPress={() => setDatePickerField(null)}>
                    <ThemedText style={{ color: mutedTextColor, fontSize: 16 }}>
                      Cancelar
                    </ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      if (datePickerField) {
                        const val =
                          datePickerMode === "date"
                            ? dateToISODate(datePickerValue)
                            : dateToISOString(datePickerValue);
                        if (datePickerTarget === "quick") {
                          setQuickCreateState((prev) => ({
                            ...prev,
                            [datePickerField]: val,
                          }));
                        } else {
                          setFormState((prev) => ({
                            ...prev,
                            [datePickerField]: val,
                          }));
                        }
                      }
                      setDatePickerField(null);
                    }}
                  >
                    <ThemedText
                      style={{
                        color: tintColor,
                        fontSize: 16,
                        fontWeight: "700",
                      }}
                    >
                      Confirmar
                    </ThemedText>
                  </TouchableOpacity>
                </View>
                <View style={{ alignItems: "center" }}>
                  <DateTimePickerMobile
                    value={datePickerValue}
                    mode={datePickerMode === "datetime" ? "datetime" : "date"}
                    display="spinner"
                    locale="pt-BR"
                    onChange={(_event: unknown, selectedDate?: Date) => {
                      if (selectedDate) setDatePickerValue(selectedDate);
                    }}
                  />
                </View>
              </View>
            </View>
          </Modal>
        ) : null}

        <Modal
          transparent
          visible={quickCreateModalOpen}
          animationType="slide"
          onRequestClose={closeQuickCreate}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: modalBackdrop,
              justifyContent: "center",
              padding: 16,
              zIndex: 20000 + modalDepth * 1000,
              elevation: 30 + modalDepth,
            }}
          >
            <View
              style={{
                backgroundColor: cardColor,
                borderRadius: 12,
                padding: 16,
                maxHeight: "90%",
              }}
            >
              <ThemedText style={[styles.processTitle, { color: textColor }]}>
                Criar novo
              </ThemedText>

              {quickCreateFieldsLoading ? (
                <ActivityIndicator style={{ marginTop: 12 }} />
              ) : null}

              <ScrollView
                style={{ marginTop: 12 }}
                contentContainerStyle={{ paddingBottom: 8 }}
              >
                {quickCreateFields.map((field) => {
                  const resolvedField = normalizeCrudField(field);

                  const qcInputStyle = {
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    backgroundColor: inputBackground,
                    color: textColor,
                    marginTop: 6,
                  } as const;

                  const renderQcFieldInput = () => {
                    // Reference
                    if (resolvedField.type === "reference") {
                      return (
                        <TouchableOpacity
                          onPress={() =>
                            openReferenceModal(resolvedField, "quick")
                          }
                          style={{ ...qcInputStyle, paddingVertical: 12 }}
                        >
                          <ThemedText style={{ color: textColor }}>
                            {quickCreateReferenceLabels[field.key] ||
                              (quickCreateState[field.key]
                                ? getCachedReferenceLabel(
                                    resolvedField,
                                    quickCreateState[field.key],
                                  )
                                : "") ||
                              (quickCreateState[field.key]
                                ? "Selecionado"
                                : "") ||
                              resolvedField.placeholder ||
                              "Selecionar"}
                          </ThemedText>
                        </TouchableOpacity>
                      );
                    }

                    // Boolean
                    if (resolvedField.type === "boolean") {
                      const labels = getBooleanOptionLabels(resolvedField);
                      return (
                        <View
                          style={{ flexDirection: "row", gap: 8, marginTop: 6 }}
                        >
                          <TouchableOpacity
                            onPress={() =>
                              !resolvedField.readOnly &&
                              setQuickCreateState((prev) => ({
                                ...prev,
                                [resolvedField.key]: "true",
                              }))
                            }
                            style={{
                              ...qcInputStyle,
                              marginTop: 0,
                              backgroundColor:
                                quickCreateState[resolvedField.key] === "true"
                                  ? tintColor + "1A"
                                  : inputBackground,
                              opacity: resolvedField.readOnly ? 0.6 : 1,
                            }}
                          >
                            <ThemedText style={{ color: textColor }}>
                              {labels.trueLabel}
                            </ThemedText>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() =>
                              !resolvedField.readOnly &&
                              setQuickCreateState((prev) => ({
                                ...prev,
                                [resolvedField.key]: "false",
                              }))
                            }
                            style={{
                              ...qcInputStyle,
                              marginTop: 0,
                              backgroundColor:
                                quickCreateState[resolvedField.key] === "false"
                                  ? tintColor + "1A"
                                  : inputBackground,
                              opacity: resolvedField.readOnly ? 0.6 : 1,
                            }}
                          >
                            <ThemedText style={{ color: textColor }}>
                              {labels.falseLabel}
                            </ThemedText>
                          </TouchableOpacity>
                        </View>
                      );
                    }

                    // Select
                    if (
                      resolvedField.type === "select" &&
                      resolvedField.options?.length
                    ) {
                      return (
                        <View
                          style={{
                            flexDirection: "row",
                            flexWrap: "wrap",
                            gap: 8,
                            marginTop: 6,
                          }}
                        >
                          {resolvedField.options.map((option) => {
                            const selected =
                              String(
                                quickCreateState[resolvedField.key] ?? "",
                              ) === option.value;
                            return (
                              <TouchableOpacity
                                key={`qc-${resolvedField.key}-${option.value}`}
                                onPress={() =>
                                  !resolvedField.readOnly &&
                                  setQuickCreateState((prev) => ({
                                    ...prev,
                                    [resolvedField.key]: option.value,
                                  }))
                                }
                                style={{
                                  ...qcInputStyle,
                                  marginTop: 0,
                                  backgroundColor: selected
                                    ? tintColor + "1A"
                                    : inputBackground,
                                  opacity: resolvedField.readOnly ? 0.6 : 1,
                                }}
                              >
                                <ThemedText style={{ color: textColor }}>
                                  {option.label}
                                </ThemedText>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      );
                    }

                    // Date / Datetime
                    if (
                      resolvedField.type === "date" ||
                      resolvedField.type === "datetime"
                    ) {
                      const currentValue =
                        quickCreateState[resolvedField.key] ?? "";
                      const displayValue =
                        resolvedField.type === "date"
                          ? formatDateBR(currentValue)
                          : formatDateTimeBR(currentValue);
                      const showDisplay = currentValue && displayValue !== "-";

                      if (Platform.OS === "web") {
                        const nativeInputValue = currentValue
                          ? resolvedField.type === "date"
                            ? (() => {
                                const d = parseDate(currentValue);
                                return d ? dateToISODate(d) : currentValue;
                              })()
                            : (() => {
                                const d = parseDate(currentValue);
                                return d
                                  ? d.toISOString().slice(0, 16)
                                  : currentValue;
                              })()
                          : "";

                        return (
                          <View style={{ marginTop: 6 }}>
                            <View
                              style={{
                                position: "relative",
                                flexDirection: "row",
                                alignItems: "center",
                              }}
                            >
                              <View
                                style={{
                                  ...qcInputStyle,
                                  marginTop: 0,
                                  flex: 1,
                                  flexDirection: "row",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  paddingVertical: 12,
                                }}
                                pointerEvents="none"
                              >
                                <ThemedText
                                  style={{
                                    fontSize: 14,
                                    color: showDisplay
                                      ? textColor
                                      : mutedTextColor,
                                  }}
                                >
                                  {showDisplay
                                    ? displayValue
                                    : (resolvedField.placeholder ??
                                      resolvedField.label)}
                                </ThemedText>
                                <ThemedText
                                  style={{
                                    fontSize: 16,
                                    color: mutedTextColor,
                                    marginLeft: 8,
                                  }}
                                >
                                  📅
                                </ThemedText>
                              </View>
                              {!resolvedField.readOnly &&
                                createElement("input", {
                                  type:
                                    resolvedField.type === "date"
                                      ? "date"
                                      : "datetime-local",
                                  value: nativeInputValue,
                                  onChange: (e: any) => {
                                    const val = e.target?.value ?? "";
                                    setQuickCreateState(
                                      (prev: Record<string, string>) => ({
                                        ...prev,
                                        [resolvedField.key]: val,
                                      }),
                                    );
                                  },
                                  style: {
                                    position: "absolute" as const,
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    width: "100%",
                                    height: "100%",
                                    opacity: 0.01,
                                    cursor: "pointer",
                                    border: "none",
                                    background: "transparent",
                                    fontSize: 16,
                                    zIndex: 10,
                                    pointerEvents: "auto" as const,
                                  },
                                })}
                            </View>
                          </View>
                        );
                      }

                      // Mobile: opens shared date picker with quick target
                      return (
                        <View style={{ marginTop: 6 }}>
                          <TouchableOpacity
                            onPress={() => {
                              if (resolvedField.readOnly) return;
                              setDatePickerTarget("quick");
                              setDatePickerField(resolvedField.key);
                              setDatePickerMode(
                                resolvedField.type === "date"
                                  ? "date"
                                  : "datetime",
                              );
                              const parsed = parseDate(currentValue);
                              setDatePickerValue(parsed ?? new Date());
                            }}
                            style={{
                              ...qcInputStyle,
                              paddingVertical: 12,
                              marginTop: 0,
                              opacity: resolvedField.readOnly ? 0.6 : 1,
                            }}
                          >
                            <ThemedText
                              style={{
                                color: showDisplay ? textColor : mutedTextColor,
                              }}
                            >
                              {showDisplay
                                ? displayValue
                                : (resolvedField.placeholder ??
                                  resolvedField.label)}
                            </ThemedText>
                          </TouchableOpacity>
                        </View>
                      );
                    }

                    // Currency
                    if (resolvedField.type === "currency") {
                      const rawVal = quickCreateState[resolvedField.key] ?? "";
                      return (
                        <View style={{ marginTop: 6 }}>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                            }}
                          >
                            <ThemedText
                              style={{
                                color: mutedTextColor,
                                marginRight: 4,
                                fontSize: 14,
                              }}
                            >
                              R$
                            </ThemedText>
                            <TextInput
                              value={rawVal}
                              onChangeText={(text) => {
                                const cleaned = text.replace(/[^\d.,]/g, "");
                                setQuickCreateState((prev) => ({
                                  ...prev,
                                  [resolvedField.key]: cleaned,
                                }));
                              }}
                              placeholder="0,00"
                              placeholderTextColor={mutedTextColor}
                              keyboardType="decimal-pad"
                              editable={!resolvedField.readOnly}
                              style={{
                                ...qcInputStyle,
                                flex: 1,
                                marginTop: 0,
                              }}
                            />
                          </View>
                          {rawVal ? (
                            <ThemedText
                              style={{
                                fontSize: 11,
                                color: mutedTextColor,
                                marginTop: 4,
                              }}
                            >
                              {formatCurrencyBR(parseCurrencyInput(rawVal))}
                            </ThemedText>
                          ) : null}
                        </View>
                      );
                    }

                    // Masked (CPF, CNPJ, CEP, phone)
                    if (
                      resolvedField.type === "masked" &&
                      resolvedField.maskType
                    ) {
                      const rawDigits = (
                        quickCreateState[resolvedField.key] ?? ""
                      ).replace(/\D/g, "");
                      const maxLen = maskMaxDigits(resolvedField.maskType);
                      return (
                        <TextInput
                          value={applyMask(rawDigits, resolvedField.maskType)}
                          onChangeText={(text) => {
                            const digits = text
                              .replace(/\D/g, "")
                              .slice(0, maxLen);
                            setQuickCreateState((prev) => ({
                              ...prev,
                              [resolvedField.key]: digits,
                            }));
                          }}
                          placeholder={
                            resolvedField.placeholder ?? resolvedField.label
                          }
                          placeholderTextColor={mutedTextColor}
                          keyboardType="number-pad"
                          maxLength={
                            applyMask(
                              "9".repeat(maxLen),
                              resolvedField.maskType,
                            ).length
                          }
                          editable={!resolvedField.readOnly}
                          style={qcInputStyle}
                        />
                      );
                    }

                    // Number
                    if (resolvedField.type === "number") {
                      return (
                        <TextInput
                          value={quickCreateState[resolvedField.key] ?? ""}
                          onChangeText={(text) => {
                            const cleaned = text.replace(/[^\d.,-]/g, "");
                            setQuickCreateState((prev) => ({
                              ...prev,
                              [resolvedField.key]: cleaned,
                            }));
                          }}
                          placeholder={
                            resolvedField.placeholder ?? resolvedField.label
                          }
                          placeholderTextColor={mutedTextColor}
                          keyboardType="decimal-pad"
                          editable={!resolvedField.readOnly}
                          style={qcInputStyle}
                        />
                      );
                    }

                    // JSON
                    if (resolvedField.type === "json") {
                      return (
                        <JsonEditor
                          value={quickCreateState[resolvedField.key] ?? ""}
                          onChange={(text) =>
                            setQuickCreateState((prev) => ({
                              ...prev,
                              [resolvedField.key]: text,
                            }))
                          }
                          placeholder={
                            resolvedField.placeholder ?? resolvedField.label
                          }
                          readOnly={resolvedField.readOnly}
                          textColor={textColor}
                          mutedColor={mutedTextColor}
                          borderColor={borderColor}
                          bgColor={cardColor}
                          inputBgColor={inputBackground}
                          tintColor={tintColor}
                        />
                      );
                    }

                    // Default: text, multiline, email, phone, url
                    const keyboardType =
                      resolvedField.type === "email"
                        ? ("email-address" as const)
                        : resolvedField.type === "phone"
                          ? ("phone-pad" as const)
                          : resolvedField.type === "url"
                            ? ("url" as const)
                            : ("default" as const);

                    return (
                      <TextInput
                        value={quickCreateState[resolvedField.key] ?? ""}
                        onChangeText={(text) =>
                          setQuickCreateState((prev) => ({
                            ...prev,
                            [resolvedField.key]: text,
                          }))
                        }
                        placeholder={
                          resolvedField.placeholder ?? resolvedField.label
                        }
                        placeholderTextColor={mutedTextColor}
                        multiline={resolvedField.type === "multiline"}
                        keyboardType={keyboardType}
                        autoCapitalize={
                          resolvedField.type === "email" ||
                          resolvedField.type === "url"
                            ? "none"
                            : undefined
                        }
                        autoComplete={
                          resolvedField.type === "email"
                            ? "email"
                            : resolvedField.type === "phone"
                              ? "tel"
                              : undefined
                        }
                        editable={!resolvedField.readOnly}
                        style={{
                          ...qcInputStyle,
                          minHeight:
                            resolvedField.type === "multiline" ? 90 : undefined,
                          textAlignVertical:
                            resolvedField.type === "multiline" ? "top" : "auto",
                        }}
                      />
                    );
                  };

                  return (
                    <View key={resolvedField.key} style={{ marginBottom: 12 }}>
                      <ThemedText
                        style={{ fontSize: 12, color: mutedTextColor }}
                      >
                        {resolvedField.label}
                        {resolvedField.required ? " *" : ""}
                      </ThemedText>
                      {renderQcFieldInput()}
                    </View>
                  );
                })}
              </ScrollView>

              {quickCreateError ? (
                <ThemedText style={{ color: tintColor, marginTop: 8 }}>
                  {quickCreateError}
                </ThemedText>
              ) : null}

              <View
                style={{
                  flexDirection: "row",
                  gap: 8,
                  marginTop: 12,
                  justifyContent: "flex-end",
                }}
              >
                <TouchableOpacity
                  onPress={closeQuickCreate}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor,
                    backgroundColor: cardColor,
                  }}
                >
                  <ThemedText style={{ color: textColor, fontWeight: "600" }}>
                    Cancelar
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleQuickCreateSave}
                  disabled={quickCreateSaving || quickCreateFieldsLoading}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: 6,
                    backgroundColor:
                      quickCreateSaving || quickCreateFieldsLoading
                        ? mutedTextColor
                        : tintColor,
                  }}
                >
                  <ThemedText
                    style={{ color: onTintTextColor, fontWeight: "700" }}
                  >
                    {quickCreateSaving ? "Salvando..." : "Salvar"}
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Render por último para nunca ficar atrás do quick create */}
        <Modal
          transparent
          visible={!!referenceModalField}
          animationType="slide"
          onRequestClose={() => {
            setReferenceModalField(null);
            setReferenceModalContext("form");
            setActiveQuickFieldKey(null);
            setModalDepth((prev) => Math.max(0, prev - 1));
          }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: modalBackdrop,
              justifyContent: "center",
              padding: 16,
              zIndex: 30000 + modalDepth * 1000,
              elevation: 40 + modalDepth,
            }}
          >
            <View
              style={{
                backgroundColor: cardColor,
                borderRadius: 12,
                padding: 16,
                maxHeight: "90%",
                zIndex: 30001 + modalDepth * 1000,
                elevation: 41 + modalDepth,
              }}
            >
              <ThemedText style={[styles.processTitle, { color: textColor }]}>
                Selecionar
              </ThemedText>

              <TextInput
                value={referenceSearch}
                onChangeText={setReferenceSearch}
                placeholder="Buscar"
                placeholderTextColor={mutedTextColor}
                style={{
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  backgroundColor: inputBackground,
                  color: textColor,
                  marginTop: 12,
                }}
              />

              {referenceLoading ? (
                <ActivityIndicator style={{ marginTop: 12 }} />
              ) : null}

              {referenceError ? (
                <ThemedText style={{ color: tintColor, marginTop: 8 }}>
                  {referenceError}
                </ThemedText>
              ) : null}

              <TouchableOpacity
                onPress={() => {
                  if (!referenceModalField) return;
                  openQuickCreate(referenceModalField);
                }}
                style={{
                  marginTop: 12,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  backgroundColor: tintColor,
                  borderRadius: 6,
                  alignItems: "center",
                }}
              >
                <ThemedText
                  style={{ color: onTintTextColor, fontWeight: "600" }}
                >
                  + Criar Novo
                </ThemedText>
              </TouchableOpacity>

              <ScrollView style={{ marginTop: 12 }}>
                {referenceOptions.length === 0 && !referenceLoading ? (
                  <ThemedText style={{ color: mutedTextColor }}>
                    Nenhum resultado encontrado.
                  </ThemedText>
                ) : null}

                {referenceOptions.map((option) => (
                  <TouchableOpacity
                    key={option.id}
                    onPress={() => {
                      if (!referenceModalField) return;
                      if (referenceModalContext === "form") {
                        setFormState((prev) => ({
                          ...prev,
                          [referenceModalField.key]: option.id,
                        }));
                        setReferenceLabels((prev) => ({
                          ...prev,
                          [referenceModalField.key]: option.label,
                        }));
                      } else {
                        const targetKey =
                          activeQuickFieldKey ?? referenceModalField.key;
                        setQuickCreateState((prev) => ({
                          ...prev,
                          [targetKey]: option.id,
                        }));
                        setQuickCreateReferenceLabels((prev) => ({
                          ...prev,
                          [targetKey]: option.label,
                        }));
                      }
                      setReferenceModalField(null);
                      setReferenceModalContext("form");
                      setActiveQuickFieldKey(null);
                      setModalDepth((prev) => Math.max(0, prev - 1));
                    }}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 8,
                      borderBottomWidth: 1,
                      borderBottomColor: borderColor,
                    }}
                  >
                    <ThemedText style={{ color: textColor, fontWeight: "600" }}>
                      {option.label}
                    </ThemedText>
                    {option.raw ? (
                      <View style={{ marginTop: 4, gap: 2 }}>
                        {formatRecordDetails(option.raw, fields).map(
                          (detail) => (
                            <ThemedText
                              key={`${option.id}-${detail.key}`}
                              style={{ fontSize: 12, color: mutedTextColor }}
                            >
                              {getFriendlyLabelByKey(detail.key, fields)}:{" "}
                              {detail.value}
                            </ThemedText>
                          ),
                        )}
                      </View>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity
                onPress={() => {
                  setReferenceModalField(null);
                  setReferenceModalContext("form");
                  setActiveQuickFieldKey(null);
                  setModalDepth((prev) => Math.max(0, prev - 1));
                }}
                style={{
                  marginTop: 12,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  backgroundColor: cardColor,
                  borderRadius: 6,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor,
                }}
              >
                <ThemedText style={{ color: textColor, fontWeight: "600" }}>
                  Fechar
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Reference detail modal for viewing linked records */}
        <Modal
          transparent
          visible={referenceDetailModalOpen}
          animationType="slide"
          onRequestClose={closeReferenceDetail}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: modalBackdrop,
              justifyContent: "center",
              padding: 16,
              zIndex: 40000 + modalDepth * 1000,
              elevation: 50 + modalDepth,
            }}
          >
            <View
              style={{
                backgroundColor: cardColor,
                borderRadius: 12,
                padding: 16,
                maxHeight: "90%",
                zIndex: 40001 + modalDepth * 1000,
                elevation: 51 + modalDepth,
              }}
            >
              <ThemedText style={[styles.processTitle, { color: textColor }]}>
                Detalhes
              </ThemedText>

              {referenceDetailLoading ? (
                <ActivityIndicator style={{ marginTop: 12 }} />
              ) : null}

              {referenceDetailError ? (
                <ThemedText style={{ color: tintColor, marginTop: 8 }}>
                  {referenceDetailError}
                </ThemedText>
              ) : null}

              {referenceDetailData ? (
                <ScrollView
                  style={{ marginTop: 12 }}
                  contentContainerStyle={{ paddingBottom: 8 }}
                >
                  {formatRecordDetails(referenceDetailData, fields).map(
                    (detail) => {
                      const refField = fields.find(
                        (f) =>
                          String(f.key) === detail.key &&
                          f.type === "reference",
                      );
                      const dataValue = referenceDetailData?.[detail.key];
                      const isRefValue =
                        refField && dataValue && detail.value !== "-";

                      return (
                        <View
                          key={`detail-${detail.key}`}
                          style={{ marginBottom: 8 }}
                        >
                          {isRefValue ? (
                            <TouchableOpacity
                              onPress={() => {
                                if (refField && dataValue) {
                                  openReferenceDetail(
                                    refField,
                                    String(dataValue),
                                  );
                                }
                              }}
                            >
                              <ThemedText
                                style={{
                                  fontSize: 12,
                                  color: mutedTextColor,
                                  marginBottom: 2,
                                }}
                              >
                                {getFriendlyLabelByKey(detail.key, fields)}
                              </ThemedText>
                              <ThemedText
                                style={{
                                  fontSize: 13,
                                  color: tintColor,
                                  textDecorationLine: "underline",
                                  fontWeight: "500",
                                }}
                              >
                                {detail.value}
                              </ThemedText>
                            </TouchableOpacity>
                          ) : (
                            <>
                              <ThemedText
                                style={{
                                  fontSize: 12,
                                  color: mutedTextColor,
                                  marginBottom: 2,
                                }}
                              >
                                {getFriendlyLabelByKey(detail.key, fields)}
                              </ThemedText>
                              <ThemedText
                                style={{
                                  fontSize: 13,
                                  color: textColor,
                                }}
                              >
                                {detail.value}
                              </ThemedText>
                            </>
                          )}
                        </View>
                      );
                    },
                  )}
                </ScrollView>
              ) : null}

              <TouchableOpacity
                onPress={closeReferenceDetail}
                style={{
                  marginTop: 12,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  backgroundColor: tintColor,
                  borderRadius: 6,
                  alignItems: "center",
                }}
              >
                <ThemedText
                  style={{ color: onTintTextColor, fontWeight: "600" }}
                >
                  Fechar
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>

      {/* ── Floating Action Buttons (FAB) ── */}
      <View
        style={{
          position: "absolute",
          bottom: 24,
          right: 24,
          flexDirection: "row",
          gap: 10,
          alignItems: "center",
        }}
      >
        <TouchableOpacity
          onPress={generateAiInsights}
          disabled={aiLoading}
          style={{
            backgroundColor: aiLoading ? `${tintColor}66` : cardColor,
            borderRadius: 999,
            paddingHorizontal: 16,
            paddingVertical: 12,
            flexDirection: "row",
            gap: 6,
            alignItems: "center",
            elevation: 4,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.2,
            shadowRadius: 4,
            borderWidth: 1,
            borderColor,
          }}
        >
          {aiLoading ? (
            <ActivityIndicator size="small" color={tintColor} />
          ) : (
            <ThemedText
              style={{ color: tintColor, fontWeight: "700", fontSize: 13 }}
            >
              ✨ IA
            </ThemedText>
          )}
        </TouchableOpacity>
        {!hideAddButton && (
          <TouchableOpacity
            onPress={onAddPress ?? openCreate}
            style={{
              backgroundColor: tintColor,
              borderRadius: 999,
              paddingHorizontal: 20,
              paddingVertical: 14,
              flexDirection: "row",
              gap: 8,
              alignItems: "center",
              elevation: 6,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.25,
              shadowRadius: 6,
            }}
          >
            <ThemedText
              style={{
                color: onTintTextColor,
                fontWeight: "700",
                fontSize: 14,
              }}
            >
              {addButtonLabel ?? "+ Adicionar"}
            </ThemedText>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
