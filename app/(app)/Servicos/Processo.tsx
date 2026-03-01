import { QuoteSection } from "@/components/quotes/QuoteSection";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { SignatureRequest } from "@/components/ui/SignatureRequest";
import { useAuth } from "@/core/auth/AuthContext";
import { PERMISSIONS } from "@/core/auth/permissions";
import { usePermissions } from "@/core/auth/usePermissions";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
  AI_AGENT_ENDPOINT,
  buildAiInsightMessage,
  extractAiInsightText,
  UNIVERSAL_AI_INSIGHT_PROMPT,
} from "@/services/ai-insights";
import { api, getApiErrorMessage } from "@/services/api";
import { buildSearchParams, CRUD_ENDPOINT } from "@/services/crud";
import {
  createAndSendDocument,
  getDocument as documensoGetDocument,
  getSigningUrl as documensoGetSigningUrl,
  listRecipients as documensoListRecipients,
  SIGNING_TYPES,
  type SigningType,
} from "@/services/documenso";
import {
  createDocumentResponse,
  updateDocumentRequest,
  type DocumentRequest,
} from "@/services/document-requests";
import { isPdf, pdfToImages } from "@/services/pdf-to-image";
import {
  buildPortalUrl,
  buildReviewUrl,
  createPortalToken,
  listPortalTokens,
  revokePortalToken,
} from "@/services/portal-publico";
import {
  extractCnpj,
  extractCpf,
  extractCurrency,
  extractDates,
  recognizeText,
} from "@/services/tesseract-ocr";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { styles } from "../../theme/styles";

interface Property {
  id: string;
  address?: string | null;
  number?: string | null;
  city?: string | null;
  state?: string | null;
  [key: string]: any;
}

interface ProcessUpdateFile {
  id: string;
  drive_file_id?: string;
  file_name?: string;
  description?: string;
  mime_type?: string;
  file_size?: number;
  drive_web_view_link?: string;
  drive_web_content_link?: string;
  url?: string;
  created_at?: string;
  is_client_visible?: boolean;
  file_data?: string;
  storage_type?: "drive" | "database" | "both";
  include_in_protocol?: boolean;
}

interface ProcessUpdate {
  id: string;
  property_id?: string;
  service_order_id?: string;
  title?: string;
  description?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  is_client_visible?: boolean;
  files?: ProcessUpdateFile[];
  process_update_files?: ProcessUpdateFile[];
  attachments?: ProcessUpdateFile[];
  client_files?: ProcessUpdateFile[];
}

interface ProcessDocumentResponse {
  id: string;
  document_request_id: string;
  file_name?: string;
  mime_type?: string;
  drive_file_id?: string;
  drive_web_view_link?: string;
  drive_web_content_link?: string;
  file_data?: string | null;
  storage_type?: "drive" | "database" | "both";
  deleted_at?: string | null;
}

type DocumentRequestRow = DocumentRequest & {
  property_id?: string | number | null;
  process_update_id?: string | number | null;
  update_id?: string | number | null;
  process_update?: string | number | null;
};

const normalizeList = <T,>(data: unknown): T[] => {
  const body = data as any;
  const list = Array.isArray(data)
    ? data
    : (body?.data ?? body?.value ?? body?.items ?? []);
  return Array.isArray(list) ? (list as T[]) : [];
};

const extractProcessUpdateId = (value: unknown): string => {
  const row = (value ?? {}) as Record<string, unknown>;
  return String(
    row.property_process_update_id ??
      row.process_update_id ??
      row.process_update ??
      row.update_id ??
      "",
  ).trim();
};

