/**
 * ICP-Brasil Digital Signing Service
 *
 * Handles:
 * - Certificate file (.p12 / .pfx) picking from device
 * - Certificate info extraction (subject, CPF/CNPJ, validity)
 * - PDF digital signing via backend (N8N) using signer's own certificate
 * - Signed PDF download
 *
 * Legal basis: Lei 14.063/2020 — Assinatura Qualificada (Art. 4º, III)
 * Uses the signer's own ICP-Brasil certificate for maximum legal validity.
 */

import { api, getApiErrorMessage } from "@/services/api";
import * as DocumentPicker from "expo-document-picker";
import { Alert, Platform } from "react-native";

// Lazy-loaded: expo-file-system File/Paths don't work on web
const getFileSystem = async () =>
  Platform.OS !== "web" ? await import("expo-file-system") : null;

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

const N8N_BASE = "https://n8n.sosescritura.com.br/webhook";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CertificateInfo {
  subject: string;
  issuer: string;
  serial: string;
  validFrom: string;
  validTo: string;
  cpf?: string;
  cnpj?: string;
  name: string;
  isValid: boolean;
  daysUntilExpiry: number;
}

export interface SigningResult {
  success: boolean;
  signedPdfUrl?: string;
  signedPdfBase64?: string;
  certificateInfo: CertificateInfo;
  signedAt: string;
  error?: string;
}

export interface PickedCertificate {
  uri: string;
  name: string;
  base64: string;
  size: number;
}

/* ------------------------------------------------------------------ */
/*  1. Picking a .p12 / .pfx certificate from device                   */
/* ------------------------------------------------------------------ */

/**
 * Opens the device file picker filtered for .p12 / .pfx certificate files.
 * Returns the certificate as base64 along with metadata.
 */
