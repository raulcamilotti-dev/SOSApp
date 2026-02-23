/**
 * Shipping Service — Correios integration for rate calculation & tracking.
 *
 * MVP: Uses Correios public endpoints for rate estimation and tracking.
 * Future: Integrate with Melhor Envio or similar aggregator for multi-carrier.
 *
 * The service is consumed by:
 * - Marketplace checkout (calculate shipping before order)
 * - Order management (track delivery status)
 * - Admin config (set origin CEP, free shipping threshold)
 */

import { getMarketplaceConfig } from "./marketplace";

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
        errorMessage:
          err instanceof Error ? err.message : "Erro ao calcular frete",
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

/**
 * Fetch a single Correios rate.
 *
 * Uses the public "CalcPrecoPrazo" SOAP/XML endpoint via URL params.
 * This is the uncontracted (público) rate. Contracted rates
 * require enterprise credentials and a different endpoint.
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

/* ------------------------------------------------------------------ */
/*  Correios API — Tracking                                            */
/* ------------------------------------------------------------------ */

/**
 * Track a shipment by tracking code using Correios public endpoints.
 *
 * Note: The Correios public tracking endpoint may require CORS proxy
 * or server-side call in production. This implementation works from
 * Node.js (N8N) or with a proxy.
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

  try {
    // Use Link & Track public endpoint (may change)
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

    const events: TrackingEvent[] = eventos.map((ev) => {
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
      error: err instanceof Error ? err.message : "Falha na consulta",
    };
  }
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
