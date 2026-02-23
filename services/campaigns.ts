/**
 * Campaigns Service Layer
 *
 * Manages marketing campaigns and their metrics for tracking ROI.
 *
 * Architecture:
 *   Campaign → Campaign Metrics (daily snapshots)
 *            → Leads (via lead.campaign_id)
 *            → Customers / Revenue (via converted leads)
 *
 * Data sources:
 *   - Manual input: tenant creates campaigns, optionally logs daily metrics
 *   - UTM matching: public forms parse ?utm_campaign and auto-link leads
 *   - WhatsApp bot: leads from bot tagged with source="whatsapp"
 *   - Google Analytics / Meta Ads: tenant can input aggregated data
 *
 * The tenant visualizes third-party campaign performance here;
 * they manage the campaigns on the external platforms (GA, Meta, etc).
 */

import { api } from "./api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
    type CrudFilter,
    type CrudListOptions,
} from "./crud";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type CampaignChannel =
  | "google_ads"
  | "facebook"
  | "instagram"
  | "whatsapp"
  | "email"
  | "organic"
  | "evento"
  | "indicacao"
  | "outro";

export type CampaignStatus = "rascunho" | "ativa" | "pausada" | "encerrada";

export type CampaignItemType =
  | "post"
  | "blog"
  | "ad"
  | "video"
  | "reel"
  | "story"
  | "email"
  | "referral"
  | "evento"
  | "outro";

export type CampaignItemPlatform =
  | "instagram"
  | "facebook"
  | "linkedin"
  | "google"
  | "youtube"
  | "tiktok"
  | "blog"
  | "whatsapp"
  | "email"
  | "outro";

export type CampaignItemStatus =
  | "rascunho"
  | "agendado"
  | "publicado"
  | "arquivado";

