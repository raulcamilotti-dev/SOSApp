/**
 * PIX Utilities Service
 *
 * Wraps the `pix-utils` library to generate PIX QR codes and BRCode strings.
 * All PIX generation goes through this file — if we ever swap libraries,
 * only this file changes (zero screen impact).
 *
 * Usage:
 *   import { generatePixPayload, generatePixQRCodeBase64 } from "@/services/pix";
 *   const brCode = generatePixPayload({ pixKey, merchantName, merchantCity, amount });
 *   const base64Png = await generatePixQRCodeBase64({ pixKey, merchantName, merchantCity, amount });
 */

import { createStaticPix, hasError } from "pix-utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PixPayloadParams {
  /** The PIX key (CPF, CNPJ, email, phone, or random key) */
  pixKey: string;
  /** Merchant / company name (max 25 chars, ASCII, no accents). Auto-sanitized. */
  merchantName: string;
  /** City of the merchant (max 15 chars, ASCII). Auto-sanitized. */
  merchantCity: string;
  /** Transaction amount in BRL. If 0 or undefined, generates an open-value QR. */
  amount?: number;
  /** Optional transaction identifier (max 25 chars) */
  txId?: string;
  /** Optional description / additional info (max 72 chars) */
  description?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Sanitize string for PIX (remove accents, limit length, uppercase).
 */
function sanitize(value: string, maxLength: number): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-zA-Z0-9 ]/g, "") // keep only alphanumeric + spaces
    .substring(0, maxLength)
    .trim();
}

/* ------------------------------------------------------------------ */
/*  Core Functions                                                     */
/* ------------------------------------------------------------------ */

/**
 * Generate a PIX BRCode (EMV string) for copy-paste.
 * Returns the BRCode string or null if generation fails.
 */
export function generatePixPayload(params: PixPayloadParams): string | null {
  try {
    const pix = createStaticPix({
      merchantName: sanitize(params.merchantName, 25),
      merchantCity: sanitize(params.merchantCity, 15),
      pixKey: params.pixKey.trim(),
      infoAdicional: params.description
        ? sanitize(params.description, 72)
        : undefined,
      transactionAmount:
        params.amount && params.amount > 0 ? params.amount : undefined,
      txid: params.txId ? sanitize(params.txId, 25) : undefined,
    });

    if (hasError(pix)) {
      console.warn("[PIX] Error generating payload:", pix);
      return null;
    }

    return pix.toBRCode();
  } catch (err) {
    console.error("[PIX] Failed to generate payload:", err);
    return null;
  }
}

/**
 * Generate a PIX QR Code as a base64 PNG data URI.
 * Returns `data:image/png;base64,...` string or null if generation fails.
 */
export async function generatePixQRCodeBase64(
  params: PixPayloadParams,
): Promise<string | null> {
  try {
    const pix = createStaticPix({
      merchantName: sanitize(params.merchantName, 25),
      merchantCity: sanitize(params.merchantCity, 15),
      pixKey: params.pixKey.trim(),
      infoAdicional: params.description
        ? sanitize(params.description, 72)
        : undefined,
      transactionAmount:
        params.amount && params.amount > 0 ? params.amount : undefined,
      txid: params.txId ? sanitize(params.txId, 25) : undefined,
    });

    if (hasError(pix)) {
      console.warn("[PIX] Error generating QR:", pix);
      return null;
    }

    // toImage returns a base64 data URI (data:image/png;base64,...)
    const base64Image = await pix.toImage();
    return base64Image;
  } catch (err) {
    console.error("[PIX] Failed to generate QR code:", err);
    return null;
  }
}

/**
 * Validate if a PIX key looks valid (basic format check).
 */
export function isValidPixKey(key: string): boolean {
  if (!key || !key.trim()) return false;
  const trimmed = key.trim();

  // CPF: 11 digits
  if (/^\d{11}$/.test(trimmed.replace(/[.\-]/g, ""))) return true;
  // CNPJ: 14 digits
  if (/^\d{14}$/.test(trimmed.replace(/[.\-/]/g, ""))) return true;
  // Email
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return true;
  // Phone: +55...
  if (/^\+55\d{10,11}$/.test(trimmed.replace(/[\s()-]/g, ""))) return true;
  // Random key (UUID format)
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      trimmed,
    )
  )
    return true;

  return false;
}
