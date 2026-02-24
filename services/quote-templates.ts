/**
 * Quote Templates Service
 *
 * Manages reusable quote templates and multi-option packages.
 *
 * Architecture:
 *   - quote_templates table stores template items, defaults, and package info
 *   - Templates can be standalone or grouped as package options (is_package=true)
 *   - Applying a template pre-fills quote items on creation
 *   - Multi-option: create multiple quotes with same quote_group_id,
 *     each as a different option_label for the client to pick
 */

import { api } from "./api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
    normalizeCrudOne,
    type CrudFilter,
    type CrudListOptions,
} from "./crud";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface QuoteTemplateItem {
  description: string;
  quantity: number;
  unit_price: number;
  sort_order?: number;
}

export interface QuoteTemplate {
  id: string;
  tenant_id: string;
  name: string;
  description?: string | null;
  items: QuoteTemplateItem[] | string;
  default_discount: number;
  default_valid_days: number;
  default_notes?: string | null;
  /** FK to document_templates — used for PDF/document rendering when creating a quote */
  document_template_id?: string | null;
  is_package: boolean;
  package_name?: string | null;
  package_description?: string | null;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

/** Parsed template ready for use */
export interface ParsedQuoteTemplate extends Omit<QuoteTemplate, "items"> {
  items: QuoteTemplateItem[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Parse template items from JSONB to array */
export function parseTemplateItems(
  items: QuoteTemplateItem[] | string | null | undefined,
): QuoteTemplateItem[] {
  if (!items) return [];
  if (typeof items === "string") {
    try {
      return JSON.parse(items) as QuoteTemplateItem[];
    } catch {
      return [];
    }
  }
  return items;
}

/** Calculate template total from items */
export function calculateTemplateTotal(
  items: QuoteTemplateItem[],
  discount?: number,
): { subtotal: number; discount: number; total: number } {
  const subtotal = items.reduce(
    (sum, it) => sum + it.quantity * it.unit_price,
    0,
  );
  const disc = discount ?? 0;
  return {
    subtotal,
    discount: disc,
    total: Math.max(0, subtotal - disc),
  };
}

/** Format currency (pt-BR) */
export function formatTemplateCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/* ------------------------------------------------------------------ */
/*  CRUD                                                               */
/* ------------------------------------------------------------------ */

export async function listQuoteTemplates(
  tenantId: string,
  filters?: CrudFilter[],
  options?: CrudListOptions,
): Promise<QuoteTemplate[]> {
  const baseFilters: CrudFilter[] = [
    { field: "tenant_id", value: tenantId },
    ...(filters ?? []),
  ];
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "quote_templates",
    ...buildSearchParams(baseFilters, {
      sortColumn: options?.sortColumn ?? "sort_order ASC, created_at DESC",
      ...options,
    }),
  });
  return normalizeCrudList<QuoteTemplate>(res.data).filter(
    (t) => !t.deleted_at,
  );
}

export async function getQuoteTemplateById(
  templateId: string,
): Promise<QuoteTemplate | null> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "quote_templates",
    ...buildSearchParams([{ field: "id", value: templateId }]),
  });
  const list = normalizeCrudList<QuoteTemplate>(res.data);
  return list.length > 0 ? list[0] : null;
}

export async function createQuoteTemplate(
  payload: Omit<
    QuoteTemplate,
    "id" | "created_at" | "updated_at" | "deleted_at"
  >,
): Promise<QuoteTemplate> {
  const itemsJson =
    typeof payload.items === "string"
      ? payload.items
      : JSON.stringify(payload.items);

  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "quote_templates",
    payload: {
      ...payload,
      items: itemsJson,
    },
  });
  return normalizeCrudOne<QuoteTemplate>(res.data);
}

export async function updateQuoteTemplate(
  templateId: string,
  payload: Partial<QuoteTemplate>,
): Promise<QuoteTemplate> {
  const updates: Record<string, unknown> = { id: templateId, ...payload };
  if (payload.items && typeof payload.items !== "string") {
    updates.items = JSON.stringify(payload.items);
  }
  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "quote_templates",
    payload: updates,
  });
  return normalizeCrudOne<QuoteTemplate>(res.data);
}

