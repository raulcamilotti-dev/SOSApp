/**
 * Shipping Service — Correios integration for rate calculation & tracking.
 *
 * Uses the Correios contracted CWS REST API when EXPO_PUBLIC_CORREIOS_API_KEY
 * is set. Falls back to the legacy public XML endpoint otherwise.
 *
 * The service is consumed by:
 * - Marketplace checkout (calculate shipping before order)
 * - Order management (track delivery status)
 * - Admin config (set origin CEP, free shipping threshold)
 *
 * Contracted API endpoint: https://api.correios.com.br/
 * Documentation: https://cws.correios.com.br/
 */

import { getApiErrorMessage } from "./api";
import { getMarketplaceConfig } from "./marketplace";

/* ------------------------------------------------------------------ */
/*  Correios API Configuration                                         */
/* ------------------------------------------------------------------ */

/**
 * Correios contracted API key.
 * Set via EXPO_PUBLIC_CORREIOS_API_KEY environment variable.
 * When set, enables contracted rates (cheaper) and full tracking via
 * the Correios CWS REST API instead of the legacy XML endpoint.
 */
export const CORREIOS_API_KEY = process.env.EXPO_PUBLIC_CORREIOS_API_KEY ?? "";

/** Correios CWS REST API base URL */
const CORREIOS_API_BASE = "https://api.correios.com.br";

/** Correios CNPJ (required by contracted API — can be updated) */
const CORREIOS_CARTAO_POSTAGEM = process.env.EXPO_PUBLIC_CORREIOS_CARTAO ?? "";

/** Cache for auth token to avoid re-authenticating every request */
let _correiosToken: string | null = null;
let _correiosTokenExpires = 0;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ShippingServiceCode =
  | "04014" // SEDEX
  | "04510" // PAC
  | "04782" // SEDEX 12
  | "04790"; // SEDEX 10

export interface ShippingRateParams {
  tenantId: string;
  /** Origin CEP (defaults to marketplace config) */
  originCep?: string;
  /** Destination CEP */
  destinationCep: string;
  /** Total weight in grams */
  weightGrams: number;
  /** Package dimensions in cm */
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  /** Optional: specific service codes to quote */
  serviceCodes?: ShippingServiceCode[];
}

export interface ShippingRate {
  /** Correios service code */
  serviceCode: string;
  /** Service name (e.g. "SEDEX", "PAC") */
  serviceName: string;
  /** Final rate value in BRL */
  value: number;
  /** Estimated delivery in business days */
  estimatedDays: number;
  /** Whether there was an error calculating this rate */
  error: boolean;
  /** Error message if any */
  errorMessage?: string;
}

export interface ShippingQuoteResult {
  rates: ShippingRate[];
  /** Origin CEP used */
  originCep: string;
  /** Destination CEP */
  destinationCep: string;
  /** Whether free shipping applies (based on tenant config) */
  freeShippingApplies: boolean;
  /** Subtotal threshold for free shipping */
  freeShippingAbove: number | null;
}

export interface TrackingEvent {
  date: string;
  time: string;
  location: string;
  status: string;
  description: string;
}

