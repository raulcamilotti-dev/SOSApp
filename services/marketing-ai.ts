/**
 * Marketing AI Service — Assistente criativo de marketing com IA.
 *
 * Permite ao tenant:
 *  1. Manter um perfil de marketing persistente (tenants.config.marketing_profile)
 *  2. Gerar conteúdo criativo recorrentemente (campanhas, posts, calendários)
 *  3. Criar campaign_items em lote a partir das sugestões da IA
 *
 * O perfil de marketing é armazenado em tenants.config.marketing_profile (JSONB).
 * Nenhuma tabela nova é necessária.
 */

import {
    AI_AGENT_ENDPOINT,
    extractAiInsightText,
} from "@/services/ai-insights";
import { api } from "@/services/api";
import { CRUD_ENDPOINT, normalizeCrudList } from "@/services/crud";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Marketing profile stored in tenants.config.marketing_profile */
export interface MarketingProfile {
  /** O que a empresa faz, setor, modelo de negócio */
  business_description: string;
  /** Público-alvo: faixa etária, perfil socioeconômico, dores */
  target_audience: string;
  /** Tom de voz da marca (formal, descontraído, técnico, etc.) */
  brand_voice: string;
  /** Diferenciais competitivos */
  differentials: string;
  /** Principais serviços/produtos a destacar */
  services_highlight: string;
  /** Região/cidade de atuação */
  region: string;
  /** Objetivos de marketing (captar leads, engajar, etc.) */
  marketing_goals: string;
}

/** Available generation modes */
export type GenerationMode =
  | "campaign_plan"
  | "single_post"
  | "content_calendar";

/** A single content item suggested by the AI */
export interface AiContentSuggestion {
  title: string;
  content: string;
  item_type: string;
  platform: string;
  /** Suggested publish date in ISO format (optional) */
  scheduled_at?: string;
}

/** Full response from marketing AI generation */
export interface MarketingAiResult {
  /** Overall campaign/content strategy summary */
  summary: string;
  /** Campaign name suggestion (for campaign_plan mode) */
  campaign_name?: string;
  /** Individual content items */
  items: AiContentSuggestion[];
  /** Raw AI response for debugging */
  raw?: unknown;
}

/** Parameters for content generation */
export interface GenerateContentParams {
  mode: GenerationMode;
  profile: MarketingProfile;
  tenantId: string;
  userId?: string;
  /** Existing campaign context (name, channel) for targeted generation */
  campaignContext?: {
    name: string;
    channel?: string;
    description?: string;
  };
  /** Free-form extra instruction from the user */
  userInstruction?: string;
  /** Number of items to generate (default: mode-dependent) */
  itemCount?: number;
}

/* ------------------------------------------------------------------ */
/*  Empty profile helper                                               */
/* ------------------------------------------------------------------ */

export const EMPTY_MARKETING_PROFILE: MarketingProfile = {
  business_description: "",
  target_audience: "",
  brand_voice: "",
  differentials: "",
  services_highlight: "",
  region: "",
  marketing_goals: "",
};

export const RADUL_MARKETING_PROFILE: MarketingProfile = {
  business_description:
    "A Radul Platform (SOS) e uma plataforma SaaS de operacoes configuravel para empresas de servicos. Organiza processos com CrudScreen, workflow engine, kanban, portal publico e automacoes, tudo em um unico sistema multi-tenant.",
  target_audience:
    "Empresas de servicos no Brasil (escritorios, consultorias, despachantes, imobiliarias, agencias e B2B em geral). Donos e gestores 25-55 anos que precisam padronizar operacoes, reduzir retrabalho e ganhar visibilidade sem burocracia.",
  brand_voice:
    "Profissional, direto e confiavel. Tecnologico sem jargao. Didatico, orientado a resultado e autonomia do cliente.",
  differentials:
    "CRUD-first com aprendizado unico, workflow 100% configuravel por dados, multi-tenant com branding por dominio, modulos opt-in, integracoes BR (Gov.br, ONR, WhatsApp), portal publico e IA aplicada a operacoes.",
  services_highlight:
    "Workflow Engine, CrudScreen, Kanban, Portal do Cliente, Financeiro completo, CRM/Kanban de leads, Templates Packs por vertical, AI Agents e SaaS Billing.",
  region: "Brasil (atuacao nacional com onboarding remoto).",
  marketing_goals:
    "Gerar leads qualificados, converter demos em trials, aumentar reconhecimento da marca e reduzir CAC com prova de valor rapida (15 minutos para operar).",
};

