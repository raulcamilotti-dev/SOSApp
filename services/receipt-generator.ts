/**
 * Receipt Generator Service (Automação de Recibos)
 *
 * Automatically generates receipt documents when accounts_receivable
 * entries are marked as "paid". Uses the document-templates system
 * to fill a receipt template with financial data and optionally
 * generate a PDF.
 *
 * Flow:
 *   1. ContasAReceber status → "paid"
 *   2. generateReceipt() is called with the AR entry + context
 *   3. Finds or creates a "Recibo" template for the tenant
 *   4. Fills variables from AR entry + customer data
 *   5. Creates a generated_documents record (+ optional PDF)
 *   6. Optionally creates a notification
 *
 * Tables: document_templates, generated_documents, accounts_receivable, customers
 * Depends on: services/document-templates.ts, services/crud.ts, services/pix.ts
 */

import { api, getApiErrorMessage } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import {
    buildFullHtml,
    createGeneratedDocument,
    createTemplate,
    generatePdf,
    interpolateVariables,
    listTemplates,
    type DocumentTemplate,
} from "@/services/document-templates";

/* ------------------------------------------------------------------ */
/*  Receipt Template HTML                                              */
/* ------------------------------------------------------------------ */

export const RECEIPT_TEMPLATE_HTML = `<div style="text-align:center; margin-bottom:30px;">
  <h1 style="font-size:20pt; margin-bottom:4px;">RECIBO DE PAGAMENTO</h1>
  <p style="font-size:11pt; color:#666;">Nº {{recibo_numero}}</p>
</div>

<div style="border:1px solid #ddd; border-radius:8px; padding:20px; margin-bottom:24px;">
  <table style="width:100%; border:none;">
    <tr style="border:none;">
      <td style="border:none; width:50%; vertical-align:top;">
        <p style="color:#888; font-size:9pt; margin-bottom:2px;">RECEBEMOS DE</p>
        <p style="font-size:12pt; font-weight:bold;">{{cliente_nome}}</p>
        <p style="font-size:10pt;">CPF/CNPJ: {{cliente_documento}}</p>
        <p style="font-size:10pt;">{{cliente_email}}</p>
      </td>
      <td style="border:none; width:50%; vertical-align:top; text-align:right;">
        <p style="color:#888; font-size:9pt; margin-bottom:2px;">DATA</p>
        <p style="font-size:12pt;">{{data_recebimento}}</p>
        <p style="color:#888; font-size:9pt; margin-bottom:2px; margin-top:12px;">VENCIMENTO</p>
        <p style="font-size:12pt;">{{data_vencimento}}</p>
      </td>
    </tr>
  </table>
</div>

<div style="background:#f8f9fa; border-radius:8px; padding:20px; margin-bottom:24px;">
  <p style="color:#888; font-size:9pt; margin-bottom:4px;">DESCRIÇÃO</p>
  <p style="font-size:12pt;">{{descricao}}</p>
  <p style="font-size:10pt; color:#666; margin-top:4px;">Categoria: {{categoria}}</p>
</div>

<div style="display:flex; gap:20px; margin-bottom:24px;">
  <div style="flex:1; background:#e8f5e9; border-radius:8px; padding:16px; text-align:center;">
    <p style="color:#2e7d32; font-size:9pt; margin-bottom:4px;">VALOR TOTAL</p>
    <p style="font-size:18pt; font-weight:bold; color:#2e7d32;">R$ {{valor_total}}</p>
  </div>
  <div style="flex:1; background:#e3f2fd; border-radius:8px; padding:16px; text-align:center;">
    <p style="color:#1565c0; font-size:9pt; margin-bottom:4px;">VALOR RECEBIDO</p>
    <p style="font-size:18pt; font-weight:bold; color:#1565c0;">R$ {{valor_recebido}}</p>
  </div>
</div>

<div style="border:1px solid #ddd; border-radius:8px; padding:16px; margin-bottom:24px;">
  <p style="color:#888; font-size:9pt; margin-bottom:4px;">FORMA DE PAGAMENTO</p>
  <p style="font-size:12pt;">{{forma_pagamento}}</p>
  {{#pix_info}}
  <p style="font-size:10pt; color:#666; margin-top:4px;">Chave PIX: {{pix_chave}}</p>
  {{/pix_info}}
</div>

{{#observacoes}}
<div style="border-left:3px solid #1976d2; padding-left:12px; margin-bottom:24px;">
  <p style="color:#888; font-size:9pt; margin-bottom:4px;">OBSERVAÇÕES</p>
  <p style="font-size:10pt;">{{observacoes}}</p>
</div>
{{/observacoes}}

<div style="margin-top:40px; text-align:center;">
  <p style="font-size:10pt; color:#666;">{{cidade_estado}}, {{data_extenso}}</p>
</div>

<div style="display:flex; justify-content:space-around; margin-top:50px;">
  <div style="text-align:center;">
    <div style="border-top:1px solid #333; width:250px; padding-top:8px;">
      <p style="font-size:10pt;">{{empresa_nome}}</p>
      <p style="font-size:9pt; color:#666;">Recebedor</p>
    </div>
  </div>
  <div style="text-align:center;">
    <div style="border-top:1px solid #333; width:250px; padding-top:8px;">
      <p style="font-size:10pt;">{{cliente_nome}}</p>
      <p style="font-size:9pt; color:#666;">Pagador</p>
    </div>
  </div>
</div>

<div style="margin-top:30px; text-align:center;">
  <p style="font-size:8pt; color:#999;">Documento gerado automaticamente pelo SOS Platform</p>
</div>`;