export interface Campaign {
  id: string;
  tenant_id: string;
  name: string;
  channel: CampaignChannel | string;
  status: CampaignStatus;
  budget?: number | string | null;
  spent?: number | string | null;
  start_date?: string | null;
  end_date?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  target_url?: string | null;
  notes?: string | null;
  metrics_snapshot?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface CampaignMetric {
  id: string;
  campaign_id: string;
  tenant_id: string;
  metric_date: string;
  impressions?: number | string | null;
  clicks?: number | string | null;
  leads_generated?: number | string | null;
  conversions?: number | string | null;
  cost?: number | string | null;
  revenue?: number | string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface CampaignItem {
  id: string;
  tenant_id: string;
  campaign_id: string;
  item_type: CampaignItemType;
  platform: CampaignItemPlatform;
  title: string;
  content?: string | null;
  media_url?: string | null;
  target_url?: string | null;
  status: CampaignItemStatus;
  scheduled_at?: string | null;
  published_at?: string | null;
  published_url?: string | null;
  impressions?: number | null;
  clicks?: number | null;
  engagement?: number | null;
  conversions?: number | null;
  reach?: number | null;
  cost?: number | null;
  notes?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

/* ------------------------------------------------------------------ */
/*  Configuration                                                      */
/* ------------------------------------------------------------------ */

export const CAMPAIGN_CHANNELS: {
  value: CampaignChannel;
  label: string;
  icon: string;
  color: string;
}[] = [
  {
    value: "google_ads",
    label: "Google Ads",
    icon: "logo-google",
    color: "#4285F4",
  },
  {
    value: "facebook",
    label: "Facebook Ads",
    icon: "logo-facebook",
    color: "#1877F2",
  },
  {
    value: "instagram",
    label: "Instagram",
    icon: "logo-instagram",
    color: "#E4405F",
  },
  {
    value: "whatsapp",
    label: "WhatsApp",
    icon: "logo-whatsapp",
    color: "#25D366",
  },
  {
    value: "email",
    label: "E-mail Marketing",
    icon: "mail-outline",
    color: "#6366f1",
  },
  {
    value: "organic",
    label: "Orgânico",
    icon: "leaf-outline",
    color: "#22c55e",
  },
  {
    value: "evento",
    label: "Evento",
    icon: "calendar-outline",
    color: "#f59e0b",
  },
  {
    value: "indicacao",
    label: "Indicação",
    icon: "people-outline",
    color: "#8b5cf6",
  },
  {
    value: "outro",
    label: "Outro",
    icon: "ellipsis-horizontal-outline",
    color: "#6b7280",
  },
];

export const CAMPAIGN_STATUSES: {
  value: CampaignStatus;
  label: string;
  color: string;
  icon: string;
}[] = [
  {
    value: "rascunho",
    label: "Rascunho",
    color: "#9ca3af",
    icon: "create-outline",
  },
  {
    value: "ativa",
    label: "Ativa",
    color: "#22c55e",
    icon: "play-circle-outline",
  },
  {
    value: "pausada",
    label: "Pausada",
    color: "#f59e0b",
    icon: "pause-circle-outline",
  },
  {
    value: "encerrada",
    label: "Encerrada",
    color: "#6b7280",
    icon: "stop-circle-outline",
  },
];

export const CAMPAIGN_ITEM_TYPES: {
  value: CampaignItemType;
  label: string;
  icon: string;
  color: string;
}[] = [
  { value: "post", label: "Post", icon: "image-outline", color: "#3b82f6" },
  { value: "blog", label: "Blog", icon: "reader-outline", color: "#8b5cf6" },
  {
    value: "ad",
    label: "Anúncio",
    icon: "megaphone-outline",
    color: "#ef4444",
  },
  {
    value: "video",
    label: "Vídeo",
    icon: "videocam-outline",
    color: "#f59e0b",
  },
  { value: "reel", label: "Reel", icon: "film-outline", color: "#ec4899" },
  { value: "story", label: "Story", icon: "albums-outline", color: "#14b8a6" },
  { value: "email", label: "E-mail", icon: "mail-outline", color: "#6366f1" },
  {
    value: "referral",
    label: "Indicação",
    icon: "people-outline",
    color: "#22c55e",
  },
  {
    value: "evento",
    label: "Evento",
    icon: "calendar-outline",
    color: "#f97316",
  },
  {
    value: "outro",
    label: "Outro",
    icon: "ellipsis-horizontal-outline",
    color: "#6b7280",
  },
];

export const CAMPAIGN_ITEM_PLATFORMS: {
  value: CampaignItemPlatform;
  label: string;
  icon: string;
  color: string;
}[] = [
  {
    value: "instagram",
    label: "Instagram",
    icon: "logo-instagram",
    color: "#E4405F",
  },
  {
    value: "facebook",
    label: "Facebook",
    icon: "logo-facebook",
    color: "#1877F2",
  },
  {
    value: "linkedin",
    label: "LinkedIn",
    icon: "logo-linkedin",
    color: "#0A66C2",
  },
  { value: "google", label: "Google", icon: "logo-google", color: "#4285F4" },
  {
    value: "youtube",
    label: "YouTube",
    icon: "logo-youtube",
    color: "#FF0000",
  },
  { value: "tiktok", label: "TikTok", icon: "logo-tiktok", color: "#000000" },
  { value: "blog", label: "Blog", icon: "reader-outline", color: "#8b5cf6" },
  {
    value: "whatsapp",
    label: "WhatsApp",
    icon: "logo-whatsapp",
    color: "#25D366",
  },
  { value: "email", label: "E-mail", icon: "mail-outline", color: "#6366f1" },
  {
    value: "outro",
    label: "Outro",
    icon: "ellipsis-horizontal-outline",
    color: "#6b7280",
  },
];

export const CAMPAIGN_ITEM_STATUSES: {
  value: CampaignItemStatus;
  label: string;
  color: string;
  icon: string;
}[] = [
  {
    value: "rascunho",
    label: "Rascunho",
    color: "#9ca3af",
    icon: "create-outline",
  },
  {
    value: "agendado",
    label: "Agendado",
    color: "#3b82f6",
    icon: "time-outline",
  },
  {
    value: "publicado",
    label: "Publicado",
    color: "#22c55e",
    icon: "checkmark-circle-outline",
  },
  {
    value: "arquivado",
    label: "Arquivado",
    color: "#6b7280",
    icon: "archive-outline",
  },
];

/* ------------------------------------------------------------------ */
/*  Campaign CRUD                                                      */
/* ------------------------------------------------------------------ */

export async function listCampaigns(
  tenantId: string,
  filters?: CrudFilter[],
  options?: CrudListOptions,
): Promise<Campaign[]> {
  const baseFilters: CrudFilter[] = [
    { field: "tenant_id", value: tenantId },
    ...(filters ?? []),
  ];
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "campaigns",
    ...buildSearchParams(baseFilters, {
      sortColumn: options?.sortColumn ?? "created_at DESC",
      ...options,
    }),
  });
  return normalizeCrudList<Campaign>(res.data).filter((c) => !c.deleted_at);
}

export async function getCampaignById(
  campaignId: string,
): Promise<Campaign | null> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "campaigns",
    ...buildSearchParams([{ field: "id", value: campaignId }]),
  });
  const list = normalizeCrudList<Campaign>(res.data);
  return list.length > 0 ? list[0] : null;
}