const isRadulTenant = (slug?: string | null, companyName?: string | null) => {
  const slugValue = String(slug ?? "")
    .trim()
    .toLowerCase();
  const companyValue = String(companyName ?? "")
    .trim()
    .toLowerCase();
  return slugValue === "radul" || companyValue.includes("radul");
};

const applyProfileDefaults = (
  profile: MarketingProfile,
  defaults: MarketingProfile,
): MarketingProfile => {
  const next = { ...profile } as MarketingProfile;
  (Object.keys(defaults) as (keyof MarketingProfile)[]).forEach((key) => {
    const value = String(next[key] ?? "").trim();
    if (!value) {
      next[key] = defaults[key];
    }
  });
  return next;
};

export const PROFILE_FIELDS: {
  key: keyof MarketingProfile;
  label: string;
  placeholder: string;
  multiline?: boolean;
}[] = [
  {
    key: "business_description",
    label: "Descrição do Negócio",
    placeholder:
      "Ex: Escritório de advocacia especializado em direito trabalhista para PMEs",
    multiline: true,
  },
  {
    key: "target_audience",
    label: "Público-Alvo",
    placeholder:
      "Ex: Empresários de pequenas empresas, 30-55 anos, região metropolitana de Curitiba",
    multiline: true,
  },
  {
    key: "brand_voice",
    label: "Tom de Voz da Marca",
    placeholder: "Ex: Profissional mas acessível, educativo, confiável",
  },
  {
    key: "differentials",
    label: "Diferenciais Competitivos",
    placeholder:
      "Ex: Atendimento 100% digital, resposta em 24h, experiência de 15 anos",
    multiline: true,
  },
  {
    key: "services_highlight",
    label: "Serviços/Produtos em Destaque",
    placeholder: "Ex: Consultoria tributária, defesa trabalhista, contratos",
    multiline: true,
  },
  {
    key: "region",
    label: "Região de Atuação",
    placeholder: "Ex: Curitiba e Região Metropolitana, todo o Paraná",
  },
  {
    key: "marketing_goals",
    label: "Objetivos de Marketing",
    placeholder:
      "Ex: Gerar 30 leads qualificados/mês, aumentar reconhecimento da marca no Instagram",
    multiline: true,
  },
];

/* ------------------------------------------------------------------ */
/*  Profile persistence (tenants.config.marketing_profile)             */
/* ------------------------------------------------------------------ */

/**
 * Load the marketing profile from tenants.config.marketing_profile.
 * Returns EMPTY_MARKETING_PROFILE if not set.
 */
export async function loadMarketingProfile(
  tenantId: string,
): Promise<MarketingProfile> {
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "tenants",
      search_field1: "id",
      search_value1: tenantId,
      search_operator1: "equal",
      fields: ["id", "config", "slug", "company_name"],
    });
    const rows = normalizeCrudList<{
      id: string;
      config?: Record<string, unknown>;
      slug?: string | null;
      company_name?: string | null;
    }>(res.data);
    const tenant = rows.find((r) => r.id === tenantId);
    const config = tenant?.config ?? {};
    const saved = config.marketing_profile as
      | Partial<MarketingProfile>
      | undefined;
    const baseProfile: MarketingProfile = {
      ...EMPTY_MARKETING_PROFILE,
      ...(saved && typeof saved === "object" ? saved : {}),
    };
    if (isRadulTenant(tenant?.slug, tenant?.company_name)) {
      return applyProfileDefaults(baseProfile, RADUL_MARKETING_PROFILE);
    }
    return baseProfile;
  } catch {
    return { ...EMPTY_MARKETING_PROFILE };
  }
}