export const RECEIPT_TEMPLATE_VARIABLES = [
  {
    key: "recibo_numero",
    label: "Número do Recibo",
    type: "text" as const,
    source: "manual" as const,
    required: true,
  },
  {
    key: "cliente_nome",
    label: "Nome do Cliente",
    type: "text" as const,
    source: "customer" as const,
    sourceField: "name",
  },
  {
    key: "cliente_documento",
    label: "CPF/CNPJ do Cliente",
    type: "text" as const,
    source: "customer" as const,
    sourceField: "cpf",
  },
  {
    key: "cliente_email",
    label: "Email do Cliente",
    type: "text" as const,
    source: "customer" as const,
    sourceField: "email",
  },
  {
    key: "data_recebimento",
    label: "Data do Recebimento",
    type: "date" as const,
    source: "manual" as const,
  },
  {
    key: "data_vencimento",
    label: "Data de Vencimento",
    type: "date" as const,
    source: "manual" as const,
  },
  {
    key: "descricao",
    label: "Descrição",
    type: "text" as const,
    source: "manual" as const,
    required: true,
  },
  {
    key: "categoria",
    label: "Categoria",
    type: "text" as const,
    source: "manual" as const,
  },
  {
    key: "valor_total",
    label: "Valor Total",
    type: "currency" as const,
    source: "manual" as const,
    required: true,
  },
  {
    key: "valor_recebido",
    label: "Valor Recebido",
    type: "currency" as const,
    source: "manual" as const,
  },
  {
    key: "forma_pagamento",
    label: "Forma de Pagamento",
    type: "text" as const,
    source: "manual" as const,
  },
  {
    key: "pix_chave",
    label: "Chave PIX",
    type: "text" as const,
    source: "manual" as const,
  },
  {
    key: "observacoes",
    label: "Observações",
    type: "textarea" as const,
    source: "manual" as const,
  },
  {
    key: "cidade_estado",
    label: "Cidade/Estado",
    type: "text" as const,
    source: "manual" as const,
  },
  {
    key: "data_extenso",
    label: "Data por Extenso",
    type: "text" as const,
    source: "manual" as const,
  },
  {
    key: "empresa_nome",
    label: "Nome da Empresa",
    type: "text" as const,
    source: "manual" as const,
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: "PIX",
  boleto: "Boleto Bancário",
  transfer: "Transferência Bancária",
  credit_card: "Cartão de Crédito",
  cash: "Dinheiro",
  other: "Outro",
};

function formatCurrencyBR(value: unknown): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "0,00";
  return num.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateBR(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return new Date().toLocaleDateString("pt-BR");
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("pt-BR");
}

function formatDateExtensoBR(): string {
  return new Date().toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Generate a sequential receipt number for the tenant.
 * Format: REC-YYYYMM-NNN (e.g., REC-202602-001)
 */
async function generateReceiptNumber(tenantId: string): Promise<string> {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `REC-${yearMonth}`;

  try {
    // Count existing receipts this month to generate sequential number
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "generated_documents",
      ...buildSearchParams(
        [
          { field: "tenant_id", value: tenantId },
          { field: "name", value: `%${prefix}%`, operator: "ilike" },
        ],
        { sortColumn: "created_at DESC", limit: 1 },
      ),
    });
    const existing = normalizeCrudList<{ name: string }>(res.data);
    const nextNum = existing.length + 1;
    return `${prefix}-${String(nextNum).padStart(3, "0")}`;
  } catch {
    return `${prefix}-001`;
  }
}