export async function createCampaign(
  payload: Omit<Campaign, "id" | "created_at" | "updated_at" | "deleted_at">,
): Promise<Campaign> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "campaigns",
    payload: {
      ...payload,
      status: payload.status || "rascunho",
      channel: payload.channel || "outro",
    },
  });
  return (res.data as Campaign[])?.[0] ?? res.data;
}

export async function updateCampaign(
  payload: Partial<Campaign> & { id: string },
): Promise<Campaign> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "campaigns",
    payload,
  });
  return (res.data as Campaign[])?.[0] ?? res.data;
}

export async function deleteCampaign(campaignId: string): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "campaigns",
    payload: { id: campaignId, deleted_at: new Date().toISOString() },
  });
}

/* ------------------------------------------------------------------ */
/*  Campaign Metrics CRUD                                              */
/* ------------------------------------------------------------------ */

export async function listCampaignMetrics(
  campaignId: string,
  options?: CrudListOptions,
): Promise<CampaignMetric[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "campaign_metrics",
    ...buildSearchParams([{ field: "campaign_id", value: campaignId }], {
      sortColumn: options?.sortColumn ?? "metric_date DESC",
      ...options,
    }),
  });
  return normalizeCrudList<CampaignMetric>(res.data).filter(
    (m) => !m.deleted_at,
  );
}

export async function createCampaignMetric(
  payload: Omit<
    CampaignMetric,
    "id" | "created_at" | "updated_at" | "deleted_at"
  >,
): Promise<CampaignMetric> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "campaign_metrics",
    payload,
  });
  return (res.data as CampaignMetric[])?.[0] ?? res.data;
}

export async function updateCampaignMetric(
  payload: Partial<CampaignMetric> & { id: string },
): Promise<CampaignMetric> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "campaign_metrics",
    payload,
  });
  return (res.data as CampaignMetric[])?.[0] ?? res.data;
}

export async function deleteCampaignMetric(metricId: string): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "campaign_metrics",
    payload: { id: metricId, deleted_at: new Date().toISOString() },
  });
}

/* ------------------------------------------------------------------ */
/*  Campaign Items CRUD                                                */
/* ------------------------------------------------------------------ */

export async function listCampaignItems(
  campaignId: string,
  tenantId: string,
  options?: CrudListOptions,
): Promise<CampaignItem[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "campaign_items",
    ...buildSearchParams(
      [
        { field: "campaign_id", value: campaignId },
        { field: "tenant_id", value: tenantId },
      ],
      {
        sortColumn: options?.sortColumn ?? "created_at DESC",
        ...options,
      },
    ),
  });
  return normalizeCrudList<CampaignItem>(res.data).filter((i) => !i.deleted_at);
}

export async function createCampaignItem(
  payload: Omit<
    CampaignItem,
    "id" | "created_at" | "updated_at" | "deleted_at"
  >,
): Promise<CampaignItem> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "campaign_items",
    payload: {
      ...payload,
      status: payload.status || "rascunho",
      item_type: payload.item_type || "post",
      platform: payload.platform || "outro",
    },
  });
  return (res.data as CampaignItem[])?.[0] ?? res.data;
}

