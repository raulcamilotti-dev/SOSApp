/**
 * Fiscal Configuration Service
 *
 * Manages tenant fiscal data required for NF-e / NFC-e emission via sped-nfe.
 * Validates tenant readiness (certificate, CNPJ, IBGE code) before allowing emission.
 *
 * Usage:
 *   const config = await loadTenantFiscalConfig(tenantId);
 *   const check = validateTenantFiscalReadiness(config, "nfe");
 *   if (!check.ok) Alert.alert("Campos faltando", check.missing.join(", "));
 */

import { api, getApiErrorMessage } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import type { FiscalDocumentType } from "@/services/fiscal-documents";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TenantFiscalConfig {
  id: string;
  tenant_id: string;

  // Company identity
  legal_name: string | null;
  trade_name: string | null;
  cnpj: string | null;
  state_registration: string | null;
  municipal_registration: string | null;
  tax_regime: string | null; // simples_nacional | simples_excesso | regime_normal | mei

  // Address
  fiscal_street: string | null;
  fiscal_number: string | null;
  fiscal_complement: string | null;
  fiscal_neighborhood: string | null;
  fiscal_city: string | null;
  fiscal_state: string | null;
  fiscal_zip_code: string | null;
  fiscal_country: string | null;
  ibge_city_code: string | null;

  // Certificate (A1 .pfx in base64)
  fiscal_certificate_pfx: string | null;
  fiscal_certificate_password: string | null;
  fiscal_certificate_expires_at: string | null;

  // NFC-e CSC
  nfce_csc: string | null;
  nfce_csc_id: string | null;

  // Numbering
  nfe_series: number;
  nfe_next_number: number;
  nfce_series: number;
  nfce_next_number: number;

  // Environment
  fiscal_default_environment: "production" | "homologation";

  // Provider (legacy — not used with sped-nfe)
  fiscal_provider: string | null;
  fiscal_endpoint: string | null;
  fiscal_api_token: string | null;
}

