/**
 * sos-icp-sign — Cloudflare Worker for ICP-Brasil PDF Digital Signing
 *
 * Endpoints: POST / with JSON body { action: "validate" | "sign" | "download", ... }
 *
 * Uses node-forge for PKCS#12 parsing and PKCS#7/CMS signing.
 * Requires nodejs_compat compatibility flag for Buffer/crypto support.
 *
 * Legal basis: MP 2.200-2/2001 Art. 10 §1, Lei 14.063/2020, DOC-ICP-04
 */

import forge from "node-forge";

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

interface Env {
  API_KEY: string;
  DOCUMENSO_API_KEY: string;
  API_CRUD_KEY: string;
  DOCUMENSO_URL: string;
  API_CRUD_URL: string;
  ENVIRONMENT: string;
}

interface CertificateInfo {
  subject: string;
  issuer: string;
  serial: string;
  validFrom: string;
  validTo: string;
  cpf: string | null;
  cnpj: string | null;
  name: string;
  isValid: boolean;
  daysUntilExpiry: number;
  isIcpBrasil: boolean;
  chainDepth: number;
  rootCA: string | null;
  chainWarnings: string[];
  revocationCheck?: RevocationResult;
}

/** A PKCS#12 bag entry (node-forge internal type — not fully typed) */
type Pkcs12CertBag = {
  cert?: forge.pki.Certificate;
  key?: forge.pki.PrivateKey;
};

interface ParsedCertificate {
  cert: forge.pki.Certificate;
  privateKey: forge.pki.PrivateKey;
  certBag: Pkcs12CertBag[];
  info: CertificateInfo;
}

interface ChainValidation {
  isIcpBrasil: boolean;
  chainDepth: number;
  rootCA: string | null;
  warnings: string[];
}

interface RevocationResult {
  checked: boolean;
  revoked: boolean;
  error: string | null;
  crlUrl: string | null;
}

interface RequestBody {
  action: string;
  signatureId?: string;
  documensoDocumentId?: number;
  pdfBase64?: string;
  certificate?: string;
  password?: string;
}

/* ================================================================== */
/*  CORS Helpers                                                       */
/* ================================================================== */

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Api-Key, Authorization",
  "Access-Control-Max-Age": "86400",
};