export async function updateCampaignItem(
  payload: Partial<CampaignItem> & { id: string },
): Promise<CampaignItem> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "campaign_items",
    payload,
  });
  return (res.data as CampaignItem[])?.[0] ?? res.data;
}

export async function deleteCampaignItem(itemId: string): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "campaign_items",
    payload: { id: itemId, deleted_at: new Date().toISOString() },
  });
}

export function getItemTypeConfig(type: string) {
  return (
    CAMPAIGN_ITEM_TYPES.find((t) => t.value === type) ??
    CAMPAIGN_ITEM_TYPES[CAMPAIGN_ITEM_TYPES.length - 1]
  );
}

export function getItemPlatformConfig(platform: string) {
  return (
    CAMPAIGN_ITEM_PLATFORMS.find((p) => p.value === platform) ??
    CAMPAIGN_ITEM_PLATFORMS[CAMPAIGN_ITEM_PLATFORMS.length - 1]
  );
}

export function getItemStatusConfig(status: string) {
  return (
    CAMPAIGN_ITEM_STATUSES.find((s) => s.value === status) ??
    CAMPAIGN_ITEM_STATUSES[0]
  );
}

/* ------------------------------------------------------------------ */
/*  Attribution Helpers                                                 */
/* ------------------------------------------------------------------ */

/**
 * Count leads attributed to a campaign.
 */
export async function countLeadsByCampaign(
  campaignId: string,
  tenantId: string,
): Promise<number> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "leads",
    ...buildSearchParams([
      { field: "campaign_id", value: campaignId },
      { field: "tenant_id", value: tenantId },
    ]),
  });
  return normalizeCrudList(res.data).filter(
    (l: Record<string, unknown>) => !l.deleted_at,
  ).length;
}

/**
 * Count converted leads (status = "convertido") attributed to a campaign.
 */
export async function countConversionsByCampaign(
  campaignId: string,
  tenantId: string,
): Promise<number> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "leads",
    ...buildSearchParams([
      { field: "campaign_id", value: campaignId },
      { field: "tenant_id", value: tenantId },
      { field: "status", value: "convertido" },
    ]),
  });
  return normalizeCrudList(res.data).filter(
    (l: Record<string, unknown>) => !l.deleted_at,
  ).length;
}

/**
 * Find a campaign by its utm_campaign value (for auto-attribution from forms).
 */
export async function findCampaignByUtm(
  tenantId: string,
  utmCampaign: string,
): Promise<Campaign | null> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "campaigns",
    ...buildSearchParams([
      { field: "tenant_id", value: tenantId },
      { field: "utm_campaign", value: utmCampaign },
    ]),
  });
  const list = normalizeCrudList<Campaign>(res.data).filter(
    (c) => !c.deleted_at,
  );
  return list.length > 0 ? list[0] : null;
}

/* ------------------------------------------------------------------ */
/*  Dashboard Helpers                                                  */
/* ------------------------------------------------------------------ */

export function getChannelConfig(channel: string) {
  return (
    CAMPAIGN_CHANNELS.find((c) => c.value === channel) ??
    CAMPAIGN_CHANNELS[CAMPAIGN_CHANNELS.length - 1]
  );
}

export function getStatusConfig(status: string) {
  return (
    CAMPAIGN_STATUSES.find((s) => s.value === status) ?? CAMPAIGN_STATUSES[0]
  );
}

/**
 * Build UTM query string from campaign fields.
 */
export function buildUtmUrl(campaign: Campaign): string {
  if (!campaign.target_url) return "";
  const params = new URLSearchParams();
  if (campaign.utm_source) params.set("utm_source", campaign.utm_source);
  if (campaign.utm_medium) params.set("utm_medium", campaign.utm_medium);
  if (campaign.utm_campaign) params.set("utm_campaign", campaign.utm_campaign);
  if (campaign.utm_content) params.set("utm_content", campaign.utm_content);
  const qs = params.toString();
  if (!qs) return campaign.target_url;
  const sep = campaign.target_url.includes("?") ? "&" : "?";
  return `${campaign.target_url}${sep}${qs}`;
}

/**
 * Format currency value.
 */
export function formatCurrency(
  value: number | string | null | undefined,
): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (num == null || isNaN(num)) return "R$ 0,00";
  return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