/* ------------------------------------------------------------------ */
/*  Find or create the receipt template for a tenant                   */
/* ------------------------------------------------------------------ */

async function getOrCreateReceiptTemplate(
  tenantId: string,
): Promise<DocumentTemplate> {
  // Look for an existing active "recibo" template for this tenant
  const templates = await listTemplates();
  const existing = templates.find(
    (t) =>
      t.category === "recibo" &&
      String(t.tenant_id) === String(tenantId) &&
      t.is_active !== false,
  );

  if (existing) return existing;

  // Create the default receipt template
  await createTemplate({
    tenant_id: tenantId,
    name: "Recibo de Pagamento (Automático)",
    description:
      "Template usado para gerar recibos automaticamente quando uma conta é recebida.",
    category: "recibo",
    content_html: RECEIPT_TEMPLATE_HTML,
    variables: RECEIPT_TEMPLATE_VARIABLES,
    is_active: true,
    header_html: "",
    footer_html: "",
    page_config: {
      size: "A4",
      orientation: "portrait",
      margins: { top: 15, right: 15, bottom: 15, left: 15 },
    },
  });

  // Re-fetch to get the created template with ID
  const refreshed = await listTemplates();
  const created = refreshed.find(
    (t) =>
      t.category === "recibo" &&
      String(t.tenant_id) === String(tenantId) &&
      t.name === "Recibo de Pagamento (Automático)",
  );

  if (!created) throw new Error("Failed to create receipt template");
  return created;
}

/* ------------------------------------------------------------------ */
/*  Fetch customer data for variable filling                           */
/* ------------------------------------------------------------------ */

async function fetchCustomer(
  customerId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "customers",
      ...buildSearchParams([{ field: "id", value: customerId }]),
    });
    const rows = normalizeCrudList<Record<string, unknown>>(res.data);
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Fetch tenant info for company name                                 */
/* ------------------------------------------------------------------ */

async function fetchTenant(
  tenantId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "tenants",
      ...buildSearchParams([{ field: "id", value: tenantId }]),
    });
    const rows = normalizeCrudList<Record<string, unknown>>(res.data);
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Main: Generate Receipt                                             */
/* ------------------------------------------------------------------ */

export interface ReceiptContext {
  /** The accounts_receivable entry */
  entry: Record<string, unknown>;
  /** Tenant ID */
  tenantId: string;
  /** User ID who confirmed the payment */
  userId?: string;
  /** Whether to generate PDF (default: true) */
  generatePdfDoc?: boolean;
}