export interface TrackingResult {
  trackingCode: string;
  events: TrackingEvent[];
  delivered: boolean;
  lastStatus: string;
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SERVICE_NAMES: Record<string, string> = {
  "04014": "SEDEX",
  "04510": "PAC",
  "04782": "SEDEX 12",
  "04790": "SEDEX 10",
};

const DEFAULT_SERVICE_CODES: ShippingServiceCode[] = ["04014", "04510"];

/** Minimum package dimensions (Correios requirements) */
const MIN_LENGTH_CM = 16;
const MIN_WIDTH_CM = 11;
const MIN_HEIGHT_CM = 2;
const MIN_WEIGHT_GRAMS = 300;

/** Maximum package dimensions (Correios limit) */
const MAX_WEIGHT_GRAMS = 30000;
const MAX_DIMENSION_SUM_CM = 200; // L+W+H

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Clean CEP to digits only */
const cleanCep = (cep: string): string => cep.replace(/\D/g, "").slice(0, 8);

/** Enforce minimum dimensions for Correios */
function normalizePackageDimensions(params: {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightGrams: number;
}): { length: number; width: number; height: number; weight: number } {
  const length = Math.max(params.lengthCm, MIN_LENGTH_CM);
  const width = Math.max(params.widthCm, MIN_WIDTH_CM);
  const height = Math.max(params.heightCm, MIN_HEIGHT_CM);
  const weight = Math.min(
    Math.max(params.weightGrams, MIN_WEIGHT_GRAMS),
    MAX_WEIGHT_GRAMS,
  );

  return { length, width, height, weight };
}

/** Validate that a package fits Correios constraints */
function validatePackage(params: {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightGrams: number;
}): { valid: boolean; error?: string } {
  if (params.weightGrams > MAX_WEIGHT_GRAMS) {
    return {
      valid: false,
      error: `Peso excede o máximo de ${MAX_WEIGHT_GRAMS / 1000}kg`,
    };
  }

  const dimensionSum = params.lengthCm + params.widthCm + params.heightCm;
  if (dimensionSum > MAX_DIMENSION_SUM_CM) {
    return {
      valid: false,
      error: `Soma das dimensões excede ${MAX_DIMENSION_SUM_CM}cm`,
    };
  }

  return { valid: true };
}

/* ------------------------------------------------------------------ */
/*  Correios API — Rate calculation                                    */
/* ------------------------------------------------------------------ */

/**
 * Calculate shipping rates via Correios web service.
 *
 * Uses the public Correios "calc preco prazo" endpoint.
 * This is a best-effort integration — the endpoint may change without notice.
 * Future: migrate to Melhor Envio or Correios contract API.
 */
export async function calculateShippingRates(
  params: ShippingRateParams,
): Promise<ShippingQuoteResult> {
  const { tenantId, destinationCep, serviceCodes } = params;

  // Resolve origin CEP from marketplace config if not provided
  let originCep = params.originCep;
  let freeShippingAbove: number | null = null;

  try {
    const config = await getMarketplaceConfig(tenantId);
    if (!originCep && config.correios_cep_origin) {
      originCep = config.correios_cep_origin;
    }
    freeShippingAbove = config.free_shipping_above ?? null;
  } catch {
    // Config not found — continue with provided origin
  }

  if (!originCep) {
    throw new Error(
      "CEP de origem não configurado. Configure nas opções do marketplace.",
    );
  }

  const cleanOrigin = cleanCep(originCep);
  const cleanDest = cleanCep(destinationCep);

  if (cleanOrigin.length !== 8 || cleanDest.length !== 8) {
    throw new Error("CEP de origem ou destino inválido.");
  }

  // Validate package
  const validation = validatePackage(params);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const { length, width, height, weight } = normalizePackageDimensions(params);
  const codes = serviceCodes ?? DEFAULT_SERVICE_CODES;

  const rates: ShippingRate[] = [];

  // Query each service code individually (Correios public API)
  for (const code of codes) {
    try {
      const rate = await fetchCorreiosRate({
        serviceCode: code,
        originCep: cleanOrigin,
        destinationCep: cleanDest,
        weightKg: weight / 1000,
        lengthCm: length,
        widthCm: width,
        heightCm: height,
      });
      rates.push(rate);
    } catch (err) {
      rates.push({
        serviceCode: code,
        serviceName: SERVICE_NAMES[code] ?? code,
        value: 0,
        estimatedDays: 0,
        error: true,
        errorMessage: getApiErrorMessage(err, "Erro ao calcular frete"),
      });
    }
  }

  return {
    rates: rates.sort((a, b) => {
      // Sort by price (errors last)
      if (a.error && !b.error) return 1;
      if (!a.error && b.error) return -1;
      return a.value - b.value;
    }),
    originCep: cleanOrigin,
    destinationCep: cleanDest,
    freeShippingApplies: false, // Caller checks against subtotal
    freeShippingAbove,
  };
}

/* ---- Correios CWS REST API — Token authentication ---- */

/**
 * Authenticate with the Correios CWS REST API.
 * Returns a Bearer token valid for ~1 hour.
 * Caches the token to avoid re-authenticating every request.
 */
async function getCorreiosToken(): Promise<string> {
  // Return cached token if still valid (5 min buffer)
  if (_correiosToken && Date.now() < _correiosTokenExpires - 300_000) {
    return _correiosToken;
  }

  const endpoint = CORREIOS_CARTAO_POSTAGEM
    ? `${CORREIOS_API_BASE}/token/v1/autentica/cartaopostagem`
    : `${CORREIOS_API_BASE}/token/v1/autentica`;

  const body = CORREIOS_CARTAO_POSTAGEM
    ? JSON.stringify({ numero: CORREIOS_CARTAO_POSTAGEM })
    : undefined;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${btoa(`${CORREIOS_API_KEY}:`)}`,
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Correios auth falhou (${response.status}): ${errorText}`.slice(0, 200),
    );
  }

  const data = (await response.json()) as Record<string, unknown>;
  const token = String(data?.token ?? "");
  const expiresIn = Number(data?.expiraEm ?? 3600);

  if (!token) {
    throw new Error("Token Correios vazio na resposta");
  }

  _correiosToken = token;
  // expiraEm is typically an ISO string or seconds — handle both
  if (typeof data?.expiraEm === "string" && data.expiraEm.includes("T")) {
    _correiosTokenExpires = new Date(data.expiraEm as string).getTime();
  } else {
    _correiosTokenExpires = Date.now() + expiresIn * 1000;
  }

  return token;
}

