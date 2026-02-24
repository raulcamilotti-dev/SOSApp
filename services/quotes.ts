/**
 * Quotes (Orçamentos) Service
 *
 * Manages quotes with line items, template rendering,
 * public URL sharing, and client approval/rejection.
 *
 * Architecture:
 * - quotes table: header (total, status, token, template)
 * - quote_items table: line items (description, qty, unit_price)
 * - Reuses document_templates for rendering (optional)
 * - Public access via token (no CPF needed, link is the auth)
 * - Integrates with Processo.tsx and Portal Público
 */

import { type TemplateVariable } from "@/services/document-templates";
import axios, { type AxiosInstance } from "axios";
import { buildSearchParams, CRUD_ENDPOINT, normalizeCrudList } from "./crud";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const N8N_API_KEY = process.env.EXPO_PUBLIC_N8N_API_KEY ?? "";

/** Direct axios instance — no user auth token, but includes Worker API key */
const publicApi = axios.create({
  timeout: 15000,
  headers: { "X-Api-Key": N8N_API_KEY },
});

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type QuoteStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "approved"
  | "rejected"
  | "expired";

export interface Quote {
  id: string;
  tenant_id: string;
  service_order_id: string;
  workflow_step_id?: string | null;
  template_id?: string | null;
  token: string;
  title: string;
  description?: string | null;
  subtotal: number;
  discount: number;
  total: number;
  valid_until?: string | null;
  notes?: string | null;
  status: QuoteStatus;
  approved_at?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  filled_html?: string | null;
  pdf_url?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface QuoteItem {
  id: string;
  quote_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

/** Payload for creating/updating items */
export interface QuoteItemInput {
  description: string;
  quantity: number;
  unit_price: number;
  sort_order?: number;
}

/** Public quote data (no sensitive info) */
export interface PublicQuoteData {
  title: string;
  description: string | null;
  items: QuoteItem[];
  subtotal: number;
  discount: number;
  total: number;
  validUntil: string | null;
  notes: string | null;
  status: QuoteStatus;
  tenantName: string;
  orderTitle: string;
  createdAt: string;
  filledHtml: string | null;
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

/** Generate a URL-safe token (32 hex chars) */
export function generateQuoteToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 32; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

/* ------------------------------------------------------------------ */
/*  Quote CRUD (authenticated — needs api instance)                    */
/* ------------------------------------------------------------------ */

/**
 * List all quotes for a service_order
 */
export async function listQuotes(
  authApi: AxiosInstance,
  serviceOrderId: string,
): Promise<Quote[]> {
  const res = await authApi.post(CRUD_ENDPOINT, {
    action: "list",
    table: "quotes",
    ...buildSearchParams(
      [{ field: "service_order_id", value: serviceOrderId }],
      { sortColumn: "created_at DESC" },
    ),
  });
  return normalizeCrudList<Quote>(res.data).filter((q) => !q.deleted_at);
}

/**
 * Get a single quote by ID
 */
export async function getQuote(
  authApi: AxiosInstance,
  quoteId: string,
): Promise<Quote | null> {
  const res = await authApi.post(CRUD_ENDPOINT, {
    action: "list",
    table: "quotes",
    ...buildSearchParams([{ field: "id", value: quoteId }]),
  });
  const list = normalizeCrudList<Quote>(res.data);
  return list[0] ?? null;
}

/**
 * Create a new quote with items
 */
export async function createQuote(
  authApi: AxiosInstance,
  params: {
    tenantId: string;
    serviceOrderId: string;
    workflowStepId?: string;
    templateId?: string;
    title: string;
    description?: string;
    items: QuoteItemInput[];
    discount?: number;
    validUntil?: string;
    notes?: string;
    createdBy?: string;
    filledHtml?: string;
  },
): Promise<Quote> {
  const token = generateQuoteToken();

  // Calculate totals
  const subtotal = params.items.reduce(
    (sum, item) => sum + Number(item.quantity) * Number(item.unit_price),
    0,
  );
  const discount = Number(params.discount ?? 0) || 0;
  const total = Math.max(0, subtotal - discount);

  // Create quote header
  await authApi.post(CRUD_ENDPOINT, {
    action: "create",
    table: "quotes",
    payload: {
      tenant_id: params.tenantId,
      service_order_id: params.serviceOrderId,
      workflow_step_id: params.workflowStepId || null,
      template_id: params.templateId || null,
      token,
      title: params.title,
      description: params.description || null,
      subtotal: subtotal.toFixed(2),
      discount: discount.toFixed(2),
      total: total.toFixed(2),
      valid_until: params.validUntil || null,
      notes: params.notes || null,
      status: "draft",
      filled_html: params.filledHtml || null,
      created_by: params.createdBy || null,
    },
  });

  // Get the created quote to retrieve its ID
  const createdQuotes = await authApi.post(CRUD_ENDPOINT, {
    action: "list",
    table: "quotes",
    ...buildSearchParams([{ field: "token", value: token }], { limit: 1 }),
  });
  const quote = normalizeCrudList<Quote>(createdQuotes.data)[0];
  if (!quote) throw new Error("Erro ao criar orçamento");

  // Create line items
  for (let i = 0; i < params.items.length; i++) {
    const item = params.items[i];
    await authApi.post(CRUD_ENDPOINT, {
      action: "create",
      table: "quote_items",
      payload: {
        quote_id: quote.id,
        description: item.description,
        quantity: item.quantity.toFixed(2),
        unit_price: item.unit_price.toFixed(2),
        subtotal: (item.quantity * item.unit_price).toFixed(2),
        sort_order: item.sort_order ?? i,
      },
    });
  }

  return quote;
}

/**
 * Update quote header (not items)
 */
export async function updateQuote(
  authApi: AxiosInstance,
  quoteId: string,
  payload: Partial<
    Pick<
      Quote,
      | "title"
      | "description"
      | "discount"
      | "valid_until"
      | "notes"
      | "status"
      | "filled_html"
      | "pdf_url"
    >
  >,
): Promise<void> {
  const updatePayload: Record<string, unknown> = { id: quoteId };
  if (payload.title !== undefined) updatePayload.title = payload.title;
  if (payload.description !== undefined)
    updatePayload.description = payload.description;
  if (payload.discount !== undefined)
    updatePayload.discount = Number(payload.discount).toFixed(2);
  if (payload.valid_until !== undefined)
    updatePayload.valid_until = payload.valid_until;
  if (payload.notes !== undefined) updatePayload.notes = payload.notes;
  if (payload.status !== undefined) updatePayload.status = payload.status;
  if (payload.filled_html !== undefined)
    updatePayload.filled_html = payload.filled_html;
  if (payload.pdf_url !== undefined) updatePayload.pdf_url = payload.pdf_url;
  updatePayload.updated_at = new Date().toISOString();

  await authApi.post(CRUD_ENDPOINT, {
    action: "update",
    table: "quotes",
    payload: updatePayload,
  });
}

/**
 * Recalculate quote totals from its items
 */
export async function recalculateQuoteTotals(
  authApi: AxiosInstance,
  quoteId: string,
): Promise<{ subtotal: number; total: number }> {
  const items = await listQuoteItems(authApi, quoteId);
  const subtotal = items.reduce((sum, item) => sum + Number(item.subtotal), 0);

  const quote = await getQuote(authApi, quoteId);
  const discount = quote ? Number(quote.discount) || 0 : 0;
  const total = Math.max(0, subtotal - discount);

  await authApi.post(CRUD_ENDPOINT, {
    action: "update",
    table: "quotes",
    payload: {
      id: quoteId,
      subtotal: subtotal.toFixed(2),
      total: total.toFixed(2),
      updated_at: new Date().toISOString(),
    },
  });

  return { subtotal, total };
}

/**
 * Send quote to client (changes status to "sent")
 */
export async function sendQuote(
  authApi: AxiosInstance,
  quoteId: string,
): Promise<void> {
  await updateQuote(authApi, quoteId, { status: "sent" });
}

/**
 * Soft-delete a quote
 */
export async function deleteQuote(
  authApi: AxiosInstance,
  quoteId: string,
): Promise<void> {
  await authApi.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "quotes",
    payload: { id: quoteId, deleted_at: new Date().toISOString() },
  });
}

/* ------------------------------------------------------------------ */
/*  Quote Items CRUD (authenticated)                                   */
/* ------------------------------------------------------------------ */

/**
 * List items for a quote
 */
export async function listQuoteItems(
  authApi: AxiosInstance,
  quoteId: string,
): Promise<QuoteItem[]> {
  const res = await authApi.post(CRUD_ENDPOINT, {
    action: "list",
    table: "quote_items",
    ...buildSearchParams([{ field: "quote_id", value: quoteId }], {
      sortColumn: "sort_order ASC",
    }),
  });
  return normalizeCrudList<QuoteItem>(res.data).filter(
    (item) => !item.deleted_at,
  );
}

/**
 * Add an item to a quote (and recalculate totals)
 */
export async function addQuoteItem(
  authApi: AxiosInstance,
  quoteId: string,
  item: QuoteItemInput,
): Promise<void> {
  await authApi.post(CRUD_ENDPOINT, {
    action: "create",
    table: "quote_items",
    payload: {
      quote_id: quoteId,
      description: item.description,
      quantity: item.quantity.toFixed(2),
      unit_price: item.unit_price.toFixed(2),
      subtotal: (item.quantity * item.unit_price).toFixed(2),
      sort_order: item.sort_order ?? 0,
    },
  });
  await recalculateQuoteTotals(authApi, quoteId);
}

/**
 * Remove an item from a quote (soft delete + recalculate)
 */
export async function removeQuoteItem(
  authApi: AxiosInstance,
  quoteId: string,
  itemId: string,
): Promise<void> {
  await authApi.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "quote_items",
    payload: { id: itemId, deleted_at: new Date().toISOString() },
  });
  await recalculateQuoteTotals(authApi, quoteId);
}