export async function deleteQuoteTemplate(templateId: string): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "quote_templates",
    payload: { id: templateId, deleted_at: new Date().toISOString() },
  });
}

/* ------------------------------------------------------------------ */
/*  Apply template → Quote items                                       */
/* ------------------------------------------------------------------ */

/**
 * Apply a template to create quote items payload.
 * Returns the items ready to be passed to createQuote().
 */
export function applyTemplateToQuote(template: QuoteTemplate): {
  items: QuoteTemplateItem[];
  discount: number;
  validDays: number;
  notes: string | null;
} {
  const items = parseTemplateItems(template.items);
  return {
    items,
    discount: template.default_discount ?? 0,
    validDays: template.default_valid_days ?? 30,
    notes: template.default_notes ?? null,
  };
}

/* ------------------------------------------------------------------ */
/*  Multi-option (package) support                                     */
/* ------------------------------------------------------------------ */

/**
 * List package templates (is_package=true) for a tenant.
 */
export async function listPackageTemplates(
  tenantId: string,
): Promise<QuoteTemplate[]> {
  return listQuoteTemplates(tenantId, [
    { field: "is_package", value: "true", operator: "equal" },
    { field: "is_active", value: "true", operator: "equal" },
  ]);
}

/**
 * Generate a unique group ID for multi-option quotes.
 */
export function generateQuoteGroupId(): string {
  return `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create multiple quote options from package templates.
 *
 * Each template becomes a separate quote in the same group.
 * The client picks one option. The backend uses quote_group_id + is_selected_option.
 *
 * @param templates - Array of templates to create as options
 * @param baseQuoteData - Common data for all quotes (tenant_id, service_order_id, etc.)
 * @param createQuoteFn - The createQuote function from quotes.ts
 */
export async function createMultiOptionQuotes(
  templates: ParsedQuoteTemplate[],
  baseQuoteData: {
    tenant_id: string;
    service_order_id: string;
    title: string;
    created_by?: string;
  },
  createQuoteFn: (data: Record<string, unknown>) => Promise<unknown>,
): Promise<string> {
  const groupId = generateQuoteGroupId();

  for (let i = 0; i < templates.length; i++) {
    const tmpl = templates[i];
    const { items, discount, validDays, notes } = applyTemplateToQuote(tmpl);
    const subtotal = items.reduce(
      (sum, it) => sum + it.quantity * it.unit_price,
      0,
    );

    await createQuoteFn({
      tenant_id: baseQuoteData.tenant_id,
      service_order_id: baseQuoteData.service_order_id,
      title: `${baseQuoteData.title} — ${tmpl.package_name || tmpl.name}`,
      quote_group_id: groupId,
      option_label: tmpl.package_name || tmpl.name,
      is_selected_option: false,
      subtotal,
      discount,
      total: Math.max(0, subtotal - discount),
      valid_until: validDays
        ? new Date(Date.now() + validDays * 86400000)
            .toISOString()
            .split("T")[0]
        : null,
      notes,
      created_by: baseQuoteData.created_by,
      items,
    });
  }

  return groupId;
}

/**
 * Select one option from a multi-option quote group.
 * Marks the selected quote and un-marks others.
 */
export async function selectQuoteOption(
  quoteGroupId: string,
  selectedQuoteId: string,
): Promise<void> {
  // Find all quotes in the group
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "quotes",
    ...buildSearchParams([
      { field: "quote_group_id", value: quoteGroupId },
      { field: "deleted_at", value: "", operator: "is_null" },
    ]),
  });
  const quotes = normalizeCrudList<{ id: string }>(res.data);

  // Unmark all, then mark the selected
  for (const q of quotes) {
    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "quotes",
      payload: {
        id: q.id,
        is_selected_option: q.id === selectedQuoteId,
      },
    });
  }
}