/** Invalidate cached token (forces re-authentication on next call) */
function invalidateCorreiosToken(): void {
  _correiosToken = null;
  _correiosTokenExpires = 0;
}

/* ---- Correios CWS REST API — Contracted rate fetch ---- */

/**
 * Service code mapping for the CWS API.
 * The contracted API uses different product codes in some cases.
 */
const CWS_PRODUCT_CODES: Record<string, string> = {
  "04014": "04014", // SEDEX
  "04510": "04510", // PAC
  "04782": "04782", // SEDEX 12
  "04790": "04790", // SEDEX 10
};

/**
 * Fetch a single Correios rate using the contracted CWS REST API.
 *
 * Endpoint: POST /preco/v1/nacional
 * Auth: Bearer token from /token/v1/autentica
 */
async function fetchCorreiosRateContracted(params: {
  serviceCode: string;
  originCep: string;
  destinationCep: string;
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}): Promise<ShippingRate> {
  const {
    serviceCode,
    originCep,
    destinationCep,
    weightKg,
    lengthCm,
    widthCm,
    heightCm,
  } = params;

  const token = await getCorreiosToken();
  const productCode = CWS_PRODUCT_CODES[serviceCode] ?? serviceCode;

  const requestBody = {
    coProduto: productCode,
    cepOrigem: originCep,
    cepDestino: destinationCep,
    psObjeto: String(Math.ceil(weightKg * 1000)), // weight in grams
    tpObjeto: 2, // 1=envelope, 2=package, 3=cylinder
    comprimento: Math.ceil(lengthCm),
    largura: Math.ceil(widthCm),
    altura: Math.ceil(heightCm),
    vlDeclarado: 0,
    cdMaoPropria: "N",
    cdAvisoRecebimento: "N",
  };

  const response = await fetch(`${CORREIOS_API_BASE}/preco/v1/nacional`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(requestBody),
  });

  // If 401/403, invalidate token and retry once
  if (response.status === 401 || response.status === 403) {
    invalidateCorreiosToken();
    const retryToken = await getCorreiosToken();
    const retryResponse = await fetch(
      `${CORREIOS_API_BASE}/preco/v1/nacional`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${retryToken}`,
        },
        body: JSON.stringify(requestBody),
      },
    );

    if (!retryResponse.ok) {
      throw new Error(`Correios CWS retornou status ${retryResponse.status}`);
    }

    const retryData = (await retryResponse.json()) as Record<string, unknown>;
    return parseContractedRateResponse(retryData, serviceCode);
  }

  if (!response.ok) {
    throw new Error(`Correios CWS retornou status ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  return parseContractedRateResponse(data, serviceCode);
}

/** Parse the CWS /preco/v1/nacional JSON response into a ShippingRate */
function parseContractedRateResponse(
  data: Record<string, unknown>,
  serviceCode: string,
): ShippingRate {
  // CWS response: { pcFinal, prazoEntrega, coProduto, txErro, ... }
  const errorMsg = String(data?.txErro ?? "").trim();
  const hasError = !!errorMsg && errorMsg !== "0";

  if (hasError) {
    return {
      serviceCode,
      serviceName: SERVICE_NAMES[serviceCode] ?? serviceCode,
      value: 0,
      estimatedDays: 0,
      error: true,
      errorMessage: errorMsg,
    };
  }

  // pcFinal is the contracted price (string like "45.30" or number)
  const rawPrice = data?.pcFinal ?? data?.pcBase ?? data?.vlTotalServicos ?? 0;
  const value =
    typeof rawPrice === "number"
      ? rawPrice
      : parseFloat(String(rawPrice).replace(",", "."));
  const estimatedDays = parseInt(String(data?.prazoEntrega ?? 0), 10);

  return {
    serviceCode,
    serviceName: SERVICE_NAMES[serviceCode] ?? serviceCode,
    value: isNaN(value) ? 0 : value,
    estimatedDays: isNaN(estimatedDays) ? 0 : estimatedDays,
    error: false,
  };
}

/* ---- Correios Legacy Public XML API — Fallback ---- */

/**
 * Fetch a single Correios rate using the legacy public XML endpoint.
 * Used as fallback when CORREIOS_API_KEY is not set.
 */
async function fetchCorreiosRateLegacy(params: {
  serviceCode: string;
  originCep: string;
  destinationCep: string;
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}): Promise<ShippingRate> {
  const {
    serviceCode,
    originCep,
    destinationCep,
    weightKg,
    lengthCm,
    widthCm,
    heightCm,
  } = params;

  const url = new URL(
    "https://ws.correios.com.br/calculador/CalcPrecoPrazo.aspx",
  );
  url.searchParams.set("nCdServico", serviceCode);
  url.searchParams.set("sCepOrigem", originCep);
  url.searchParams.set("sCepDestino", destinationCep);
  url.searchParams.set("nVlPeso", String(weightKg));
  url.searchParams.set("nCdFormato", "1"); // Caixa/pacote
  url.searchParams.set("nVlComprimento", String(lengthCm));
  url.searchParams.set("nVlLargura", String(widthCm));
  url.searchParams.set("nVlAltura", String(heightCm));
  url.searchParams.set("nVlDiametro", "0");
  url.searchParams.set("sCdMaoPropria", "N");
  url.searchParams.set("nVlValorDeclarado", "0");
  url.searchParams.set("sCdAvisoRecebimento", "N");
  url.searchParams.set("nCdEmpresa", "");
  url.searchParams.set("sDsSenha", "");
  url.searchParams.set("StrRetorno", "xml");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/xml, text/xml" },
  });

  if (!response.ok) {
    throw new Error(`Correios retornou status ${response.status}`);
  }

  const xml = await response.text();

  // Parse the XML response (simple regex approach — no XML parser needed)
  const getValue = (tag: string): string => {
    const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
    return match?.[1]?.trim() ?? "";
  };

  const errorCode = getValue("Erro");
  const errorMsg = getValue("MsgErro");
  const valueStr = getValue("Valor").replace(".", "").replace(",", ".");
  const daysStr = getValue("PrazoEntrega");

  if (errorCode && errorCode !== "0") {
    return {
      serviceCode,
      serviceName: SERVICE_NAMES[serviceCode] ?? serviceCode,
      value: 0,
      estimatedDays: 0,
      error: true,
      errorMessage: errorMsg || `Erro Correios: ${errorCode}`,
    };
  }

  const value = parseFloat(valueStr);
  const estimatedDays = parseInt(daysStr, 10);

  return {
    serviceCode,
    serviceName: SERVICE_NAMES[serviceCode] ?? serviceCode,
    value: isNaN(value) ? 0 : value,
    estimatedDays: isNaN(estimatedDays) ? 0 : estimatedDays,
    error: false,
  };
}

