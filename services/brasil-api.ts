/**
 * BrasilAPI Service
 *
 * Free, open-source API for Brazilian public data:
 * - CEP → Full address lookup
 * - CNPJ → Company data
 * - Banks → Bank list
 * - IBGE → Cities / States
 *
 * Docs: https://brasilapi.com.br/docs
 * No authentication required.
 */

import axios from "axios";
import { api } from "./api";
import { buildSearchParams, CRUD_ENDPOINT } from "./crud";
/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

const BRASIL_API_BASE = "https://brasilapi.com.br/api";

const client = axios.create({
  baseURL: BRASIL_API_BASE,
  timeout: 10_000,
});

/* ------------------------------------------------------------------ */
/*  Cache Layer (brasil_api_cache table via api_crud)                   */
/* ------------------------------------------------------------------ */

/** TTL in hours for each cache type */
const CACHE_TTL: Record<string, number> = {
  cep: 720, // 30 days – addresses rarely change
  cnpj: 168, // 7 days – company data can change
  holidays: 8760, // 365 days – holidays don't change once fetched
  banks: 720, // 30 days
};

async function getCached<T>(tipo: string, chave: string): Promise<T | null> {
  try {
    const { data } = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "brasil_api_cache",
      ...buildSearchParams(
        [
          { field: "tipo", value: tipo },
          { field: "chave", value: chave },
        ],
        { combineType: "AND" },
      ),
    });
    const rows = Array.isArray(data) ? data : (data?.data ?? []);
    const row = rows.find(
      (r: any) => r.tipo === tipo && r.chave === chave && !r.deleted_at,
    );
    if (!row) return null;

    // Check TTL
    const ttlHours = CACHE_TTL[tipo] ?? 168;
    const cachedAt = new Date(row.updated_at || row.created_at);
    const ageHours = (Date.now() - cachedAt.getTime()) / (1000 * 60 * 60);
    if (ageHours > ttlHours) return null;

    const raw = row.dados ?? row.resultado;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsed as T;
  } catch {
    return null;
  }
}

async function setCache(
  tipo: string,
  chave: string,
  resultado: unknown,
): Promise<void> {
  try {
    // Try to find existing entry
    const { data } = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "brasil_api_cache",
      ...buildSearchParams(
        [
          { field: "tipo", value: tipo },
          { field: "chave", value: chave },
        ],
        { combineType: "AND" },
      ),
    });
    const rows = Array.isArray(data) ? data : (data?.data ?? []);
    const existing = rows.find(
      (r: any) => r.tipo === tipo && r.chave === chave && !r.deleted_at,
    );

    const payload = {
      tipo,
      chave,
      dados: JSON.stringify(resultado),
    };

    if (existing) {
      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "brasil_api_cache",
        payload: { ...payload, id: existing.id },
      });
    } else {
      await api.post(CRUD_ENDPOINT, {
        action: "create",
        table: "brasil_api_cache",
        payload,
      });
    }
  } catch {
    // Cache write failure is non-critical
  }
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface BrasilApiAddress {
  cep: string;
  state: string;
  city: string;
  neighborhood: string;
  street: string;
  service: string;
}

export interface BrasilApiCnpj {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  situacao_cadastral: number;
  descricao_situacao_cadastral: string;
  data_situacao_cadastral: string;
  cnae_fiscal: number;
  cnae_fiscal_descricao: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  ddd_telefone_1: string;
  email: string;
  porte: string;
  natureza_juridica: string;
  capital_social: number;
  data_inicio_atividade: string;
  cnaes_secundarios: { codigo: number; descricao: string }[];
  qsa: {
    nome_socio: string;
    cnpj_cpf_do_socio: string;
    qualificacao_socio: string;
  }[];
}

export interface BrasilApiBank {
  ispb: string;
  name: string;
  code: number | null;
  fullName: string;
}

export interface BrasilApiState {
  id: number;
  sigla: string;
  nome: string;
}

export interface BrasilApiCity {
  nome: string;
  codigo_ibge: string;
}

export interface BrasilApiHoliday {
  date: string;
  name: string;
  type: string;
}

/* ------------------------------------------------------------------ */
/*  CEP Lookup                                                         */
/* ------------------------------------------------------------------ */

/**
 * Look up an address by CEP (Brazilian ZIP code).
 * Aggregates multiple providers (ViaCEP, Correios, etc.) for reliability.
 */
export async function lookupCep(cep: string): Promise<BrasilApiAddress> {
  const sanitized = cep.replace(/\D/g, "");
  if (sanitized.length !== 8) {
    throw new Error("CEP deve conter 8 dígitos");
  }

  // Check cache first
  const cached = await getCached<BrasilApiAddress>("cep", sanitized);
  if (cached) return cached;

  const { data } = await client.get<BrasilApiAddress>(`/cep/v2/${sanitized}`);

  // Store in cache (fire-and-forget)
  setCache("cep", sanitized, data);

  return data;
}

/**
 * Look up CEP with ViaCEP as fallback.
 */
