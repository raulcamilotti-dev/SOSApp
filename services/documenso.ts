/**
 * Documenso — open-source document signing integration.
 *
 * Supports:
 * - Standard Documenso electronic signatures
 * - ICP-Brasil certificate-based signing (.p12 / PKCS#12)
 *
 * Docs: https://docs.documenso.com/developers/public-api/reference
 */

import axios from "axios";
import { Platform } from "react-native";

import { getApiErrorMessage } from "./api";

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

const DOCUMENSO_BASE_URL =
  process.env.EXPO_PUBLIC_DOCUMENSO_URL ??
  "https://documenso.sosescritura.com.br";
const DOCUMENSO_API_KEY = process.env.EXPO_PUBLIC_DOCUMENSO_API_KEY || "";

/** v1 client (legacy — some self-hosted versions still use v1) */
const documensoV1 = axios.create({
  baseURL: `${DOCUMENSO_BASE_URL}/api/v1`,
  headers: {
    Authorization: DOCUMENSO_API_KEY,
    "Content-Type": "application/json",
  },
});

/** v2 client (current — envelope-based API) */
const documensoV2 = axios.create({
  baseURL: `${DOCUMENSO_BASE_URL}/api/v2`,
  headers: {
    Authorization: DOCUMENSO_API_KEY,
    "Content-Type": "application/json",
  },
});

/* ------------------------------------------------------------------ */
/*  Signing Types                                                      */
/* ------------------------------------------------------------------ */

export type SigningType = "documenso" | "icp_brasil";

export const SIGNING_TYPES: {
  value: SigningType;
  label: string;
  description: string;
  icon: string;
}[] = [
  {
    value: "documenso",
    label: "Assinatura Eletrônica",
    description: "Assinatura digital padrão via Documenso (email + link)",
    icon: "create-outline",
  },
  {
    value: "icp_brasil",
    label: "Certificado ICP-Brasil",
    description: "Assinatura com certificado digital A1/A3 (.p12)",
    icon: "shield-checkmark-outline",
  },
];

