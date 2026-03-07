/**
 * Fiscal Documents Service — End-to-end NF-e / NFC-e emission
 *
 * Full flow:
 *   1. Validate invoice-level data (recipient, totals)
 *   2. Load tenant fiscal config (certificate, CNPJ, IBGE, tax regime)
 *   3. Validate tenant fiscal readiness
 *   4. Load invoice items from database
 *   5. Consume next fiscal number (series + nNF)
 *   6. Build NF-e/NFC-e payload via nfe-builder
 *   7. POST payload to PHP microservice (sped-nfe Docker)
 *   8. Persist SEFAZ response (access key, protocol, XML/PDF URLs)
 *
 * The PHP microservice handles: XML build → sign → SEFAZ transmission.
 */

import { api, getApiErrorMessage } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import {
    consumeNextFiscalNumber,
    loadTenantFiscalConfig,
    validateTenantFiscalReadiness,
} from "@/services/fiscal-config";
import {
    buildNFePayload,
    type InvoiceItemRow,
    type InvoiceRow,
} from "@/services/nfe-builder";

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

/**
 * Fiscal emission endpoint — routed through the Cloudflare Worker.
 * The Worker forwards `/fiscal/*` to a Workers Container running the
 * PHP sped-nfe microservice (FiscalContainer Durable Object).
 * The container scales to zero after idle and cold-starts in ~2-3s.
 */
const FISCAL_PROXY_PATHS = {
  nfe: "/fiscal/nfe/emit",
  nfce: "/fiscal/nfce/emit",
} as const;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Invoice-level validation                                           */
/* ------------------------------------------------------------------ */

export function validateInvoiceForFiscalEmission(invoice: Row): {
  ok: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  const docType = normalizeDocType(invoice.document_type);
  if (docType === "none") {
    missing.push("Tipo de documento fiscal");
  }

  const recipientDoc = toStringOrNull(invoice.recipient_cpf_cnpj);
  const recipientName = toStringOrNull(invoice.recipient_name);
  const operationNature = toStringOrNull(invoice.operation_nature);
  const total = Number(invoice.total_amount ?? invoice.total ?? 0);

  if (!recipientName) missing.push("Nome do destinatário");
  if (!recipientDoc) {
    missing.push("CPF/CNPJ do destinatário");
  } else if (!validateCpfCnpj(recipientDoc)) {
    missing.push("CPF/CNPJ do destinatário inválido");
  }
  if (!operationNature) missing.push("Natureza da operação");
  if (!(total > 0)) missing.push("Total da fatura maior que zero");

  // Address required for NF-e; optional for NFC-e
  const recipientCity = toStringOrNull(invoice.recipient_city);
  const recipientState = toStringOrNull(invoice.recipient_state);
  const recipientZip = toStringOrNull(invoice.recipient_zip_code);
  if (docType === "nfe") {
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

/* ------------------------------------------------------------------ */
/*  Load invoice items from database                                   */
/* ------------------------------------------------------------------ */

async function loadInvoiceItems(invoiceId: string): Promise<InvoiceItemRow[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "invoice_items",
    ...buildSearchParams([{ field: "invoice_id", value: invoiceId }], {
      sortColumn: "created_at ASC",
      autoExcludeDeleted: true,
    }),
  });
  return normalizeCrudList<InvoiceItemRow>(res.data);
}

/* ------------------------------------------------------------------ */
/*  Update invoice fiscal status helper                                */
/* ------------------------------------------------------------------ */

