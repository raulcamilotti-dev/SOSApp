/**
 * PDF-to-Image conversion using pdfjs-dist.
 *
 * Renders each page of a PDF to a canvas and returns PNG data-URIs
 * that can be passed to Tesseract.js for OCR.
 *
 * Only works on web (canvas required).
 */

import { Platform } from "react-native";

export interface PdfPageImage {
  /** 1-based page number */
  page: number;
  /** PNG data-URI (data:image/png;base64,...) */
  dataUri: string;
  /** Canvas width */
  width: number;
  /** Canvas height */
  height: number;
}

/**
 * Convert a PDF (base64 or data-URI) to an array of PNG images.
 *
 * @param input - base64 string (raw or data-URI) of a PDF file
 * @param scale - render scale factor (default 2 for good OCR quality)
 * @returns array of PdfPageImage (one per page)
 */
export async function pdfToImages(
  input: string,
  scale: number = 2,
): Promise<PdfPageImage[]> {
  if (Platform.OS !== "web") {
    throw new Error("pdfToImages is only supported on web (requires canvas)");
  }

  // Dynamically import pdfjs-dist to avoid bundling issues on native
  const pdfjsLib = await import("pdfjs-dist");

  // Set worker source from CDN matching installed version
  const version = pdfjsLib.version || "4.4.168";
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;

  // Parse base64 input
  let raw = input;
  if (raw.startsWith("data:")) {
    // Strip data-URI prefix
    raw = raw.split(",")[1] || raw;
  }

  // Decode base64 to Uint8Array
  const binaryString = atob(raw);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Load the PDF document
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;

  const images: PdfPageImage[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    // Create an off-screen canvas
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Could not create 2D canvas context");
    }

    // Render PDF page to canvas
    await page.render({ canvasContext: ctx, viewport }).promise;

    // Convert canvas to PNG data URI
    const dataUri = canvas.toDataURL("image/png");

    images.push({
      page: pageNum,
      dataUri,
      width: viewport.width,
      height: viewport.height,
    });
  }

  return images;
}

/**
 * Check if a mime type represents a PDF document.
 */
export function isPdf(mimeType?: string | null): boolean {
  if (!mimeType) return false;
  return mimeType.toLowerCase() === "application/pdf";
}