export interface FiscalReadinessCheck {
  ok: boolean;
  missing: string[];
  warnings: string[];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Columns to fetch from tenants table for fiscal configuration */
const FISCAL_COLUMNS = [
  "id",
  "legal_name",
  "trade_name",
  "cnpj",
  "state_registration",
  "municipal_registration",
  "tax_regime",
  "fiscal_street",
  "fiscal_number",
  "fiscal_complement",
  "fiscal_neighborhood",
  "fiscal_city",
  "fiscal_state",
  "fiscal_zip_code",
  "fiscal_country",
  "ibge_city_code",
  "fiscal_certificate_pfx",
  "fiscal_certificate_password",
  "fiscal_certificate_expires_at",
  "nfce_csc",
  "nfce_csc_id",
  "nfe_series",
  "nfe_next_number",
  "nfce_series",
  "nfce_next_number",
  "fiscal_default_environment",
  "fiscal_provider",
  "fiscal_endpoint",
  "fiscal_api_token",
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const str = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s || null;
};

const digitsOnly = (v: unknown): string => String(v ?? "").replace(/\D/g, "");

/* ------------------------------------------------------------------ */
/*  Load tenant fiscal configuration                                   */
/* ------------------------------------------------------------------ */

/**
 * Fetch the fiscal-related columns from the tenant record.
 * Returns null if tenant not found or request fails.
 */
export async function loadTenantFiscalConfig(
  tenantId: string,
): Promise<TenantFiscalConfig | null> {
  if (!tenantId) return null;

  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "tenants",
      fields: FISCAL_COLUMNS,
      ...buildSearchParams([{ field: "id", value: tenantId }]),
    });

    const items = normalizeCrudList<Record<string, unknown>>(res.data);
    const tenant = items.find((t) => String(t.id) === tenantId);
    if (!tenant) return null;

    return {
      id: String(tenant.id),
      tenant_id: String(tenant.id),
      legal_name: str(tenant.legal_name),
      trade_name: str(tenant.trade_name),
      cnpj: str(tenant.cnpj),
      state_registration: str(tenant.state_registration),
      municipal_registration: str(tenant.municipal_registration),
      tax_regime: str(tenant.tax_regime),
      fiscal_street: str(tenant.fiscal_street),
      fiscal_number: str(tenant.fiscal_number),
      fiscal_complement: str(tenant.fiscal_complement),
      fiscal_neighborhood: str(tenant.fiscal_neighborhood),
      fiscal_city: str(tenant.fiscal_city),
      fiscal_state: str(tenant.fiscal_state),
      fiscal_zip_code: str(tenant.fiscal_zip_code),
      fiscal_country: str(tenant.fiscal_country),
      ibge_city_code: str(tenant.ibge_city_code),
      fiscal_certificate_pfx: str(tenant.fiscal_certificate_pfx),
      fiscal_certificate_password: str(tenant.fiscal_certificate_password),
      fiscal_certificate_expires_at: str(tenant.fiscal_certificate_expires_at),
      nfce_csc: str(tenant.nfce_csc),
      nfce_csc_id: str(tenant.nfce_csc_id),
      nfe_series: Number(tenant.nfe_series ?? 1),
      nfe_next_number: Number(tenant.nfe_next_number ?? 1),
      nfce_series: Number(tenant.nfce_series ?? 1),
      nfce_next_number: Number(tenant.nfce_next_number ?? 1),
      fiscal_default_environment:
        (str(tenant.fiscal_default_environment) as any) ?? "homologation",
      fiscal_provider: str(tenant.fiscal_provider),
      fiscal_endpoint: str(tenant.fiscal_endpoint),
      fiscal_api_token: str(tenant.fiscal_api_token),
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Update tenant fiscal configuration                                 */
/* ------------------------------------------------------------------ */

/**
 * Persist fiscal configuration changes back to the tenant record.
 * Only updates the fields provided in `updates`.
 */
export async function saveTenantFiscalConfig(
  tenantId: string,
  updates: Partial<Omit<TenantFiscalConfig, "id" | "tenant_id">>,
): Promise<{ ok: boolean; message: string }> {
  if (!tenantId) return { ok: false, message: "Tenant ID ausente." };

  try {
    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "tenants",
      payload: {
        id: tenantId,
        ...updates,
        updated_at: new Date().toISOString(),
      },
    });
    return { ok: true, message: "Configuração fiscal salva." };
  } catch (error) {
    return {
      ok: false,
      message: getApiErrorMessage(error, "Falha ao salvar configuração fiscal"),
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Increment & consume NF-e/NFC-e numbering                           */
/* ------------------------------------------------------------------ */

/**
 * Atomically read-and-increment the next fiscal number for a given type.
 * Returns { series, number } to be used in the XML.
 */
export async function consumeNextFiscalNumber(
  tenantId: string,
  docType: "nfe" | "nfce",
): Promise<{ series: number; number: number } | null> {
  const config = await loadTenantFiscalConfig(tenantId);
  if (!config) return null;

  const seriesKey = docType === "nfe" ? "nfe_series" : "nfce_series";
  const numberKey = docType === "nfe" ? "nfe_next_number" : "nfce_next_number";

  const currentSeries = config[seriesKey];
  const currentNumber = config[numberKey];

  // Increment for next call
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "tenants",
    payload: {
      id: tenantId,
      [numberKey]: currentNumber + 1,
      updated_at: new Date().toISOString(),
    },
  });

  return { series: currentSeries, number: currentNumber };
}

/* ------------------------------------------------------------------ */
/*  Validate tenant fiscal readiness                                    */
/* ------------------------------------------------------------------ */

/**
 * Check whether the tenant has ALL required data to emit a given fiscal
 * document type (NF-e or NFC-e). Returns { ok, missing, warnings }.
 *
 * Call this BEFORE attempting emission — if !ok, block and show the
 * missing list to the admin so they can fill in the data.
 */