export default function EtapaPropertiesScreen() {
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const canRequestSignature = hasPermission(PERMISSIONS.SIGNATURE_REQUEST);
  const canAnalyzeOcr = hasPermission(PERMISSIONS.OCR_ANALYZE);
  const canCompileProtocol = hasPermission(PERMISSIONS.PROTOCOL_COMPILE);
  const router = useRouter();
  const params = useLocalSearchParams<{
    propertyId?: string;
    serviceOrderId?: string;
  }>();
  const paramPropertyId = params.propertyId;
  const paramServiceOrderId = params.serviceOrderId;

  const [serviceOrderId, setServiceOrderId] = useState<string | null>(
    paramServiceOrderId ?? null,
  );
  const [propertyId, setPropertyId] = useState<string | null>(
    paramPropertyId ?? null,
  );
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [updates, setUpdates] = useState<ProcessUpdate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [documentRequests, setDocumentRequests] = useState<
    Map<string, DocumentRequest[]>
  >(new Map());
  const [documentResponses, setDocumentResponses] = useState<
    Map<string, ProcessDocumentResponse[]>
  >(new Map());
  const [uploadingDocuments, setUploadingDocuments] = useState<Set<string>>(
    new Set(),
  );
  const [signatures, setSignatures] = useState<
    Map<
      string,
      { status: string; signingUrl?: string; documensoDocumentId?: number }
    >
  >(new Map());
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInsights, setAiInsights] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  /* ── Signature request modal state ── */
  const [signModalVisible, setSignModalVisible] = useState(false);
  const [signModalFile, setSignModalFile] = useState<ProcessUpdateFile | null>(
    null,
  );
  const [signModalType, setSignModalType] = useState<SigningType>("documenso");
  const [signModalDesc, setSignModalDesc] = useState("");
  const [signModalLoading, setSignModalLoading] = useState(false);

  /* ── Signer selection state ── */
  interface SignerOption {
    id: string;
    name: string;
    email: string;
    source: "user" | "customer";
  }
  const [availableSigners, setAvailableSigners] = useState<SignerOption[]>([]);
  const [selectedSignerIds, setSelectedSignerIds] = useState<Set<string>>(
    new Set(),
  );
  const [signersLoading, setSignersLoading] = useState(false);
  const [signerSearch, setSignerSearch] = useState("");
  /** Tracks existing signatures per file id */
  const [fileSignatures, setFileSignatures] = useState<
    Map<
      string,
      {
        id: string;
        status: string;
        signingUrl?: string;
        documensoDocumentId?: number;
        signingType?: string;
      }
    >
  >(new Map());
  const [syncingFileId, setSyncingFileId] = useState<string | null>(null);

  /* ── OCR analysis modal state ── */
  const [ocrModalVisible, setOcrModalVisible] = useState(false);
  const [ocrModalFile, setOcrModalFile] = useState<ProcessUpdateFile | null>(
    null,
  );
  const [ocrConfigs, setOcrConfigs] = useState<any[]>([]);
  const [ocrSelectedConfig, setOcrSelectedConfig] = useState<string | null>(
    null,
  );
  const [ocrLoading, setOcrLoading] = useState(false);
  /** Existing OCR results per file id */
  const [fileOcrResults, setFileOcrResults] = useState<Map<string, any>>(
    new Map(),
  );
  /** View OCR result modal */
  const [ocrViewVisible, setOcrViewVisible] = useState(false);
  const [ocrViewData, setOcrViewData] = useState<any | null>(null);

  /* ── OCR AI insight state ── */
  const [ocrAiLoading, setOcrAiLoading] = useState(false);
  const [ocrAiInsight, setOcrAiInsight] = useState<string | null>(null);
  const [ocrAiError, setOcrAiError] = useState<string | null>(null);

  /* ── Portal público state ── */
  const [portalToken, setPortalToken] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalCopied, setPortalCopied] = useState(false);

  /* ── ONR protocol state ── */
  const [onrProtocolos, setOnrProtocolos] = useState<any[]>([]);
  const [onrCertidoes, setOnrCertidoes] = useState<any[]>([]);

  /* ── Service order segmentation info ── */
  const [orderInfo, setOrderInfo] = useState<{
    typeName: string | null;
    categoryName: string | null;
    stepName: string | null;
    currentStepId: string | null;
    templateName: string | null;
    processStatus: string | null;
    entityTable: string | null;
    orderTitle: string | null;
    orderDescription: string | null;
    customerName: string | null;
    customerCpf: string | null;
    estimatedCost: number | null;
    estimatedDurationDays: number | null;
    estimatedCompletionDate: string | null;
  }>({
    typeName: null,
    categoryName: null,
    stepName: null,
    currentStepId: null,
    templateName: null,
    processStatus: null,
    entityTable: null,
    orderTitle: null,
    orderDescription: null,
    customerName: null,
    customerCpf: null,
    estimatedCost: null,
    estimatedDurationDays: null,
    estimatedCompletionDate: null,
  });

  const tintColor = useThemeColor({}, "tint");
  const titleTextColor = useThemeColor({}, "text");
  const mutedTextColor = useThemeColor({}, "muted");
  const bodyTextColor = useThemeColor({}, "text");
  const cardBorderColor = useThemeColor({}, "border");
  const cardBackground = useThemeColor({}, "card");
  const innerCardBackground = useThemeColor({}, "card");

  const formatDate = (value?: string) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const fetchProperty = useCallback(async () => {
    try {
      // If we have serviceOrderId but no propertyId, resolve from context
      if (serviceOrderId && !propertyId) {
        const [, ctxRes] = await Promise.all([
          api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "service_orders",
            ...buildSearchParams([
              { field: "id", value: serviceOrderId },
              { field: "tenant_id", value: user?.tenant_id },
            ]),
          }),
          api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "service_order_context",
            ...buildSearchParams([
              { field: "service_order_id", value: serviceOrderId },
            ]),
          }),
        ]);
        const contexts = normalizeList<{
          service_order_id: string;
          entity_type: string;
          entity_id: string;
        }>(ctxRes.data);
        const propCtx = contexts.find(
          (c) =>
            c.service_order_id === serviceOrderId &&
            c.entity_type === "property",
        );
        if (propCtx) {
          setPropertyId(propCtx.entity_id);
          // Load property below
          const response = await api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "properties",
            ...buildSearchParams([
              { field: "id", value: propCtx.entity_id },
              { field: "tenant_id", value: user?.tenant_id },
            ]),
          });
          const list = normalizeList<Property>(response.data).filter(
            (item) => !item.deleted_at,
          );
          const found = list.find(
            (item) => String(item.id) === String(propCtx.entity_id),
          );
          setProperty(found ?? null);
        }
        return;
      }

      if (!propertyId) return;

      // If we have propertyId but no serviceOrderId, resolve from context
      if (!serviceOrderId) {
        try {
          const ctxRes = await api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "service_order_context",
            ...buildSearchParams([{ field: "entity_id", value: propertyId }]),
          });
          const contexts = normalizeList<{
            service_order_id: string;
            entity_type: string;
            entity_id: string;
          }>(ctxRes.data);
          const propCtx = contexts.find(
            (c) =>
              c.entity_type === "property" &&
              c.entity_id === String(propertyId),
          );
          if (propCtx) {
            setServiceOrderId(propCtx.service_order_id);
          }
        } catch {
          // fallback: continue without service order
        }
      }

      const response = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "properties",
        ...buildSearchParams([
          { field: "id", value: propertyId },
          { field: "tenant_id", value: user?.tenant_id },
        ]),
      });
      const list = normalizeList<Property>(response.data).filter(
        (item) => !item.deleted_at,
      );
      const found = list.find((item) => String(item.id) === String(propertyId));
      setProperty(found ?? null);
    } catch (err) {
      setError(getApiErrorMessage(err, "Falha ao carregar imóvel"));
    }
  }, [propertyId, serviceOrderId, user?.tenant_id]);

  const fetchOnrData = useCallback(async () => {
    if (!propertyId) return;
    try {
      const [protocolosRes, certidoesRes] = await Promise.all([
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "onr_protocolos",
          ...buildSearchParams([
            { field: "property_id", value: propertyId },
            { field: "tenant_id", value: user?.tenant_id },
          ]),
        }),
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "onr_certidoes",
          ...buildSearchParams([
            { field: "property_id", value: propertyId },
            { field: "tenant_id", value: user?.tenant_id },
          ]),
        }),
      ]);
      const protocolos = normalizeList<any>(protocolosRes.data).filter(
        (p) => !p.deleted_at && String(p.property_id) === String(propertyId),
      );
      const certidoes = normalizeList<any>(certidoesRes.data).filter(
        (c) => !c.deleted_at && String(c.property_id) === String(propertyId),
      );
      setOnrProtocolos(protocolos);
      setOnrCertidoes(certidoes);
    } catch {
      /* ONR data is optional — don't block the screen */
    }
  }, [propertyId, user?.tenant_id]);

  /* ── Fetch service order segmentation: type, category, step, template ── */
  const fetchServiceOrderInfo = useCallback(async () => {
    const soId = serviceOrderId;
    if (!soId) return;
    try {
      const [
        ordersRes,
        typesRes,
        catsRes,
        stepsRes,
        templatesRes,
        customersRes,
      ] = await Promise.all([
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "service_orders",
          ...buildSearchParams([
            { field: "id", value: soId },
            { field: "tenant_id", value: user?.tenant_id },
          ]),
        }),
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "service_types",
          ...buildSearchParams(
            [{ field: "tenant_id", value: user?.tenant_id }],
            { sortColumn: "name" },
          ),
        }),
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "service_categories",
          ...buildSearchParams(
            [{ field: "tenant_id", value: user?.tenant_id }],
            { sortColumn: "name" },
          ),
        }),
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "workflow_steps",
          sort_column: "step_order",
        }),
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "workflow_templates",
          ...buildSearchParams(
            [{ field: "tenant_id", value: user?.tenant_id }],
            { sortColumn: "name" },
          ),
        }),
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "customers",
          ...buildSearchParams(
            [{ field: "tenant_id", value: user?.tenant_id }],
            { sortColumn: "name" },
          ),
        }),
      ]);

      const orders = normalizeList<Record<string, any>>(ordersRes.data);
      const order = orders.find((o) => String(o.id) === String(soId));
      if (!order) return;

      const types = normalizeList<Record<string, any>>(typesRes.data);
      const cats = normalizeList<Record<string, any>>(catsRes.data);
      const steps = normalizeList<Record<string, any>>(stepsRes.data);
      const templates = normalizeList<Record<string, any>>(templatesRes.data);
      const customers = normalizeList<Record<string, any>>(customersRes.data);

      const type = types.find(
        (t) => String(t.id) === String(order.service_type_id ?? ""),
      );
      const category = type
        ? cats.find((c) => String(c.id) === String(type.category_id ?? ""))
        : null;
      const step = steps.find(
        (s) => String(s.id) === String(order.current_step_id ?? ""),
      );
      const template = templates.find(
        (t) => String(t.id) === String(order.template_id ?? ""),
      );
      const customer = order.customer_id
        ? customers.find((c) => String(c.id) === String(order.customer_id))
        : null;

      setOrderInfo({
        typeName: type ? String(type.name ?? "") : null,
        categoryName: category ? String(category.name ?? "") : null,
        stepName: step ? String(step.name ?? "") : null,
        currentStepId: order.current_step_id
          ? String(order.current_step_id)
          : null,
        templateName: template ? String(template.name ?? "") : null,
        processStatus: order.process_status
          ? String(order.process_status)
          : null,
        entityTable: type?.entity_table ? String(type.entity_table) : null,
        orderTitle: order.title ? String(order.title) : null,
        orderDescription: order.description ? String(order.description) : null,
        customerName: customer?.name ? String(customer.name) : null,
        customerCpf: customer?.cpf ? String(customer.cpf) : null,
        estimatedCost:
          order.estimated_cost != null ? Number(order.estimated_cost) : null,
        estimatedDurationDays:
          order.estimated_duration_days != null
            ? Number(order.estimated_duration_days)
            : null,
        estimatedCompletionDate: order.estimated_completion_date
          ? String(order.estimated_completion_date)
          : null,
      });
    } catch {
      /* segmentation info is optional */
    }
  }, [serviceOrderId, user?.tenant_id]);

  const fetchUpdates = useCallback(async () => {
    const soId = serviceOrderId;
    if (!soId && !propertyId) return;
    try {
      // Try new table first (process_updates with service_order_id)
      let list: ProcessUpdate[] = [];

      if (soId) {
        const updatesResponse = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "process_updates",
          ...buildSearchParams([{ field: "service_order_id", value: soId }]),
        });

        const rawUpdates = normalizeList<ProcessUpdate>(updatesResponse.data);
        list = rawUpdates
          .filter((item) => !item.deleted_at)
          .filter(
            (item) => String(item.service_order_id ?? "") === String(soId),
          )
          .sort((a, b) => {
            const ad = new Date(String(a.created_at ?? "")).getTime();
            const bd = new Date(String(b.created_at ?? "")).getTime();
            return (
              (Number.isFinite(bd) ? bd : 0) - (Number.isFinite(ad) ? ad : 0)
            );
          });
      }

      // Fallback to old table if no results and we have propertyId
      if (list.length === 0 && propertyId) {
        try {
          const updatesResponse = await api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "property_process_updates",
            ...buildSearchParams([{ field: "property_id", value: propertyId }]),
          });

          const rawUpdates = normalizeList<ProcessUpdate>(updatesResponse.data);
          list = rawUpdates
            .filter((item) => !item.deleted_at)
            .filter(
              (item) => String(item.property_id ?? "") === String(propertyId),
            )
            .sort((a, b) => {
              const ad = new Date(String(a.created_at ?? "")).getTime();
              const bd = new Date(String(b.created_at ?? "")).getTime();
              return (
                (Number.isFinite(bd) ? bd : 0) - (Number.isFinite(ad) ? ad : 0)
              );
            });
        } catch {
          // old table may be gone
        }
      }

      const updateIds = new Set(list.map((item) => String(item.id ?? "")));

      const mergeFiles = (files: ProcessUpdateFile[]) => {
        if (!files.length) return;
        const filesByUpdate = new Map<string, ProcessUpdateFile[]>();
        files.forEach((file) => {
          const updateId = extractProcessUpdateId(file as any);
          if (!updateId || !updateIds.has(updateId)) return;
          const prev = filesByUpdate.get(updateId) ?? [];
          prev.push(file);
          filesByUpdate.set(updateId, prev);
        });

        list.forEach((update) => {
          const updateId = String(update.id ?? "");
          const related = filesByUpdate.get(updateId) ?? [];
          if (!related.length) return;
          update.process_update_files = related;
        });
      };

      // Fetch files from process_update_files (new table)
      try {
        const filesResponse = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "process_update_files",
        });
        const files = normalizeList<ProcessUpdateFile>(
          filesResponse.data,
        ).filter((file: any) => !file.deleted_at);
        mergeFiles(files);
      } catch {
        // fallback to old table
        try {
          const filesResponse = await api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "property_process_update_files",
          });
          const files = normalizeList<ProcessUpdateFile>(
            filesResponse.data,
          ).filter((file: any) => !file.deleted_at);
          mergeFiles(files);
        } catch {
          // table may not exist
        }
      }

      setUpdates(list);

      const docRequestsByUpdate = new Map<string, DocumentRequest[]>();
      const docResponsesByRequest = new Map<
        string,
        ProcessDocumentResponse[]
      >();

      try {
        const [requestsRes, responsesRes] = await Promise.all([
          api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "process_document_requests",
            ...buildSearchParams([{ field: "service_order_id", value: soId }]),
          }),
          api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "process_document_responses",
          }),
        ]);

        const allRequests = normalizeList<DocumentRequestRow>(requestsRes.data)
          .filter((item) => !item.deleted_at)
          .filter((item) => {
            // Match by service_order_id or property_id
            if (
              soId &&
              String((item as any).service_order_id ?? "") === String(soId)
            )
              return true;
            if (
              propertyId &&
              String(item.property_id ?? "") === String(propertyId)
            )
              return true;
            return false;
          })
          .filter((item) => {
            const updateId = extractProcessUpdateId(item);
            return updateId ? updateIds.has(updateId) : false;
          });

        allRequests.forEach((request) => {
          const updateId = extractProcessUpdateId(request);
          if (!updateId) return;
          const prev = docRequestsByUpdate.get(updateId) ?? [];
          prev.push(request as DocumentRequest);
          docRequestsByUpdate.set(updateId, prev);
        });

        const requestIds = new Set(
          allRequests.map((item) => String(item.id ?? "")),
        );

        const allResponses = normalizeList<ProcessDocumentResponse>(
          responsesRes.data,
        )
          .filter((item) => !item.deleted_at)
          .filter((item) =>
            requestIds.has(String(item.document_request_id ?? "")),
          );

        allResponses.forEach((response) => {
          const requestId = String(response.document_request_id ?? "");
          if (!requestId) return;
          const prev = docResponsesByRequest.get(requestId) ?? [];
          prev.push(response);
          docResponsesByRequest.set(requestId, prev);
        });
      } catch (err) {
        console.error(
          "Erro ao carregar documentos solicitados/respostas:",
          err,
        );
      }

      setDocumentRequests(docRequestsByUpdate);
      setDocumentResponses(docResponsesByRequest);
    } catch (err) {
      setError(getApiErrorMessage(err, "Falha ao carregar atualizações"));
      setUpdates([]);
      setDocumentRequests(new Map());
      setDocumentResponses(new Map());
    }
  }, [propertyId, serviceOrderId]);

  /** Convert a picked file to base64 */
  const fileToBase64 = async (fileUri: string): Promise<string> => {
    if (Platform.OS === "web") {
      const resp = await fetch(fileUri);
      const blob = await resp.blob();
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1] || result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
    // Native: expo-file-system would be needed; for now web-only
    const resp = await fetch(fileUri);
    const blob = await resp.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1] || result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleUploadDocumentRequest = useCallback(
    async (documentRequestId: string, updateId: string) => {
      try {
        setUploadingDocuments((prev) => new Set(prev).add(documentRequestId));

        const result = await DocumentPicker.getDocumentAsync({
          type: ["application/pdf", "image/*"],
          copyToCacheDirectory: true,
        });

        if (result.canceled || !result.assets?.[0]) return;

        const file = result.assets[0];
        const mimeType = file.mimeType ?? "application/octet-stream";

        // Convert to base64 for DB storage
        const base64Data = await fileToBase64(file.uri);

        // Save file record directly via api_crud (database storage)
        // Use process_update_files for service-order flow, property_process_update_files for property flow
        const fileTable = serviceOrderId
          ? "process_update_files"
          : "property_process_update_files";
        const fileResponse = await api.post(CRUD_ENDPOINT, {
          action: "create",
          table: fileTable,
          payload: {
            process_update_id: updateId,
            file_name: file.name,
            mime_type: mimeType,
            file_size: file.size ?? base64Data.length,
            file_data: base64Data,
            storage_type: "database",
            is_client_visible: true,
          },
        });

        const responseData = fileResponse.data?.data || fileResponse.data;
        const fileId = responseData?.id;

        if (fileId) {
          // Create document response and mark request as fulfilled
          const createdResponse = await createDocumentResponse({
            document_request_id: documentRequestId,
            file_name: file.name,
            mime_type: mimeType,
            drive_file_id: fileId,
            drive_web_view_link: "",
            file_data: base64Data,
            storage_type: "database",
          });

          // Persist is_fulfilled in DB so fetchUpdates won't revert it
          updateDocumentRequest(documentRequestId, {
            is_fulfilled: true,
          }).catch((err) =>
            console.warn("Falha ao marcar solicitação como atendida:", err),
          );

          // Optimistically update local state for instant feedback
          setDocumentRequests((prev) => {
            const updated = new Map(prev);
            const docs = updated.get(updateId) || [];
            updated.set(
              updateId,
              docs.map((doc) =>
                doc.id === documentRequestId
                  ? { ...doc, is_fulfilled: true }
                  : doc,
              ),
            );
            return updated;
          });

          // Add new response to local state immediately
          setDocumentResponses((prev) => {
            const updated = new Map(prev);
            const existing = updated.get(documentRequestId) || [];
            updated.set(documentRequestId, [
              ...existing,
              {
                id: createdResponse.id,
                document_request_id: documentRequestId,
                file_name: file.name,
                mime_type: mimeType,
                drive_file_id: fileId,
                file_data: base64Data,
                storage_type: "database",
              },
            ]);
            return updated;
          });

          Alert.alert("Sucesso", "Documento enviado com sucesso!");

          // Sync full state in the background
          fetchUpdates().catch(() => {});
        }
      } catch (err) {
        console.error("Erro ao enviar documento:", err);
        Alert.alert("Erro", "Falha ao enviar documento");
      } finally {
        setUploadingDocuments((prev) => {
          const updated = new Set(prev);
          updated.delete(documentRequestId);
          return updated;
        });
      }
    },
    [fetchUpdates, serviceOrderId],
  );

  /* ── Portal público: gerar / copiar link ──────────────────── */
  const handleSharePortalLink = useCallback(async () => {
    if (!serviceOrderId || !user?.tenant_id) return;
    setPortalLoading(true);
    try {
      // Check if token already exists
      let token = portalToken;
      if (!token) {
        const existing = await listPortalTokens(api, serviceOrderId);
        const active = existing.find((t) => !t.is_revoked);
        if (active) {
          token = active.token;
        } else {
          const result = await createPortalToken(api, {
            entityType: "service_order",
            entityId: serviceOrderId,
            tenantId: user.tenant_id,
            createdBy: user.id,
          });
          token = result.token;
        }
        setPortalToken(token);
      }

      const url = buildPortalUrl(token);
      if (Platform.OS === "web") {
        await Clipboard.setStringAsync(url);
      } else {
        await Clipboard.setStringAsync(url);
      }
      setPortalCopied(true);
      setTimeout(() => setPortalCopied(false), 3000);
    } catch {
      Alert.alert("Erro", "Não foi possível gerar o link de acompanhamento.");
    } finally {
      setPortalLoading(false);
    }
  }, [serviceOrderId, user, portalToken]);

  const handleRevokePortalLink = useCallback(async () => {
    if (!serviceOrderId) return;
    try {
      const existing = await listPortalTokens(api, serviceOrderId);
      for (const t of existing.filter((x) => !x.is_revoked)) {
        await revokePortalToken(api, t.id);
      }
      setPortalToken(null);
      setPortalCopied(false);
      Alert.alert(
        "Link revogado",
        "O link público foi desativado com sucesso.",
      );
    } catch {
      Alert.alert("Erro", "Não foi possível revogar o link.");
    }
  }, [serviceOrderId]);

  const handleSendWhatsApp = useCallback(
    async (type: "portal" | "review") => {
      if (!serviceOrderId || !user?.tenant_id) return;
      setPortalLoading(true);
      try {
        let token = portalToken;
        if (!token) {
          const existing = await listPortalTokens(api, serviceOrderId);
          const active = existing.find((t) => !t.is_revoked);
          if (active) {
            token = active.token;
          } else {
            const result = await createPortalToken(api, {
              entityType: "service_order",
              entityId: serviceOrderId,
              tenantId: user.tenant_id,
              createdBy: user.id,
            });
            token = result.token;
          }
          setPortalToken(token);
        }

        const url =
          type === "review" ? buildReviewUrl(token) : buildPortalUrl(token);
        const title = orderInfo.orderTitle || "seu processo";
        const msg =
          type === "review"
            ? `Olá! Seu processo "${title}" foi concluído. Gostaríamos de saber sua opinião:\n${url}`
            : `Olá! Acompanhe o andamento do seu processo "${title}" pelo link:\n${url}`;

        const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
        await Linking.openURL(waUrl);
      } catch {
        Alert.alert("Erro", "Não foi possível abrir o WhatsApp.");
      } finally {
        setPortalLoading(false);
      }
    },
    [serviceOrderId, user, portalToken, orderInfo.orderTitle],
  );

  /* ── Estimativa: edição inline ──────────────────── */
  const [estimateEditing, setEstimateEditing] = useState(false);
  const [estimateCost, setEstimateCost] = useState("");
  const [estimateDays, setEstimateDays] = useState("");
  const [estimateDate, setEstimateDate] = useState("");
  const [estimateSaving, setEstimateSaving] = useState(false);

  const handleEditEstimate = useCallback(() => {
    setEstimateCost(
      orderInfo.estimatedCost != null
        ? orderInfo.estimatedCost.toFixed(2).replace(".", ",")
        : "",
    );
    setEstimateDays(
      orderInfo.estimatedDurationDays != null
        ? String(orderInfo.estimatedDurationDays)
        : "",
    );
    setEstimateDate(orderInfo.estimatedCompletionDate ?? "");
    setEstimateEditing(true);
  }, [orderInfo]);

  const handleSaveEstimate = useCallback(async () => {
    if (!serviceOrderId) return;
    setEstimateSaving(true);
    try {
      const payload: Record<string, unknown> = { id: serviceOrderId };
      payload.estimated_cost = estimateCost
        ? Number(estimateCost.replace(/\./g, "").replace(",", "."))
        : null;
      payload.estimated_duration_days = estimateDays
        ? Number(estimateDays)
        : null;
      payload.estimated_completion_date = estimateDate || null;

      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "service_orders",
        payload,
      });

      setOrderInfo((prev) => ({
        ...prev,
        estimatedCost: payload.estimated_cost as number | null,
        estimatedDurationDays: payload.estimated_duration_days as number | null,
        estimatedCompletionDate: payload.estimated_completion_date as
          | string
          | null,
      }));
      setEstimateEditing(false);
    } catch {
      Alert.alert("Erro", "Não foi possível salvar a estimativa.");
    } finally {
      setEstimateSaving(false);
    }
  }, [serviceOrderId, estimateCost, estimateDays, estimateDate]);

  const generateAiInsights = useCallback(async () => {
    if (!propertyId) return;

    try {
      setAiLoading(true);
      setAiError(null);

      const visible = updates.filter(
        (update) => update.is_client_visible !== false,
      );

      const sampleUpdates = visible.slice(0, 10).map((update) => {
        const files =
          (Array.isArray(update.files) && update.files) ||
          (Array.isArray(update.process_update_files) &&
            update.process_update_files) ||
          (Array.isArray(update.attachments) && update.attachments) ||
          (Array.isArray(update.client_files) && update.client_files) ||
          [];

        const docs = documentRequests.get(update.id) || [];
        const pendingDocs = docs.filter((doc) => !doc.is_fulfilled).length;

        return {
          id: update.id,
          title: update.title ?? "Atualização",
          created_at: update.created_at ?? null,
          has_description: Boolean(update.description),
          files_count: files.length,
          requested_documents_count: docs.length,
          pending_documents_count: pendingDocs,
        };
      });

      const contextPayload = {
        screen: {
          name: "Servicos/Processo",
          generated_at: new Date().toISOString(),
        },
        actor: {
          user_id: user?.id ?? null,
          role: user?.role ?? null,
          tenant_id: user?.tenant_id ?? null,
        },
        property: property
          ? {
              id: property.id,
              address: property.address ?? null,
              city: property.city ?? null,
              state: property.state ?? null,
            }
          : null,
        process: {
          updates_total: updates.length,
          updates_visible_to_client: visible.length,
          sample_updates: sampleUpdates,
        },
      };

      const message = buildAiInsightMessage(
        contextPayload,
        "Contexto de acompanhamento de processo do imóvel para cliente final.",
      );

      const response = await api.post(AI_AGENT_ENDPOINT, {
        source: "processo_screen_insights",
        prompt: UNIVERSAL_AI_INSIGHT_PROMPT,
        message,
        context: contextPayload,
        user_id: user?.id ?? null,
        tenant_id: user?.tenant_id ?? null,
        property_id: propertyId,
      });

      const insightText = extractAiInsightText(response.data);
      if (!insightText) {
        throw new Error("A IA não retornou conteúdo para exibir");
      }

      setAiInsights(insightText);
    } catch (err) {
      setAiError(getApiErrorMessage(err, "Falha ao consultar a IA"));
      setAiInsights(null);
    } finally {
      setAiLoading(false);
    }
  }, [
    documentRequests,
    property,
    propertyId,
    updates,
    user?.id,
    user?.role,
    user?.tenant_id,
  ]);

  /* ── Fetch existing file-level signatures (+ auto-sync from Documenso) ── */
  const fetchFileSignatures = useCallback(async () => {
    try {
      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "document_signatures",
        ...buildSearchParams([{ field: "tenant_id", value: user?.tenant_id }]),
      });
      const list = normalizeList<any>(res.data).filter(
        (r: any) => !r.deleted_at && r.document_response_id,
      );
      const map = new Map<string, any>();
      list.forEach((row: any) => {
        map.set(String(row.document_response_id), {
          id: row.id,
          status: row.status,
          signingUrl: row.signing_url,
          documensoDocumentId: row.documenso_document_id,
          signingType: row.signing_type,
        });
      });

      // Auto-sync: for items that have a Documenso ID but aren't signed yet
      const toSync = list.filter(
        (r: any) =>
          r.documenso_document_id &&
          r.signing_type !== "icp_brasil" &&
          r.status !== "signed" &&
          r.status !== "rejected" &&
          r.status !== "expired",
      );
      for (const row of toSync) {
        try {
          const docId = Number(row.documenso_document_id);
          const doc = await documensoGetDocument(docId);
          const docStatus = doc?.status?.toUpperCase?.() ?? "";

          let newStatus = row.status;
          let signedAt: string | undefined;
          let updatedSigningUrl: string | undefined;

          try {
            const recipients = await documensoListRecipients(docId);
            const target = recipients[0];
            if (target?.signedAt) {
              newStatus = "signed";
              signedAt = target.signedAt;
            }
            if (target?.signingUrl) {
              updatedSigningUrl = target.signingUrl;
            }
          } catch {
            /* ignore */
          }

          if (docStatus === "COMPLETED" && newStatus !== "signed") {
            newStatus = "signed";
            if (!signedAt) signedAt = new Date().toISOString();
          }

          if (newStatus !== row.status || updatedSigningUrl) {
            const updatePayload: Record<string, unknown> = {
              id: row.id,
              status: newStatus,
            };
            if (signedAt) updatePayload.signed_at = signedAt;
            if (updatedSigningUrl)
              updatePayload.signing_url = updatedSigningUrl;

            await api.post(CRUD_ENDPOINT, {
              action: "update",
              table: "document_signatures",
              payload: updatePayload,
            });

            // Update map with synced data
            const fileKey = String(row.document_response_id);
            map.set(fileKey, {
              ...map.get(fileKey),
              status: newStatus,
              signingUrl: updatedSigningUrl ?? map.get(fileKey)?.signingUrl,
            });
          }
        } catch {
          // ignore sync errors for individual items
        }
      }

      setFileSignatures(map);
    } catch {
      // ignore — signatures section is optional
    }
  }, [user?.tenant_id]);

  /* ── Fetch available OCR configs ── */
  const fetchOcrConfigs = useCallback(async () => {
    try {
      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "ocr_config",
        ...buildSearchParams([{ field: "tenant_id", value: user?.tenant_id }]),
      });
      const list = normalizeList<any>(res.data).filter(
        (r: any) => !r.deleted_at && r.is_active,
      );
      setOcrConfigs(list);
    } catch {
      // ignore
    }
  }, [user?.tenant_id]);

  /* ── Fetch existing OCR results per file ── */
  const fetchFileOcrResults = useCallback(async () => {
    try {
      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "ocr_results",
        ...buildSearchParams([{ field: "tenant_id", value: user?.tenant_id }]),
      });
      const list = normalizeList<any>(res.data).filter(
        (r: any) => !r.deleted_at && r.document_response_id,
      );
      const map = new Map<string, any>();
      list.forEach((row: any) => {
        map.set(String(row.document_response_id), row);
      });
      setFileOcrResults(map);
    } catch {
      // ignore
    }
  }, [user?.tenant_id]);

  /* ── Toggle include_in_protocol flag on a file ── */
  const toggleIncludeInProtocol = useCallback(
    async (file: ProcessUpdateFile) => {
      const newValue = !file.include_in_protocol;
      // Optimistic update
      setUpdates((prev) =>
        prev.map((u) => ({
          ...u,
          files: u.files?.map((f: ProcessUpdateFile) =>
            f.id === file.id ? { ...f, include_in_protocol: newValue } : f,
          ),
          process_update_files: (u as any).process_update_files?.map(
            (f: ProcessUpdateFile) =>
              f.id === file.id ? { ...f, include_in_protocol: newValue } : f,
          ),
        })),
      );
      try {
        const fileTable = serviceOrderId
          ? "process_update_files"
          : "property_process_update_files";
        await api.post(CRUD_ENDPOINT, {
          action: "update",
          table: fileTable,
          payload: { id: file.id, include_in_protocol: newValue },
        });
      } catch (err) {
        console.error("Erro ao atualizar flag de protocolo:", err);
        // Revert
        setUpdates((prev) =>
          prev.map((u) => ({
            ...u,
            files: u.files?.map((f: ProcessUpdateFile) =>
              f.id === file.id ? { ...f, include_in_protocol: !newValue } : f,
            ),
            process_update_files: (u as any).process_update_files?.map(
              (f: ProcessUpdateFile) =>
                f.id === file.id ? { ...f, include_in_protocol: !newValue } : f,
            ),
          })),
        );
      }
    },
    [serviceOrderId],
  );

  /* ── Open OCR analysis modal ── */
  const openOcrModal = async (file: ProcessUpdateFile) => {
    setOcrModalFile(file);
    setOcrSelectedConfig(null);
    setOcrModalVisible(true);
    if (ocrConfigs.length === 0) {
      await fetchOcrConfigs();
    }
  };

  /* ── View OCR result for a file ── */
  const openOcrView = (fileId: string) => {
    const result = fileOcrResults.get(fileId);
    if (result) {
      setOcrViewData(result);
      setOcrAiInsight(null);
      setOcrAiError(null);
      setOcrViewVisible(true);
    }
  };

  /* ── Generate AI insight from OCR extracted text ── */
  const generateOcrAiInsight = useCallback(async () => {
    if (!ocrViewData?.extracted_text) return;

    try {
      setOcrAiLoading(true);
      setOcrAiError(null);

      const contextPayload = {
        screen: {
          name: "Servicos/Processo/OCR_Result",
          generated_at: new Date().toISOString(),
        },
        actor: {
          user_id: user?.id ?? null,
          role: user?.role ?? null,
          tenant_id: user?.tenant_id ?? null,
        },
        property: {
          id: property?.id ?? propertyId,
          address: property?.address ?? null,
          city: property?.city ?? null,
          state: property?.state ?? null,
        },
        ocr_result: {
          confidence: ocrViewData.confidence ?? null,
          extracted_text: ocrViewData.extracted_text,
          extracted_cpf: ocrViewData.extracted_cpf ?? [],
          extracted_cnpj: ocrViewData.extracted_cnpj ?? [],
          extracted_dates: ocrViewData.extracted_dates ?? [],
          extracted_currency: ocrViewData.extracted_currency ?? [],
          processed_at: ocrViewData.processed_at ?? null,
        },
      };

      const message = buildAiInsightMessage(
        contextPayload,
        "Analise o texto extraído via OCR deste documento imobiliário. Identifique informações relevantes, possíveis inconsistências, dados importantes como CPFs, datas, valores e forneça um resumo útil para o operador.",
      );

      const response = await api.post(AI_AGENT_ENDPOINT, {
        source: "ocr_result_ai_insight",
        prompt: UNIVERSAL_AI_INSIGHT_PROMPT,
        message,
        context: contextPayload,
        user_id: user?.id ?? null,
        tenant_id: user?.tenant_id ?? null,
        property_id: propertyId,
      });

      const insightText = extractAiInsightText(response.data);
      if (!insightText) {
        throw new Error("A IA não retornou conteúdo para exibir");
      }

      setOcrAiInsight(insightText);
    } catch (err) {
      setOcrAiError(getApiErrorMessage(err, "Falha ao consultar a IA"));
      setOcrAiInsight(null);
    } finally {
      setOcrAiLoading(false);
    }
  }, [
    ocrViewData,
    property,
    propertyId,
    user?.id,
    user?.role,
    user?.tenant_id,
  ]);

  /* ── Run OCR analysis ── */
  const handleRunOcrAnalysis = async () => {
    if (!ocrModalFile || !ocrSelectedConfig) return;

    const config = ocrConfigs.find(
      (c: any) => String(c.id) === ocrSelectedConfig,
    );
    if (!config) return;

    setOcrLoading(true);
    try {
      let base64: string | null = null;

      // Prefer DB-stored file_data (no CORS issues)
      if (ocrModalFile.file_data && ocrModalFile.file_data.length > 0) {
        base64 = ocrModalFile.file_data;
      } else {
        // Fallback: try fetching from URL (may fail due to CORS)
        const fileUrl =
          ocrModalFile.url ||
          ocrModalFile.drive_web_view_link ||
          ocrModalFile.drive_web_content_link;

        if (!fileUrl) {
          Alert.alert("Erro", "Arquivo sem dados disponíveis para análise.");
          return;
        }

        try {
          const response = await fetch(fileUrl);
          const blob = await response.blob();
          base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = reader.result as string;
              resolve(result.split(",")[1] || result);
            };
            reader.readAsDataURL(blob);
          });
        } catch {
          Alert.alert(
            "Erro",
            "Não foi possível acessar o arquivo. Arquivos do Google Drive não podem ser lidos diretamente. Faça re-upload do arquivo para armazenar no banco.",
          );
          return;
        }
      }

      if (!base64) {
        Alert.alert("Erro", "Não foi possível obter os dados do arquivo.");
        return;
      }

      const dataUri = `data:${ocrModalFile.mime_type || "image/png"};base64,${base64}`;

      // If the file is a PDF, convert pages to images first
      let ocrResult: { text: string; confidence: number };

      if (isPdf(ocrModalFile.mime_type)) {
        // Convert PDF pages to PNG images
        const pageImages = await pdfToImages(base64, 2);
        if (pageImages.length === 0) {
          Alert.alert("Erro", "Não foi possível renderizar as páginas do PDF.");
          return;
        }

        // OCR each page and combine results
        let combinedText = "";
        let totalConfidence = 0;

        for (const pageImg of pageImages) {
          const pageResult = await recognizeText(
            pageImg.dataUri,
            config.lang || "por",
          );
          combinedText +=
            (combinedText
              ? "\n\n--- Página " + pageImg.page + " ---\n\n"
              : "") + pageResult.text;
          totalConfidence += pageResult.confidence;
        }

        ocrResult = {
          text: combinedText,
          confidence: totalConfidence / pageImages.length,
        };
      } else {
        // Image file — OCR directly
        ocrResult = await recognizeText(dataUri, config.lang || "por");
      }

      // Extract structured data based on config features
      const features: string[] = Array.isArray(config.extract_features)
        ? config.extract_features
        : [];
      const extractedCpf = features.includes("cpf")
        ? extractCpf(ocrResult.text)
        : [];
      const extractedCnpj = features.includes("cnpj")
        ? extractCnpj(ocrResult.text)
        : [];
      const extractedDates =
        features.includes("data") || features.includes("dates")
          ? extractDates(ocrResult.text)
          : [];
      const extractedCurrency =
        features.includes("valor") || features.includes("currency")
          ? extractCurrency(ocrResult.text)
          : [];

      // Save to database
      const saveRes = await api.post(CRUD_ENDPOINT, {
        action: "create",
        table: "ocr_results",
        payload: {
          tenant_id: user?.tenant_id ?? null,
          document_response_id: ocrModalFile.id,
          extracted_text: ocrResult.text,
          confidence: ocrResult.confidence,
          extracted_cpf: JSON.stringify(extractedCpf),
          extracted_cnpj: JSON.stringify(extractedCnpj),
          extracted_dates: JSON.stringify(extractedDates),
          extracted_currency: JSON.stringify(extractedCurrency),
          ocr_config_id: config.id,
          lang: config.lang || "por",
          processed_at: new Date().toISOString(),
        },
      });

      const newRow = saveRes.data?.data || saveRes.data;

      // Update local state
      setFileOcrResults((prev) => {
        const updated = new Map(prev);
        updated.set(ocrModalFile.id, {
          id: newRow?.id,
          extracted_text: ocrResult.text,
          confidence: ocrResult.confidence,
          extracted_cpf: extractedCpf,
          extracted_cnpj: extractedCnpj,
          extracted_dates: extractedDates,
          extracted_currency: extractedCurrency,
          lang: config.lang || "por",
          processed_at: new Date().toISOString(),
        });
        return updated;
      });

      setOcrModalVisible(false);
      Alert.alert(
        "Análise concluída",
        `Texto extraído com ${ocrResult.confidence.toFixed(0)}% de confiança.\n` +
          (extractedCpf.length > 0
            ? `CPFs: ${extractedCpf.join(", ")}\n`
            : "") +
          (extractedCnpj.length > 0
            ? `CNPJs: ${extractedCnpj.join(", ")}\n`
            : "") +
          (extractedDates.length > 0
            ? `Datas: ${extractedDates.join(", ")}\n`
            : "") +
          (extractedCurrency.length > 0
            ? `Valores: ${extractedCurrency.join(", ")}`
            : ""),
      );
    } catch (err) {
      const msg = getApiErrorMessage(err, "Falha na análise OCR");
      Alert.alert("Erro", msg);
    } finally {
      setOcrLoading(false);
    }
  };

  /* ── Fetch available signers (users + customers of the tenant) ── */
  const fetchAvailableSigners = useCallback(async () => {
    setSignersLoading(true);
    try {
      const [usersRes, customersRes] = await Promise.all([
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "users",
          ...buildSearchParams(
            user?.tenant_id
              ? [{ field: "tenant_id", value: user.tenant_id }]
              : [],
            { sortColumn: "name ASC" },
          ),
        }),
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "customers",
          ...buildSearchParams(
            user?.tenant_id
              ? [{ field: "tenant_id", value: user.tenant_id }]
              : [],
            { sortColumn: "name ASC" },
          ),
        }),
      ]);
      const users = normalizeList<any>(usersRes.data).filter(
        (u: any) => !u.deleted_at && u.email,
      );
      const customers = normalizeList<any>(customersRes.data).filter(
        (c: any) => !c.deleted_at && c.email,
      );
      const signers: SignerOption[] = [
        ...users.map((u: any) => ({
          id: `user_${u.id}`,
          name: u.name || u.email,
          email: u.email,
          source: "user" as const,
        })),
        ...customers.map((c: any) => ({
          id: `customer_${c.id}`,
          name: c.name || c.email,
          email: c.email,
          source: "customer" as const,
        })),
      ];
      setAvailableSigners(signers);
    } catch {
      // fallback: empty list, user can still proceed with logged-in user
    } finally {
      setSignersLoading(false);
    }
  }, [user?.tenant_id]);

  /* ── Open signature request modal for a file ── */
  const openSignModal = (file: ProcessUpdateFile) => {
    setSignModalFile(file);
    setSignModalType("documenso");
    setSignModalDesc("");
    setSelectedSignerIds(new Set());
    setSignerSearch("");
    setSignModalVisible(true);
    fetchAvailableSigners();
  };

  /* ── Sync a single file signature status from Documenso ── */
  const syncFileSignatureStatus = async (fileId: string) => {
    const sig = fileSignatures.get(fileId);
    if (!sig || !sig.documensoDocumentId) return;

    setSyncingFileId(fileId);
    try {
      const doc = await documensoGetDocument(sig.documensoDocumentId);
      const docStatus = doc?.status?.toUpperCase?.() ?? "";

      let newStatus = sig.status;
      let signedAt: string | undefined;
      let signingUrl: string | undefined;

      // Also check recipient-level for signing URL & signedAt
      try {
        const recipients = await documensoListRecipients(
          sig.documensoDocumentId,
        );
        const target = recipients[0];
        if (target?.signedAt) {
          newStatus = "signed";
          signedAt = target.signedAt;
        }
        if (target?.signingUrl) {
          signingUrl = target.signingUrl;
        }
      } catch {
        // fallback to doc-level status
      }

      if (docStatus === "COMPLETED") {
        newStatus = "signed";
        if (!signedAt) signedAt = new Date().toISOString();
      } else if (docStatus === "PENDING" && newStatus !== "signed") {
        newStatus = "sent";
      }

      // Update DB
      const updatePayload: Record<string, unknown> = {
        id: sig.id,
        status: newStatus,
      };
      if (signedAt) updatePayload.signed_at = signedAt;
      if (signingUrl) updatePayload.signing_url = signingUrl;

      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "document_signatures",
        payload: updatePayload,
      });

      // Update local state
      setFileSignatures((prev) => {
        const updated = new Map(prev);
        updated.set(fileId, {
          ...sig,
          status: newStatus,
          signingUrl: signingUrl ?? sig.signingUrl,
        });
        return updated;
      });

      const label =
        newStatus === "signed"
          ? "Assinado ✓"
          : newStatus === "sent"
            ? "Enviado"
            : newStatus;
      Alert.alert("Status atualizado", `Status atual: ${label}`);
    } catch (err) {
      const msg = getApiErrorMessage(err, "Erro ao sincronizar");
      Alert.alert("Erro", msg);
    } finally {
      setSyncingFileId(null);
    }
  };

  /* ── Submit signature request ── */
  const handleSubmitSignatureRequest = async () => {
    if (!signModalFile) return;

    // Build list of signers: selected ones, or fallback to logged-in user
    const signers: { name: string; email: string }[] = [];
    if (selectedSignerIds.size > 0) {
      for (const sid of selectedSignerIds) {
        const s = availableSigners.find((a) => a.id === sid);
        if (s) signers.push({ name: s.name, email: s.email });
      }
    }
    if (signers.length === 0) {
      signers.push({
        name: user?.name ?? user?.email ?? "Cliente",
        email: user?.email ?? "",
      });
    }

    setSignModalLoading(true);
    try {
      const fileUrl =
        signModalFile.url ||
        signModalFile.drive_web_view_link ||
        signModalFile.drive_web_content_link;

      const docTitle = signModalDesc
        ? `${signModalFile.file_name || "Documento"} — ${signModalDesc}`
        : `${signModalFile.file_name || "Documento"} - ${property?.address || orderInfo.typeName || "Processo"}`;

      // Create one signature record per signer
      let lastSignatureId: string | undefined;
      let documensoDocId: number | undefined;
      let signingUrl: string | undefined;

      for (const signer of signers) {
        const createRes = await api.post(CRUD_ENDPOINT, {
          action: "create",
          table: "document_signatures",
          payload: {
            tenant_id: user?.tenant_id ?? null,
            document_response_id: signModalFile.id,
            signer_name: signer.name,
            signer_email: signer.email,
            document_title: docTitle,
            signing_type: signModalType,
            status: "pending",
            notes: signModalDesc || null,
            created_by: user?.id ?? null,
          },
        });
        const newRow = createRes.data?.data || createRes.data;
        lastSignatureId = newRow?.id;
      }

      // If the file has content and type is documenso, try to create via Documenso
      if (signModalType === "documenso") {
        try {
          let base64: string | undefined;

          if (signModalFile.file_data && signModalFile.file_data.length > 0) {
            base64 = signModalFile.file_data;
          } else if (fileUrl) {
            try {
              const fileResponse = await fetch(fileUrl);
              const blob = await fileResponse.blob();
              base64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                  const result = reader.result as string;
                  resolve(result.split(",")[1] || result);
                };
                reader.readAsDataURL(blob);
              });
            } catch {
              // CORS or network error
            }
          }

          if (!base64) {
            console.warn("Sem dados do arquivo para enviar ao Documenso");
            throw new Error("Arquivo sem dados disponíveis");
          }

          const result = await createAndSendDocument(
            docTitle,
            base64,
            signers.map((s) => ({ name: s.name, email: s.email })),
          );

          documensoDocId = result.document.id;

          if (result.recipients.length > 0) {
            try {
              signingUrl = await documensoGetSigningUrl(
                result.document.id,
                result.recipients[0].id,
              );
            } catch {
              // signingUrl may not be available yet
            }
          }

          // Update all signature records with Documenso IDs
          // Re-fetch to get all IDs for this file
          const sigRes = await api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "document_signatures",
            ...buildSearchParams([
              { field: "document_response_id", value: signModalFile.id },
              { field: "status", value: "pending" },
              { field: "tenant_id", value: user?.tenant_id },
            ]),
          });
          const sigRows = normalizeList<any>(sigRes.data).filter(
            (r: any) => !r.deleted_at,
          );
          for (const row of sigRows) {
            await api.post(CRUD_ENDPOINT, {
              action: "update",
              table: "document_signatures",
              payload: {
                id: row.id,
                documenso_document_id: documensoDocId,
                signing_url: signingUrl,
                status: "sent",
                sent_at: new Date().toISOString(),
              },
            });
          }
        } catch (docErr) {
          console.warn(
            "Documenso auto-send failed, signatures saved as pending:",
            docErr,
          );
        }
      }

      // Update local state
      setFileSignatures((prev) => {
        const updated = new Map(prev);
        updated.set(signModalFile.id, {
          id: lastSignatureId ?? "",
          status: documensoDocId ? "sent" : "pending",
          signingUrl,
          documensoDocumentId: documensoDocId,
          signingType: signModalType,
        });
        return updated;
      });

      setSignModalVisible(false);
      const signerNames = signers.map((s) => s.name).join(", ");
      Alert.alert(
        "Assinatura solicitada",
        documensoDocId
          ? `Solicitação enviada via Documenso para: ${signerNames}`
          : `Registro de assinatura criado para: ${signerNames}`,
      );
    } catch (err) {
      const msg = getApiErrorMessage(err, "Falha ao solicitar assinatura");
      Alert.alert("Erro", msg);
    } finally {
      setSignModalLoading(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([
          fetchProperty(),
          fetchUpdates(),
          fetchFileSignatures(),
          fetchOcrConfigs(),
          fetchFileOcrResults(),
          fetchOnrData(),
          fetchServiceOrderInfo(),
        ]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [
    fetchProperty,
    fetchUpdates,
    fetchFileSignatures,
    fetchOcrConfigs,
    fetchFileOcrResults,
    fetchOnrData,
    fetchServiceOrderInfo,
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
        <ThemedText style={{ marginTop: 12 }}>
          Carregando atualizações...
        </ThemedText>
      </ThemedView>
    );
  }

  /* Property is now optional — screen works with just serviceOrderId */

  const visibleUpdates = updates.filter(
    (update) => update.is_client_visible !== false,
  );

  /* ── Compute primary title: service type name > order title > property address ── */
  const primaryTitle =
    orderInfo.typeName ||
    orderInfo.orderTitle ||
    (property ? property.address || "Processo" : "Processo");
  const primarySubtitle = (() => {
    const parts: string[] = [];
    if (orderInfo.categoryName) parts.push(orderInfo.categoryName);
    if (orderInfo.customerName) {
      let custLabel = orderInfo.customerName;
      if (orderInfo.customerCpf) custLabel += ` · ${orderInfo.customerCpf}`;
      parts.push(custLabel);
    }
    if (!parts.length && property) {
      parts.push([property.city, property.state].filter(Boolean).join(" / "));
    }
    return parts.join(" — ");
  })();

  return (
    <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 32 }}>
      {/* ── Header: Serviço adquirido ── */}
      <ThemedView
        style={[styles.processCard, { backgroundColor: cardBackground }]}
      >
        <ThemedText style={[styles.processTitle, { color: titleTextColor }]}>
          {primaryTitle}
        </ThemedText>
        {primarySubtitle ? (
          <ThemedText
            style={[styles.processSubtitle, { color: mutedTextColor }]}
          >
            {primarySubtitle}
          </ThemedText>
        ) : null}

        {/* ── Segmentation: Category / Type / Step / Status ── */}
        {(orderInfo.stepName || orderInfo.processStatus) && (
          <View
            style={{
              marginTop: 8,
              paddingTop: 8,
              borderTopWidth: 1,
              borderTopColor: cardBorderColor,
              gap: 4,
            }}
          >
            {orderInfo.stepName && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Ionicons
                  name="git-branch-outline"
                  size={14}
                  color={tintColor}
                />
                <View
                  style={{
                    backgroundColor: tintColor + "20",
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 6,
                  }}
                >
                  <ThemedText
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: tintColor,
                    }}
                  >
                    {orderInfo.stepName}
                  </ThemedText>
                </View>
              </View>
            )}
            {orderInfo.processStatus && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 2,
                }}
              >
                <Ionicons
                  name="ellipse"
                  size={10}
                  color={
                    orderInfo.processStatus === "active"
                      ? "#22c55e"
                      : orderInfo.processStatus === "finished"
                        ? "#6b7280"
                        : orderInfo.processStatus === "paused"
                          ? "#f59e0b"
                          : "#3b82f6"
                  }
                />
                <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                  {orderInfo.processStatus === "active"
                    ? "Em andamento"
                    : orderInfo.processStatus === "finished"
                      ? "Concluído"
                      : orderInfo.processStatus === "paused"
                        ? "Pausado"
                        : orderInfo.processStatus === "cancelled"
                          ? "Cancelado"
                          : orderInfo.processStatus}
                </ThemedText>
              </View>
            )}
            {property && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 2,
                }}
              >
                <Ionicons
                  name="home-outline"
                  size={14}
                  color={mutedTextColor}
                />
                <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                  {[property.address, property.city, property.state]
                    .filter(Boolean)
                    .join(", ")}
                </ThemedText>
              </View>
            )}
          </View>
        )}
        {/* ── Portal público: ações rápidas ── */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 6,
            marginTop: 10,
            paddingTop: 10,
            borderTopWidth: 1,
            borderTopColor: cardBorderColor,
          }}
        >
          <TouchableOpacity
            onPress={handleSharePortalLink}
            disabled={portalLoading}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              backgroundColor: portalCopied ? "#22c55e" : tintColor,
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 6,
              opacity: portalLoading ? 0.6 : 1,
            }}
          >
            {portalLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons
                name={portalCopied ? "checkmark-circle" : "link-outline"}
                size={14}
                color="#fff"
              />
            )}
            <ThemedText
              style={{ fontSize: 12, fontWeight: "600", color: "#fff" }}
            >
              {portalCopied ? "Copiado!" : "Copiar Link"}
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleSendWhatsApp("portal")}
            disabled={portalLoading}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              backgroundColor: "#25D366",
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 6,
              opacity: portalLoading ? 0.6 : 1,
            }}
          >
            <Ionicons name="logo-whatsapp" size={14} color="#fff" />
            <ThemedText
              style={{ fontSize: 12, fontWeight: "600", color: "#fff" }}
            >
              WhatsApp
            </ThemedText>
          </TouchableOpacity>
          {(orderInfo.processStatus === "completed" ||
            orderInfo.processStatus === "finished") && (
            <TouchableOpacity
              onPress={() => handleSendWhatsApp("review")}
              disabled={portalLoading}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                backgroundColor: "#f59e0b",
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 6,
                opacity: portalLoading ? 0.6 : 1,
              }}
            >
              <Ionicons name="star" size={14} color="#fff" />
              <ThemedText
                style={{ fontSize: 12, fontWeight: "600", color: "#fff" }}
              >
                Avaliação
              </ThemedText>
            </TouchableOpacity>
          )}
          {portalToken && (
            <TouchableOpacity
              onPress={handleRevokePortalLink}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 3,
                paddingHorizontal: 8,
                paddingVertical: 5,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: "#ef4444",
              }}
            >
              <Ionicons name="close-circle-outline" size={14} color="#ef4444" />
              <ThemedText style={{ fontSize: 11, color: "#ef4444" }}>
                Revogar
              </ThemedText>
            </TouchableOpacity>
          )}
        </View>
      </ThemedView>

      {/* ── Estimativa de prazo / custo ── */}
      <ThemedView
        style={[styles.processCard, { backgroundColor: cardBackground }]}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="calculator-outline" size={16} color={tintColor} />
            <ThemedText
              style={{ fontSize: 14, fontWeight: "600", color: titleTextColor }}
            >
              Estimativa
            </ThemedText>
          </View>
          <TouchableOpacity
            onPress={estimateEditing ? handleSaveEstimate : handleEditEstimate}
            disabled={estimateSaving}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              backgroundColor: estimateEditing ? "#22c55e" : tintColor + "15",
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 6,
            }}
          >
            {estimateSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons
                name={estimateEditing ? "checkmark" : "create-outline"}
                size={14}
                color={estimateEditing ? "#fff" : tintColor}
              />
            )}
            <ThemedText
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: estimateEditing ? "#fff" : tintColor,
              }}
            >
              {estimateEditing ? "Salvar" : "Editar"}
            </ThemedText>
          </TouchableOpacity>
        </View>

        {estimateEditing ? (
          <View style={{ gap: 10 }}>
            <View>
              <ThemedText
                style={{ fontSize: 12, color: mutedTextColor, marginBottom: 4 }}
              >
                Custo estimado (R$)
              </ThemedText>
              <TextInput
                value={estimateCost}
                onChangeText={setEstimateCost}
                placeholder="0,00"
                keyboardType="decimal-pad"
                style={{
                  borderWidth: 1,
                  borderColor: cardBorderColor,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  fontSize: 14,
                  color: titleTextColor,
                  backgroundColor: innerCardBackground,
                }}
                placeholderTextColor={mutedTextColor}
              />
            </View>
            <View>
              <ThemedText
                style={{ fontSize: 12, color: mutedTextColor, marginBottom: 4 }}
              >
                Prazo estimado (dias úteis)
              </ThemedText>
              <TextInput
                value={estimateDays}
                onChangeText={setEstimateDays}
                placeholder="Ex: 30"
                keyboardType="number-pad"
                style={{
                  borderWidth: 1,
                  borderColor: cardBorderColor,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  fontSize: 14,
                  color: titleTextColor,
                  backgroundColor: innerCardBackground,
                }}
                placeholderTextColor={mutedTextColor}
              />
            </View>
            <View>
              <ThemedText
                style={{ fontSize: 12, color: mutedTextColor, marginBottom: 4 }}
              >
                Data prevista de conclusão
              </ThemedText>
              <TextInput
                value={estimateDate}
                onChangeText={setEstimateDate}
                placeholder="AAAA-MM-DD"
                style={{
                  borderWidth: 1,
                  borderColor: cardBorderColor,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  fontSize: 14,
                  color: titleTextColor,
                  backgroundColor: innerCardBackground,
                }}
                placeholderTextColor={mutedTextColor}
              />
            </View>
            {estimateEditing && (
              <TouchableOpacity
                onPress={() => setEstimateEditing(false)}
                style={{ alignSelf: "flex-start", paddingVertical: 4 }}
              >
                <ThemedText style={{ fontSize: 12, color: "#ef4444" }}>
                  Cancelar
                </ThemedText>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={{ gap: 6 }}>
            {[
              {
                label: "Custo estimado",
                value:
                  orderInfo.estimatedCost != null
                    ? `R$ ${orderInfo.estimatedCost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                    : null,
                icon: "cash-outline" as const,
              },
              {
                label: "Prazo estimado",
                value:
                  orderInfo.estimatedDurationDays != null
                    ? `${orderInfo.estimatedDurationDays} dias úteis`
                    : null,
                icon: "time-outline" as const,
              },
              {
                label: "Previsão de conclusão",
                value: orderInfo.estimatedCompletionDate
                  ? formatDate(orderInfo.estimatedCompletionDate)
                  : null,
                icon: "calendar-outline" as const,
              },
            ].map((item) => (
              <View
                key={item.label}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Ionicons name={item.icon} size={14} color={mutedTextColor} />
                <ThemedText style={{ fontSize: 13, color: mutedTextColor }}>
                  {item.label}:
                </ThemedText>
                <ThemedText
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: item.value ? titleTextColor : mutedTextColor,
                  }}
                >
                  {item.value ?? "Não informado"}
                </ThemedText>
              </View>
            ))}
          </View>
        )}
      </ThemedView>

      {/* ── Orçamentos ── */}
      {serviceOrderId && (
        <QuoteSection
          authApi={api}
          serviceOrderId={serviceOrderId}
          tenantId={user.tenant_id}
          userId={user.id}
          partnerId={(user as any)?.partner_id ?? null}
          workflowStepId={orderInfo.currentStepId}
          orderTitle={orderInfo.orderTitle}
        />
      )}

      {/* ── Dados do Imóvel ── */}
      {property && (
        <ThemedView
          style={[styles.processCard, { backgroundColor: cardBackground }]}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginBottom: 8,
            }}
          >
            <Ionicons name="home-outline" size={16} color={tintColor} />
            <ThemedText
              style={{ fontSize: 14, fontWeight: "600", color: titleTextColor }}
            >
              Dados do Imóvel
            </ThemedText>
          </View>

          {[
            {
              label: "Endereço",
              value: [property.address, property.number]
                .filter(Boolean)
                .join(", "),
              icon: "location-outline" as const,
            },
            {
              label: "Complemento",
              value: property.complement,
              icon: "layers-outline" as const,
            },
            {
              label: "CEP",
              value: property.postal_code
                ? String(property.postal_code).replace(
                    /^(\d{5})(\d{3})$/,
                    "$1-$2",
                  )
                : null,
              icon: "mail-outline" as const,
            },
            {
              label: "Cidade / UF",
              value: [property.city, property.state]
                .filter(Boolean)
                .join(" / "),
              icon: "map-outline" as const,
            },
            {
              label: "Zona",
              value: property.city_rural,
              icon: "earth-outline" as const,
            },
            {
              label: "CPF / CNPJ do proprietário",
              value: property.cpf
                ? String(property.cpf).length === 11
                  ? String(property.cpf).replace(
                      /^(\d{3})(\d{3})(\d{3})(\d{2})$/,
                      "$1.$2.$3-$4",
                    )
                  : String(property.cpf).replace(
                      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
                      "$1.$2.$3/$4-$5",
                    )
                : null,
              icon: "person-outline" as const,
            },
            {
              label: "Tipo de proprietário",
              value:
                property.owner_kind === "cpf"
                  ? "Pessoa Física"
                  : property.owner_kind === "cnpj"
                    ? "Pessoa Jurídica"
                    : property.owner_kind,
              icon: "briefcase-outline" as const,
            },
            {
              label: "Valor do imóvel",
              value: property.property_value
                ? `R$ ${Number(property.property_value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                : null,
              icon: "cash-outline" as const,
            },
            {
              label: "Possui matrícula",
              value:
                property.has_registry === true
                  ? "Sim"
                  : property.has_registry === false
                    ? "Não"
                    : null,
              icon: "document-outline" as const,
            },
            {
              label: "Possui contrato",
              value:
                property.has_contract === true
                  ? "Sim"
                  : property.has_contract === false
                    ? "Não"
                    : null,
              icon: "clipboard-outline" as const,
            },
            {
              label: "Parte de área maior",
              value:
                property.part_of_larger_area === true
                  ? "Sim"
                  : property.part_of_larger_area === false
                    ? "Não"
                    : null,
              icon: "resize-outline" as const,
            },
          ]
            .filter((item) => item.value)
            .map((item) => (
              <View
                key={item.label}
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 6,
                  paddingVertical: 4,
                  borderBottomWidth: 0.5,
                  borderBottomColor: cardBorderColor + "40",
                }}
              >
                <Ionicons
                  name={item.icon}
                  size={14}
                  color={mutedTextColor}
                  style={{ marginTop: 2 }}
                />
                <View style={{ flex: 1 }}>
                  <ThemedText
                    style={{
                      fontSize: 11,
                      color: mutedTextColor,
                      marginBottom: 1,
                    }}
                  >
                    {item.label}
                  </ThemedText>
                  <ThemedText
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: titleTextColor,
                    }}
                  >
                    {item.value}
                  </ThemedText>
                </View>
              </View>
            ))}
        </ThemedView>
      )}

      {/* ── ONR Protocol & Certificate Status ── */}
      {(onrProtocolos.length > 0 || onrCertidoes.length > 0) && (
        <ThemedView
          style={[styles.processCard, { backgroundColor: cardBackground }]}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginBottom: 8,
            }}
          >
            <Ionicons
              name="document-text-outline"
              size={16}
              color={tintColor}
            />
            <ThemedText
              style={{ fontSize: 14, fontWeight: "600", color: titleTextColor }}
            >
              Registro ONR
            </ThemedText>
          </View>

          {onrProtocolos.map((p) => {
            const statusColors: Record<string, string> = {
              rascunho: "#888",
              submetido: "#f59e0b",
              em_analise: "#3b82f6",
              exigencia: "#ef4444",
              registrado: "#22c55e",
              cancelado: "#ef4444",
            };
            const statusLabel: Record<string, string> = {
              rascunho: "Rascunho",
              submetido: "Submetido",
              em_analise: "Em análise",
              exigencia: "Exigência",
              registrado: "Registrado",
              cancelado: "Cancelado",
            };
            const color = statusColors[p.status] ?? "#888";
            return (
              <View
                key={p.id}
                style={{
                  borderWidth: 1,
                  borderColor: cardBorderColor,
                  borderRadius: 8,
                  padding: 10,
                  marginBottom: 8,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <ThemedText
                    style={{ fontWeight: "700", color: titleTextColor }}
                  >
                    Protocolo {p.protocolo_onr || "—"}
                  </ThemedText>
                  <View
                    style={{
                      backgroundColor: `${color}22`,
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 12,
                    }}
                  >
                    <ThemedText
                      style={{ fontSize: 11, fontWeight: "600", color }}
                    >
                      {statusLabel[p.status] ?? p.status}
                    </ThemedText>
                  </View>
                </View>
                {p.tipo_protocolo ? (
                  <ThemedText
                    style={{
                      fontSize: 12,
                      color: mutedTextColor,
                      marginTop: 4,
                    }}
                  >
                    Tipo: {p.tipo_protocolo}
                  </ThemedText>
                ) : null}
                {p.cartorio_nome ? (
                  <ThemedText
                    style={{
                      fontSize: 12,
                      color: mutedTextColor,
                      marginTop: 2,
                    }}
                  >
                    Cartório: {p.cartorio_nome}
                  </ThemedText>
                ) : null}
                {p.exigencias &&
                Array.isArray(p.exigencias) &&
                p.exigencias.length > 0 ? (
                  <View style={{ marginTop: 6 }}>
                    <ThemedText
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        color: "#ef4444",
                      }}
                    >
                      Exigências pendentes:
                    </ThemedText>
                    {p.exigencias.map((ex: string, i: number) => (
                      <ThemedText
                        key={i}
                        style={{
                          fontSize: 12,
                          color: mutedTextColor,
                          marginLeft: 8,
                        }}
                      >
                        • {ex}
                      </ThemedText>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}

          {onrCertidoes.map((c) => (
            <View
              key={c.id}
              style={{
                borderWidth: 1,
                borderColor: cardBorderColor,
                borderRadius: 8,
                padding: 10,
                marginBottom: 8,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <ThemedText
                  style={{ fontWeight: "700", color: titleTextColor, flex: 1 }}
                >
                  Certidão: {c.tipo_certidao || "—"}
                </ThemedText>
                <View
                  style={{
                    backgroundColor:
                      c.status === "emitida" ? "#22c55e22" : "#f59e0b22",
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 12,
                  }}
                >
                  <ThemedText
                    style={{
                      fontSize: 11,
                      fontWeight: "600",
                      color: c.status === "emitida" ? "#22c55e" : "#f59e0b",
                    }}
                  >
                    {c.status ?? "pendente"}
                  </ThemedText>
                </View>
              </View>
              {c.cartorio ? (
                <ThemedText
                  style={{ fontSize: 12, color: mutedTextColor, marginTop: 4 }}
                >
                  Cartório: {c.cartorio}
                </ThemedText>
              ) : null}
            </View>
          ))}
        </ThemedView>
      )}

      <ThemedView
        style={[styles.processCard, { backgroundColor: cardBackground }]}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <ThemedText
            style={{ fontSize: 14, fontWeight: "600", color: titleTextColor }}
          >
            Atualizações
          </ThemedText>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Administrador/lancamentos-processos",
                  params: {
                    serviceOrderId: serviceOrderId ?? "",
                    lockProperty: "1",
                  },
                } as any)
              }
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 8,
                backgroundColor: "#10b981",
              }}
            >
              <Ionicons name="add-circle-outline" size={14} color="white" />
              <ThemedText
                style={{ color: "white", fontSize: 12, fontWeight: "700" }}
              >
                Lançar
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={generateAiInsights}
              disabled={aiLoading}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 8,
                backgroundColor: aiLoading ? `${tintColor}33` : tintColor,
              }}
            >
              {aiLoading ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <ThemedText
                  style={{ color: "white", fontSize: 12, fontWeight: "700" }}
                >
                  ✨ IA
                </ThemedText>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {aiError ? (
          <ThemedText style={{ color: tintColor, marginBottom: 8 }}>
            {aiError}
          </ThemedText>
        ) : null}

        {aiInsights ? (
          <View
            style={{
              marginBottom: 10,
              borderWidth: 1,
              borderColor: cardBorderColor,
              borderRadius: 8,
              padding: 10,
              backgroundColor: innerCardBackground,
            }}
          >
            <ThemedText
              style={{ fontSize: 12, fontWeight: "700", color: bodyTextColor }}
            >
              Insights da IA
            </ThemedText>
            <ThemedText
              style={{ fontSize: 12, color: bodyTextColor, marginTop: 6 }}
            >
              {aiInsights}
            </ThemedText>
          </View>
        ) : null}

        {visibleUpdates.length === 0 ? (
          <ThemedText style={{ color: mutedTextColor }}>
            {error
              ? "Não foi possível carregar as atualizações."
              : "Nenhuma atualização publicada ainda."}
          </ThemedText>
        ) : (
          <View style={{ gap: 12 }}>
            {visibleUpdates.map((update) => (
              <View
                key={update.id}
                style={{
                  padding: 12,
                  borderWidth: 1,
                  borderColor: cardBorderColor,
                  borderRadius: 8,
                  backgroundColor: innerCardBackground,
                }}
              >
                <ThemedText
                  style={{
                    fontWeight: "700",
                    fontSize: 14,
                    color: bodyTextColor,
                  }}
                >
                  {update.title || "Atualização"}
                </ThemedText>
                {update.description ? (
                  <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                    {update.description}
                  </ThemedText>
                ) : null}
                {update.created_at ? (
                  <ThemedText style={{ fontSize: 11, color: mutedTextColor }}>
                    Publicado em {formatDate(update.created_at)}
                  </ThemedText>
                ) : null}

                {(() => {
                  const files =
                    (Array.isArray(update.files) && update.files) ||
                    (Array.isArray(update.process_update_files) &&
                      update.process_update_files) ||
                    (Array.isArray(update.attachments) && update.attachments) ||
                    (Array.isArray(update.client_files) &&
                      update.client_files) ||
                    [];

                  if (files.length === 0) return null;

                  return (
                    <View style={{ marginTop: 8, gap: 6 }}>
                      {files
                        .filter((file) => file.is_client_visible !== false)
                        .map((file) => {
                          const externalUrl =
                            file.url ||
                            file.drive_web_view_link ||
                            file.drive_web_content_link;
                          const hasDbData = !!(
                            file.file_data && file.file_data.length > 0
                          );
                          const dataUri = hasDbData
                            ? `data:${file.mime_type || "application/octet-stream"};base64,${file.file_data}`
                            : null;
                          const fileUrl = dataUri || externalUrl;
                          return (
                            <View key={file.id} style={{ gap: 4 }}>
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 8,
                                }}
                              >
                                <TouchableOpacity
                                  onPress={async () => {
                                    if (dataUri && Platform.OS === "web") {
                                      // Open data URI in new tab for DB-stored files
                                      const w = window.open();
                                      if (w) {
                                        w.document.write(
                                          `<iframe src="${dataUri}" style="width:100%;height:100%;border:none;"></iframe>`,
                                        );
                                        w.document.title =
                                          file.file_name || "Arquivo";
                                      }
                                      return;
                                    }
                                    const url = externalUrl;
                                    if (!url) {
                                      alert("Arquivo sem link disponível.");
                                      return;
                                    }
                                    const canOpen =
                                      await Linking.canOpenURL(url);
                                    if (canOpen) {
                                      Linking.openURL(url);
                                    } else {
                                      alert("Não foi possível abrir o link.");
                                    }
                                  }}
                                  activeOpacity={0.7}
                                  style={{ flex: 1 }}
                                >
                                  <ThemedText
                                    style={{
                                      fontSize: 12,
                                      fontWeight: "600",
                                      color: fileUrl
                                        ? tintColor
                                        : bodyTextColor,
                                      textDecorationLine: fileUrl
                                        ? "underline"
                                        : "none",
                                    }}
                                  >
                                    {file.file_name || "Arquivo"}
                                    {hasDbData ? " 💾" : ""}
                                  </ThemedText>
                                </TouchableOpacity>

                                {/* Signature request button — only for users with signature.request permission */}
                                {canRequestSignature &&
                                  (() => {
                                    const existingSig = fileSignatures.get(
                                      file.id,
                                    );
                                    if (existingSig) {
                                      const isSigned =
                                        existingSig.status === "signed";
                                      const isSent =
                                        existingSig.status === "sent";
                                      const sigColor = isSigned
                                        ? "#22c55e"
                                        : isSent
                                          ? "#3b82f6"
                                          : "#f59e0b";
                                      const sigLabel = isSigned
                                        ? "Assinado ✓"
                                        : isSent
                                          ? "Enviado"
                                          : "Pendente";
                                      const isSyncing =
                                        syncingFileId === file.id;
                                      return (
                                        <View
                                          style={{
                                            flexDirection: "row",
                                            alignItems: "center",
                                            gap: 4,
                                          }}
                                        >
                                          {/* Status badge */}
                                          <View
                                            style={{
                                              flexDirection: "row",
                                              alignItems: "center",
                                              gap: 4,
                                              paddingHorizontal: 6,
                                              paddingVertical: 2,
                                              borderRadius: 999,
                                              backgroundColor: sigColor + "20",
                                            }}
                                          >
                                            <Ionicons
                                              name={
                                                isSigned
                                                  ? "checkmark-circle"
                                                  : "create-outline"
                                              }
                                              size={12}
                                              color={sigColor}
                                            />
                                            <ThemedText
                                              style={{
                                                fontSize: 10,
                                                fontWeight: "700",
                                                color: sigColor,
                                              }}
                                            >
                                              {sigLabel}
                                            </ThemedText>
                                          </View>
                                          {/* Sync status button — only if not yet signed and has Documenso ID */}
                                          {!isSigned &&
                                          existingSig.documensoDocumentId ? (
                                            <TouchableOpacity
                                              onPress={() =>
                                                syncFileSignatureStatus(file.id)
                                              }
                                              disabled={isSyncing}
                                              style={{
                                                paddingHorizontal: 6,
                                                paddingVertical: 2,
                                                borderRadius: 999,
                                                backgroundColor:
                                                  tintColor + "15",
                                              }}
                                              activeOpacity={0.7}
                                            >
                                              {isSyncing ? (
                                                <ActivityIndicator
                                                  size={12}
                                                  color={tintColor}
                                                />
                                              ) : (
                                                <Ionicons
                                                  name="refresh"
                                                  size={13}
                                                  color={tintColor}
                                                />
                                              )}
                                            </TouchableOpacity>
                                          ) : null}
                                          {/* Open signing URL */}
                                          {existingSig.signingUrl &&
                                          !isSigned ? (
                                            <TouchableOpacity
                                              onPress={() => {
                                                if (existingSig.signingUrl)
                                                  Linking.openURL(
                                                    existingSig.signingUrl,
                                                  );
                                              }}
                                              style={{
                                                paddingHorizontal: 6,
                                                paddingVertical: 2,
                                                borderRadius: 999,
                                                backgroundColor: "#3b82f620",
                                              }}
                                              activeOpacity={0.7}
                                            >
                                              <Ionicons
                                                name="open-outline"
                                                size={13}
                                                color="#3b82f6"
                                              />
                                            </TouchableOpacity>
                                          ) : null}
                                        </View>
                                      );
                                    }
                                    return (
                                      <TouchableOpacity
                                        onPress={() => openSignModal(file)}
                                        style={{
                                          flexDirection: "row",
                                          alignItems: "center",
                                          gap: 4,
                                          paddingHorizontal: 8,
                                          paddingVertical: 4,
                                          borderRadius: 6,
                                          borderWidth: 1,
                                          borderColor: tintColor,
                                        }}
                                        activeOpacity={0.7}
                                      >
                                        <Ionicons
                                          name="create-outline"
                                          size={13}
                                          color={tintColor}
                                        />
                                        <ThemedText
                                          style={{
                                            fontSize: 10,
                                            fontWeight: "700",
                                            color: tintColor,
                                          }}
                                        >
                                          Assinar
                                        </ThemedText>
                                      </TouchableOpacity>
                                    );
                                  })()}

                                {/* OCR buttons */}
                                {(() => {
                                  const hasOcrResult = fileOcrResults.has(
                                    file.id,
                                  );
                                  return (
                                    <>
                                      {/* View analysis — always visible if result exists */}
                                      {hasOcrResult && (
                                        <TouchableOpacity
                                          onPress={() => openOcrView(file.id)}
                                          style={{
                                            flexDirection: "row",
                                            alignItems: "center",
                                            gap: 4,
                                            paddingHorizontal: 8,
                                            paddingVertical: 4,
                                            borderRadius: 6,
                                            backgroundColor: "#8b5cf620",
                                          }}
                                          activeOpacity={0.7}
                                        >
                                          <Ionicons
                                            name="eye-outline"
                                            size={13}
                                            color="#8b5cf6"
                                          />
                                          <ThemedText
                                            style={{
                                              fontSize: 10,
                                              fontWeight: "700",
                                              color: "#8b5cf6",
                                            }}
                                          >
                                            Análise
                                          </ThemedText>
                                        </TouchableOpacity>
                                      )}
                                      {/* Request analysis — permission-gated */}
                                      {canAnalyzeOcr && !hasOcrResult && (
                                        <TouchableOpacity
                                          onPress={() => openOcrModal(file)}
                                          style={{
                                            flexDirection: "row",
                                            alignItems: "center",
                                            gap: 4,
                                            paddingHorizontal: 8,
                                            paddingVertical: 4,
                                            borderRadius: 6,
                                            borderWidth: 1,
                                            borderColor: "#8b5cf6",
                                          }}
                                          activeOpacity={0.7}
                                        >
                                          <Ionicons
                                            name="scan-outline"
                                            size={13}
                                            color="#8b5cf6"
                                          />
                                          <ThemedText
                                            style={{
                                              fontSize: 10,
                                              fontWeight: "700",
                                              color: "#8b5cf6",
                                            }}
                                          >
                                            Analisar
                                          </ThemedText>
                                        </TouchableOpacity>
                                      )}
                                    </>
                                  );
                                })()}

                                {/* Protocol toggle — permission-gated */}
                                {canCompileProtocol && (
                                  <TouchableOpacity
                                    onPress={() =>
                                      toggleIncludeInProtocol(file)
                                    }
                                    style={{
                                      flexDirection: "row",
                                      alignItems: "center",
                                      gap: 4,
                                      paddingHorizontal: 8,
                                      paddingVertical: 4,
                                      borderRadius: 6,
                                      ...(file.include_in_protocol
                                        ? {
                                            backgroundColor: "#16a34a20",
                                          }
                                        : {
                                            borderWidth: 1,
                                            borderColor: "#6b7280",
                                          }),
                                    }}
                                    activeOpacity={0.7}
                                  >
                                    <Ionicons
                                      name={
                                        file.include_in_protocol
                                          ? "checkbox"
                                          : "square-outline"
                                      }
                                      size={13}
                                      color={
                                        file.include_in_protocol
                                          ? "#16a34a"
                                          : "#6b7280"
                                      }
                                    />
                                    <ThemedText
                                      style={{
                                        fontSize: 10,
                                        fontWeight: "700",
                                        color: file.include_in_protocol
                                          ? "#16a34a"
                                          : "#6b7280",
                                      }}
                                    >
                                      Protocolo
                                    </ThemedText>
                                  </TouchableOpacity>
                                )}
                              </View>
                              {file.description ? (
                                <ThemedText
                                  style={{
                                    fontSize: 11,
                                    color: mutedTextColor,
                                  }}
                                >
                                  {file.description}
                                </ThemedText>
                              ) : null}
                            </View>
                          );
                        })}
                    </View>
                  );
                })()}

                {(() => {
                  const docs = documentRequests.get(update.id) || [];
                  if (docs.length === 0) return null;

                  return (
                    <View
                      style={{
                        marginTop: 12,
                        paddingTop: 12,
                        borderTopWidth: 1,
                        borderTopColor: cardBorderColor,
                      }}
                    >
                      <ThemedText
                        style={{
                          fontSize: 12,
                          fontWeight: "600",
                          color: bodyTextColor,
                          marginBottom: 8,
                        }}
                      >
                        Documentos solicitados
                      </ThemedText>
                      <View style={{ gap: 8 }}>
                        {docs.map((doc) => {
                          const isUploading = uploadingDocuments.has(doc.id);
                          const responses = documentResponses.get(doc.id) || [];
                          return (
                            <View
                              key={doc.id}
                              style={{
                                paddingHorizontal: 10,
                                paddingVertical: 8,
                                backgroundColor: doc.is_fulfilled
                                  ? tintColor + "20"
                                  : cardBorderColor + "20",
                                borderRadius: 6,
                                borderLeftWidth: 3,
                                borderLeftColor: doc.is_fulfilled
                                  ? tintColor
                                  : mutedTextColor,
                              }}
                            >
                              <View
                                style={{
                                  flexDirection: "row",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                }}
                              >
                                <View style={{ flex: 1 }}>
                                  <ThemedText
                                    style={{
                                      fontSize: 12,
                                      fontWeight: "600",
                                      color: bodyTextColor,
                                    }}
                                  >
                                    {doc.document_type}
                                  </ThemedText>
                                  {doc.description ? (
                                    <ThemedText
                                      style={{
                                        fontSize: 11,
                                        color: mutedTextColor,
                                        marginTop: 2,
                                      }}
                                    >
                                      {doc.description}
                                    </ThemedText>
                                  ) : null}
                                  {responses.length > 0 ? (
                                    <View style={{ marginTop: 6, gap: 4 }}>
                                      {responses.map((response) => {
                                        const hasDbData = !!(
                                          response.file_data &&
                                          response.file_data.length > 0
                                        );
                                        const externalUrl =
                                          response.drive_web_view_link ||
                                          response.drive_web_content_link;
                                        const dataUri = hasDbData
                                          ? `data:${response.mime_type || "application/octet-stream"};base64,${response.file_data}`
                                          : null;
                                        return (
                                          <View
                                            key={response.id}
                                            style={{
                                              flexDirection: "row",
                                              alignItems: "center",
                                              gap: 6,
                                              backgroundColor: tintColor + "15",
                                              paddingHorizontal: 8,
                                              paddingVertical: 5,
                                              borderRadius: 4,
                                            }}
                                          >
                                            <ThemedText
                                              style={{
                                                fontSize: 11,
                                                color: tintColor,
                                              }}
                                            >
                                              ✓
                                            </ThemedText>
                                            <TouchableOpacity
                                              onPress={async () => {
                                                if (
                                                  dataUri &&
                                                  Platform.OS === "web"
                                                ) {
                                                  const w = window.open();
                                                  if (w) {
                                                    w.document.write(
                                                      `<iframe src="${dataUri}" style="width:100%;height:100%;border:none;"></iframe>`,
                                                    );
                                                    w.document.title =
                                                      response.file_name ||
                                                      "Arquivo";
                                                  }
                                                  return;
                                                }
                                                const url = externalUrl;
                                                if (!url) {
                                                  alert(
                                                    "Arquivo sem link disponível.",
                                                  );
                                                  return;
                                                }
                                                const canOpen =
                                                  await Linking.canOpenURL(url);
                                                if (canOpen) {
                                                  Linking.openURL(url);
                                                }
                                              }}
                                              style={{ flex: 1 }}
                                            >
                                              <ThemedText
                                                style={{
                                                  fontSize: 11,
                                                  color: tintColor,
                                                  textDecorationLine:
                                                    "underline",
                                                }}
                                                numberOfLines={1}
                                              >
                                                {response.file_name ||
                                                  "Arquivo enviado"}
                                              </ThemedText>
                                            </TouchableOpacity>
                                          </View>
                                        );
                                      })}
                                    </View>
                                  ) : null}
                                </View>
                                <TouchableOpacity
                                  onPress={() =>
                                    handleUploadDocumentRequest(
                                      doc.id,
                                      update.id,
                                    )
                                  }
                                  disabled={isUploading}
                                  style={{
                                    marginLeft: 8,
                                    paddingHorizontal: 10,
                                    paddingVertical: 6,
                                    backgroundColor: doc.is_fulfilled
                                      ? mutedTextColor + "40"
                                      : tintColor,
                                    borderRadius: 4,
                                    borderWidth: doc.is_fulfilled ? 1 : 0,
                                    borderColor: doc.is_fulfilled
                                      ? mutedTextColor
                                      : "transparent",
                                  }}
                                >
                                  {isUploading ? (
                                    <ActivityIndicator
                                      size="small"
                                      color={bodyTextColor}
                                    />
                                  ) : (
                                    <ThemedText
                                      style={{
                                        fontSize: 11,
                                        fontWeight: "600",
                                        color: doc.is_fulfilled
                                          ? bodyTextColor
                                          : "white",
                                      }}
                                    >
                                      {doc.is_fulfilled
                                        ? "Enviar novamente"
                                        : "Enviar"}
                                    </ThemedText>
                                  )}
                                </TouchableOpacity>
                              </View>

                              {doc.is_fulfilled && property ? (
                                <View style={{ marginTop: 8 }}>
                                  <SignatureRequest
                                    documentTitle={`${doc.document_type} - ${property.address || "Imóvel"}`}
                                    signerName={
                                      user?.name ?? user?.email ?? "Cliente"
                                    }
                                    signerEmail={user?.email ?? ""}
                                    status={signatures.get(doc.id)?.status}
                                    signingUrl={
                                      signatures.get(doc.id)?.signingUrl
                                    }
                                    documensoDocumentId={
                                      signatures.get(doc.id)
                                        ?.documensoDocumentId
                                    }
                                    onCreated={(data) => {
                                      setSignatures((prev) => {
                                        const updated = new Map(prev);
                                        updated.set(doc.id, {
                                          status: "sent",
                                          signingUrl: data.signingUrl,
                                          documensoDocumentId:
                                            data.documensoDocumentId,
                                        });
                                        return updated;
                                      });
                                    }}
                                  />
                                </View>
                              ) : null}
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  );
                })()}
              </View>
            ))}
          </View>
        )}
      </ThemedView>

      {/* ── Signature Request Modal ── */}
      <Modal
        visible={signModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSignModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: cardBackground,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingBottom: Platform.OS === "ios" ? 40 : 24,
              maxHeight: "85%",
            }}
          >
            <ScrollView
              style={{ padding: 24 }}
              contentContainerStyle={{ gap: 16, paddingBottom: 16 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              {/* Header */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <ThemedText
                  style={{
                    fontSize: 18,
                    fontWeight: "700",
                    color: titleTextColor,
                  }}
                >
                  Solicitar Assinatura
                </ThemedText>
                <TouchableOpacity onPress={() => setSignModalVisible(false)}>
                  <Ionicons name="close" size={24} color={mutedTextColor} />
                </TouchableOpacity>
              </View>

              {/* File info */}
              {signModalFile ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    padding: 12,
                    borderRadius: 8,
                    backgroundColor: cardBorderColor + "30",
                  }}
                >
                  <Ionicons
                    name="document-text-outline"
                    size={20}
                    color={tintColor}
                  />
                  <ThemedText
                    style={{ fontSize: 13, color: bodyTextColor, flex: 1 }}
                    numberOfLines={2}
                  >
                    {signModalFile.file_name || "Documento"}
                  </ThemedText>
                </View>
              ) : null}

              {/* Signing type selector */}
              <View style={{ gap: 8 }}>
                <ThemedText
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: bodyTextColor,
                  }}
                >
                  Tipo de assinatura
                </ThemedText>
                {SIGNING_TYPES.map((type) => {
                  const isSelected = signModalType === type.value;
                  return (
                    <TouchableOpacity
                      key={type.value}
                      onPress={() => setSignModalType(type.value)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        padding: 14,
                        borderWidth: 2,
                        borderColor: isSelected ? tintColor : cardBorderColor,
                        borderRadius: 12,
                        backgroundColor: isSelected
                          ? tintColor + "10"
                          : "transparent",
                      }}
                      activeOpacity={0.7}
                    >
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: isSelected
                            ? tintColor + "20"
                            : cardBorderColor + "40",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons
                          name={type.icon as any}
                          size={18}
                          color={isSelected ? tintColor : mutedTextColor}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <ThemedText
                          style={{
                            fontSize: 14,
                            fontWeight: "600",
                            color: bodyTextColor,
                          }}
                        >
                          {type.label}
                        </ThemedText>
                        <ThemedText
                          style={{ fontSize: 11, color: mutedTextColor }}
                        >
                          {type.description}
                        </ThemedText>
                      </View>
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          borderWidth: 2,
                          borderColor: isSelected ? tintColor : cardBorderColor,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {isSelected ? (
                          <View
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: 6,
                              backgroundColor: tintColor,
                            }}
                          />
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Signer selection */}
              <View style={{ gap: 8 }}>
                <ThemedText
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: bodyTextColor,
                  }}
                >
                  Assinantes
                </ThemedText>
                <ThemedText style={{ fontSize: 11, color: mutedTextColor }}>
                  Selecione quem deve assinar. Se nenhum for selecionado, será
                  usado o usuário logado.
                </ThemedText>

                {/* Search */}
                <TextInput
                  value={signerSearch}
                  onChangeText={setSignerSearch}
                  placeholder="Buscar por nome ou email..."
                  placeholderTextColor={mutedTextColor}
                  style={{
                    borderWidth: 1,
                    borderColor: cardBorderColor,
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    fontSize: 13,
                    color: bodyTextColor,
                    backgroundColor: innerCardBackground,
                  }}
                />

                {/* Signer list */}
                {signersLoading ? (
                  <ActivityIndicator
                    size="small"
                    color={tintColor}
                    style={{ marginVertical: 8 }}
                  />
                ) : (
                  <ScrollView
                    style={{ maxHeight: 180 }}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator
                  >
                    {availableSigners
                      .filter((s) => {
                        if (!signerSearch.trim()) return true;
                        const q = signerSearch.toLowerCase();
                        return (
                          s.name.toLowerCase().includes(q) ||
                          s.email.toLowerCase().includes(q)
                        );
                      })
                      .map((signer) => {
                        const isChecked = selectedSignerIds.has(signer.id);
                        return (
                          <TouchableOpacity
                            key={signer.id}
                            onPress={() => {
                              setSelectedSignerIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(signer.id)) next.delete(signer.id);
                                else next.add(signer.id);
                                return next;
                              });
                            }}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 10,
                              paddingVertical: 8,
                              paddingHorizontal: 4,
                              borderBottomWidth: 0.5,
                              borderBottomColor: cardBorderColor + "40",
                            }}
                            activeOpacity={0.7}
                          >
                            <View
                              style={{
                                width: 22,
                                height: 22,
                                borderRadius: 4,
                                borderWidth: 2,
                                borderColor: isChecked
                                  ? tintColor
                                  : cardBorderColor,
                                backgroundColor: isChecked
                                  ? tintColor
                                  : "transparent",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              {isChecked ? (
                                <Ionicons
                                  name="checkmark"
                                  size={14}
                                  color="white"
                                />
                              ) : null}
                            </View>
                            <View style={{ flex: 1 }}>
                              <ThemedText
                                style={{
                                  fontSize: 13,
                                  fontWeight: "500",
                                  color: bodyTextColor,
                                }}
                                numberOfLines={1}
                              >
                                {signer.name}
                              </ThemedText>
                              <ThemedText
                                style={{ fontSize: 11, color: mutedTextColor }}
                                numberOfLines={1}
                              >
                                {signer.email}
                                {signer.source === "customer"
                                  ? " · Cliente"
                                  : " · Usuário"}
                              </ThemedText>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    {availableSigners.length === 0 && !signersLoading && (
                      <ThemedText
                        style={{
                          fontSize: 12,
                          color: mutedTextColor,
                          textAlign: "center",
                          paddingVertical: 12,
                        }}
                      >
                        Nenhum contato encontrado
                      </ThemedText>
                    )}
                  </ScrollView>
                )}

                {/* Selected count badge */}
                {selectedSignerIds.size > 0 && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingVertical: 4,
                    }}
                  >
                    <View
                      style={{
                        backgroundColor: tintColor + "20",
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 10,
                      }}
                    >
                      <ThemedText
                        style={{
                          fontSize: 11,
                          fontWeight: "600",
                          color: tintColor,
                        }}
                      >
                        {selectedSignerIds.size} assinante
                        {selectedSignerIds.size > 1 ? "s" : ""} selecionado
                        {selectedSignerIds.size > 1 ? "s" : ""}
                      </ThemedText>
                    </View>
                    <TouchableOpacity
                      onPress={() => setSelectedSignerIds(new Set())}
                    >
                      <ThemedText
                        style={{ fontSize: 11, color: mutedTextColor }}
                      >
                        Limpar
                      </ThemedText>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Description input */}
              <View style={{ gap: 6 }}>
                <ThemedText
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: bodyTextColor,
                  }}
                >
                  Descrição (opcional)
                </ThemedText>
                <TextInput
                  value={signModalDesc}
                  onChangeText={setSignModalDesc}
                  placeholder="Ex: Assinatura do contrato de compra do imóvel..."
                  placeholderTextColor={mutedTextColor}
                  multiline
                  numberOfLines={3}
                  style={{
                    borderWidth: 1,
                    borderColor: cardBorderColor,
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    fontSize: 14,
                    color: bodyTextColor,
                    backgroundColor: innerCardBackground,
                    textAlignVertical: "top",
                    minHeight: 70,
                  }}
                />
              </View>

              {/* Submit button */}
              <TouchableOpacity
                onPress={handleSubmitSignatureRequest}
                disabled={signModalLoading}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  paddingVertical: 14,
                  borderRadius: 12,
                  backgroundColor: signModalLoading
                    ? `${tintColor}66`
                    : tintColor,
                }}
                activeOpacity={0.8}
              >
                {signModalLoading ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <>
                    <Ionicons
                      name={
                        signModalType === "icp_brasil"
                          ? "shield-checkmark"
                          : "create-outline"
                      }
                      size={18}
                      color="white"
                    />
                    <ThemedText
                      style={{
                        color: "white",
                        fontWeight: "700",
                        fontSize: 15,
                      }}
                    >
                      {signModalType === "icp_brasil"
                        ? "Solicitar Assinatura ICP-Brasil"
                        : "Solicitar Assinatura"}
                      {selectedSignerIds.size > 0
                        ? ` (${selectedSignerIds.size})`
                        : ""}
                    </ThemedText>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── OCR Analysis Modal ── */}
      <Modal
        visible={ocrModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setOcrModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0,0,0,0.4)",
          }}
        >
          <View
            style={{
              backgroundColor: cardBackground,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 24,
              gap: 16,
              maxHeight: "80%",
            }}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <ThemedText
                style={{
                  fontSize: 18,
                  fontWeight: "700",
                  color: titleTextColor,
                }}
              >
                Análise OCR
              </ThemedText>
              <TouchableOpacity onPress={() => setOcrModalVisible(false)}>
                <Ionicons name="close" size={24} color={mutedTextColor} />
              </TouchableOpacity>
            </View>

            {ocrModalFile && (
              <ThemedText style={{ fontSize: 13, color: mutedTextColor }}>
                Arquivo: {ocrModalFile.file_name || "Arquivo"}
              </ThemedText>
            )}

            {/* Config selector */}
            <ThemedText
              style={{ fontSize: 13, fontWeight: "600", color: bodyTextColor }}
            >
              Modelo de Análise
            </ThemedText>
            <ScrollView style={{ maxHeight: 250 }}>
              <View style={{ gap: 8 }}>
                {ocrConfigs.length === 0 ? (
                  <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                    Nenhum modelo cadastrado.
                  </ThemedText>
                ) : (
                  ocrConfigs.map((cfg) => {
                    const isSelected = ocrSelectedConfig === String(cfg.id);
                    return (
                      <TouchableOpacity
                        key={cfg.id}
                        onPress={() => setOcrSelectedConfig(String(cfg.id))}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 12,
                          padding: 12,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: isSelected ? "#8b5cf6" : cardBorderColor,
                          backgroundColor: isSelected
                            ? "#8b5cf610"
                            : innerCardBackground,
                        }}
                        activeOpacity={0.7}
                      >
                        <View
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            borderWidth: 2,
                            borderColor: isSelected
                              ? "#8b5cf6"
                              : cardBorderColor,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {isSelected && (
                            <View
                              style={{
                                width: 12,
                                height: 12,
                                borderRadius: 6,
                                backgroundColor: "#8b5cf6",
                              }}
                            />
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <ThemedText
                            style={{
                              fontSize: 14,
                              fontWeight: "600",
                              color: bodyTextColor,
                            }}
                          >
                            {cfg.name}
                          </ThemedText>
                          {cfg.description ? (
                            <ThemedText
                              style={{
                                fontSize: 11,
                                color: mutedTextColor,
                                marginTop: 2,
                              }}
                            >
                              {cfg.description}
                            </ThemedText>
                          ) : null}
                          {cfg.document_types && (
                            <ThemedText
                              style={{
                                fontSize: 10,
                                color: mutedTextColor,
                                marginTop: 2,
                              }}
                            >
                              Tipos:{" "}
                              {Array.isArray(cfg.document_types)
                                ? cfg.document_types.join(", ")
                                : String(cfg.document_types)}
                            </ThemedText>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            </ScrollView>

            {/* Run analysis button */}
            <TouchableOpacity
              onPress={handleRunOcrAnalysis}
              disabled={ocrLoading || !ocrSelectedConfig}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                paddingVertical: 14,
                borderRadius: 12,
                backgroundColor:
                  ocrLoading || !ocrSelectedConfig ? "#8b5cf666" : "#8b5cf6",
              }}
              activeOpacity={0.8}
            >
              {ocrLoading ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Ionicons name="scan-outline" size={18} color="white" />
                  <ThemedText
                    style={{ color: "white", fontWeight: "700", fontSize: 15 }}
                  >
                    Executar Análise
                  </ThemedText>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── View OCR Results Modal ── */}
      <Modal
        visible={ocrViewVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setOcrViewVisible(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0,0,0,0.4)",
          }}
        >
          <View
            style={{
              backgroundColor: cardBackground,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 24,
              gap: 14,
              maxHeight: "85%",
            }}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <ThemedText
                style={{
                  fontSize: 18,
                  fontWeight: "700",
                  color: titleTextColor,
                }}
              >
                Resultado da Análise
              </ThemedText>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <TouchableOpacity
                  onPress={generateOcrAiInsight}
                  disabled={ocrAiLoading || !ocrViewData?.extracted_text}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 8,
                    backgroundColor: ocrAiLoading
                      ? `${tintColor}33`
                      : tintColor,
                  }}
                >
                  {ocrAiLoading ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <ThemedText
                      style={{
                        color: "white",
                        fontSize: 12,
                        fontWeight: "700",
                      }}
                    >
                      ✨ IA
                    </ThemedText>
                  )}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setOcrViewVisible(false)}>
                  <Ionicons name="close" size={24} color={mutedTextColor} />
                </TouchableOpacity>
              </View>
            </View>

            {ocrAiError ? (
              <ThemedText style={{ color: tintColor, marginBottom: 4 }}>
                {ocrAiError}
              </ThemedText>
            ) : null}

            {ocrAiInsight ? (
              <View
                style={{
                  marginBottom: 4,
                  borderWidth: 1,
                  borderColor: cardBorderColor,
                  borderRadius: 8,
                  padding: 10,
                  backgroundColor: innerCardBackground,
                }}
              >
                <ThemedText
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: bodyTextColor,
                  }}
                >
                  Insights da IA sobre o OCR
                </ThemedText>
                <ThemedText
                  style={{ fontSize: 12, color: bodyTextColor, marginTop: 6 }}
                >
                  {ocrAiInsight}
                </ThemedText>
              </View>
            ) : null}

            {ocrViewData && (
              <ScrollView style={{ maxHeight: "100%" }}>
                <View style={{ gap: 12 }}>
                  {/* Confidence */}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons
                      name="analytics-outline"
                      size={16}
                      color="#8b5cf6"
                    />
                    <ThemedText
                      style={{
                        fontSize: 14,
                        fontWeight: "600",
                        color: bodyTextColor,
                      }}
                    >
                      Confiança:{" "}
                      {typeof ocrViewData.confidence === "number"
                        ? `${ocrViewData.confidence.toFixed(1)}%`
                        : (ocrViewData.confidence ?? "–")}
                    </ThemedText>
                  </View>

                  {/* Extracted CPFs */}
                  {(() => {
                    const cpfs = Array.isArray(ocrViewData.extracted_cpf)
                      ? ocrViewData.extracted_cpf
                      : typeof ocrViewData.extracted_cpf === "string"
                        ? (() => {
                            try {
                              return JSON.parse(ocrViewData.extracted_cpf);
                            } catch {
                              return [];
                            }
                          })()
                        : [];
                    if (cpfs.length === 0) return null;
                    return (
                      <View style={{ gap: 4 }}>
                        <ThemedText
                          style={{
                            fontSize: 13,
                            fontWeight: "600",
                            color: bodyTextColor,
                          }}
                        >
                          CPFs encontrados
                        </ThemedText>
                        {cpfs.map((c: string, i: number) => (
                          <ThemedText
                            key={i}
                            style={{
                              fontSize: 13,
                              color: mutedTextColor,
                              marginLeft: 8,
                            }}
                          >
                            • {c}
                          </ThemedText>
                        ))}
                      </View>
                    );
                  })()}

                  {/* Extracted CNPJs */}
                  {(() => {
                    const cnpjs = Array.isArray(ocrViewData.extracted_cnpj)
                      ? ocrViewData.extracted_cnpj
                      : typeof ocrViewData.extracted_cnpj === "string"
                        ? (() => {
                            try {
                              return JSON.parse(ocrViewData.extracted_cnpj);
                            } catch {
                              return [];
                            }
                          })()
                        : [];
                    if (cnpjs.length === 0) return null;
                    return (
                      <View style={{ gap: 4 }}>
                        <ThemedText
                          style={{
                            fontSize: 13,
                            fontWeight: "600",
                            color: bodyTextColor,
                          }}
                        >
                          CNPJs encontrados
                        </ThemedText>
                        {cnpjs.map((c: string, i: number) => (
                          <ThemedText
                            key={i}
                            style={{
                              fontSize: 13,
                              color: mutedTextColor,
                              marginLeft: 8,
                            }}
                          >
                            • {c}
                          </ThemedText>
                        ))}
                      </View>
                    );
                  })()}

                  {/* Extracted dates */}
                  {(() => {
                    const dates = Array.isArray(ocrViewData.extracted_dates)
                      ? ocrViewData.extracted_dates
                      : typeof ocrViewData.extracted_dates === "string"
                        ? (() => {
                            try {
                              return JSON.parse(ocrViewData.extracted_dates);
                            } catch {
                              return [];
                            }
                          })()
                        : [];
                    if (dates.length === 0) return null;
                    return (
                      <View style={{ gap: 4 }}>
                        <ThemedText
                          style={{
                            fontSize: 13,
                            fontWeight: "600",
                            color: bodyTextColor,
                          }}
                        >
                          Datas encontradas
                        </ThemedText>
                        {dates.map((d: string, i: number) => (
                          <ThemedText
                            key={i}
                            style={{
                              fontSize: 13,
                              color: mutedTextColor,
                              marginLeft: 8,
                            }}
                          >
                            • {d}
                          </ThemedText>
                        ))}
                      </View>
                    );
                  })()}

                  {/* Extracted currency values */}
                  {(() => {
                    const vals = Array.isArray(ocrViewData.extracted_currency)
                      ? ocrViewData.extracted_currency
                      : typeof ocrViewData.extracted_currency === "string"
                        ? (() => {
                            try {
                              return JSON.parse(ocrViewData.extracted_currency);
                            } catch {
                              return [];
                            }
                          })()
                        : [];
                    if (vals.length === 0) return null;
                    return (
                      <View style={{ gap: 4 }}>
                        <ThemedText
                          style={{
                            fontSize: 13,
                            fontWeight: "600",
                            color: bodyTextColor,
                          }}
                        >
                          Valores monetários
                        </ThemedText>
                        {vals.map((v: string, i: number) => (
                          <ThemedText
                            key={i}
                            style={{
                              fontSize: 13,
                              color: mutedTextColor,
                              marginLeft: 8,
                            }}
                          >
                            • {v}
                          </ThemedText>
                        ))}
                      </View>
                    );
                  })()}

                  {/* Full extracted text */}
                  <View style={{ gap: 4, marginTop: 8 }}>
                    <ThemedText
                      style={{
                        fontSize: 13,
                        fontWeight: "600",
                        color: bodyTextColor,
                      }}
                    >
                      Texto extraído
                    </ThemedText>
                    <View
                      style={{
                        backgroundColor: innerCardBackground,
                        borderWidth: 1,
                        borderColor: cardBorderColor,
                        borderRadius: 10,
                        padding: 12,
                        maxHeight: 200,
                      }}
                    >
                      <ScrollView nestedScrollEnabled>
                        <ThemedText
                          style={{
                            fontSize: 12,
                            color: mutedTextColor,
                            lineHeight: 18,
                          }}
                        >
                          {ocrViewData.extracted_text || "(vazio)"}
                        </ThemedText>
                      </ScrollView>
                    </View>
                  </View>

                  {/* Processed at */}
                  {ocrViewData.processed_at && (
                    <ThemedText
                      style={{
                        fontSize: 11,
                        color: mutedTextColor,
                        marginTop: 4,
                      }}
                    >
                      Analisado em:{" "}
                      {new Date(ocrViewData.processed_at).toLocaleString(
                        "pt-BR",
                      )}
                    </ThemedText>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
