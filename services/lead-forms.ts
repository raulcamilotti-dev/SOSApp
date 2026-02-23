/**
 * Lead Forms Service — Public Capture Forms for CRM
 *
 * Manages configurable lead capture forms that tenants can embed or share.
 * Public route: /f/:slug
 *
 * Architecture:
 *   - lead_forms table stores form configuration (fields, branding, defaults)
 *   - Public page renders dynamic form based on JSONB fields config
 *   - On submit, creates a Lead via CRM service with source="formulario"
 *   - Increments submissions_count on the form
 *   - Optionally links to a campaign for UTM tracking
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

export type FormFieldType =
  | "text"
  | "email"
  | "phone"
  | "textarea"
  | "select"
  | "number"
  | "cpf"
  | "cnpj";

export interface LeadFormField {
  key: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  placeholder?: string;
  options?: string[]; // for type="select"
}

export interface LeadForm {
  id: string;
  tenant_id: string;
  title: string;
  description?: string | null;
  slug: string;
  fields: LeadFormField[] | string;
  default_source: string;
  default_priority: string;
  assigned_to?: string | null;
  campaign_id?: string | null;
  interested_service_type_id?: string | null;
  success_message: string;
  button_label: string;
  primary_color: string;
  is_active: boolean;
  submissions_count: number;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

/** Parsed form data for public rendering (no sensitive info) */
export interface PublicLeadFormData {
  id: string;
  title: string;
  description: string | null;
  fields: LeadFormField[];
  success_message: string;
  button_label: string;
  primary_color: string;
  tenant_name: string;
}

/** Submission payload from the public form */
export interface LeadFormSubmission {
  [key: string]: string;
}

/* ------------------------------------------------------------------ */
/*  Default form fields                                                */
/* ------------------------------------------------------------------ */

export const DEFAULT_FORM_FIELDS: LeadFormField[] = [
  {
    key: "name",
    label: "Nome Completo",
    type: "text",
    required: true,
    placeholder: "Seu nome",
  },
  {
    key: "email",
    label: "E-mail",
    type: "email",
    required: false,
    placeholder: "seu@email.com",
  },
  {
    key: "phone",
    label: "Telefone",
    type: "phone",
    required: true,
    placeholder: "(11) 99999-9999",
  },
  {
    key: "message",
    label: "Mensagem",
    type: "textarea",
    required: false,
    placeholder: "Como podemos ajudar?",
  },
];

/* ------------------------------------------------------------------ */
/*  Slug generation                                                    */
/* ------------------------------------------------------------------ */

export function generateFormSlug(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/* ------------------------------------------------------------------ */
/*  Lead Forms CRUD (authenticated — admin)                            */
/* ------------------------------------------------------------------ */

export async function listLeadForms(
  tenantId: string,
  filters?: CrudFilter[],
  options?: CrudListOptions,
): Promise<LeadForm[]> {
  const baseFilters: CrudFilter[] = [
    { field: "tenant_id", value: tenantId },
    ...(filters ?? []),
  ];
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "lead_forms",
    ...buildSearchParams(baseFilters, {
      sortColumn: options?.sortColumn ?? "created_at DESC",
      ...options,
    }),
  });
  return normalizeCrudList<LeadForm>(res.data).filter((f) => !f.deleted_at);
}

export async function getLeadFormById(
  formId: string,
): Promise<LeadForm | null> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "lead_forms",
    ...buildSearchParams([{ field: "id", value: formId }]),
  });
  const list = normalizeCrudList<LeadForm>(res.data);
  return list.length > 0 ? list[0] : null;
}

export async function createLeadForm(
  payload: Omit<
    LeadForm,
    "id" | "created_at" | "updated_at" | "deleted_at" | "submissions_count"
  >,
): Promise<LeadForm> {
  const fieldsJson =
    typeof payload.fields === "string"
      ? payload.fields
      : JSON.stringify(payload.fields);

  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "lead_forms",
    payload: {
      ...payload,
      fields: fieldsJson,
      slug: payload.slug || generateFormSlug(payload.title),
    },
  });
  return normalizeCrudOne<LeadForm>(res.data);
}