export async function pickCertificateFile(): Promise<PickedCertificate | null> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: Platform.select({
        // MIME types for PKCS#12 certificates
        ios: "application/x-pkcs12",
        android: "*/*", // Android doesn't reliably filter by MIME for .p12
        default: "application/x-pkcs12",
      }),
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets?.length) {
      return null;
    }

    const asset = result.assets[0];
    const fileName = asset.name ?? "certificate.p12";

    // Validate extension
    const ext = fileName.toLowerCase().split(".").pop();
    if (ext !== "p12" && ext !== "pfx") {
      Alert.alert(
        "Arquivo inválido",
        "Selecione um certificado digital no formato .p12 ou .pfx",
      );
      return null;
    }

    // Read as base64
    let base64: string;
    const fs = await getFileSystem();
    if (fs && Platform.OS !== "web") {
      const file = new fs.File(asset.uri);
      base64 = await file
        .text()
        .then((text: string) => btoa(text))
        .catch(async () => {
          const bytes = await file.bytes();
          let binary = "";
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          return btoa(binary);
        });
    } else {
      // Web fallback: fetch the blob and convert via FileReader
      const resp = await fetch(asset.uri);
      const blob = await resp.blob();
      base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          resolve(dataUrl.split(",")[1] ?? "");
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }

    return {
      uri: asset.uri,
      name: fileName,
      base64,
      size: asset.size ?? base64.length,
    };
  } catch (err) {
    const msg = getApiErrorMessage(err, "Erro ao selecionar arquivo");
    Alert.alert("Erro", msg);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  2. Extract certificate info (validate before signing)              */
/* ------------------------------------------------------------------ */

/**
 * Sends the certificate to the backend to extract info and validate.
 * Does NOT sign anything — just reads cert metadata.
 */
export async function extractCertificateInfo(
  certBase64: string,
  password: string,
): Promise<CertificateInfo> {
  const response = await api.post(`${N8N_BASE}/api_icp_sign`, {
    action: "validate",
    certificate: certBase64,
    password,
  });

  const data = response.data;

  if (!data?.success) {
    throw new Error(
      data?.error ?? "Não foi possível ler o certificado. Verifique a senha.",
    );
  }

  return data.certificateInfo as CertificateInfo;
}

/* ------------------------------------------------------------------ */
/*  3. Sign PDF with signer's ICP-Brasil certificate                   */
/* ------------------------------------------------------------------ */

/**
 * Sends the signer's .p12 certificate + password to the backend,
 * which downloads the PDF from Documenso, signs it with the
 * certificate, and stores the result.
 *
 * @param signatureId  - ID of the document_signatures row
 * @param documensoDocId - Documenso document ID (to download the PDF)
 * @param certBase64   - The .p12 certificate file content as base64
 * @param password     - The certificate password
 * @returns Signing result with cert info and signed PDF URL
 */
export async function signPdfWithCertificate(
  signatureId: string,
  documensoDocId: number,
  certBase64: string,
  password: string,
): Promise<SigningResult> {
  const response = await api.post(`${N8N_BASE}/api_icp_sign`, {
    action: "sign",
    signatureId,
    documensoDocumentId: documensoDocId,
    certificate: certBase64,
    password,
  });

  const data = response.data;

  if (!data?.success) {
    throw new Error(
      data?.error ?? "Erro ao assinar o documento com o certificado.",
    );
  }

  return {
    success: true,
    signedPdfUrl: data.signedPdfUrl,
    signedPdfBase64: data.signedPdfBase64,
    certificateInfo: data.certificateInfo,
    signedAt: data.signedAt ?? new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/*  4. Download signed PDF                                             */
/* ------------------------------------------------------------------ */

/**
 * Downloads the signed PDF for a given signature record.
 */
export async function downloadSignedPdf(
  signatureId: string,
): Promise<string | null> {
  try {
    const response = await api.post(`${N8N_BASE}/api_icp_sign`, {
      action: "download",
      signatureId,
    });

    if (response.data?.signedPdfBase64) {
      const fs = await getFileSystem();
      if (fs && Platform.OS !== "web") {
        // Native: save to device documents directory
        const fName = `documento_assinado_${signatureId}.pdf`;
        const filePath = fs.Paths.join(fs.Paths.document, fName);
        const file = new fs.File(filePath);
        const binary = atob(response.data.signedPdfBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        await file.write(bytes);
        return filePath;
      } else {
        // Web: trigger download via blob
        const binary = atob(response.data.signedPdfBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `documento_assinado_${signatureId}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        return `documento_assinado_${signatureId}.pdf`;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  5. Password prompt helper                                          */
/* ------------------------------------------------------------------ */

/**
 * Shows an alert prompt asking for the certificate password.
 * Returns a Promise that resolves with the password or null if cancelled.
 */
export function promptCertificatePassword(): Promise<string | null> {
  return new Promise((resolve) => {
    if (Platform.OS === "web") {
      const pwd = window.prompt("Digite a senha do certificado:");
      resolve(pwd ?? null);
      return;
    }

    Alert.prompt(
      "Senha do Certificado",
      "Digite a senha do seu certificado digital (.p12):",
      [
        { text: "Cancelar", style: "cancel", onPress: () => resolve(null) },
        { text: "Confirmar", onPress: (pwd) => resolve(pwd ?? null) },
      ],
      "secure-text",
      "",
      "default",
    );
  });
}

/**
 * Cross-platform password prompt (Android doesn't have Alert.prompt).
 * Falls back to a simple Alert with text input workaround.
 */
export function promptPasswordCrossPlatform(
  onConfirm: (password: string) => void,
  onCancel?: () => void,
): void {
  if (Platform.OS === "ios") {
    Alert.prompt(
      "Senha do Certificado",
      "Digite a senha do seu certificado digital (.p12):",
      [
        {
          text: "Cancelar",
          style: "cancel",
          onPress: () => onCancel?.(),
        },
        {
          text: "Confirmar",
          onPress: (pwd) => {
            if (pwd) onConfirm(pwd);
            else onCancel?.();
          },
        },
      ],
      "secure-text",
    );
  } else {
    // For Android/Web, we'll use a modal approach in the component
    // This fires the callback which should show a modal with TextInput
    onConfirm("__SHOW_MODAL__");
  }
}

/* ------------------------------------------------------------------ */
/*  6. Full signing flow (convenience)                                 */
/* ------------------------------------------------------------------ */

/**
 * Complete ICP-Brasil signing flow:
 * 1. Pick .p12 file
 * 2. Extract & validate certificate
 * 3. Show cert info for confirmation
 * 4. Sign the PDF
 *
 * @returns SigningResult or null if cancelled/failed
 */
export async function fullSigningFlow(
  signatureId: string,
  documensoDocId: number,
  password: string,
): Promise<{ cert: PickedCertificate; info: CertificateInfo } | null> {
  // Step 1: Pick certificate
  const cert = await pickCertificateFile();
  if (!cert) return null;

  // Step 2: Validate certificate
  const info = await extractCertificateInfo(cert.base64, password);

  if (!info.isValid) {
    Alert.alert(
      "Certificado Inválido",
      `O certificado "${info.name}" está expirado ou inválido.\nValidade: ${info.validFrom} até ${info.validTo}`,
    );
    return null;
  }

  return { cert, info };
}
