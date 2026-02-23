/**
 * Content Pages Service — Public Blog + Landing Pages per Tenant
 *
 * Every tenant can publish:
 *   - Blog posts (public blog at /blog/{tenantSlug})
 *   - Landing pages (public LP at /lp/{tenantSlug}/{slug})
 *
 * CTAs embed lead_forms for lead capture.
 * Public routes use unauthenticated axios (no auth token).
 */

import axios from "axios";
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

export type ContentPageType = "blog_post" | "landing_page";

export type ContentPageStatus =
  | "draft"
  | "scheduled"
  | "published"
  | "archived";

export type ContentTemplateKey = "standard" | "hero" | "minimal";

export interface ContentPage {
  id: string;
  tenant_id: string;
  page_type: ContentPageType;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  featured_image_url: string | null;
  meta_title: string | null;
  meta_description: string | null;
  author_id: string | null;
  author_name: string | null;
  status: ContentPageStatus;
  published_at: string | null;
  scheduled_at: string | null;
  category: string | null;
  tags: string[] | string | null;
  lead_form_id: string | null;
  cta_text: string | null;
  cta_url: string | null;
  template_key: ContentTemplateKey;
  is_featured: boolean;
  sort_order: number;
  view_count: number;
  reading_time_min: number | null;
  campaign_id: string | null;
  campaign_item_id: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

/** Sanitized content page for public rendering */
export interface PublicContentPage {
  id: string;
  page_type: ContentPageType;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  featured_image_url: string | null;
  meta_title: string | null;
  meta_description: string | null;
  author_name: string | null;
  status: ContentPageStatus;
  published_at: string | null;
  category: string | null;
  tags: string[];
  lead_form_id: string | null;
  cta_text: string | null;
  cta_url: string | null;
  template_key: ContentTemplateKey;
  is_featured: boolean;
  view_count: number;
  reading_time_min: number | null;
}

/** Blog listing card (minimal data for listing pages) */
export interface BlogListingItem {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  featured_image_url: string | null;
  author_name: string | null;
  published_at: string | null;
  category: string | null;
  tags: string[];
  reading_time_min: number | null;
  is_featured: boolean;
}

/** Tenant info resolved for public pages */
export interface PublicTenantInfo {
  id: string;
  company_name: string;
  slug: string;
  brand_name: string | null;
  primary_color: string;
  logo_url?: string | null;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

export const PAGE_TYPES: { value: ContentPageType; label: string }[] = [
  { value: "blog_post", label: "Blog Post" },
  { value: "landing_page", label: "Landing Page" },
];

export const PAGE_STATUSES: {
  value: ContentPageStatus;
  label: string;
  color: string;
  icon: string;
}[] = [
  {
    value: "draft",
    label: "Rascunho",
    color: "#94a3b8",
    icon: "create-outline",
  },
  {
    value: "scheduled",
    label: "Agendado",
    color: "#f59e0b",
    icon: "time-outline",
  },
  {
    value: "published",
    label: "Publicado",
    color: "#22c55e",
    icon: "checkmark-circle-outline",
  },
  {
    value: "archived",
    label: "Arquivado",
    color: "#6b7280",
    icon: "archive-outline",
  },
];

export const TEMPLATE_KEYS: {
  value: ContentTemplateKey;
  label: string;
  description: string;
}[] = [
  {
    value: "standard",
    label: "Padrão",
    description: "Layout clássico de blog com conteúdo centralizado",
  },
  {
    value: "hero",
    label: "Hero",
    description: "Imagem grande no topo, ideal para landing pages",
  },
  {
    value: "minimal",
    label: "Minimal",
    description: "Texto limpo, sem distrações visuais",
  },
];

export const BLOG_CATEGORIES: string[] = [
  "Notícias",
  "Dicas",
  "Tutoriais",
  "Cases de Sucesso",
  "Atualizações",
  "Institucional",
  "Mercado",
  "Tecnologia",
];

/* ------------------------------------------------------------------ */
/*  Slug generation                                                    */
/* ------------------------------------------------------------------ */

export function generatePageSlug(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/**
 * Calculate estimated reading time from content text.
 * Average reading speed: ~200 words/min for Portuguese.
 */
export function calculateReadingTime(content: string | null): number {
  if (!content) return 1;
  const words = content.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

/* ------------------------------------------------------------------ */
/*  URL builders                                                       */
/* ------------------------------------------------------------------ */

const BASE_URL = "https://app.radul.com.br";

export function buildBlogListingUrl(tenantSlug: string): string {
  return `${BASE_URL}/blog/${tenantSlug}`;
}

export function buildBlogPostUrl(tenantSlug: string, pageSlug: string): string {
  return `${BASE_URL}/blog/${tenantSlug}/${pageSlug}`;
}

export function buildLandingPageUrl(
  tenantSlug: string,
  pageSlug: string,
): string {
  return `${BASE_URL}/lp/${tenantSlug}/${pageSlug}`;
}

export function buildPageUrl(
  tenantSlug: string,
  page: Pick<ContentPage, "page_type" | "slug">,
): string {
  return page.page_type === "blog_post"
    ? buildBlogPostUrl(tenantSlug, page.slug)
    : buildLandingPageUrl(tenantSlug, page.slug);
}

/* ------------------------------------------------------------------ */
/*  Admin CRUD (authenticated)                                         */
/* ------------------------------------------------------------------ */

export async function listContentPages(
  tenantId: string,
  filters?: CrudFilter[],
  options?: CrudListOptions,
): Promise<ContentPage[]> {
  const baseFilters: CrudFilter[] = [
    { field: "tenant_id", value: tenantId },
    ...(filters ?? []),
  ];
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "content_pages",
    ...buildSearchParams(baseFilters, {
      sortColumn: options?.sortColumn ?? "created_at DESC",
      ...options,
    }),
  });
  return normalizeCrudList<ContentPage>(res.data).filter((p) => !p.deleted_at);
}

export async function getContentPageById(
  pageId: string,
): Promise<ContentPage | null> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "content_pages",
    ...buildSearchParams([{ field: "id", value: pageId }]),
  });
  const list = normalizeCrudList<ContentPage>(res.data);
  return list.length > 0 ? list[0] : null;
}

