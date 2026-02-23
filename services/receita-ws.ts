/**
 * ReceitaWS Service
 *
 * CNPJ consultation from Receita Federal via ReceitaWS.
 * Rate limit: 3 requests/minute (both free and paid tiers with this token).
 * Requests are automatically queued — callers never get a rate-limit error;
 * they wait until a slot is available.
 *
 * Used as a complement/fallback to BrasilAPI CNPJ.
 * Returns richer data: QSA (sócios), atividades secundárias, Simples Nacional.
 *
 * Docs: https://receitaws.com.br/api
 */

import axios from "axios";

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

const RECEITAWS_BASE = "https://receitaws.com.br/v1";

/** Token is read from env automatically. Callers don't need to pass it. */
function getApiToken(): string | undefined {
  const token =
    typeof process !== "undefined"
      ? process.env.EXPO_PUBLIC_RECEITAWS_TOKEN
      : undefined;
  return token && token.trim().length > 0 ? token.trim() : undefined;
}

const client = axios.create({
  baseURL: RECEITAWS_BASE,
  timeout: 30_000, // ReceitaWS can be slow (queues requests)
});

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ReceitaWsSocio {
  nome: string;
  qual: string; // Qualificação do sócio
  pais_origem: string;
  nome_rep_legal: string;
  qual_rep_legal: string;
}

export interface ReceitaWsAtividadeSecundaria {
  code: string;
  text: string;
}

export interface ReceitaWsCnpj {
  status: "OK" | "ERROR";
  message?: string;

  // Dados principais
  cnpj: string;
  tipo: string; // "MATRIZ" | "FILIAL"
  abertura: string; // "01/01/2000"
  nome: string; // Razão social
  fantasia: string; // Nome fantasia
  porte: string;
  natureza_juridica: string;
  capital_social: string;

  // Atividades
  atividade_principal: { code: string; text: string }[];
  atividades_secundarias: ReceitaWsAtividadeSecundaria[];

  // Endereço
  logradouro: string;
  numero: string;
  complemento: string;
  cep: string;
  bairro: string;
  municipio: string;
  uf: string;

  // Contato
  email: string;
  telefone: string;

  // Situação
  situacao: string; // "ATIVA", "BAIXADA", etc.
  data_situacao: string;
  motivo_situacao: string;
  situacao_especial: string;
  data_situacao_especial: string;

  // Simples Nacional
  efr: string;
  simples?: {
    optante: boolean;
    data_opcao: string;
    data_exclusao: string;
    ultima_atualizacao: string;
  };
  simei?: {
    optante: boolean;
    data_opcao: string;
    data_exclusao: string;
    ultima_atualizacao: string;
  };

  // Sócios
  qsa: ReceitaWsSocio[];

  // Metadata
  ultima_atualizacao: string;
  billing?: {
    free: boolean;
    database: boolean;
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Sanitize a CNPJ string: remove non-digits.
 */
function sanitizeCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, "");
}

/**
 * Rate-limit queue: strict 3 req/min for ALL tiers.
 *
 * Instead of erroring when limit is hit, requests are queued and
 * automatically dispatched once a slot opens. The UI shows a
 * "waiting" state so the user knows what's happening.
 */
let lastRequestTimestamps: number[] = [];
const RATE_LIMIT = 3;
const RATE_WINDOW_MS = 60_000;

/** Pending queue: each item is a resolve callback that unblocks the caller. */
type QueueItem = { resolve: () => void; enqueuedAt: number };
const pendingQueue: QueueItem[] = [];
let queueTimerId: ReturnType<typeof setTimeout> | null = null;

/** Optional callback for UI to observe queue changes. */
type QueueChangeListener = (info: RateLimitInfo) => void;
const listeners: Set<QueueChangeListener> = new Set();