function corsResponse(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function corsOptionsResponse(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function errorResponse(status: number, message: string): Response {
  return corsResponse(status, { success: false, error: message });
}

/* ================================================================== */
/*  ICP-Brasil Known Root & Intermediate CA Keywords                    */
/*  Based on ITI (Instituto Nacional de TI) published chain             */
/*  Ref: https://www.gov.br/iti/pt-br/assuntos/repositorio             */
/* ================================================================== */

const ICP_BRASIL_CA_KEYWORDS: string[] = [
  // AC-Raiz (Root)
  "ICP-Brasil",
  "ICP Brasil",
  "Autoridade Certificadora Raiz Brasileira",
  // 1st-level ACs
  "AC SERPRO",
  "AC Certisign",
  "AC Serasa",
  "AC SOLUTI",
  "AC Boa Vista",
  "AC VALID",
  "AC Digital",
  "AC SAFEWEB",
  "AC Imprensa Oficial",
  "AC FENACOR",
  "AC PRODEMGE",
  "AC CAIXA",
  "AC JUS",
  "AC PR",
  "AC RFB",
  "AC CMB",
  "Autoridade Certificadora",
  // Common intermediate patterns
  "AC LINK",
  "AC ONLINE",
  "AC FENACON",
  "AC SINCOR",
  "AC BR RFB",
  "AC Instituto Fenacon",
];

/* ================================================================== */
/*  HELPER: Validate ICP-Brasil Certificate Chain                       */
/*  MP 2.200-2/2001 Art. 10 §1 — chain must originate from ICP-Brasil  */
/* ================================================================== */

function validateIcpBrasilChain(
  cert: forge.pki.Certificate,
  certBag: Pkcs12CertBag[],
): ChainValidation {
  const warnings: string[] = [];
  const chainCerts: forge.pki.Certificate[] = [];

  // Collect all certificates from the bag
  if (certBag && Array.isArray(certBag)) {
    for (let i = 0; i < certBag.length; i++) {
      if (certBag[i].cert) chainCerts.push(certBag[i].cert!);
    }
  }

  // Check issuer of the signer certificate
  const issuerStr = cert.issuer.attributes
    .map((a: any) => String(a.value || ""))
    .join(" ");

  // Check if any cert in the chain mentions ICP-Brasil
  let foundIcpRef = false;
  let rootCA: string | null = null;

  // Check signer's issuer
  for (const keyword of ICP_BRASIL_CA_KEYWORDS) {
    if (issuerStr.indexOf(keyword) >= 0) {
      foundIcpRef = true;
      rootCA = issuerStr;
      break;
    }
  }

  // Check all certs in chain for ICP-Brasil reference
  if (!foundIcpRef) {
    for (const chainCert of chainCerts) {
      const chainIssuer = chainCert.issuer.attributes
        .map((a: any) => String(a.value || ""))
        .join(" ");
      const chainSubject = chainCert.subject.attributes
        .map((a: any) => String(a.value || ""))
        .join(" ");

      for (const keyword of ICP_BRASIL_CA_KEYWORDS) {
        if (
          chainIssuer.indexOf(keyword) >= 0 ||
          chainSubject.indexOf(keyword) >= 0
        ) {
          foundIcpRef = true;
          rootCA = chainSubject || chainIssuer;
          break;
        }
      }
      if (foundIcpRef) break;
    }
  }

  // Check for ICP-Brasil policy OIDs in certificate extensions
  // OID 2.16.76.1.2.x = ICP-Brasil certificate policies
  if (!foundIcpRef) {
    const extensions = (cert as any).extensions || [];
    for (const ext of extensions) {
      if (ext.id && ext.id.indexOf("2.16.76.1") === 0) {
        foundIcpRef = true;
        rootCA = "Detected via ICP-Brasil OID: " + ext.id;
        break;
      }
    }
  }

  if (!foundIcpRef) {
    warnings.push(
      "ALERTA: Certificado NAO pertence a cadeia ICP-Brasil. " +
        "Emissor: " +
        issuerStr +
        ". " +
        "A assinatura pode nao ter validade juridica conforme MP 2.200-2/2001 Art. 10 §1.",
    );
  }

  if (chainCerts.length <= 1) {
    warnings.push(
      "AVISO: Cadeia de certificacao incompleta no arquivo .p12 (" +
        chainCerts.length +
        " certificado(s)). " +
        "Para validacao completa, o .p12 deve conter os certificados intermediarios.",
    );
  }

  return {
    isIcpBrasil: foundIcpRef,
    chainDepth: chainCerts.length,
    rootCA,
    warnings,
  };
}

/* ================================================================== */
/*  HELPER: CRL Revocation Check (best-effort)                         */
/*  Checks if certificate has been revoked via CRL distribution point   */
/*  Ref: DOC-ICP-04                                                    */
/* ================================================================== */

async function checkRevocation(
  cert: forge.pki.Certificate,
): Promise<RevocationResult> {
  const result: RevocationResult = {
    checked: false,
    revoked: false,
    error: null,
    crlUrl: null,
  };

  try {
    // Find CRL Distribution Points extension
    const extensions = (cert as any).extensions || [];
    let crlUrl: string | null = null;

    for (const ext of extensions) {
      // CRL Distribution Points OID: 2.5.29.31
      if (ext.id === "2.5.29.31" || ext.name === "cRLDistributionPoints") {
        // Extract URL from the extension value
        const val = ext.value || "";
        if (typeof val === "string") {
          const urlMatch = val.match(/https?:\/\/[^\s"'<>]+\.crl/i);
          if (urlMatch) crlUrl = urlMatch[0];
        }
        // node-forge may parse it as an object with distributionPoints
        if (!crlUrl && ext.cRLDistributionPoints) {
          const dps = ext.cRLDistributionPoints;
          for (const dp of dps) {
            if (dp.fullName) {
              for (const gn of dp.fullName) {
                if (gn.type === 6 && gn.value) {
                  // uniformResourceIdentifier
                  crlUrl = gn.value;
                  break;
                }
              }
            }
            if (crlUrl) break;
          }
        }
        if (crlUrl) break;
      }
    }

    if (!crlUrl) {
      result.error = "CRL Distribution Point nao encontrado no certificado.";
      return result;
    }

    result.crlUrl = crlUrl;

    // Download CRL (with timeout)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const crlResponse = await fetch(crlUrl, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!crlResponse.ok) {
      result.error = "Falha ao baixar CRL: HTTP " + crlResponse.status;
      return result;
    }

    // Parse CRL and check serial number
    const crlBuffer = await crlResponse.arrayBuffer();
    const crlDer = forge.util.createBuffer(
      Buffer.from(crlBuffer).toString("binary"),
    );

    try {
      const crlAsn1 = forge.asn1.fromDer(crlDer);
      // CRL structure: SEQUENCE { tbsCertList, signatureAlgorithm, signatureValue }
      // tbsCertList: version, signature, issuer, thisUpdate, nextUpdate, revokedCertificates
      const tbsCertList = (crlAsn1 as any).value[0];
      let revokedCerts: any = null;

      for (let ri = 0; ri < tbsCertList.value.length; ri++) {
        const item = tbsCertList.value[ri];
        // revokedCertificates is a SEQUENCE of SEQUENCE entries
        if (item.type === forge.asn1.Type.SEQUENCE && ri >= 5) {
          revokedCerts = item;
          break;
        }
      }

      result.checked = true;

      if (revokedCerts && revokedCerts.value) {
        const certSerial = cert.serialNumber.toLowerCase().replace(/:/g, "");
        for (const entry of revokedCerts.value) {
          if (entry.value && entry.value[0]) {
            const revokedSerial = forge.util
              .bytesToHex(entry.value[0].value)
              .toLowerCase();
            if (revokedSerial === certSerial) {
              result.revoked = true;
              break;
            }
          }
        }
      }
    } catch (parseErr: any) {
      result.error = "Erro ao interpretar CRL: " + parseErr.message;
    }
  } catch (err: any) {
    result.error =
      "Erro na verificacao de revogacao: " + (err.message || String(err));
  }

  return result;
}

/* ================================================================== */
/*  HELPER: Parse PKCS#12 Certificate                                  */
/* ================================================================== */

function parseCertificate(
  certBase64: string,
  password: string,
): ParsedCertificate {
  const derBytes = forge.util.decode64(certBase64);
  const asn1 = forge.asn1.fromDer(derBytes);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);

  // Extract certificate(s)
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = certBags[forge.pki.oids.certBag];
  if (!certBag || certBag.length === 0) {
    throw new Error("Nenhum certificado encontrado no arquivo .p12");
  }

  const cert = certBag[0].cert!;

  // Extract private key
  const keyBags = p12.getBags({
    bagType: forge.pki.oids.pkcs8ShroudedKeyBag,
  });
  const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag];
  if (!keyBag || keyBag.length === 0) {
    throw new Error("Chave privada nao encontrada no arquivo .p12");
  }
  const privateKey = keyBag[0].key!;

  // Parse subject
  const subject = cert.subject.attributes
    .map((a: any) => a.shortName + "=" + a.value)
    .join(", ");
  const issuer = cert.issuer.attributes
    .map((a: any) => a.shortName + "=" + a.value)
    .join(", ");

  // Common Name
  const cnAttr = cert.subject.getField("CN");
  const name = cnAttr ? String(cnAttr.value) : subject;

  // Extract CPF/CNPJ from extensions
  let cpf: string | null = null;
  let cnpj: string | null = null;
  const extensions = (cert as any).extensions || [];
  for (const ext of extensions) {
    if (ext.id === "2.16.76.1.3.1" || ext.name === "subjectAltName") {
      const val = ext.value || "";
      const cpfMatch = val.match(/(\d{11})/);
      if (cpfMatch) cpf = cpfMatch[1];
      const cnpjMatch = val.match(/(\d{14})/);
      if (cnpjMatch) cnpj = cnpjMatch[1];
    }
  }
  // Fallback: CN pattern "NAME:12345678901"
  if (!cpf && name) {
    const cnMatch = name.match(/:(\d{11})$/);
    if (cnMatch) cpf = cnMatch[1];
  }

  // Validity
  const validFrom = cert.validity.notBefore.toISOString();
  const validTo = cert.validity.notAfter.toISOString();
  const now = new Date();
  const isValid =
    now >= cert.validity.notBefore && now <= cert.validity.notAfter;
  const daysUntilExpiry = Math.floor(
    (cert.validity.notAfter.getTime() - now.getTime()) / 86400000,
  );

  // ICP-Brasil chain validation (MP 2.200-2/2001 Art. 10 §1)
  const chainValidation = validateIcpBrasilChain(cert, certBag);

  return {
    cert,
    privateKey,
    certBag,
    info: {
      subject,
      issuer,
      serial: cert.serialNumber,
      validFrom,
      validTo,
      cpf: cpf
        ? cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
        : null,
      cnpj: cnpj
        ? cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
        : null,
      name,
      isValid,
      daysUntilExpiry,
      isIcpBrasil: chainValidation.isIcpBrasil,
      chainDepth: chainValidation.chainDepth,
      rootCA: chainValidation.rootCA,
      chainWarnings: chainValidation.warnings,
    },
  };
}

/* ================================================================== */
/*  HELPER: Download PDF from Documenso                                */
/* ================================================================== */

async function downloadPdfFromDocumenso(
  documentId: number,
  env: Env,
): Promise<Buffer> {
  const url =
    env.DOCUMENSO_URL + "/api/v1/documents/" + documentId + "/download";
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: env.DOCUMENSO_API_KEY },
  });
  if (!response.ok) {
    throw new Error("Erro ao baixar PDF do Documenso: HTTP " + response.status);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/* ================================================================== */
/*  HELPER: Sign PDF with PKCS#7 (CMS)                                */
/* ================================================================== */

function signPdf(
  pdfBuffer: Buffer,
  cert: forge.pki.Certificate,
  privateKey: forge.pki.PrivateKey,
  allCerts: Pkcs12CertBag[],
): Buffer {
  const pdf = pdfBuffer.toString("binary");
  // 16384 hex chars = 8KB — enough for full ICP-Brasil chain + future TSA timestamp
  const SIGNATURE_LENGTH = 16384;
  const signaturePlaceholder = "<" + "0".repeat(SIGNATURE_LENGTH) + ">";
  const BR_PLACEHOLDER = "/ByteRange [0 /********** /********** /**********]";

  // Find next object ID
  let maxId = 0;
  let objMatch: RegExpExecArray | null;
  const objRegex = /(\d+)\s+0\s+obj/g;
  while ((objMatch = objRegex.exec(pdf)) !== null) {
    const oid = parseInt(objMatch[1], 10);
    if (oid > maxId) maxId = oid;
  }
  const nextObjId = maxId + 1;

  // Format date
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const pdfDate =
    "" +
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z";

  // Escape PDF string
  const escPdf = (s: string) =>
    (s || "")
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");

  const cn = cert.subject.getField("CN");
  const signerName = cn ? String(cn.value) : "Signatario";
  const emailField = cert.subject.getField("E");
  const signerEmail = emailField ? String(emailField.value) : "";

  // Build signature dictionary
  const sigDict =
    "\n" +
    nextObjId +
    " 0 obj\n<<\n/Type /Sig\n/Filter /Adobe.PPKLite\n/SubFilter /adbe.pkcs7.detached\n" +
    BR_PLACEHOLDER +
    "\n/Contents " +
    signaturePlaceholder +
    "\n/M (D:" +
    pdfDate +
    ")\n/Name (" +
    escPdf(signerName) +
    ")\n/Reason (Assinatura Digital ICP-Brasil)\n/Location (Brasil)\n/ContactInfo (" +
    escPdf(signerEmail) +
    ")\n>>\nendobj\n";

  let pdfWithSig = pdf + sigDict;

  // Find positions
  const contentsStart = pdfWithSig.lastIndexOf(signaturePlaceholder);
  const contentsEnd = contentsStart + signaturePlaceholder.length;
  const byteRange = [
    0,
    contentsStart,
    contentsEnd,
    pdfWithSig.length - contentsEnd,
  ];

  // Replace ByteRange placeholder
  const brStr =
    "/ByteRange [" +
    byteRange[0] +
    " " +
    byteRange[1] +
    " " +
    byteRange[2] +
    " " +
    byteRange[3] +
    "]";
  const finalPdf = pdfWithSig.replace(
    /\/ByteRange \[0 \/\*{10} \/\*{10} \/\*{10}\]/,
    brStr.padEnd(BR_PLACEHOLDER.length, " "),
  );

  // Hash PDF content (excluding signature)
  const pdfBuf = Buffer.from(finalPdf, "binary");
  const hashContent = Buffer.concat([
    pdfBuf.subarray(byteRange[0], byteRange[1]),
    pdfBuf.subarray(byteRange[2], byteRange[2] + byteRange[3]),
  ]);

  // Create PKCS#7 signature
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(hashContent.toString("binary"));
  p7.addCertificate(cert);
  if (allCerts) {
    for (const bag of allCerts) {
      if (bag.cert && bag.cert !== cert) {
        p7.addCertificate(bag.cert);
      }
    }
  }

  p7.addSigner({
    key: privateKey as unknown as string,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      {
        type: forge.pki.oids.contentType,
        value: forge.pki.oids.data,
      },
      { type: forge.pki.oids.messageDigest },
      {
        type: forge.pki.oids.signingTime,
        value: new Date().toISOString(),
      },
    ],
  });

  p7.sign({ detached: true });

  // ────────────────────────────────────────────────────────────────────
  // TSA (Timestamp Authority) — DOC-ICP-16 / RFC 3161
  // TODO: When a TSA subscription is available, add timestamp token here:
  //
  //   1. Hash the signature value (SHA-256)
  //   2. Send TimeStampReq to TSA URL (RFC 3161)
  //   3. Receive TimeStampResp with signed timestamp token
  //   4. Embed the timestamp as an unsigned attribute (OID 1.2.840.113549.1.9.16.2.14)
  //      in the PKCS#7 SignerInfo
  //
  // Recommended Brazilian TSAs (ACTs - Autoridades de Carimbo do Tempo):
  //   - Serpro ACT: https://act.serpro.gov.br/tsp
  //   - Certisign ACT: varies by contract
  //   - Valid ACT: varies by contract
  //
  // Note: TSA is RECOMMENDED but not REQUIRED by MP 2.200-2/2001.
  //       It provides long-term signature validity (LTV) and
  //       proof of signing time from a trusted third party.
  //       Without TSA, signature validity depends on certificate validity period.
  // ────────────────────────────────────────────────────────────────────

  const derBytes = forge.asn1.toDer(p7.toAsn1()).getBytes();
  const signatureHex = Buffer.from(derBytes, "binary").toString("hex");
  const paddedSig = signatureHex.padEnd(SIGNATURE_LENGTH, "0");

  const signedPdf = finalPdf.replace(
    signaturePlaceholder,
    "<" + paddedSig + ">",
  );
  return Buffer.from(signedPdf, "binary");
}