/**
 * Save the marketing profile to tenants.config.marketing_profile.
 * Merges with existing config to avoid overwriting other keys.
 */
export async function saveMarketingProfile(
  tenantId: string,
  profile: MarketingProfile,
): Promise<void> {
  // 1. Fetch current config
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "tenants",
    search_field1: "id",
    search_value1: tenantId,
    search_operator1: "equal",
    fields: ["id", "config"],
  });
  const rows = normalizeCrudList<{
    id: string;
    config?: Record<string, unknown>;
  }>(res.data);
  const tenant = rows.find((r) => r.id === tenantId);
  const currentConfig = (tenant?.config ?? {}) as Record<string, unknown>;

  // 2. Merge marketing_profile into existing config
  const updatedConfig = {
    ...currentConfig,
    marketing_profile: profile,
  };

  // 3. Update tenant
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "tenants",
    payload: {
      id: tenantId,
      config: updatedConfig,
      updated_at: new Date().toISOString(),
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Prompt builders                                                    */
/* ------------------------------------------------------------------ */

const MODE_LABELS: Record<GenerationMode, string> = {
  campaign_plan: "Plano de Campanha Completo",
  single_post: "Post Único / Conteúdo Avulso",
  content_calendar: "Calendário de Conteúdo (1 semana)",
};

function buildSystemPrompt(): string {
  return [
    "Você é um especialista em marketing digital e criação de conteúdo para empresas de serviços no Brasil.",
    "Gere conteúdo criativo, prático e acionável. Sempre em português do Brasil.",
    "Responda APENAS em JSON válido conforme o schema solicitado, sem texto extra antes ou depois do JSON.",
    "Nunca invente dados estatísticos. Foque em copy persuasivo e estratégia de conteúdo.",
  ].join(" ");
}

function buildUserPrompt(params: GenerateContentParams): string {
  const { mode, profile, campaignContext, userInstruction, itemCount } = params;

  const count =
    itemCount ??
    (mode === "campaign_plan" ? 5 : mode === "content_calendar" ? 7 : 1);

  const sections: string[] = [
    `## Modo: ${MODE_LABELS[mode]}`,
    "",
    "## Perfil da Empresa:",
    `- **Negócio:** ${profile.business_description || "(não informado)"}`,
    `- **Público-alvo:** ${profile.target_audience || "(não informado)"}`,
    `- **Tom de voz:** ${profile.brand_voice || "(não informado)"}`,
    `- **Diferenciais:** ${profile.differentials || "(não informado)"}`,
    `- **Serviços destaque:** ${profile.services_highlight || "(não informado)"}`,
    `- **Região:** ${profile.region || "(não informado)"}`,
    `- **Objetivos:** ${profile.marketing_goals || "(não informado)"}`,
  ];

  if (campaignContext) {
    sections.push(
      "",
      "## Contexto da Campanha Existente:",
      `- **Nome:** ${campaignContext.name}`,
      campaignContext.channel ? `- **Canal:** ${campaignContext.channel}` : "",
      campaignContext.description
        ? `- **Descrição:** ${campaignContext.description}`
        : "",
    );
  }

  if (userInstruction?.trim()) {
    sections.push(
      "",
      `## Instrução Adicional do Usuário:`,
      userInstruction.trim(),
    );
  }

  sections.push(
    "",
    `## Gere exatamente ${count} item(ns) de conteúdo.`,
    "",
    "## Schema de Resposta (JSON):",
    "```json",
    JSON.stringify(
      {
        summary: "Resumo estratégico da sugestão (texto livre)",
        campaign_name:
          mode === "campaign_plan"
            ? "Nome sugerido para a campanha"
            : undefined,
        items: [
          {
            title: "Título ou headline do conteúdo",
            content:
              "Corpo do texto / copy / roteiro completo pronto para publicar",
            item_type:
              "post | blog | ad | video | reel | story | email | referral | evento | outro",
            platform:
              "instagram | facebook | linkedin | google | youtube | tiktok | blog | whatsapp | email | outro",
            scheduled_at: "YYYY-MM-DD (opcional, sugestão de data)",
          },
        ],
      },
      null,
      2,
    ),
    "```",
  );

  return sections.filter(Boolean).join("\n");
}

/* ------------------------------------------------------------------ */
/*  Generation function                                                */
/* ------------------------------------------------------------------ */

/**
 * Generate marketing content via the AI agent endpoint.
 * Returns parsed suggestions ready to be previewed and saved as campaign_items.
 */
export async function generateMarketingContent(
  params: GenerateContentParams,
): Promise<MarketingAiResult> {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(params);

  const response = await api.post(AI_AGENT_ENDPOINT, {
    source: "marketing_creative",
    prompt: systemPrompt,
    message: userPrompt,
    context: {
      mode: params.mode,
      tenant_id: params.tenantId,
      campaign: params.campaignContext ?? null,
    },
    user_id: params.userId ?? null,
    tenant_id: params.tenantId,
  });

  // Parse the AI response — try JSON first, then fall back to text extraction
  const rawText = extractAiInsightText(response.data);

  try {
    // Try to parse the full response as JSON
    const parsed = parseJsonFromText(rawText);
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      return {
        summary: String(obj.summary ?? ""),
        campaign_name: obj.campaign_name
          ? String(obj.campaign_name)
          : undefined,
        items: Array.isArray(obj.items)
          ? (obj.items as Record<string, unknown>[]).map(normalizeItem)
          : [],
        raw: response.data,
      };
    }
  } catch {
    // Fall through to text-only response
  }

  // If AI didn't return valid JSON, wrap the text as a single suggestion
  return {
    summary: rawText,
    items: rawText
      ? [
          {
            title: "Sugestão da IA",
            content: rawText,
            item_type: "post",
            platform: "instagram",
          },
        ]
      : [],
    raw: response.data,
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Extract JSON from text that may have markdown code fences */
function parseJsonFromText(text: string): unknown {
  const trimmed = text.trim();

  // Try direct parse
  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }

  // Extract from markdown code fence
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // continue
    }
  }

  // Extract first { ... } or [ ... ]
  const jsonMatch = trimmed.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch?.[1]) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch {
      // give up
    }
  }

  return null;
}