/* ------------------------------------------------------------------ */
/*  Public Quote Access (no auth)                                      */
/* ------------------------------------------------------------------ */

/**
 * Validate a quote token and return basic info
 */
export async function validateQuoteToken(
  token: string,
): Promise<{ valid: boolean; title?: string; tenantName?: string }> {
  try {
    const res = await publicApi.post(CRUD_ENDPOINT, {
      action: "list",
      table: "quotes",
      ...buildSearchParams([{ field: "token", value: token }]),
    });
    const quotes = normalizeCrudList<Quote>(res.data).filter(
      (q) => !q.deleted_at,
    );
    if (quotes.length === 0) return { valid: false };

    const quote = quotes[0];

    // Get tenant name
    let tenantName = "";
    try {
      const tenantRes = await publicApi.post(CRUD_ENDPOINT, {
        action: "list",
        table: "tenants",
        ...buildSearchParams([{ field: "id", value: quote.tenant_id }]),
      });
      const tenants = normalizeCrudList<{ name: string }>(tenantRes.data);
      tenantName = tenants[0]?.name ?? "";
    } catch {
      /* ignore */
    }

    return { valid: true, title: quote.title, tenantName };
  } catch {
    return { valid: false };
  }
}

/**
 * Load full quote data for public display
 */
export async function loadPublicQuote(
  token: string,
): Promise<PublicQuoteData | null> {
  try {
    // Fetch quote
    const quoteRes = await publicApi.post(CRUD_ENDPOINT, {
      action: "list",
      table: "quotes",
      ...buildSearchParams([{ field: "token", value: token }]),
    });
    const quotes = normalizeCrudList<Quote>(quoteRes.data).filter(
      (q) => !q.deleted_at,
    );
    if (quotes.length === 0) return null;

    const quote = quotes[0];

    // Draft quotes should not be accessible publicly
    if (quote.status === "draft") return null;

    // Mark as viewed if sent
    if (quote.status === "sent") {
      try {
        await publicApi.post(CRUD_ENDPOINT, {
          action: "update",
          table: "quotes",
          payload: { id: quote.id, status: "viewed" },
        });
      } catch {
        /* ignore */
      }
    }

    // Fetch items
    const itemsRes = await publicApi.post(CRUD_ENDPOINT, {
      action: "list",
      table: "quote_items",
      ...buildSearchParams([{ field: "quote_id", value: quote.id }], {
        sortColumn: "sort_order ASC",
      }),
    });
    const items = normalizeCrudList<QuoteItem>(itemsRes.data).filter(
      (i) => !i.deleted_at,
    );

    // Fetch tenant name
    let tenantName = "";
    try {
      const tenantRes = await publicApi.post(CRUD_ENDPOINT, {
        action: "list",
        table: "tenants",
        ...buildSearchParams([{ field: "id", value: quote.tenant_id }]),
      });
      tenantName =
        normalizeCrudList<{ name: string }>(tenantRes.data)[0]?.name ?? "";
    } catch {
      /* ignore */
    }

    // Fetch order title
    let orderTitle = "";
    try {
      const orderRes = await publicApi.post(CRUD_ENDPOINT, {
        action: "list",
        table: "service_orders",
        ...buildSearchParams([{ field: "id", value: quote.service_order_id }]),
      });
      orderTitle =
        normalizeCrudList<{ title: string }>(orderRes.data)[0]?.title ?? "";
    } catch {
      /* ignore */
    }

    return {
      title: quote.title,
      description: quote.description ?? null,
      items,
      subtotal: Number(quote.subtotal),
      discount: Number(quote.discount),
      total: Number(quote.total),
      validUntil: quote.valid_until ?? null,
      notes: quote.notes ?? null,
      status: quote.status as QuoteStatus,
      tenantName,
      orderTitle,
      createdAt: quote.created_at ?? "",
      filledHtml: quote.filled_html ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Client approves a quote (public, no auth)
 */
export async function approveQuote(token: string): Promise<boolean> {
  try {
    const quoteRes = await publicApi.post(CRUD_ENDPOINT, {
      action: "list",
      table: "quotes",
      ...buildSearchParams([{ field: "token", value: token }]),
    });
    const quotes = normalizeCrudList<Quote>(quoteRes.data).filter(
      (q) => !q.deleted_at,
    );
    if (quotes.length === 0) return false;

    const quote = quotes[0];
    if (quote.status === "approved" || quote.status === "rejected")
      return false;

    // Check expiry
    if (quote.valid_until) {
      const expiry = new Date(quote.valid_until);
      if (expiry < new Date()) {
        await publicApi.post(CRUD_ENDPOINT, {
          action: "update",
          table: "quotes",
          payload: { id: quote.id, status: "expired" },
        });
        return false;
      }
    }

    await publicApi.post(CRUD_ENDPOINT, {
      action: "update",
      table: "quotes",
      payload: {
        id: quote.id,
        status: "approved",
        approved_at: new Date().toISOString(),
      },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Client rejects a quote (public, no auth)
 */
export async function rejectQuote(
  token: string,
  reason?: string,
): Promise<boolean> {
  try {
    const quoteRes = await publicApi.post(CRUD_ENDPOINT, {
      action: "list",
      table: "quotes",
      ...buildSearchParams([{ field: "token", value: token }]),
    });
    const quotes = normalizeCrudList<Quote>(quoteRes.data).filter(
      (q) => !q.deleted_at,
    );
    if (quotes.length === 0) return false;

    const quote = quotes[0];
    if (quote.status === "approved" || quote.status === "rejected")
      return false;

    await publicApi.post(CRUD_ENDPOINT, {
      action: "update",
      table: "quotes",
      payload: {
        id: quote.id,
        status: "rejected",
        rejected_at: new Date().toISOString(),
        rejection_reason: reason || null,
      },
    });
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  URL Builders                                                       */
/* ------------------------------------------------------------------ */

export function buildQuoteUrl(token: string): string {
  const baseUrl =
    typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.host}`
      : "https://app.radul.com.br";
  return `${baseUrl}/q/${token}`;
}

export function buildQuoteWhatsAppUrl(token: string, title: string): string {
  const url = buildQuoteUrl(token);
  const text = encodeURIComponent(
    `Olá! Segue o orçamento "${title}":\n\n${url}\n\nPor favor, revise os itens e valores. Você pode aprovar ou recusar diretamente pelo link.`,
  );
  return `https://wa.me/?text=${text}`;
}

/* ------------------------------------------------------------------ */
/*  Quote Variables for Document Templates                             */
/* ------------------------------------------------------------------ */

export const QUOTE_VARIABLES: TemplateVariable[] = [
  {
    key: "orcamento_titulo",
    label: "Título do Orçamento",
    type: "text",
    source: "manual",
  },
  {
    key: "orcamento_itens",
    label: "Tabela de Itens do Orçamento",
    type: "text",
    source: "manual",
  },
  {
    key: "orcamento_subtotal",
    label: "Subtotal do Orçamento",
    type: "currency",
    source: "manual",
  },
  {
    key: "orcamento_desconto",
    label: "Desconto do Orçamento",
    type: "currency",
    source: "manual",
  },
  {
    key: "orcamento_total",
    label: "Total do Orçamento",
    type: "currency",
    source: "manual",
  },
  {
    key: "orcamento_validade",
    label: "Validade do Orçamento",
    type: "date",
    source: "manual",
  },
  {
    key: "orcamento_notas",
    label: "Observações do Orçamento",
    type: "textarea",
    source: "manual",
  },
  {
    key: "estimativa_custo",
    label: "Custo Estimado (R$)",
    type: "currency",
    source: "process",
    sourceField: "estimated_cost",
  },
  {
    key: "estimativa_prazo_dias",
    label: "Prazo Estimado (dias)",
    type: "number",
    source: "process",
    sourceField: "estimated_duration_days",
  },
  {
    key: "estimativa_data_conclusao",
    label: "Data Prevista de Conclusão",
    type: "date",
    source: "process",
    sourceField: "estimated_completion_date",
  },
];

/**
 * Build variable values for a quote to use in template interpolation
 */
export function buildQuoteVariableValues(
  quote: Quote,
  items: QuoteItem[],
  orderEstimates?: {
    estimated_cost?: number | null;
    estimated_duration_days?: number | null;
    estimated_completion_date?: string | null;
  },
): Record<string, string> {
  const formatCurrency = (value: number) =>
    value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // Build items HTML table
  const itemsHtml =
    items.length > 0
      ? `<table style="width:100%;border-collapse:collapse;margin:10px 0">
        <thead>
          <tr style="background:#f5f5f5">
            <th style="border:1px solid #ddd;padding:8px;text-align:left">Item</th>
            <th style="border:1px solid #ddd;padding:8px;text-align:center;width:80px">Qtd</th>
            <th style="border:1px solid #ddd;padding:8px;text-align:right;width:120px">Valor Unit.</th>
            <th style="border:1px solid #ddd;padding:8px;text-align:right;width:120px">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (item) => `
            <tr>
              <td style="border:1px solid #ddd;padding:8px">${item.description}</td>
              <td style="border:1px solid #ddd;padding:8px;text-align:center">${Number(item.quantity)}</td>
              <td style="border:1px solid #ddd;padding:8px;text-align:right">${formatCurrency(Number(item.unit_price))}</td>
              <td style="border:1px solid #ddd;padding:8px;text-align:right">${formatCurrency(Number(item.subtotal))}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>`
      : "<p>Nenhum item adicionado.</p>";

  const values: Record<string, string> = {
    orcamento_titulo: quote.title,
    orcamento_itens: itemsHtml,
    orcamento_subtotal: formatCurrency(Number(quote.subtotal)),
    orcamento_desconto: formatCurrency(Number(quote.discount)),
    orcamento_total: formatCurrency(Number(quote.total)),
    orcamento_validade: quote.valid_until
      ? new Date(quote.valid_until + "T00:00:00").toLocaleDateString("pt-BR")
      : "Sem prazo definido",
    orcamento_notas: quote.notes ?? "",
  };

  // Add estimates if available
  if (orderEstimates) {
    if (orderEstimates.estimated_cost != null) {
      values.estimativa_custo = formatCurrency(
        Number(orderEstimates.estimated_cost),
      );
    }
    if (orderEstimates.estimated_duration_days != null) {
      values.estimativa_prazo_dias = String(
        orderEstimates.estimated_duration_days,
      );
    }
    if (orderEstimates.estimated_completion_date) {
      values.estimativa_data_conclusao = new Date(
        orderEstimates.estimated_completion_date + "T00:00:00",
      ).toLocaleDateString("pt-BR");
    }
  }

  return values;
}

/**
 * List quotes for a service_order for the public portal (no auth)
 */
export async function listPublicQuotes(serviceOrderId: string): Promise<
  {
    token: string;
    title: string;
    total: number;
    status: QuoteStatus;
    validUntil: string | null;
    createdAt: string;
  }[]
> {
  try {
    const res = await publicApi.post(CRUD_ENDPOINT, {
      action: "list",
      table: "quotes",
      ...buildSearchParams(
        [{ field: "service_order_id", value: serviceOrderId }],
        { sortColumn: "created_at DESC" },
      ),
    });
    return normalizeCrudList<Quote>(res.data)
      .filter((q) => !q.deleted_at && q.status !== "draft")
      .map((q) => ({
        token: q.token,
        title: q.title,
        total: Number(q.total),
        status: q.status as QuoteStatus,
        validUntil: q.valid_until ?? null,
        createdAt: q.created_at ?? "",
      }));
  } catch {
    return [];
  }
}