async function updateFiscalStatus(
  invoiceId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "invoices",
    payload: {
      id: invoiceId,
      fiscal_last_sync_at: new Date().toISOString(),
      ...fields,
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Main emission function                                             */
/* ------------------------------------------------------------------ */

export async function emitFiscalDocument(params: {
  invoice: Row;
  tenantId?: string | null;
  userId?: string | null;
}): Promise<FiscalEmitResult> {
  const { invoice, tenantId, userId } = params;
  const invoiceId = String(invoice.id ?? "");
  const resolvedTenantId = String(tenantId ?? invoice.tenant_id ?? "").trim();

  if (!invoiceId) {
    return { ok: false, message: "Fatura sem ID." };
  }
  if (!resolvedTenantId) {
    return { ok: false, message: "Tenant não identificado." };
  }

  const docType = normalizeDocType(invoice.document_type);

  // ── NFS-e / service coupon: not yet supported (Phase 2) ──
  if (docType === "nfse" || docType === "service_coupon") {
    return {
      ok: false,
      message: "Emissão de NFS-e ainda não disponível. Use NF-e ou NFC-e.",
    };
  }

  // ── Must be NF-e or NFC-e ──
  if (docType !== "nfe" && docType !== "nfce") {
    return {
      ok: false,
      message: "Selecione o tipo de documento fiscal (NF-e ou NFC-e).",
    };
  }

  // ── Step 1: Validate invoice-level data ──
  const invoiceCheck = validateInvoiceForFiscalEmission(invoice);
  if (!invoiceCheck.ok) {
    return {
      ok: false,
      message: `Dados da fatura incompletos: ${invoiceCheck.missing.join(", ")}`,
    };
  }

  // ── Step 2: Load tenant fiscal config ──
  let tenantConfig;
  try {
    tenantConfig = await loadTenantFiscalConfig(resolvedTenantId);
  } catch (err) {
    return {
      ok: false,
      message: `Falha ao carregar configuração fiscal: ${getApiErrorMessage(err)}`,
    };
  }

  if (!tenantConfig) {
    return {
      ok: false,
      message:
        "Configuração fiscal do tenant não encontrada. Configure CNPJ, certificado e endereço fiscal.",
    };
  }

  // ── Step 3: Validate tenant fiscal readiness ──
  const readiness = validateTenantFiscalReadiness(tenantConfig, docType);
  if (!readiness.ok) {
    return {
      ok: false,
      message: `Configuração fiscal incompleta: ${readiness.missing.join(", ")}`,
    };
  }

  // ── Mark invoice as processing ──
  await updateFiscalStatus(invoiceId, { fiscal_status: "processing" });

  // ── Step 4: Resolve fiscal proxy path ──
  const fiscalProxyPath =
    docType === "nfce" ? FISCAL_PROXY_PATHS.nfce : FISCAL_PROXY_PATHS.nfe;

  try {
    // ── Step 5: Load invoice items ──
    const items = await loadInvoiceItems(invoiceId);
    if (items.length === 0) {
      await updateFiscalStatus(invoiceId, {
        fiscal_status: "error",
        fiscal_error_message: "Fatura sem itens",
      });
      return { ok: false, message: "A fatura não possui itens." };
    }

    // ── Step 6: Consume next fiscal number ──
    const { series, number: nfNumber } = await consumeNextFiscalNumber(
      resolvedTenantId,
      docType,
    );

    // ── Step 7: Build NF-e/NFC-e payload ──
    const buildResult = buildNFePayload(
      invoice as unknown as InvoiceRow,
      items,
      tenantConfig,
      series,
      nfNumber,
    );

    if (!buildResult.ok || !buildResult.payload) {
      await updateFiscalStatus(invoiceId, {
        fiscal_status: "error",
        fiscal_error_message: buildResult.error ?? "Falha ao montar payload",
      });
      return {
        ok: false,
        message: buildResult.error ?? "Falha ao montar payload fiscal.",
      };
    }

    // ── Step 8: POST to PHP microservice (via Cloudflare Worker proxy) ──
    const response = await api.post(fiscalProxyPath, {
      ...buildResult.payload,
      invoice_id: invoiceId,
      tenant_id: resolvedTenantId,
      requested_by: userId ?? null,
    });

    const body = response.data as Row;

    const status = String(body?.status ?? body?.fiscal_status ?? "processing");
    const isAuthorized =
      status === "authorized" ||
      status === "approved" ||
      status === "success" ||
      body?.authorized === true;

    const mappedStatus = isAuthorized ? "authorized" : status;

    // ── Step 9: Persist SEFAZ response ──
    const persistedPayload: Row = {
      id: invoiceId,
      fiscal_status: mappedStatus,
      fiscal_number:
        toStringOrNull(body?.number ?? body?.fiscal_number) ?? String(nfNumber),
      fiscal_series:
        toStringOrNull(body?.series ?? body?.fiscal_series) ?? String(series),
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
        : String(body?.message ?? "Emissão fiscal enviada para processamento."),
      invoice: { ...invoice, ...persistedPayload },
    };
  } catch (error) {
    const msg = getApiErrorMessage(error, "Falha ao emitir documento fiscal");
    await updateFiscalStatus(invoiceId, {
      fiscal_status: "error",
      fiscal_error_message: msg,
    });
    return { ok: false, message: msg };
  }
}