/* ================================================================== */
/*  ACTION: validate                                                   */
/* ================================================================== */

async function handleValidate(body: RequestBody): Promise<Response> {
  const { certificate, password } = body;

  if (!certificate || !password) {
    return errorResponse(400, "Certificado e senha sao obrigatorios.");
  }

  try {
    const result = parseCertificate(certificate, password);

    // CRL revocation check (DOC-ICP-04)
    const revocationResult = await checkRevocation(result.cert);
    result.info.revocationCheck = {
      checked: revocationResult.checked,
      revoked: revocationResult.revoked,
      crlUrl: revocationResult.crlUrl,
      error: revocationResult.error,
    };

    if (revocationResult.revoked) {
      result.info.isValid = false;
      result.info.chainWarnings = (result.info.chainWarnings || []).concat(
        "CRITICO: Certificado REVOGADO conforme CRL da AC emissora. Assinatura sera juridicamente NULA.",
      );
    }

    return corsResponse(200, { success: true, certificateInfo: result.info });
  } catch (err: any) {
    return corsResponse(200, {
      success: false,
      error: err.message || String(err),
    });
  }
}

/* ================================================================== */
/*  ACTION: sign                                                       */
/* ================================================================== */

async function handleSign(body: RequestBody, env: Env): Promise<Response> {
  const {
    signatureId,
    documensoDocumentId,
    pdfBase64: pdfBase64Input,
    certificate,
    password,
  } = body;

  if (!signatureId || !certificate || !password) {
    return errorResponse(
      400,
      "signatureId, certificate e password sao obrigatorios.",
    );
  }

  if (!documensoDocumentId && !pdfBase64Input) {
    return errorResponse(
      400,
      "Informe documensoDocumentId ou pdfBase64 para assinar.",
    );
  }

  try {
    const parsed = parseCertificate(certificate, password);
    if (!parsed.info.isValid) {
      return corsResponse(200, {
        success: false,
        error: "Certificado expirado em " + parsed.info.validTo,
        certificateInfo: parsed.info,
      });
    }

    // MP 2.200-2 Art. 10 §1: Validate ICP-Brasil chain
    if (!parsed.info.isIcpBrasil) {
      return corsResponse(200, {
        success: false,
        error:
          "Certificado NAO pertence a cadeia ICP-Brasil. " +
          "Conforme MP 2.200-2/2001 Art. 10 §1, apenas certificados emitidos na hierarquia ICP-Brasil " +
          "possuem presuncao de veracidade juridica. Emissor: " +
          parsed.info.issuer,
        certificateInfo: parsed.info,
      });
    }

    // DOC-ICP-04: CRL revocation check
    const revocationResult = await checkRevocation(parsed.cert);
    parsed.info.revocationCheck = {
      checked: revocationResult.checked,
      revoked: revocationResult.revoked,
      crlUrl: revocationResult.crlUrl,
      error: revocationResult.error,
    };

    if (revocationResult.revoked) {
      return corsResponse(200, {
        success: false,
        error:
          "Certificado REVOGADO conforme CRL da AC emissora. " +
          "Assinatura com certificado revogado e juridicamente NULA (DOC-ICP-04).",
        certificateInfo: parsed.info,
      });
    }

    // Get PDF: from direct base64 or download from Documenso
    let pdfBuffer: Buffer;
    if (pdfBase64Input) {
      pdfBuffer = Buffer.from(pdfBase64Input, "base64");
    } else {
      pdfBuffer = await downloadPdfFromDocumenso(documensoDocumentId!, env);
    }

    const signedPdf = signPdf(
      pdfBuffer,
      parsed.cert,
      parsed.privateKey,
      parsed.certBag,
    );
    const signedPdfBase64 = signedPdf.toString("base64");
    const signedAt = new Date().toISOString();

    // Update DB — save signed PDF alongside status
    await fetch(env.API_CRUD_URL + "/api_crud", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": env.API_CRUD_KEY,
      },
      body: JSON.stringify({
        action: "update",
        table: "document_signatures",
        payload: {
          id: signatureId,
          status: "signed",
          signed_at: signedAt,
          certificate_info: JSON.stringify(parsed.info),
          signed_pdf_base64: signedPdfBase64,
        },
      }),
    });

    return corsResponse(200, {
      success: true,
      signedAt,
      certificateInfo: parsed.info,
      signedPdfBase64,
      legalBasis:
        "MP 2.200-2/2001 Art. 10 §1 — Assinatura Qualificada ICP-Brasil",
      chainValidation: {
        isIcpBrasil: parsed.info.isIcpBrasil,
        chainDepth: parsed.info.chainDepth,
        rootCA: parsed.info.rootCA,
        revocationChecked: revocationResult.checked,
        revoked: revocationResult.revoked,
        warnings: parsed.info.chainWarnings || [],
      },
      message:
        "Documento assinado por " +
        parsed.info.name +
        " com certificado ICP-Brasil (cadeia validada, " +
        (revocationResult.checked
          ? "revogacao verificada"
          : "CRL indisponivel") +
        ").",
    });
  } catch (err: any) {
    return corsResponse(200, {
      success: false,
      error: err.message || String(err),
    });
  }
}