export async function createContentPage(
  payload: Partial<ContentPage> & { tenant_id: string; title: string },
): Promise<ContentPage> {
  const slug = payload.slug || generatePageSlug(payload.title);
  const readingTime = calculateReadingTime(payload.content ?? null);

  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "content_pages",
    payload: {
      ...payload,
      slug,
      reading_time_min: readingTime,
      tags:
        payload.tags && typeof payload.tags !== "string"
          ? JSON.stringify(payload.tags)
          : (payload.tags ?? "[]"),
    },
  });
  return normalizeCrudOne<ContentPage>(res.data);
}

export async function updateContentPage(
  pageId: string,
  payload: Partial<ContentPage>,
): Promise<ContentPage> {
  const updates: Record<string, unknown> = { id: pageId, ...payload };

  // Recalculate reading time if content changed
  if (payload.content !== undefined) {
    updates.reading_time_min = calculateReadingTime(payload.content);
  }

  // Auto-set published_at when publishing for the first time
  if (payload.status === "published" && !payload.published_at) {
    updates.published_at = new Date().toISOString();
  }

  if (payload.tags && typeof payload.tags !== "string") {
    updates.tags = JSON.stringify(payload.tags);
  }

  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "content_pages",
    payload: updates,
  });
  return normalizeCrudOne<ContentPage>(res.data);
}

export async function deleteContentPage(pageId: string): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "content_pages",
    payload: { id: pageId, deleted_at: new Date().toISOString() },
  });
}

/* ------------------------------------------------------------------ */
/*  Public access (no auth)                                            */
/* ------------------------------------------------------------------ */

/** Direct axios for public access — no user auth token, but includes API key */
const publicApi = axios.create({
  timeout: 15000,
  headers: {
    "X-Api-Key": process.env.EXPO_PUBLIC_N8N_API_KEY ?? "",
  },
});