export async function lookupCepWithFallback(
  cep: string,
): Promise<BrasilApiAddress> {
  const sanitized = cep.replace(/\D/g, "");
  try {
    return await lookupCep(sanitized);
  } catch {
    // Fallback to ViaCEP
    const { data } = await axios.get(
      `https://viacep.com.br/ws/${sanitized}/json/`,
      { timeout: 8_000 },
    );
    if (data.erro) throw new Error("CEP não encontrado");
    return {
      cep: data.cep?.replace(/\D/g, "") ?? sanitized,
      state: data.uf ?? "",
      city: data.localidade ?? "",
      neighborhood: data.bairro ?? "",
      street: data.logradouro ?? "",
      service: "viacep-fallback",
    };
  }
}

/* ------------------------------------------------------------------ */
/*  CNPJ Lookup                                                        */
/* ------------------------------------------------------------------ */

/**
 * Look up a company by CNPJ (14 digits).
 * Returns company info: razão social, situação cadastral, endereço, sócios.
 */
export async function lookupCnpj(cnpj: string): Promise<BrasilApiCnpj> {
  const sanitized = cnpj.replace(/\D/g, "");
  if (sanitized.length !== 14) {
    throw new Error("CNPJ deve conter 14 dígitos");
  }

  // Check cache first
  const cached = await getCached<BrasilApiCnpj>("cnpj", sanitized);
  if (cached) return cached;

  const { data } = await client.get<BrasilApiCnpj>(`/cnpj/v1/${sanitized}`);

  // Store in cache (fire-and-forget)
  setCache("cnpj", sanitized, data);

  return data;
}

/* ------------------------------------------------------------------ */
/*  Banks                                                              */
/* ------------------------------------------------------------------ */

/**
 * List all Brazilian banks (BCB registry).
 */
export async function listBanks(): Promise<BrasilApiBank[]> {
  const { data } = await client.get<BrasilApiBank[]>("/banks/v1");
  return data;
}

/**
 * Get a specific bank by code.
 */
export async function getBank(code: number): Promise<BrasilApiBank> {
  const { data } = await client.get<BrasilApiBank>(`/banks/v1/${code}`);
  return data;
}

/* ------------------------------------------------------------------ */
/*  IBGE - States & Cities                                             */
/* ------------------------------------------------------------------ */

/**
 * List all Brazilian states.
 */
export async function listStates(): Promise<BrasilApiState[]> {
  const { data } = await client.get<BrasilApiState[]>("/ibge/uf/v1");
  return data;
}

/**
 * List cities in a given state (UF sigla, e.g. "SP", "RJ").
 */
export async function listCities(uf: string): Promise<BrasilApiCity[]> {
  const { data } = await client.get<BrasilApiCity[]>(
    `/ibge/municipios/v1/${uf.toUpperCase()}?providers=dados-abertos-br,gov,wikipedia`,
  );
  return data;
}

/* ------------------------------------------------------------------ */
/*  Holidays                                                           */
/* ------------------------------------------------------------------ */

/**
 * List national holidays for a given year.
 * Useful for deadline calculations (skip non-business days).
 */
export async function listHolidays(year: number): Promise<BrasilApiHoliday[]> {
  const cacheKey = String(year);

  // Check cache first
  const cached = await getCached<BrasilApiHoliday[]>("holidays", cacheKey);
  if (cached) return cached;

  const { data } = await client.get<BrasilApiHoliday[]>(`/feriados/v1/${year}`);

  // Store in cache (fire-and-forget)
  setCache("holidays", cacheKey, data);

  return data;
}

/* ------------------------------------------------------------------ */
/*  CPF Validation (offline - no API call)                             */
/* ------------------------------------------------------------------ */

/**
 * Validate a CPF number (algorithm only, no API call).
 */
export function validateCpf(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  return remainder === parseInt(digits[10]);
}

/**
 * Validate a CNPJ number (algorithm only, no API call).
 */
export function validateCnpj(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(digits[i]) * weights1[i];
  let remainder = sum % 11;
  const digit1 = remainder < 2 ? 0 : 11 - remainder;
  if (digit1 !== parseInt(digits[12])) return false;

  sum = 0;
  for (let i = 0; i < 13; i++) sum += parseInt(digits[i]) * weights2[i];
  remainder = sum % 11;
  const digit2 = remainder < 2 ? 0 : 11 - remainder;
  return digit2 === parseInt(digits[13]);
}

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

/**
 * Format CEP for display: "01310-100"
 */
export function formatCep(cep: string): string {
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== 8) return cep;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/**
 * Format CPF for display: "123.456.789-00"
 */
export function formatCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/**
 * Format CNPJ for display: "12.345.678/0001-00"
 */
export function formatCnpj(cnpj: string): string {
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14) return cnpj;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

/**
 * Helper: auto-fill address fields from a CEP input.
 * Returns a partial record you can spread into your form state.
 */
export async function autoFillFromCep(cep: string): Promise<{
  cep: string;
  state: string;
  city: string;
  neighborhood: string;
  street: string;
} | null> {
  try {
    const address = await lookupCepWithFallback(cep);
    return {
      cep: formatCep(address.cep),
      state: address.state,
      city: address.city,
      neighborhood: address.neighborhood,
      street: address.street,
    };
  } catch {
    return null;
  }
}