export interface ICPBrasilCertInfo {
  issuer?: string;
  subject?: string;
  serial?: string;
  validFrom?: string;
  validTo?: string;
  cpf?: string;
  cnpj?: string;
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface DocumensoDocument {
  id: number;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  documentDataId?: string;
}

export interface DocumensoRecipient {
  id: number;
  documentId: number;
  email: string;
  name: string;
  role: "SIGNER" | "VIEWER" | "APPROVER" | "CC";
  signingUrl?: string;
  signedAt?: string | null;
}

export interface CreateDocumentPayload {
  title: string;
  /** Base-64 encoded PDF content (not used by v1 — use createDocumentWithPdf) */
  documentBase64?: string;
  /** External reference ID */
  externalId?: string;
  /** Recipients to add at creation time (v1 supports this) */
  recipients?: AddRecipientPayload[];
  /** Metadata (language, subject, message, etc.) */
  meta?: Record<string, unknown>;
}

/**
 * Response from POST /api/v1/documents.
 * The v1 API returns a presigned uploadUrl where the PDF must be PUT.
 */
export interface CreateDocumentV1Recipient {
  recipientId: number;
  name: string;
  email: string;
  token: string;
  role: string;
  signingOrder?: number | null;
  signingUrl: string;
}

export interface CreateDocumentV1Response {
  uploadUrl: string;
  documentId: number;
  externalId?: string | null;
  recipients: CreateDocumentV1Recipient[];
}

export interface AddRecipientPayload {
  email: string;
  name: string;
  role?: "SIGNER" | "VIEWER" | "APPROVER" | "CC";
}

export interface AddFieldPayload {
  recipientId: number;
  type: "SIGNATURE" | "DATE" | "TEXT" | "EMAIL" | "NAME";
  page: number;
  positionX: number;
  positionY: number;
  width?: number;
  height?: number;
}

/* ------------------------------------------------------------------ */
/*  API helpers (v1 — used by most self-hosted instances)              */
/* ------------------------------------------------------------------ */

/**
 * List all documents for the authenticated API key.
 */
export async function listDocuments(): Promise<DocumensoDocument[]> {
  const { data } = await documensoV1.get("/documents");
  return Array.isArray(data) ? data : (data?.documents ?? []);
}

/**
 * Get a single document by ID.
 */
export async function getDocument(
  documentId: number,
): Promise<DocumensoDocument> {
  const { data } = await documensoV1.get(`/documents/${documentId}`);
  return data;
}

/**
 * Create a new document (upload PDF or empty envelope).
 */
export async function createDocument(
  payload: CreateDocumentPayload,
): Promise<DocumensoDocument> {
  try {
    // Try v1 first (most self-hosted)
    const { data } = await documensoV1.post("/documents", payload);
    return data;
  } catch {
    // Fallback: try v2 envelope create
    const form = new FormData();
    form.append(
      "payload",
      JSON.stringify({ type: "DOCUMENT", title: payload.title }),
    );
    const { data } = await documensoV2.post("/envelope/create", form, {
      headers: {
        Authorization: DOCUMENSO_API_KEY,
        "Content-Type": "multipart/form-data",
      },
    });
    // Normalize v2 response → v1 shape
    return {
      id: data.id ?? data.documentId ?? 0,
      title: payload.title,
      status: "DRAFT",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}

/**
 * Delete a document by ID.
 */
export async function deleteDocument(documentId: number): Promise<void> {
  await documensoV1.delete(`/documents/${documentId}`);
}

/**
 * Add a recipient (signer) to a document.
 */
export async function addRecipient(
  documentId: number,
  payload: AddRecipientPayload,
): Promise<DocumensoRecipient> {
  const { data } = await documensoV1.post(
    `/documents/${documentId}/recipients`,
    payload,
  );
  return data;
}

/**
 * List recipients of a document.
 */
export async function listRecipients(
  documentId: number,
): Promise<DocumensoRecipient[]> {
  const { data } = await documensoV1.get(`/documents/${documentId}/recipients`);
  return Array.isArray(data) ? data : (data?.recipients ?? []);
}

/**
 * Add a signing field to a document page for a recipient.
 */
export async function addField(
  documentId: number,
  payload: AddFieldPayload,
): Promise<unknown> {
  const { data } = await documensoV1.post(
    `/documents/${documentId}/fields`,
    payload,
  );
  return data;
}

/**
 * Send the document for signing (transitions to PENDING status).
 */
export async function sendDocument(documentId: number): Promise<unknown> {
  const { data } = await documensoV1.post(`/documents/${documentId}/send`);
  return data;
}

/**
 * Get the signing URL for a specific recipient.
 */
export async function getSigningUrl(
  documentId: number,
  recipientId: number,
): Promise<string> {
  const recipients = await listRecipients(documentId);
  const target = recipients.find((r) => r.id === recipientId);
  return target?.signingUrl ?? "";
}

/**
 * Convenience: create document → add signers → send in one call.
 */
export async function createAndSendDocument(
  title: string,
  documentBase64: string,
  signers: AddRecipientPayload[],
  fields?: Omit<AddFieldPayload, "recipientId">[],
): Promise<{
  document: DocumensoDocument;
  recipients: DocumensoRecipient[];
}> {
  const document = await createDocument({ title, documentBase64 });

  const recipients: DocumensoRecipient[] = [];
  for (const signer of signers) {
    const recipient = await addRecipient(document.id, signer);
    recipients.push(recipient);

    if (fields?.length) {
      for (const field of fields) {
        await addField(document.id, { ...field, recipientId: recipient.id });
      }
    }
  }

  await sendDocument(document.id);
  return { document, recipients };
}

/* ------------------------------------------------------------------ */
/*  Full document creation with PDF upload                             */
/* ------------------------------------------------------------------ */

/**
 * Build a FormData with the PDF file for multipart upload.
 * Handles platform differences (web uses Blob, native uses URI object).
 */
async function buildFileFormData(
  fileUri: string,
  fileName: string,
): Promise<FormData> {
  const formData = new FormData();

  if (Platform.OS === "web") {
    // Web: fetch blob from picker URI and append as File/Blob
    const resp = await fetch(fileUri);
    const blob = await resp.blob();
    formData.append("files", blob, fileName);
  } else {
    // Native (iOS/Android): use URI-based object pattern
    formData.append("files", {
      uri: fileUri,
      type: "application/pdf",
      name: fileName,
    } as unknown as Blob);
  }

  return formData;
}

/**
 * Upload a PDF file to a Documenso v1 presigned URL (S3 storage).
 * Only works when Documenso has S3 storage configured.
 */
async function uploadPdfToPresignedUrl(
  uploadUrl: string,
  fileUri: string,
): Promise<void> {
  let body: Blob;

  if (Platform.OS === "web") {
    const fileResp = await fetch(fileUri);
    body = await fileResp.blob();
  } else {
    // On native, use FormData-style fetch for binary upload
    const fileResp = await fetch(fileUri);
    body = await fileResp.blob();
  }

  const uploadResp = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body,
  });

  if (!uploadResp.ok) {
    const text = await uploadResp.text().catch(() => "");
    throw new Error(
      `Falha ao enviar PDF para Documenso (HTTP ${uploadResp.status}): ${text}`,
    );
  }
}

/**
 * Full flow: create document with PDF + recipients → send for signing.
 *
 * Strategy:
 * 1. Try v2 multipart API (sends file in one request — works without S3)
 * 2. Fallback to v1 presigned URL (requires S3 storage configured)
 *
 * @param title    - Document title
 * @param fileUri  - Local file URI of the PDF (from expo-document-picker)
 * @param signers  - Array of recipients to add
 * @param options  - Optional: language, whether to auto-send
 * @returns        - documentId, recipients (with recipientId + signingUrl)
 */
export async function createDocumentWithPdf(
  title: string,
  fileUri: string,
  signers: AddRecipientPayload[],
  options?: { language?: string; send?: boolean },
): Promise<CreateDocumentV1Response> {
  const safeName = title.replace(/[^a-zA-Z0-9áéíóúãõâêôçÁÉÍÓÚÃÕÂÊÔÇ _-]/g, "_");
  const fileName = `${safeName}.pdf`;

  // ── Attempt 1: v2 multipart (preferred — sends PDF in one request) ──
  try {
    const formData = await buildFileFormData(fileUri, fileName);

    const payload: Record<string, unknown> = {
      type: "DOCUMENT",
      title,
      recipients: signers.map((s) => ({
        email: s.email,
        name: s.name,
        role: s.role || "SIGNER",
        fields: [
          {
            identifier: 0,
            type: "SIGNATURE",
            page: 1,
            positionX: 25,
            positionY: 75,
            width: 50,
            height: 10,
          },
        ],
      })),
      meta: { language: options?.language ?? "pt-BR" },
    };

    if (options?.send !== false) {
      payload.distributeDocument = true;
    }

    formData.append("payload", JSON.stringify(payload));

    const { data } = await axios.post(
      `${DOCUMENSO_BASE_URL}/api/v2/envelope/create`,
      formData,
      {
        headers: {
          Authorization: DOCUMENSO_API_KEY,
          "Content-Type": "multipart/form-data",
        },
      },
    );

    // Normalize v2 response → our standard type
    const envelopeRecipients: CreateDocumentV1Recipient[] = (
      data.recipients ?? []
    ).map((r: Record<string, unknown>) => ({
      recipientId: r.id ?? 0,
      name: String(r.name ?? ""),
      email: String(r.email ?? ""),
      token: String(r.token ?? ""),
      role: String(r.role ?? "SIGNER"),
      signingUrl:
        String(r.signingUrl ?? "") ||
        (r.token ? `${DOCUMENSO_BASE_URL}/sign/${String(r.token)}` : ""),
    }));

    const docId =
      typeof data.documentId === "number"
        ? data.documentId
        : Number(data.documentId ?? data.id ?? 0);

    return {
      uploadUrl: "",
      documentId: docId,
      recipients: envelopeRecipients,
    };
  } catch (v2Error: unknown) {
    // v2 failed — extract detailed error for debugging
    let v2Msg = "Erro desconhecido";
    if (axios.isAxiosError(v2Error)) {
      const status = v2Error.response?.status ?? 0;
      const body = v2Error.response?.data;
      v2Msg = `HTTP ${status}: ${typeof body === "string" ? body.slice(0, 300) : JSON.stringify(body ?? v2Error.message).slice(0, 300)}`;
    } else if (v2Error instanceof Error) {
      v2Msg = v2Error.message;
    }
    console.warn("[Documenso] v2 envelope/create falhou:", v2Msg);
    // Store for combined error if v1 also fails
    var _v2ErrorMsg = v2Msg; // eslint-disable-line no-var
  }

  // ── Attempt 2: v1 presigned URL (requires S3 on Documenso server) ──
  try {
    const { data } = await documensoV1.post("/documents", {
      title,
      recipients: signers.map((s) => ({
        name: s.name,
        email: s.email,
        role: s.role || "SIGNER",
      })),
      meta: {
        language: options?.language ?? "pt-BR",
      },
    });

    const result = data as CreateDocumentV1Response;

    if (!result.uploadUrl) {
      throw new Error(
        "Documenso não retornou URL de upload. Verifique se o Documenso tem storage (S3) configurado.",
      );
    }

    // Upload the PDF file to the presigned URL
    await uploadPdfToPresignedUrl(result.uploadUrl, fileUri);

    // Send document for signing (default: true)
    if (options?.send !== false) {
      await sendDocument(result.documentId);
    }

    return result;
  } catch (v1Error: unknown) {
    let v1Msg = "Erro desconhecido";
    if (axios.isAxiosError(v1Error)) {
      const status = v1Error.response?.status ?? 0;
      const body = v1Error.response?.data;
      v1Msg = `HTTP ${status}: ${typeof body === "string" ? body.slice(0, 300) : JSON.stringify(body ?? v1Error.message).slice(0, 300)}`;
    } else if (v1Error instanceof Error) {
      v1Msg = v1Error.message;
    }
    console.error("[Documenso] v1 também falhou:", v1Msg);

    // Both v1 and v2 failed — throw combined error
    const combined = [
      "Falha ao enviar PDF para Documenso.",
      `Tentativa v2: ${typeof _v2ErrorMsg === "string" ? _v2ErrorMsg : "não tentou"}`,
      `Tentativa v1: ${v1Msg}`,
      "",
      "Verifique se o Documenso está acessível e a API key é válida.",
    ].join("\n");
    throw new Error(combined);
  }
}

/* ------------------------------------------------------------------ */
/*  Batch sync — updates statuses from Documenso for multiple rows     */
/* ------------------------------------------------------------------ */

export interface SyncResult {
  id: string;
  updated: boolean;
  status?: string;
  signed_at?: string;
  signing_url?: string;
  error?: string;
}

/**
 * Sync statuses for all documents that have a documenso_document_id
 * and are not yet signed.
 *
 * @para - Document signature o[]ws from the database
 * @param onUpdate - Callback to persist status updates
 * @returns Array of sync results
 */
export async function batchSyncStatuses(
  rows: Record<string, unknown>[],
  onUpdate: (payload: Record<string, unknown>) => Promise<unknown>,
): Promise<SyncResult[]> {
  const pending = rows.filter(
    (r) =>
      r.documenso_document_id &&
      r.signing_type !== "icp_brasil" &&
      r.status !== "signed" &&
      r.status !== "rejected" &&
      r.status !== "expired",
  );

  const results: SyncResult[] = [];

  for (const row of pending) {
    const id = String(row.id);
    try {
      const docId = Number(row.documenso_document_id);
      const recipientId = Number(row.documenso_recipient_id);

      const recipients = await listRecipients(docId);
      const target = recipients.find((r) => r.id === recipientId);

      if (!target) {
        results.push({ id, updated: false });
        continue;
      }

      const updates: Record<string, unknown> = { id };
      let changed = false;

      if (target.signedAt && row.status !== "signed") {
        updates.status = "signed";
        updates.signed_at = target.signedAt;
        changed = true;
      }

      if (target.signingUrl && target.signingUrl !== row.signing_url) {
        updates.signing_url = target.signingUrl;
        changed = true;
      }

      if (changed) {
        await onUpdate(updates);
        results.push({
          id,
          updated: true,
          status: updates.status as string | undefined,
          signed_at: updates.signed_at as string | undefined,
          signing_url: updates.signing_url as string | undefined,
        });
      } else {
        results.push({ id, updated: false });
      }
    } catch (err) {
      results.push({
        id,
        updated: false,
        error: getApiErrorMessage(err, "Erro desconhecido"),
      });
    }
  }

  return results;
}

/* ------------------------------------------------------------------ */
/*  PDF download from Documenso                                        */
/* ------------------------------------------------------------------ */

/**
 * Download the PDF of a document from Documenso as base64.
 * Used by ICP-Brasil signing flow to get the PDF for external signing.
 */
export async function downloadDocumentPdf(documentId: number): Promise<string> {
  try {
    // v1 endpoint to download PDF
    const { data } = await documensoV1.get(
      `/documents/${documentId}/download`,
      { responseType: "arraybuffer" },
    );
    // Convert to base64
    const bytes = new Uint8Array(data);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch {
    throw new Error(
      "Não foi possível baixar o PDF do Documenso. Verifique se o documento existe.",
    );
  }
}

/* ------------------------------------------------------------------ */
/*  ICP-Brasil — signing with signer's own certificate                 */
/* ------------------------------------------------------------------ */

/**
 * Creates a document in Documenso for ICP-Brasil signing flow.
 *
 * The document is created and sent via Documenso normally (for
 * workflow/notification). The actual ICP-Brasil signing is done
 * separately via the icp-brasil service using the signer's own
 * .p12 certificate — this gives assinatura qualificada
 * (Lei 14.063/2020, Art. 4º, III).
 */
export async function createDocumentForICPBrasil(
  title: string,
  signerName: string,
  signerEmail: string,
): Promise<{
  document: DocumensoDocument;
  recipient: DocumensoRecipient;
  signingUrl: string;
}> {
  // Step 1: Create document
  const document = await createDocument({ title });

  // Step 2: Add signer
  const recipient = await addRecipient(document.id, {
    name: signerName,
    email: signerEmail,
    role: "SIGNER",
  });

  // Step 3: Send for signing (signer can view document)
  await sendDocument(document.id);

  // Step 4: Get signing URL
  const signingUrl = await getSigningUrl(document.id, recipient.id);

  return { document, recipient, signingUrl };
}
