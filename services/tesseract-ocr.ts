/**
 * Tesseract OCR — open-source text extraction from images.
 *
 * Uses tesseract.js (WebAssembly-based) so it works on web and
 * can run on Node as well. For native mobile, images are passed
 * as URIs (file:// or https://).
 *
 * Server-side (n8n / Docker) can also use the native binary:
 *   apt-get install tesseract-ocr tesseract-ocr-por
 *
 * Docs: https://github.com/naptha/tesseract.js
 */

import Tesseract, { type RecognizeResult } from "tesseract.js";

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

/** Default language for OCR — Portuguese */
const DEFAULT_LANG = "por";

/**
 * Optional: if you host a Tesseract service behind an HTTP endpoint
 * (e.g. via n8n or a microservice), set this and use `recognizeRemote`.
 */
const TESSERACT_REMOTE_URL = process.env.EXPO_PUBLIC_TESSERACT_URL ?? "";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface OcrResult {
  /** Full extracted text */
  text: string;
  /** Confidence score 0-100 */
  confidence: number;
  /** Per-line breakdown */
  lines: { text: string; confidence: number }[];
  /** Raw tesseract result for advanced usage */
  raw: RecognizeResult;
}

export interface OcrRemoteResult {
  text: string;
  confidence?: number;
}

/* ------------------------------------------------------------------ */
/*  Local recognition (tesseract.js in-process)                        */
/* ------------------------------------------------------------------ */

/**
 * Recognize text in an image using tesseract.js (runs in-browser or Node).
 *
 * @param image - File path, URL, base64 data-URI, Blob, or Buffer.
 * @param lang  - Tesseract language code (default: "por").
 */
export async function recognizeText(
  image: string | Buffer | Blob | File,
  lang: string = DEFAULT_LANG,
): Promise<OcrResult> {
  const result = await Tesseract.recognize(image, lang, {
    logger: __DEV__ ? (info) => console.log("[OCR]", info) : undefined,
  });

  const lines: { text: string; confidence: number }[] = [];
  for (const block of result.data.blocks ?? []) {
    for (const para of block.paragraphs) {
      for (const line of para.lines) {
        lines.push({
          text: line.text.trim(),
          confidence: line.confidence,
        });
      }
    }
  }

  return {
    text: result.data.text.trim(),
    confidence: result.data.confidence,
    lines,
    raw: result,
  };
}

/**
 * Recognize text from a base64-encoded image string.
 */
export async function recognizeBase64(
  base64: string,
  mimeType: string = "image/png",
  lang: string = DEFAULT_LANG,
): Promise<OcrResult> {
  const dataUri = base64.startsWith("data:")
    ? base64
    : `data:${mimeType};base64,${base64}`;
  return recognizeText(dataUri, lang);
}

/* ------------------------------------------------------------------ */
/*  Remote recognition (delegated to server)                           */
/* ------------------------------------------------------------------ */

/**
 * Send an image to a remote Tesseract microservice (e.g. n8n webhook).
 * Falls back to local recognition if no remote URL is configured.
 *
 * Expected remote API contract:
 *   POST <TESSERACT_REMOTE_URL>
 *   Body: { image: "<base64>", lang: "por" }
 *   Response: { text: "...", confidence: 95 }
 */
export async function recognizeRemote(
  imageBase64: string,
  lang: string = DEFAULT_LANG,
): Promise<OcrRemoteResult> {
  if (!TESSERACT_REMOTE_URL) {
    const local = await recognizeBase64(imageBase64, "image/png", lang);
    return { text: local.text, confidence: local.confidence };
  }

  const response = await fetch(TESSERACT_REMOTE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: imageBase64, lang }),
  });

  if (!response.ok) {
    throw new Error(
      `OCR service error: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  return {
    text: data?.text ?? "",
    confidence: data?.confidence,
  };
}

/* ------------------------------------------------------------------ */
/*  Utility helpers                                                    */
/* ------------------------------------------------------------------ */

/**
 * Extract CPF numbers from OCR text.
 * Pattern: ###.###.###-## or ########### (11 digits).
 */
export function extractCpf(text: string): string[] {
  const pattern = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g;
  return [...text.matchAll(pattern)].map((m) => m[0]);
}

/**
 * Extract CNPJ numbers from OCR text.
 * Pattern: ##.###.###/####-## or 14 digits.
 */
export function extractCnpj(text: string): string[] {
  const pattern = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g;
  return [...text.matchAll(pattern)].map((m) => m[0]);
}

/**
 * Extract dates in common Brazilian format (dd/mm/yyyy).
 */
export function extractDates(text: string): string[] {
  const pattern = /\d{2}\/\d{2}\/\d{4}/g;
  return [...text.matchAll(pattern)].map((m) => m[0]);
}

/**
 * Extract monetary values (R$ 1.234,56 pattern).
 */
export function extractCurrency(text: string): string[] {
  const pattern = /R\$\s?[\d.,]+/g;
  return [...text.matchAll(pattern)].map((m) => m[0]);
}