/** Parse tags from JSONB → string[] safely */
function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Convert DB row to sanitized public content page */
function toPublicPage(page: ContentPage): PublicContentPage {
  return {
    id: page.id,
    page_type: page.page_type,
    title: page.title,
    slug: page.slug,
    excerpt: page.excerpt,
    content: page.content,
    featured_image_url: page.featured_image_url,
    meta_title: page.meta_title,
    meta_description: page.meta_description,
    author_name: page.author_name,
    status: page.status,
    published_at: page.published_at,
    category: page.category,
    tags: parseTags(page.tags),
    lead_form_id: page.lead_form_id,
    cta_text: page.cta_text,
    cta_url: page.cta_url,
    template_key: page.template_key as ContentTemplateKey,
    is_featured: page.is_featured,
    view_count: page.view_count,
    reading_time_min: page.reading_time_min,
  };
}

/** Convert to blog listing item (minimal) */
function toBlogListingItem(page: ContentPage): BlogListingItem {
  return {
    id: page.id,
    title: page.title,
    slug: page.slug,
    excerpt: page.excerpt,
    featured_image_url: page.featured_image_url,
    author_name: page.author_name,
    published_at: page.published_at,
    category: page.category,
    tags: parseTags(page.tags),
    reading_time_min: page.reading_time_min,
    is_featured: page.is_featured,
  };
}

/**
 * Resolve tenant by slug for public pages.
 * Returns basic tenant info + branding.
 */
export async function resolvePublicTenant(
  tenantSlug: string,
): Promise<PublicTenantInfo | null> {
  try {
    const res = await publicApi.post(CRUD_ENDPOINT, {
      action: "list",
      table: "tenants",
      ...buildSearchParams([{ field: "slug", value: tenantSlug }]),
    });
    const tenants = normalizeCrudList<Record<string, unknown>>(res.data);
    if (tenants.length === 0) return null;

    const t = tenants[0];
    const config =
      typeof t.config === "string" ? JSON.parse(t.config) : t.config;
    const brand = config?.brand ?? {};

    return {
      id: String(t.id),
      company_name: String(t.company_name ?? ""),
      slug: String(t.slug ?? tenantSlug),
      brand_name: brand.name ?? null,
      primary_color: brand.primary_color ?? "#2563eb",
    };
  } catch {
    return null;
  }
}

/**
 * Load published blog posts for a tenant (public listing).
 */
export async function loadPublicBlogListing(tenantSlug: string): Promise<{
  tenant: PublicTenantInfo | null;
  posts: BlogListingItem[];
}> {
  const tenant = await resolvePublicTenant(tenantSlug);
  if (!tenant) return { tenant: null, posts: [] };

  try {
    const res = await publicApi.post(CRUD_ENDPOINT, {
      action: "list",
      table: "content_pages",
      ...buildSearchParams(
        [
          { field: "tenant_id", value: tenant.id },
          { field: "page_type", value: "blog_post" },
          { field: "status", value: "published" },
          { field: "deleted_at", value: "", operator: "is_null" },
        ],
        { sortColumn: "published_at DESC" },
      ),
    });
    const pages = normalizeCrudList<ContentPage>(res.data);
    return {
      tenant,
      posts: pages.map(toBlogListingItem),
    };
  } catch {
    return { tenant, posts: [] };
  }
}

/**
 * Load a single published page by tenant slug + page slug.
 */
export async function loadPublicPage(
  tenantSlug: string,
  pageSlug: string,
  pageType?: ContentPageType,
): Promise<{
  tenant: PublicTenantInfo | null;
  page: PublicContentPage | null;
}> {
  const tenant = await resolvePublicTenant(tenantSlug);
  if (!tenant) return { tenant: null, page: null };

  try {
    const filters: CrudFilter[] = [
      { field: "tenant_id", value: tenant.id },
      { field: "slug", value: pageSlug },
      { field: "status", value: "published" },
      { field: "deleted_at", value: "", operator: "is_null" },
    ];
    if (pageType) {
      filters.push({ field: "page_type", value: pageType });
    }

    const res = await publicApi.post(CRUD_ENDPOINT, {
      action: "list",
      table: "content_pages",
      ...buildSearchParams(filters),
    });
    const pages = normalizeCrudList<ContentPage>(res.data);

    if (pages.length === 0) return { tenant, page: null };

    // Increment view count (fire & forget)
    incrementViewCount(pages[0].id).catch(() => {});

    return {
      tenant,
      page: toPublicPage(pages[0]),
    };
  } catch {
    return { tenant, page: null };
  }
}