export async function updateLeadForm(
  formId: string,
  payload: Partial<LeadForm>,
): Promise<LeadForm> {
  const updates: Record<string, unknown> = { id: formId, ...payload };
  if (payload.fields && typeof payload.fields !== "string") {
    updates.fields = JSON.stringify(payload.fields);
  }
  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "lead_forms",
    payload: updates,
  });
  return normalizeCrudOne<LeadForm>(res.data);
}

export async function deleteLeadForm(formId: string): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "lead_forms",
    payload: { id: formId, deleted_at: new Date().toISOString() },
  });
}

/* ------------------------------------------------------------------ */
/*  Public form access (no auth)                                       */
/* ------------------------------------------------------------------ */

/** Direct axios for public access — no user auth token, but includes API key */
const publicApi = axios.create({
  timeout: 15000,
  headers: {
    "X-Api-Key": process.env.EXPO_PUBLIC_N8N_API_KEY ?? "",
  },
});

/**
 * Load a public form by slug. Resolves tenant + form in one call.
 * The public page calls this with the slug from the URL.
 */
export async function loadPublicLeadForm(
  slug: string,
): Promise<PublicLeadFormData | null> {
  try {
    // Find the form by slug (is_active = true)
    const formRes = await publicApi.post(CRUD_ENDPOINT, {
      action: "list",
      table: "lead_forms",
      ...buildSearchParams([
        { field: "slug", value: slug },
        { field: "is_active", value: "true", operator: "equal" },
        { field: "deleted_at", value: "", operator: "is_null" },
      ]),
    });
    const forms = normalizeCrudList<LeadForm>(formRes.data);
    if (forms.length === 0) return null;

    const form = forms[0];

    // Resolve tenant name
    let tenantName = "";
    try {
      const tenantRes = await publicApi.post(CRUD_ENDPOINT, {
        action: "list",
        table: "tenants",
        ...buildSearchParams([{ field: "id", value: form.tenant_id }]),
      });
      const tenants = normalizeCrudList<{ id: string; company_name?: string }>(
        tenantRes.data,
      );
      tenantName = tenants[0]?.company_name ?? "";
    } catch {
      // Non-critical — continue without tenant name
    }

    // Parse fields
    let parsedFields: LeadFormField[];
    if (typeof form.fields === "string") {
      try {
        parsedFields = JSON.parse(form.fields);
      } catch {
        parsedFields = DEFAULT_FORM_FIELDS;
      }
    } else {
      parsedFields = form.fields as LeadFormField[];
    }

    return {
      id: form.id,
      title: form.title,
      description: form.description ?? null,
      fields: parsedFields,
      success_message: form.success_message,
      button_label: form.button_label,
      primary_color: form.primary_color,
      tenant_name: tenantName,
    };
  } catch {
    return null;
  }
}

/**
 * Submit a public lead form. Creates a lead in the CRM.
 *
 * @param formId - The lead_form ID
 * @param submission - Key-value pairs from the form fields
 * @param utmParams - Optional UTM parameters for campaign linking
 */