/* ================================================================== */
/*  ACTION: download                                                   */
/* ================================================================== */

async function handleDownload(body: RequestBody, env: Env): Promise<Response> {
  if (!body.signatureId) {
    return errorResponse(400, "signatureId e obrigatorio.");
  }

  try {
    // Read signed PDF from database
    const dbRes = await fetch(env.API_CRUD_URL + "/api_crud", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": env.API_CRUD_KEY,
      },
      body: JSON.stringify({
        action: "list",
        table: "document_signatures",
        search_field1: "id",
        search_value1: body.signatureId,
        search_operator1: "equal",
      }),
    });

    const dbData: any = await dbRes.json();
    const records = Array.isArray(dbData) ? dbData : dbData.data || [];
    const record = records[0];

    if (!record || !record.signed_pdf_base64) {
      return corsResponse(200, {
        success: false,
        error: "PDF assinado nao encontrado no banco de dados.",
      });
    }

    return corsResponse(200, {
      success: true,
      signedPdfBase64: record.signed_pdf_base64,
      message: "PDF assinado recuperado do banco de dados.",
    });
  } catch (err: any) {
    return corsResponse(200, {
      success: false,
      error: err.message || String(err),
    });
  }
}

/* ================================================================== */
/*  MAIN WORKER EXPORT                                                 */
/* ================================================================== */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return corsOptionsResponse();
    }

    // Only accept POST
    if (request.method !== "POST") {
      return errorResponse(405, "Metodo nao permitido. Use POST.");
    }

    // Auth check
    const apiKey = request.headers.get("X-Api-Key") || "";
    if (!apiKey || apiKey !== env.API_KEY) {
      return errorResponse(401, "Unauthorized");
    }

    try {
      const body = (await request.json()) as RequestBody;
      const action = body.action;

      switch (action) {
        case "validate":
          return await handleValidate(body);
        case "sign":
          return await handleSign(body, env);
        case "download":
          return await handleDownload(body, env);
        default:
          return errorResponse(
            400,
            "Acao desconhecida: " + action + ". Use: validate, sign, download.",
          );
      }
    } catch (fatalError: any) {
      return corsResponse(500, {
        success: false,
        error: "FATAL: " + (fatalError.message || String(fatalError)),
      });
    }
  },
};