/**
 * Increment page view count (fire & forget, no auth needed).
 */
export async function incrementViewCount(pageId: string): Promise<void> {
  try {
    // Read current count
    const res = await publicApi.post(CRUD_ENDPOINT, {
      action: "list",
      table: "content_pages",
      ...buildSearchParams([{ field: "id", value: pageId }]),
      fields: ["id", "view_count"],
    });
    const pages = normalizeCrudList<ContentPage>(res.data);
    if (pages.length === 0) return;

    const currentCount = pages[0].view_count ?? 0;
    await publicApi.post(CRUD_ENDPOINT, {
      action: "update",
      table: "content_pages",
      payload: { id: pageId, view_count: currentCount + 1 },
    });
  } catch {
    // Silently ignore view count errors
  }
}

/**
 * Load a lead form for CTA embedding (public, no auth).
 */
export async function loadLeadFormForCta(formId: string): Promise<{
  fields: {
    key: string;
    label: string;
    type: string;
    required: boolean;
    placeholder?: string;
    options?: string[];
  }[];
  button_label: string;
  success_message: string;
} | null> {
  try {
    const res = await publicApi.post(CRUD_ENDPOINT, {
      action: "list",
      table: "lead_forms",
      ...buildSearchParams([
        { field: "id", value: formId },
        { field: "is_active", value: "true", operator: "equal" },
        { field: "deleted_at", value: "", operator: "is_null" },
      ]),
    });
    const forms = normalizeCrudList<Record<string, unknown>>(res.data);
    if (forms.length === 0) return null;

    const form = forms[0];
    const fields =
      typeof form.fields === "string"
        ? JSON.parse(form.fields as string)
        : form.fields;

    return {
      fields: Array.isArray(fields) ? fields : [],
      button_label: String(form.button_label ?? "Enviar"),
      success_message: String(
        form.success_message ?? "Obrigado! Entraremos em contato.",
      ),
    };
  } catch {
    return null;
  }
}

/**
 * Submit lead form from content page CTA (public, no auth).
 * Delegates to the lead_forms public submit endpoint.
 */
export async function submitContentPageLead(
  formId: string,
  submission: Record<string, string>,
  sourcePageId?: string,
): Promise<{ success: boolean; message: string }> {
  try {
    // Use the same pattern as lead-forms.ts submitPublicLeadForm
    const res = await publicApi.post(CRUD_ENDPOINT, {
      action: "create",
      table: "leads",
      payload: {
        lead_form_id: formId,
        source: "content_page",
        data: JSON.stringify(submission),
        content_page_id: sourcePageId,
        name: submission.name ?? submission.nome ?? "",
        email: submission.email ?? "",
        phone: submission.phone ?? submission.telefone ?? "",
      },
    });

    if (res.data) {
      // Increment form submissions count (fire & forget)
      publicApi
        .post(CRUD_ENDPOINT, {
          action: "list",
          table: "lead_forms",
          ...buildSearchParams([{ field: "id", value: formId }]),
          fields: ["id", "submissions_count"],
        })
        .then((r) => {
          const forms = normalizeCrudList<Record<string, unknown>>(r.data);
          if (forms.length > 0) {
            const count = Number(forms[0].submissions_count ?? 0);
            publicApi.post(CRUD_ENDPOINT, {
              action: "update",
              table: "lead_forms",
              payload: { id: formId, submissions_count: count + 1 },
            });
          }
        })
        .catch(() => {});

      return { success: true, message: "Enviado com sucesso!" };
    }
    return { success: false, message: "Erro ao enviar." };
  } catch {
    return { success: false, message: "Erro ao enviar. Tente novamente." };
  }
}

/* ------------------------------------------------------------------ */
/*  Status helpers                                                     */
/* ------------------------------------------------------------------ */

export function getStatusConfig(status: ContentPageStatus) {
  return PAGE_STATUSES.find((s) => s.value === status) ?? PAGE_STATUSES[0];
}

export function getPageTypeLabel(pageType: ContentPageType): string {
  return PAGE_TYPES.find((t) => t.value === pageType)?.label ?? pageType;
}