export async function submitPublicLeadForm(
  formId: string,
  submission: LeadFormSubmission,
  utmParams?: { campaign?: string; source?: string; medium?: string },
): Promise<{ success: boolean; message: string }> {
  try {
    // Load form config to get default values
    const formRes = await publicApi.post(CRUD_ENDPOINT, {
      action: "list",
      table: "lead_forms",
      ...buildSearchParams([{ field: "id", value: formId }]),
    });
    const forms = normalizeCrudList<LeadForm>(formRes.data);
    if (forms.length === 0) {
      return { success: false, message: "Formulário não encontrado." };
    }

    const form = forms[0];
    if (!form.is_active) {
      return {
        success: false,
        message: "Este formulário não está mais ativo.",
      };
    }

    // Build lead data from submission
    const leadPayload: Record<string, unknown> = {
      tenant_id: form.tenant_id,
      name: submission.name || submission.nome || "Lead via formulário",
      email: submission.email || null,
      phone: submission.phone || submission.telefone || null,
      cpf: submission.cpf || null,
      company_name: submission.company_name || submission.empresa || null,
      status: "novo",
      source: form.default_source || "formulario",
      source_detail: `Formulário: ${form.title}`,
      priority: form.default_priority || "media",
      assigned_to: form.assigned_to || null,
      campaign_id: form.campaign_id || null,
      interested_service_type_id: form.interested_service_type_id || null,
      lead_form_id: form.id,
      notes:
        submission.message || submission.mensagem || submission.notes || null,
      tags: null as string | null,
    };

    // UTM-based campaign lookup (best effort)
    if (utmParams?.campaign && !form.campaign_id) {
      try {
        const campRes = await publicApi.post(CRUD_ENDPOINT, {
          action: "list",
          table: "campaigns",
          ...buildSearchParams([
            { field: "tenant_id", value: form.tenant_id },
            { field: "utm_campaign", value: utmParams.campaign },
          ]),
        });
        const campaigns = normalizeCrudList<{ id: string }>(campRes.data);
        if (campaigns.length > 0) {
          leadPayload.campaign_id = campaigns[0].id;
        }
      } catch {
        // Non-critical
      }
    }

    // Create the lead via direct API (no auth needed for public submit)
    await publicApi.post(CRUD_ENDPOINT, {
      action: "create",
      table: "leads",
      payload: leadPayload,
    });

    // Increment submissions count (best effort)
    try {
      await publicApi.post(CRUD_ENDPOINT, {
        action: "update",
        table: "lead_forms",
        payload: {
          id: form.id,
          submissions_count: (form.submissions_count || 0) + 1,
        },
      });
    } catch {
      // Non-critical
    }

    return {
      success: true,
      message:
        form.success_message || "Obrigado! Entraremos em contato em breve.",
    };
  } catch {
    return {
      success: false,
      message: "Erro ao enviar formulário. Tente novamente.",
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Lead Scoring                                                       */
/* ------------------------------------------------------------------ */

export interface LeadScoringRule {
  field: string;
  condition: "filled" | "equals" | "gt" | "contains";
  value?: string;
  points: number;
  label: string;
}

/** Default scoring rules — tenant can customize via config */
export const DEFAULT_SCORING_RULES: LeadScoringRule[] = [
  { field: "email", condition: "filled", points: 10, label: "Tem e-mail" },
  { field: "phone", condition: "filled", points: 15, label: "Tem telefone" },
  { field: "cpf", condition: "filled", points: 10, label: "Tem CPF" },
  {
    field: "estimated_value",
    condition: "gt",
    value: "0",
    points: 20,
    label: "Valor estimado informado",
  },
  {
    field: "interested_service_type_id",
    condition: "filled",
    points: 15,
    label: "Serviço de interesse",
  },
  {
    field: "priority",
    condition: "equals",
    value: "alta",
    points: 10,
    label: "Prioridade alta",
  },
  {
    field: "priority",
    condition: "equals",
    value: "urgente",
    points: 15,
    label: "Prioridade urgente",
  },
  {
    field: "source",
    condition: "equals",
    value: "indicacao",
    points: 10,
    label: "Veio por indicação",
  },
];

/**
 * Calculate lead score based on scoring rules.
 * Returns a score from 0 to 100.
 */
export function calculateLeadScore(
  lead: Record<string, unknown>,
  rules?: LeadScoringRule[],
): number {
  const activeRules = rules ?? DEFAULT_SCORING_RULES;
  let score = 0;

  for (const rule of activeRules) {
    const value = lead[rule.field];
    const strValue = value != null ? String(value).trim() : "";

    switch (rule.condition) {
      case "filled":
        if (strValue.length > 0 && strValue !== "null") {
          score += rule.points;
        }
        break;
      case "equals":
        if (strValue === rule.value) {
          score += rule.points;
        }
        break;
      case "gt": {
        const num = parseFloat(strValue);
        const threshold = parseFloat(rule.value ?? "0");
        if (!isNaN(num) && num > threshold) {
          score += rule.points;
        }
        break;
      }
      case "contains":
        if (
          rule.value &&
          strValue.toLowerCase().includes(rule.value.toLowerCase())
        ) {
          score += rule.points;
        }
        break;
    }
  }

  // Cap at 100
  return Math.min(score, 100);
}

/**
 * Calculate and persist lead score.
 * Updates the lead_score column on the leads table.
 */
export async function updateLeadScore(
  leadId: string,
  lead: Record<string, unknown>,
  rules?: LeadScoringRule[],
): Promise<number> {
  const score = calculateLeadScore(lead, rules);
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "leads",
    payload: { id: leadId, lead_score: score },
  });
  return score;
}

/**
 * Batch-recalculate scores for all leads of a tenant.
 */
export async function recalculateAllLeadScores(
  tenantId: string,
  rules?: LeadScoringRule[],
): Promise<number> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "leads",
    ...buildSearchParams(
      [
        { field: "tenant_id", value: tenantId },
        { field: "deleted_at", value: "", operator: "is_null" },
      ],
      { sortColumn: "created_at DESC" },
    ),
  });
  const leads = normalizeCrudList<Record<string, unknown>>(res.data);

  let updated = 0;
  for (const lead of leads) {
    const id = String(lead.id ?? "");
    if (!id) continue;
    const score = calculateLeadScore(lead, rules);
    const current = Number(lead.lead_score ?? 0);
    if (score !== current) {
      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "leads",
        payload: { id, lead_score: score },
      });
      updated++;
    }
  }
  return updated;
}