function normalizeItem(raw: Record<string, unknown>): AiContentSuggestion {
  return {
    title: String(raw.title ?? raw.titulo ?? "Sem título"),
    content: String(raw.content ?? raw.conteudo ?? raw.texto ?? raw.body ?? ""),
    item_type: String(raw.item_type ?? raw.tipo ?? "post"),
    platform: String(raw.platform ?? raw.plataforma ?? "instagram"),
    scheduled_at: raw.scheduled_at ? String(raw.scheduled_at) : undefined,
  };
}

/** Check if a marketing profile has minimum data filled */
export function isProfileComplete(profile: MarketingProfile): boolean {
  return Boolean(
    profile.business_description?.trim() && profile.target_audience?.trim(),
  );
}

/** Get a friendly label for a generation mode */
export function getModeLabel(mode: GenerationMode): string {
  return MODE_LABELS[mode] ?? mode;
}

export const GENERATION_MODES: {
  value: GenerationMode;
  label: string;
  description: string;
  icon: string;
}[] = [
  {
    value: "campaign_plan",
    label: "Plano de Campanha",
    description: "Gera uma campanha completa com 5 conteúdos variados",
    icon: "rocket-outline",
  },
  {
    value: "single_post",
    label: "Post Avulso",
    description: "Gera 1 conteúdo para publicação imediata",
    icon: "create-outline",
  },
  {
    value: "content_calendar",
    label: "Calendário Semanal",
    description: "Gera 7 conteúdos para 1 semana completa",
    icon: "calendar-outline",
  },
];