export function onRateLimitChange(listener: QueueChangeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners() {
  const info = getRateLimitInfo();
  listeners.forEach((fn) => {
    try {
      fn(info);
    } catch {
      /* ignore */
    }
  });
}

function cleanTimestamps(): void {
  const now = Date.now();
  lastRequestTimestamps = lastRequestTimestamps.filter(
    (ts) => now - ts < RATE_WINDOW_MS,
  );
}

function canMakeRequest(): boolean {
  cleanTimestamps();
  return lastRequestTimestamps.length < RATE_LIMIT;
}

function recordRequest(): void {
  lastRequestTimestamps.push(Date.now());
  notifyListeners();
}

function msUntilNextSlot(): number {
  cleanTimestamps();
  if (lastRequestTimestamps.length < RATE_LIMIT) return 0;
  const oldest = lastRequestTimestamps[0];
  return Math.max(0, oldest + RATE_WINDOW_MS - Date.now());
}

/** Process the queue: release pending callers when slots become available. */
function processQueue(): void {
  if (queueTimerId !== null) {
    clearTimeout(queueTimerId);
    queueTimerId = null;
  }

  while (pendingQueue.length > 0 && canMakeRequest()) {
    const item = pendingQueue.shift()!;
    recordRequest();
    item.resolve();
  }

  // If there are still items waiting, schedule retry when next slot opens
  if (pendingQueue.length > 0) {
    const waitMs = msUntilNextSlot();
    queueTimerId = setTimeout(() => {
      queueTimerId = null;
      processQueue();
      notifyListeners();
    }, waitMs + 200); // small buffer
  }

  notifyListeners();
}

/**
 * Wait for a rate-limit slot. Returns immediately if a slot is available,
 * otherwise holds the caller until one opens.
 */
function waitForSlot(): Promise<void> {
  if (canMakeRequest()) {
    recordRequest();
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    pendingQueue.push({ resolve, enqueuedAt: Date.now() });
    processQueue();
  });
}

/* ------------------------------------------------------------------ */
/*  API                                                                */
/* ------------------------------------------------------------------ */

export interface ReceitaWsOptions {
  /** Override the env token. If not set, reads from EXPO_PUBLIC_RECEITAWS_TOKEN. */
  apiToken?: string;
}

/**
 * Consult CNPJ via ReceitaWS.
 *
 * Requests are automatically queued to respect the 3 req/min limit.
 * The caller awaits until a slot is available — no rate-limit errors thrown.
 *
 * @param cnpj - CNPJ digits (14 chars)
 * @param options - Optional token override
 * @returns Company data from Receita Federal
 *
 * @example
 * ```ts
 * const company = await consultCnpj("12345678000100");
 * console.log(company.nome, company.situacao);
 * ```
 */
export async function consultCnpj(
  cnpj: string,
  options: ReceitaWsOptions = {},
): Promise<ReceitaWsCnpj> {
  const sanitized = sanitizeCnpj(cnpj);
  if (sanitized.length !== 14) {
    throw new Error("CNPJ deve conter 14 dígitos");
  }

  // Wait for a rate-limit slot (queues automatically)
  await waitForSlot();

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  const token = options.apiToken ?? getApiToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const { data } = await client.get<ReceitaWsCnpj>(`/cnpj/${sanitized}`, {
    headers,
  });

  if (data.status === "ERROR") {
    throw new Error(data.message ?? "Erro ao consultar CNPJ na ReceitaWS");
  }

  return data;
}

/**
 * Check if a company CNPJ is active (situação cadastral ATIVA).
 */
export async function isCnpjActive(
  cnpj: string,
  options?: ReceitaWsOptions,
): Promise<boolean> {
  const data = await consultCnpj(cnpj, options);
  return data.situacao?.toUpperCase() === "ATIVA";
}

/**
 * Get partner/QSA info from a CNPJ.
 */
export async function getCnpjPartners(
  cnpj: string,
  options?: ReceitaWsOptions,
): Promise<ReceitaWsSocio[]> {
  const data = await consultCnpj(cnpj, options);
  return data.qsa ?? [];
}

/**
 * Check Simples Nacional status.
 */
export async function isOptanteSimplesNacional(
  cnpj: string,
  options?: ReceitaWsOptions,
): Promise<boolean> {
  const data = await consultCnpj(cnpj, options);
  return data.simples?.optante === true;
}

/**
 * Current rate limit info — includes queue status.
 */
export interface RateLimitInfo {
  /** Requests made in the current 60s window */
  requestsUsed: number;
  /** Max requests per window */
  maxRequests: number;
  /** Ms until the oldest request expires and a slot opens */
  msUntilNextSlot: number;
  /** Number of requests waiting in the queue */
  queueLength: number;
  /** True if there are queued requests waiting */
  isQueueActive: boolean;
}

export function getRateLimitInfo(): RateLimitInfo {
  cleanTimestamps();
  return {
    requestsUsed: lastRequestTimestamps.length,
    maxRequests: RATE_LIMIT,
    msUntilNextSlot: msUntilNextSlot(),
    queueLength: pendingQueue.length,
    isQueueActive: pendingQueue.length > 0,
  };
}