/* ------------------------------------------------------------------ */
/*  Follow-up helpers                                                  */
/* ------------------------------------------------------------------ */

/**
 * Get leads with overdue follow-ups (next_follow_up_at < now).
 */
export async function getOverdueFollowUps(
  tenantId: string,
): Promise<Record<string, unknown>[]> {
  const now = new Date().toISOString();
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "leads",
    ...buildSearchParams(
      [
        { field: "tenant_id", value: tenantId },
        { field: "next_follow_up_at", value: now, operator: "lt" },
        { field: "next_follow_up_at", value: "", operator: "is_not_null" },
        { field: "status", value: "convertido", operator: "not_equal" },
        { field: "status", value: "perdido", operator: "not_equal" },
        { field: "deleted_at", value: "", operator: "is_null" },
      ],
      { sortColumn: "next_follow_up_at ASC" },
    ),
  });
  return normalizeCrudList<Record<string, unknown>>(res.data);
}

/**
 * Schedule a follow-up for a lead.
 */
export async function scheduleFollowUp(
  leadId: string,
  tenantId: string,
  followUpAt: string,
  userId?: string,
): Promise<void> {
  // Update lead follow-up date
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "leads",
    payload: {
      id: leadId,
      next_follow_up_at: followUpAt,
      last_contact_at: new Date().toISOString(),
    },
  });

  // Log follow-up activity
  await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "lead_activities",
    payload: {
      lead_id: leadId,
      tenant_id: tenantId,
      type: "follow_up",
      title: "Follow-up agendado",
      description: `Agendado para ${new Date(followUpAt).toLocaleDateString("pt-BR")}`,
      created_by: userId || null,
    },
  });
}

/* ------------------------------------------------------------------ */
/*  URL builders                                                       */
/* ------------------------------------------------------------------ */

const BASE_URL = "https://app.radul.com.br";

/** Build the public form URL */
export function buildFormUrl(slug: string): string {
  return `${BASE_URL}/f/${slug}`;
}

/** Build WhatsApp share link with the form URL */
export function buildFormWhatsAppUrl(slug: string, message?: string): string {
  const url = buildFormUrl(slug);
  const text = message || `Preencha nosso formulário: ${url}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