/* ---- Unified rate fetcher — dispatches to contracted or legacy ---- */

/**
 * Fetch a single Correios rate.
 *
 * When CORREIOS_API_KEY is set, uses the contracted CWS REST API
 * (cheaper rates, better reliability). Falls back to the legacy
 * public XML endpoint otherwise.
 */
async function fetchCorreiosRate(params: {
  serviceCode: string;
  originCep: string;
  destinationCep: string;
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}): Promise<ShippingRate> {
  if (CORREIOS_API_KEY) {
    try {
      return await fetchCorreiosRateContracted(params);
    } catch (contractedError) {
      // If contracted API fails, fall back to legacy
      if (__DEV__) {
        console.warn(
          "[Shipping] Contracted API failed, falling back to legacy:",
          contractedError,
        );
      }
      return fetchCorreiosRateLegacy(params);
    }
  }

  return fetchCorreiosRateLegacy(params);
}

/* ------------------------------------------------------------------ */
/*  Correios API — Tracking                                            */
/* ------------------------------------------------------------------ */

/**
 * Track a shipment using the Correios contracted SRO API.
 * Falls back to the proxyapp public endpoint when API key is not set.
 */
export async function trackShipment(
  trackingCode: string,
): Promise<TrackingResult> {
  const code = trackingCode.trim().toUpperCase();

  if (!code || code.length < 13) {
    return {
      trackingCode: code,
      events: [],
      delivered: false,
      lastStatus: "Código de rastreio inválido",
      error: "Código de rastreio deve ter 13 caracteres",
    };
  }

  // Use contracted API when available
  if (CORREIOS_API_KEY) {
    try {
      return await trackShipmentContracted(code);
    } catch (err) {
      if (__DEV__) {
        console.warn(
          "[Shipping] Contracted tracking failed, falling back:",
          err,
        );
      }
      // Fall through to legacy
    }
  }

  return trackShipmentLegacy(code);
}