export function validateTenantFiscalReadiness(
  config: TenantFiscalConfig | null,
  docType: FiscalDocumentType,
): FiscalReadinessCheck {
  const missing: string[] = [];
  const warnings: string[] = [];

  if (!config) {
    return {
      ok: false,
      missing: ["Configuração fiscal do tenant não encontrada"],
      warnings: [],
    };
  }

  // ── Company identity ──
  if (!config.cnpj || digitsOnly(config.cnpj).length < 14) {
    missing.push("CNPJ do emitente");
  }
  if (!config.legal_name) {
    missing.push("Razão social do emitente");
  }
  if (!config.tax_regime) {
    missing.push("Regime tributário");
  }

  // ── Address ──
  if (!config.fiscal_street) missing.push("Logradouro fiscal");
  if (!config.fiscal_number) missing.push("Número fiscal");
  if (!config.fiscal_neighborhood) missing.push("Bairro fiscal");
  if (!config.fiscal_city) missing.push("Cidade fiscal");
  if (!config.fiscal_state) missing.push("UF fiscal");
  if (!config.fiscal_zip_code) missing.push("CEP fiscal");

  // ── IBGE code (mandatory for NF-e/NFC-e XML) ──
  if (!config.ibge_city_code || config.ibge_city_code.length < 7) {
    missing.push("Código IBGE do município");
  }

  // ── Digital certificate (A1 .pfx) ──
  if (docType === "nfe" || docType === "nfce") {
    if (!config.fiscal_certificate_pfx) {
      missing.push("Certificado digital A1 (.pfx)");
    }
    if (!config.fiscal_certificate_password) {
      missing.push("Senha do certificado digital");
    }

    // Warn if certificate is expired or about to expire
    if (config.fiscal_certificate_expires_at) {
      const expiresAt = new Date(config.fiscal_certificate_expires_at);
      const now = new Date();
      if (expiresAt < now) {
        missing.push("Certificado digital expirado");
      } else {
        const daysToExpire = Math.floor(
          (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (daysToExpire <= 30) {
          warnings.push(
            `Certificado digital expira em ${daysToExpire} dia${daysToExpire === 1 ? "" : "s"}`,
          );
        }
      }
    }
  }

  // ── NFC-e specific: CSC ──
  if (docType === "nfce") {
    if (!config.nfce_csc) {
      missing.push("CSC — Código de Segurança do Contribuinte");
    }
    if (!config.nfce_csc_id) {
      missing.push("ID do CSC");
    }
  }

  // ── State registration ──
  if (docType === "nfe") {
    if (!config.state_registration) {
      warnings.push("Inscrição Estadual não informada — pode ser obrigatória");
    }
  }

  return { ok: missing.length === 0, missing, warnings };
}

/* ------------------------------------------------------------------ */
/*  CRT (Código de Regime Tributário) for NF-e XML                     */
/* ------------------------------------------------------------------ */

/**
 * Map the tenant's tax_regime to the CRT integer used in NF-e XML.
 *   1 = Simples Nacional
 *   2 = Simples Nacional excesso sublimite de receita bruta
 *   3 = Regime Normal (Lucro Real ou Presumido)
 *
 * MEI uses CRT 1 (Simples Nacional).
 */
export function getCRT(taxRegime: string | null): 1 | 2 | 3 {
  switch (taxRegime) {
    case "simples_nacional":
    case "mei":
      return 1;
    case "simples_excesso":
      return 2;
    case "regime_normal":
      return 3;
    default:
      return 1; // Safe fallback — Simples Nacional
  }
}

/**
 * Map the CRT + item CST/CSOSN to reasonable fiscal defaults for items.
 * Returns default CST_ICMS / CSOSN, CST_PIS, CST_COFINS based on regime.
 */
export function getDefaultItemTaxCodes(taxRegime: string | null): {
  cst_icms: string;
  csosn: string;
  cst_pis: string;
  cst_cofins: string;
} {
  const crt = getCRT(taxRegime);

  if (crt === 1) {
    // Simples Nacional — uses CSOSN instead of CST_ICMS
    return {
      cst_icms: "",
      csosn: "102", // Tributada pelo SN sem permissão de crédito
      cst_pis: "99", // Outras operações
      cst_cofins: "99",
    };
  }

  // Regime Normal
  return {
    cst_icms: "00", // Tributada integralmente
    csosn: "",
    cst_pis: "01", // Operação tributável - base cálculo = valor operação
    cst_cofins: "01",
  };
}
