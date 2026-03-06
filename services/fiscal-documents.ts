import { api, getApiErrorMessage } from "@/services/api";
import { CRUD_ENDPOINT } from "@/services/crud";

type Row = Record<string, unknown>;

export type FiscalDocumentType =
  | "none"
  | "nfse"
  | "nfe"
  | "nfce"
  | "service_coupon"
  | "product_coupon";

export type FiscalEmitResult = {
  ok: boolean;
  message: string;
  invoice?: Row;
};

const FISCAL_EMISSION_ENDPOINT = process.env.EXPO_PUBLIC_FISCAL_EMISSION_ENDPOINT;

const digitsOnly = (value: unknown): string =>
  String(value ?? "").replace(/\D/g, "");

const normalizeDocType = (value: unknown): FiscalDocumentType =>
  String(value ?? "none").toLowerCase() as FiscalDocumentType;

const toStringOrNull = (value: unknown): string | null => {
  const text = String(value ?? "").trim();
  return text ? text : null;
};

const validateCpfCnpj = (value: unknown): boolean => {
  const doc = digitsOnly(value);
  return doc.length === 11 || doc.length === 14;
};

export function validateInvoiceForFiscalEmission(
  invoice: Row,
): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  const docType = normalizeDocType(invoice.document_type);
  if (docType === "none") {
    missing.push("Tipo de documento fiscal");
  }

  const recipientDoc = toStringOrNull(invoice.recipient_cpf_cnpj);
  const recipientName = toStringOrNull(invoice.recipient_name);
  const operationNature = toStringOrNull(invoice.operation_nature);
  const total = Number(invoice.total ?? 0);

  if (!recipientName) missing.push("Nome do destinatário");
  if (!recipientDoc) {
    missing.push("CPF/CNPJ do destinatário");
  } else if (!validateCpfCnpj(recipientDoc)) {
    missing.push("CPF/CNPJ do destinatário inválido");
  }
  if (!operationNature) missing.push("Natureza da operação");
  if (!(total > 0)) missing.push("Total da fatura maior que zero");

  // Address is usually required for NF-e/NFC-e and commonly useful for NFS-e
  const recipientCity = toStringOrNull(invoice.recipient_city);
  const recipientState = toStringOrNull(invoice.recipient_state);
  const recipientZip = toStringOrNull(invoice.recipient_zip_code);
  if (docType === "nfe" || docType === "nfce") {
    if (!toStringOrNull(invoice.recipient_address_line1)) {
      missing.push("Logradouro do destinatário");
    }
    if (!recipientCity) missing.push("Cidade do destinatário");
    if (!recipientState) missing.push("UF do destinatário");
    if (!recipientZip) missing.push("CEP do destinatário");
  }

  if (docType === "nfse" || docType === "service_coupon") {
    if (!toStringOrNull(invoice.service_code_lc116)) {
      missing.push("Código de serviço (LC 116)");
    }
    if (!toStringOrNull(invoice.service_city_code)) {
      missing.push("Código do município do serviço");
    }
  }

  return { ok: missing.length === 0, missing };
}

export async function emitFiscalDocument(params: {
  invoice: Row;
  tenantId?: string | null;
  userId?: string | null;
}): Promise<FiscalEmitResult> {
  const { invoice, tenantId, userId } = params;
  const invoiceId = String(invoice.id ?? "");
  if (!invoiceId) {
    return { ok: false, message: "Fatura sem ID." };
  }

  const check = validateInvoiceForFiscalEmission(invoice);
  if (!check.ok) {
    return {
      ok: false,
      message: `Dados fiscais incompletos: ${check.missing.join(", ")}`,
    };
  }

  const updatePayload: Row = {
    id: invoiceId,
    fiscal_status: "processing",
    fiscal_last_sync_at: new Date().toISOString(),
  };

  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "invoices",
    payload: updatePayload,
  });

  if (!FISCAL_EMISSION_ENDPOINT) {
    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "invoices",
      payload: {
        id: invoiceId,
        fiscal_status: "ready",
        fiscal_error_message:
          "EXPO_PUBLIC_FISCAL_EMISSION_ENDPOINT não configurado",
        fiscal_last_sync_at: new Date().toISOString(),
      },
    });
    return {
      ok: false,
      message:
        "Endpoint fiscal não configurado. Defina EXPO_PUBLIC_FISCAL_EMISSION_ENDPOINT.",
    };
  }

  try {
    const payload = {
      invoice_id: invoiceId,
      tenant_id: tenantId ?? invoice.tenant_id ?? null,
      requested_by: userId ?? null,
      document_type: normalizeDocType(invoice.document_type),
      environment: String(invoice.fiscal_environment ?? "production"),
      invoice,
    };

    const response = await api.post(FISCAL_EMISSION_ENDPOINT, payload);
    const body = response.data as Row;

    const status = String(body?.status ?? body?.fiscal_status ?? "processing");
    const isAuthorized =
      status === "authorized" ||
      status === "approved" ||
      status === "success" ||
      body?.authorized === true;

    const mappedStatus = isAuthorized ? "authorized" : status;

    const persistedPayload: Row = {
      id: invoiceId,
      fiscal_status: mappedStatus,
      fiscal_number: toStringOrNull(body?.number ?? body?.fiscal_number),
      fiscal_series: toStringOrNull(body?.series ?? body?.fiscal_series),
      fiscal_access_key: toStringOrNull(
        body?.access_key ?? body?.fiscal_access_key,
      ),
      fiscal_protocol: toStringOrNull(body?.protocol ?? body?.fiscal_protocol),
      fiscal_verification_code: toStringOrNull(
        body?.verification_code ?? body?.fiscal_verification_code,
      ),
      fiscal_xml_url: toStringOrNull(body?.xml_url ?? body?.fiscal_xml_url),
      fiscal_pdf_url: toStringOrNull(body?.pdf_url ?? body?.fiscal_pdf_url),
      fiscal_json_response: body,
      fiscal_error_message: toStringOrNull(body?.error ?? body?.message),
      fiscal_last_sync_at: new Date().toISOString(),
      fiscal_authorized_at: isAuthorized ? new Date().toISOString() : null,
    };

    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "invoices",
      payload: persistedPayload,
    });

    return {
      ok: isAuthorized,
      message: isAuthorized
        ? "Documento fiscal emitido com sucesso."
        : String(body?.message ?? "Emissão fiscal enviada."),
      invoice: { ...invoice, ...persistedPayload },
    };
  } catch (error) {
    const msg = getApiErrorMessage(error, "Falha ao emitir documento fiscal");
    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "invoices",
      payload: {
        id: invoiceId,
        fiscal_status: "error",
        fiscal_error_message: msg,
        fiscal_last_sync_at: new Date().toISOString(),
      },
    });
    return { ok: false, message: msg };
  }
}