/**
 * Track via Correios contracted SRO REST API.
 * Endpoint: GET /srorastro/v1/objetos/{code}
 */
async function trackShipmentContracted(code: string): Promise<TrackingResult> {
  const token = await getCorreiosToken();

  const response = await fetch(
    `${CORREIOS_API_BASE}/srorastro/v1/objetos/${code}?resultado=T`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (response.status === 401 || response.status === 403) {
    invalidateCorreiosToken();
    throw new Error("Token expirado — retry");
  }

  if (!response.ok) {
    throw new Error(`SRO retornou status ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const objetos = (data?.objetos ?? []) as Record<string, unknown>[];
  const objeto = objetos[0];

  if (!objeto) {
    return {
      trackingCode: code,
      events: [],
      delivered: false,
      lastStatus: "Objeto não encontrado",
    };
  }

  const eventos = (objeto.eventos ?? []) as Record<string, unknown>[];
  const events = parseCorreiosEvents(eventos);
  const delivered = events.some(
    (e) =>
      e.status === "BDE" || e.description.toLowerCase().includes("entregue"),
  );

  return {
    trackingCode: code,
    events,
    delivered,
    lastStatus: events[0]?.description ?? "Sem informações",
  };
}

/**
 * Track via the public proxyapp endpoint (legacy fallback).
 */
async function trackShipmentLegacy(code: string): Promise<TrackingResult> {
  try {
    const url = `https://proxyapp.correios.com.br/v1/sro-rastro/${code}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "SOSApp/1.0",
      },
    });

    if (!response.ok) {
      return {
        trackingCode: code,
        events: [],
        delivered: false,
        lastStatus: "Não foi possível consultar",
        error: `Correios retornou status ${response.status}`,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;
    const objetos = (data?.objetos ?? []) as Record<string, unknown>[];
    const objeto = objetos[0];

    if (!objeto) {
      return {
        trackingCode: code,
        events: [],
        delivered: false,
        lastStatus: "Objeto não encontrado",
      };
    }

    const eventos = (objeto.eventos ?? []) as Record<string, unknown>[];
    const events = parseCorreiosEvents(eventos);
    const delivered = events.some(
      (e) =>
        e.status === "BDE" || e.description.toLowerCase().includes("entregue"),
    );

    return {
      trackingCode: code,
      events,
      delivered,
      lastStatus: events[0]?.description ?? "Sem informações",
    };
  } catch (err) {
    return {
      trackingCode: code,
      events: [],
      delivered: false,
      lastStatus: "Erro ao consultar rastreio",
      error: getApiErrorMessage(err, "Falha na consulta"),
    };
  }
}

/** Parse the Correios event array (shared between contracted and legacy) */
function parseCorreiosEvents(
  eventos: Record<string, unknown>[],
): TrackingEvent[] {
  return eventos.map((ev) => {
    const unidade = ev.unidade as Record<string, unknown> | undefined;
    return {
      date: String(ev.dtHrCriado ?? "").slice(0, 10),
      time: String(ev.dtHrCriado ?? "").slice(11, 16),
      location: unidade
        ? `${unidade.nome ?? ""} - ${unidade.endereco && typeof unidade.endereco === "object" ? ((unidade.endereco as Record<string, unknown>).cidade ?? "") : ""}`.trim()
        : "",
      status: String(ev.codigo ?? ""),
      description: String(ev.descricao ?? ""),
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Aggregate helpers (for checkout flow)                               */
/* ------------------------------------------------------------------ */

/**
 * Calculate total package dimensions from cart items.
 * Simple approach: sum weights, use the largest dimension per axis.
 */
export function aggregatePackageDimensions(
  items: {
    weight_grams?: number | null;
    dimension_length_cm?: number | null;
    dimension_width_cm?: number | null;
    dimension_height_cm?: number | null;
    quantity: number;
  }[],
): {
  weightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
} {
  let totalWeight = 0;
  let maxLength = 0;
  let maxWidth = 0;
  let totalHeight = 0;

  for (const item of items) {
    totalWeight += (item.weight_grams ?? 300) * item.quantity;
    maxLength = Math.max(maxLength, item.dimension_length_cm ?? 0);
    maxWidth = Math.max(maxWidth, item.dimension_width_cm ?? 0);
    totalHeight += (item.dimension_height_cm ?? 2) * item.quantity;
  }

  return {
    weightGrams: totalWeight,
    lengthCm: Math.max(maxLength, MIN_LENGTH_CM),
    widthCm: Math.max(maxWidth, MIN_WIDTH_CM),
    heightCm: Math.max(totalHeight, MIN_HEIGHT_CM),
  };
}

/**
 * Quick check: does the subtotal qualify for free shipping?
 */
export function checkFreeShipping(
  subtotal: number,
  freeShippingAbove: number | null,
): boolean {
  if (!freeShippingAbove || freeShippingAbove <= 0) return false;
  return subtotal >= freeShippingAbove;
}

/**
 * Find the cheapest valid shipping rate from a quote result.
 */
export function getCheapestRate(rates: ShippingRate[]): ShippingRate | null {
  const valid = rates.filter((r) => !r.error && r.value > 0);
  if (valid.length === 0) return null;
  return valid.reduce((min, r) => (r.value < min.value ? r : min));
}

/**
 * Format a shipping rate for display.
 */
export function formatShippingRate(rate: ShippingRate): string {
  if (rate.error) return `${rate.serviceName}: Indisponível`;
  const price = rate.value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  const days =
    rate.estimatedDays === 1
      ? "1 dia útil"
      : `${rate.estimatedDays} dias úteis`;
  return `${rate.serviceName}: ${price} (${days})`;
}