export interface ReceiptResult {
  success: boolean;
  receiptNumber?: string;
  documentId?: string;
  pdfUrl?: string;
  error?: string;
}

/**
 * Generate a receipt automatically when an accounts_receivable entry is paid.
 *
 * Steps:
 * 1. Get or create receipt template for tenant
 * 2. Fetch customer + tenant data
 * 3. Fill template variables from AR entry
 * 4. Generate HTML receipt
 * 5. Optionally generate PDF
 * 6. Save as generated_document
 * 7. Update AR entry with receipt reference
 */
export async function generateReceipt(
  ctx: ReceiptContext,
): Promise<ReceiptResult> {
  const { entry, tenantId, userId, generatePdfDoc = true } = ctx;

  try {
    // 1. Get receipt template
    const template = await getOrCreateReceiptTemplate(tenantId);

    // 2. Generate receipt number
    const receiptNumber = await generateReceiptNumber(tenantId);

    // 3. Fetch related data
    const [customer, tenant] = await Promise.all([
      entry.customer_id
        ? fetchCustomer(String(entry.customer_id))
        : Promise.resolve(null),
      fetchTenant(tenantId),
    ]);

    // 4. Build variable values from AR entry + context
    const variables: Record<string, string> = {
      recibo_numero: receiptNumber,
      // Customer
      cliente_nome: String(customer?.name ?? customer?.fullname ?? "—"),
      cliente_documento: String(
        customer?.cpf ?? customer?.cnpj ?? "Não informado",
      ),
      cliente_email: String(customer?.email ?? "—"),
      // Dates
      data_recebimento: formatDateBR(
        entry.received_at ?? new Date().toISOString(),
      ),
      data_vencimento: formatDateBR(entry.due_date),
      // Financial
      descricao: String(entry.description ?? ""),
      categoria: String(entry.category ?? "Geral"),
      valor_total: formatCurrencyBR(entry.amount),
      valor_recebido: formatCurrencyBR(entry.amount_received ?? entry.amount),
      // Payment
      forma_pagamento:
        PAYMENT_METHOD_LABELS[String(entry.payment_method ?? "")] ??
        String(entry.payment_method ?? "Não informado"),
      pix_chave: entry.pix_key ? String(entry.pix_key) : "",
      // Misc
      observacoes: String(entry.notes ?? ""),
      cidade_estado: "Brasil",
      data_extenso: formatDateExtensoBR(),
      empresa_nome: String(
        tenant?.company_name ?? tenant?.name ?? "SOS Platform",
      ),
    };

    // 5. Clean conditional blocks (simple mustache-like {{#block}}...{{/block}})
    let html = template.content_html;

    // Handle {{#pix_info}} block — show only if pix_key exists
    if (variables.pix_chave) {
      html = html
        .replace(/\{\{#pix_info\}\}/g, "")
        .replace(/\{\{\/pix_info\}\}/g, "");
    } else {
      html = html.replace(/\{\{#pix_info\}\}[\s\S]*?\{\{\/pix_info\}\}/g, "");
    }

    // Handle {{#observacoes}} block
    if (variables.observacoes && variables.observacoes !== "") {
      html = html
        .replace(/\{\{#observacoes\}\}/g, "")
        .replace(/\{\{\/observacoes\}\}/g, "");
    } else {
      html = html.replace(
        /\{\{#observacoes\}\}[\s\S]*?\{\{\/observacoes\}\}/g,
        "",
      );
    }

    // 6. Interpolate all {{variables}}
    const filledHtml = interpolateVariables(html, variables);

    // 7. Build full HTML document with styles
    const fullHtml = buildFullHtml(template, filledHtml);

    // 8. Optionally generate PDF
    let pdfBase64: string | undefined;
    let pdfUrl: string | undefined;

    if (generatePdfDoc) {
      try {
        const pdfResult = await generatePdf({
          html: fullHtml,
          documentName: `Recibo ${receiptNumber}`,
          pageConfig: template.page_config ?? undefined,
        });
        pdfBase64 = pdfResult.pdf_base64;
        pdfUrl = pdfResult.url;
      } catch (pdfErr) {
        console.warn("[Receipt] PDF generation failed (non-blocking):", pdfErr);
        // Continue without PDF — the HTML receipt is still valid
      }
    }

    // 9. Save as generated_document
    const docPayload: any = {
      tenant_id: tenantId,
      template_id: template.id,
      name: `Recibo ${receiptNumber}`,
      filled_html: fullHtml,
      variables_used: variables,
      pdf_base64: pdfBase64 ?? "",
      pdf_url: pdfUrl ?? "",
      status: "generated",
      created_by: userId ?? "",
    };

    await createGeneratedDocument(docPayload);
    const documentId = receiptNumber;

    // 10. Update AR entry with receipt reference in notes
    try {
      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "accounts_receivable",
        payload: {
          id: String(entry.id),
          notes: [
            String(entry.notes ?? ""),
            `[Recibo automático: ${receiptNumber}]`,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      });
    } catch {
      // Non-blocking — receipt was generated, just couldn't update notes
    }

    return {
      success: true,
      receiptNumber,
      documentId,
      pdfUrl,
    };
  } catch (err) {
    const message = getApiErrorMessage(err, "Erro ao gerar recibo");
    console.error("[Receipt] Generation failed:", err);
    return {
      success: false,
      error: message,
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Automation: Register receipt automation for a tenant               */
/* ------------------------------------------------------------------ */

/**
 * Creates an automation entry that triggers receipt generation
 * when accounts_receivable status changes to "paid".
 */
export async function registerReceiptAutomation(
  tenantId: string,
): Promise<void> {
  // Check if automation already exists
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "automations",
    ...buildSearchParams([
      { field: "tenant_id", value: tenantId },
      {
        field: "trigger",
        value: "accounts_receivable.paid",
        operator: "equal",
      },
    ]),
  });

  const existing = normalizeCrudList<Record<string, unknown>>(res.data).filter(
    (r) => !r.deleted_at,
  );

  if (existing.length > 0) return; // Already registered

  await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "automations",
    payload: {
      tenant_id: tenantId,
      trigger: "accounts_receivable.paid",
      action: "generate_receipt",
      config: JSON.stringify({
        template_category: "recibo",
        generate_pdf: true,
        auto_notify: true,
        description:
          "Gera recibo automaticamente quando uma conta a receber é marcada como paga",
      }),
    },
  });
}

/**
 * Check if receipt automation is enabled for a tenant.
 */
export async function isReceiptAutomationEnabled(
  tenantId: string,
): Promise<boolean> {
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "automations",
      ...buildSearchParams([
        { field: "tenant_id", value: tenantId },
        {
          field: "trigger",
          value: "accounts_receivable.paid",
          operator: "equal",
        },
      ]),
    });

    const rows = normalizeCrudList<Record<string, unknown>>(res.data).filter(
      (r) => !r.deleted_at,
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * Log an automation execution (for audit trail).
 */
export async function logAutomationExecution(params: {
  tenantId: string;
  trigger: string;
  action: string;
  inputData: Record<string, unknown>;
  outputData: Record<string, unknown>;
  status: "success" | "error";
  errorMessage?: string;
}): Promise<void> {
  try {
    await api.post(CRUD_ENDPOINT, {
      action: "create",
      table: "automation_executions",
      payload: {
        tenant_id: params.tenantId,
        trigger: params.trigger,
        action: params.action,
        input_data: JSON.stringify(params.inputData),
        output_data: JSON.stringify(params.outputData),
        status: params.status,
        error_message: params.errorMessage ?? "",
      },
    });
  } catch {
    // Non-blocking — don't fail the main operation
    console.warn("[Receipt] Failed to log automation execution");
  }
}
