/**
 * N8N Code Node — ICP-Brasil PDF Digital Signing
 *
 * Webhook: POST /api_icp_sign
 *
 * Uses node-forge for PKCS#12 parsing and PKCS#7 signing.
 * Requires env: NODE_FUNCTION_ALLOW_EXTERNAL=node-forge
 *
 * N8N WORKFLOW: Webhook → Code → Respond to Webhook
 */

// ══════════════════════════════════════════════════════════
//  MASTER TRY/CATCH — ensures we always return a response
// ══════════════════════════════════════════════════════════
try {
  // ── Load node-forge ──
  let forge;
  try {
    forge = require("node-forge");
  } catch (loadErr) {
    return [
      {
        json: {
          success: false,
          error: "node-forge nao carregou: " + loadErr.message,
          hint: "Adicione NODE_FUNCTION_ALLOW_EXTERNAL=node-forge nas env vars do N8N e instale: npm install -g node-forge",
        },
      },
    ];
  }

  // ── Parse input (defensive — handles multiple N8N webhook formats) ──
  let body;
  try {
    const raw = $input.first().json;
    body = raw.body || raw;
  } catch (inputErr) {
    return [
      {
        json: {
          success: false,
          error: "Erro ao ler input: " + inputErr.message,
        },
      },
    ];
  }

  const action = body.action;

  // ── Config (read from N8N environment / process.env) ──
  const DOCUMENSO_URL =
    process.env.DOCUMENSO_URL || "https://documenso.sosescritura.com.br";
  const DOCUMENSO_API_KEY = process.env.DOCUMENSO_API_KEY || "";
  const DB_ENDPOINT =
    process.env.API_CRUD_ENDPOINT ||
    "https://n8n.sosescritura.com.br/webhook/api_crud";

  /* ================================================================== */
  /*  ICP-Brasil — Known Root & Intermediate CA identifiers               */
  /*  Based on ITI (Instituto Nacional de TI) published chain             */
  /*  Ref: https://www.gov.br/iti/pt-br/assuntos/repositorio             */
  /* ================================================================== */
  const ICP_BRASIL_CA_KEYWORDS = [
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

  /**
   * Verifies if a certificate was issued by an ICP-Brasil CA.
   * Checks the full certificate chain in the PKCS#12 bag.
   *
   * Returns: { isIcpBrasil: boolean, chainDepth: number, rootCA: string|null, warnings: string[] }
   */
  function validateIcpBrasilChain(cert, certBag) {
    var warnings = [];
    var chainCerts = [];

    // Collect all certificates from the bag
    if (certBag && Array.isArray(certBag)) {
      for (var i = 0; i < certBag.length; i++) {
        if (certBag[i].cert) chainCerts.push(certBag[i].cert);
      }
    }

    // Check issuer of the signer certificate
    var issuerStr = cert.issuer.attributes
      .map(function (a) {
        return (a.value || "").toString();
      })
      .join(" ");

    var subjectStr = cert.subject.attributes
      .map(function (a) {
        return (a.value || "").toString();
      })
      .join(" ");

    // Check if any cert in the chain mentions ICP-Brasil
    var foundIcpRef = false;
    var rootCA = null;

    // Check signer's issuer
    for (var k = 0; k < ICP_BRASIL_CA_KEYWORDS.length; k++) {
      if (issuerStr.indexOf(ICP_BRASIL_CA_KEYWORDS[k]) >= 0) {
        foundIcpRef = true;
        rootCA = issuerStr;
        break;
      }
    }

    // Check all certs in chain for ICP-Brasil reference
    if (!foundIcpRef) {
      for (var c = 0; c < chainCerts.length; c++) {
        var chainIssuer = chainCerts[c].issuer.attributes
          .map(function (a) {
            return (a.value || "").toString();
          })
          .join(" ");
        var chainSubject = chainCerts[c].subject.attributes
          .map(function (a) {
            return (a.value || "").toString();
          })
          .join(" ");
        for (var kk = 0; kk < ICP_BRASIL_CA_KEYWORDS.length; kk++) {
          if (
            chainIssuer.indexOf(ICP_BRASIL_CA_KEYWORDS[kk]) >= 0 ||
            chainSubject.indexOf(ICP_BRASIL_CA_KEYWORDS[kk]) >= 0
          ) {
            foundIcpRef = true;
            rootCA = chainSubject || chainIssuer;
            break;
          }
        }
        if (foundIcpRef) break;
      }
    }

    // Also check for ICP-Brasil policy OIDs in certificate extensions
    // OID 2.16.76.1.2.x = ICP-Brasil certificate policies
    if (!foundIcpRef) {
      var extensions = cert.extensions || [];
      for (var e = 0; e < extensions.length; e++) {
        var ext = extensions[e];
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
      rootCA: rootCA,
      warnings: warnings,
    };
  }

  /* ================================================================== */
  /*  HELPER: CRL Revocation Check (best-effort)                         */
  /*  Checks if the certificate has been revoked via CRL distribution    */
  /*  point (CDP) embedded in the certificate extensions.                */
  /*  Ref: DOC-ICP-04                                                    */
  /* ================================================================== */
  async function checkRevocation(cert) {
    var result = { checked: false, revoked: false, error: null, crlUrl: null };

    try {
      // Find CRL Distribution Points extension
      var extensions = cert.extensions || [];
      var crlUrl = null;

      for (var i = 0; i < extensions.length; i++) {
        var ext = extensions[i];
        // CRL Distribution Points OID: 2.5.29.31
        if (ext.id === "2.5.29.31" || ext.name === "cRLDistributionPoints") {
          // Extract URL from the extension value
          var val = ext.value || "";
          if (typeof val === "string") {
            var urlMatch = val.match(/https?:\/\/[^\s"'<>]+\.crl/i);
            if (urlMatch) crlUrl = urlMatch[0];
          }
          // node-forge may parse it as an object with distributionPoints
          if (!crlUrl && ext.cRLDistributionPoints) {
            var dps = ext.cRLDistributionPoints;
            for (var d = 0; d < dps.length; d++) {
              if (dps[d].fullName) {
                for (var n = 0; n < dps[d].fullName.length; n++) {
                  var gn = dps[d].fullName[n];
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
      var controller =
        typeof AbortController !== "undefined" ? new AbortController() : null;
      var timeoutId = controller
        ? setTimeout(function () {
            controller.abort();
          }, 10000)
        : null;

      var crlResponse = await fetch(crlUrl, {
        method: "GET",
        signal: controller ? controller.signal : undefined,
      });

      if (timeoutId) clearTimeout(timeoutId);

      if (!crlResponse.ok) {
        result.error = "Falha ao baixar CRL: HTTP " + crlResponse.status;
        return result;
      }

      // Parse CRL and check serial number
      var crlBuffer = await crlResponse.arrayBuffer();
      var crlDer = forge.util.createBuffer(
        Buffer.from(crlBuffer).toString("binary"),
      );

      try {
        var crlAsn1 = forge.asn1.fromDer(crlDer);
        // The CRL structure: SEQUENCE { tbsCertList, signatureAlgorithm, signatureValue }
        // tbsCertList contains: version, signature, issuer, thisUpdate, nextUpdate, revokedCertificates
        var tbsCertList = crlAsn1.value[0];
        // revokedCertificates is typically at index 5 (after version, sig, issuer, thisUpdate, nextUpdate)
        var revokedCerts = null;
        for (var ri = 0; ri < tbsCertList.value.length; ri++) {
          var item = tbsCertList.value[ri];
          // revokedCertificates is a SEQUENCE of SEQUENCE entries
          if (item.type === forge.asn1.Type.SEQUENCE && ri >= 5) {
            revokedCerts = item;
            break;
          }
        }

        result.checked = true;

        if (revokedCerts && revokedCerts.value) {
          var certSerial = cert.serialNumber.toLowerCase().replace(/:/g, "");
          for (var si = 0; si < revokedCerts.value.length; si++) {
            var entry = revokedCerts.value[si];
            if (entry.value && entry.value[0]) {
              var revokedSerial = forge.util
                .bytesToHex(entry.value[0].value)
                .toLowerCase();
              if (revokedSerial === certSerial) {
                result.revoked = true;
                break;
              }
            }
          }
        }
      } catch (parseErr) {
        result.error = "Erro ao interpretar CRL: " + parseErr.message;
      }
    } catch (err) {
      result.error =
        "Erro na verificacao de revogacao: " + (err.message || String(err));
    }

    return result;
  }

  /* ================================================================== */
  /*  HELPER: Parse PKCS#12 certificate                                  */
  /* ================================================================== */
  function parseCertificate(certBase64, password) {
    const derBytes = forge.util.decode64(certBase64);
    const asn1 = forge.asn1.fromDer(derBytes);
    const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);

    // Extract certificate(s)
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certBag = certBags[forge.pki.oids.certBag];
    if (!certBag || certBag.length === 0) {
      throw new Error("Nenhum certificado encontrado no arquivo .p12");
    }

    const cert = certBag[0].cert;

    // Extract private key
    const keyBags = p12.getBags({
      bagType: forge.pki.oids.pkcs8ShroudedKeyBag,
    });
    const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag];
    if (!keyBag || keyBag.length === 0) {
      throw new Error("Chave privada nao encontrada no arquivo .p12");
    }
    const privateKey = keyBag[0].key;

    // Parse subject
    const subject = cert.subject.attributes
      .map(function (a) {
        return a.shortName + "=" + a.value;
      })
      .join(", ");
    const issuer = cert.issuer.attributes
      .map(function (a) {
        return a.shortName + "=" + a.value;
      })
      .join(", ");

    // Common Name
    const cnAttr = cert.subject.getField("CN");
    const name = cnAttr ? cnAttr.value : subject;

    // Extract CPF/CNPJ from extensions
    let cpf = null;
    let cnpj = null;
    const extensions = cert.extensions || [];
    for (let i = 0; i < extensions.length; i++) {
      const ext = extensions[i];
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

    // ── ICP-Brasil chain validation (MP 2.200-2/2001 Art. 10 §1) ──
    var chainValidation = validateIcpBrasilChain(cert, certBag);

    return {
      cert: cert,
      privateKey: privateKey,
      certBag: certBag,
      info: {
        subject: subject,
        issuer: issuer,
        serial: cert.serialNumber,
        validFrom: validFrom,
        validTo: validTo,
        cpf: cpf
          ? cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
          : null,
        cnpj: cnpj
          ? cnpj.replace(
              /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
              "$1.$2.$3/$4-$5",
            )
          : null,
        name: name,
        isValid: isValid,
        daysUntilExpiry: daysUntilExpiry,
        // MP 2.200-2 compliance fields
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
  async function downloadPdfFromDocumenso(documentId) {
    const url = DOCUMENSO_URL + "/api/v1/documents/" + documentId + "/download";
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: DOCUMENSO_API_KEY },
    });
    if (!response.ok) {
      throw new Error(
        "Erro ao baixar PDF do Documenso: HTTP " + response.status,
      );
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /* ================================================================== */
  /*  HELPER: Sign PDF with PKCS#7 (CMS)                                */
  /* ================================================================== */
  function signPdf(pdfBuffer, cert, privateKey, allCerts) {
    const pdf = pdfBuffer.toString("binary");
    // 16384 hex chars = 8KB — enough for full ICP-Brasil chain + future TSA timestamp
    // (was 8192/4KB which risks overflow with intermediary certs)
    const SIGNATURE_LENGTH = 16384;
    const signaturePlaceholder = "<" + "0".repeat(SIGNATURE_LENGTH) + ">";
    const BR_PLACEHOLDER = "/ByteRange [0 /********** /********** /**********]";

    // Find next object ID
    var maxId = 0;
    var objMatch;
    var objRegex = /(\d+)\s+0\s+obj/g;
    while ((objMatch = objRegex.exec(pdf)) !== null) {
      var oid = parseInt(objMatch[1], 10);
      if (oid > maxId) maxId = oid;
    }
    var nextObjId = maxId + 1;

    // Format date
    var d = new Date();
    function pad(n) {
      return String(n).padStart(2, "0");
    }
    var pdfDate =
      "" +
      d.getUTCFullYear() +
      pad(d.getUTCMonth() + 1) +
      pad(d.getUTCDate()) +
      pad(d.getUTCHours()) +
      pad(d.getUTCMinutes()) +
      pad(d.getUTCSeconds()) +
      "Z";

    // Escape PDF string
    function escPdf(s) {
      return (s || "")
        .replace(/\\/g, "\\\\")
        .replace(/\(/g, "\\(")
        .replace(/\)/g, "\\)");
    }

    var cn = cert.subject.getField("CN");
    var signerName = cn ? cn.value : "Signatario";
    var emailField = cert.subject.getField("E");
    var signerEmail = emailField ? emailField.value : "";

    // Build signature dictionary
    var sigDict =
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

    var pdfWithSig = pdf + sigDict;

    // Find positions
    var contentsStart = pdfWithSig.lastIndexOf(signaturePlaceholder);
    var contentsEnd = contentsStart + signaturePlaceholder.length;
    var byteRange = [
      0,
      contentsStart,
      contentsEnd,
      pdfWithSig.length - contentsEnd,
    ];

    // Replace ByteRange placeholder
    var brStr =
      "/ByteRange [" +
      byteRange[0] +
      " " +
      byteRange[1] +
      " " +
      byteRange[2] +
      " " +
      byteRange[3] +
      "]";
    var finalPdf = pdfWithSig.replace(
      /\/ByteRange \[0 \/\*{10} \/\*{10} \/\*{10}\]/,
      brStr.padEnd(BR_PLACEHOLDER.length, " "),
    );

    // Hash PDF content (excluding signature)
    var pdfBuf = Buffer.from(finalPdf, "binary");
    var hashContent = Buffer.concat([
      pdfBuf.subarray(byteRange[0], byteRange[1]),
      pdfBuf.subarray(byteRange[2], byteRange[2] + byteRange[3]),
    ]);

    // Create PKCS#7 signature
    var p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(hashContent.toString("binary"));
    p7.addCertificate(cert);
    if (allCerts) {
      for (var ci = 0; ci < allCerts.length; ci++) {
        if (allCerts[ci].cert && allCerts[ci].cert !== cert) {
          p7.addCertificate(allCerts[ci].cert);
        }
      }
    }

    p7.addSigner({
      key: privateKey,
      certificate: cert,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        { type: forge.pki.oids.messageDigest },
        { type: forge.pki.oids.signingTime, value: new Date() },
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

    var derBytes = forge.asn1.toDer(p7.toAsn1()).getBytes();
    var signatureHex = Buffer.from(derBytes, "binary").toString("hex");
    var paddedSig = signatureHex.padEnd(SIGNATURE_LENGTH, "0");

    var signedPdf = finalPdf.replace(
      signaturePlaceholder,
      "<" + paddedSig + ">",
    );
    return Buffer.from(signedPdf, "binary");
  }

  /* ================================================================== */
  /*  ACTION HANDLERS                                                    */
  /* ================================================================== */

  async function handleValidate() {
    var certificate = body.certificate;
    var password = body.password;

    if (!certificate || !password) {
      return { success: false, error: "Certificado e senha sao obrigatorios." };
    }
    try {
      var result = parseCertificate(certificate, password);

      // ── CRL revocation check (DOC-ICP-04) ──
      var revocationResult = await checkRevocation(result.cert);
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

      return { success: true, certificateInfo: result.info };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  }

  async function handleSign() {
    var signatureId = body.signatureId;
    var documensoDocumentId = body.documensoDocumentId;
    var pdfBase64Input = body.pdfBase64;
    var certificate = body.certificate;
    var password = body.password;

    if (!signatureId || !certificate || !password) {
      return {
        success: false,
        error: "signatureId, certificate e password sao obrigatorios.",
      };
    }

    if (!documensoDocumentId && !pdfBase64Input) {
      return {
        success: false,
        error: "Informe documensoDocumentId ou pdfBase64 para assinar.",
      };
    }

    try {
      var parsed = parseCertificate(certificate, password);
      if (!parsed.info.isValid) {
        return {
          success: false,
          error: "Certificado expirado em " + parsed.info.validTo,
          certificateInfo: parsed.info,
        };
      }

      // ── MP 2.200-2 Art. 10 §1: Validate ICP-Brasil chain ──
      if (!parsed.info.isIcpBrasil) {
        return {
          success: false,
          error:
            "Certificado NAO pertence a cadeia ICP-Brasil. " +
            "Conforme MP 2.200-2/2001 Art. 10 §1, apenas certificados emitidos na hierarquia ICP-Brasil " +
            "possuem presuncao de veracidade juridica. Emissor: " +
            parsed.info.issuer,
          certificateInfo: parsed.info,
        };
      }

      // ── DOC-ICP-04: CRL revocation check ──
      var revocationResult = await checkRevocation(parsed.cert);
      parsed.info.revocationCheck = {
        checked: revocationResult.checked,
        revoked: revocationResult.revoked,
        crlUrl: revocationResult.crlUrl,
        error: revocationResult.error,
      };

      if (revocationResult.revoked) {
        return {
          success: false,
          error:
            "Certificado REVOGADO conforme CRL da AC emissora. " +
            "Assinatura com certificado revogado e juridicamente NULA (DOC-ICP-04).",
          certificateInfo: parsed.info,
        };
      }

      // Get PDF: from direct base64 or download from Documenso
      var pdfBuffer;
      if (pdfBase64Input) {
        pdfBuffer = Buffer.from(pdfBase64Input, "base64");
      } else {
        pdfBuffer = await downloadPdfFromDocumenso(documensoDocumentId);
      }
      var signedPdf = signPdf(
        pdfBuffer,
        parsed.cert,
        parsed.privateKey,
        parsed.certBag,
      );
      var signedPdfBase64 = signedPdf.toString("base64");
      var signedAt = new Date().toISOString();

      // Update DB — save signed PDF alongside status
      await fetch(DB_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

      return {
        success: true,
        signedAt: signedAt,
        certificateInfo: parsed.info,
        signedPdfBase64: signedPdfBase64,
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
      };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  }

  async function handleDownload() {
    if (!body.signatureId) {
      return { success: false, error: "signatureId e obrigatorio." };
    }

    try {
      // Read signed PDF from database
      var dbRes = await fetch(DB_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "list",
          table: "document_signatures",
          search_field1: "id",
          search_value1: body.signatureId,
          search_operator1: "equal",
        }),
      });
      var dbData = await dbRes.json();
      var records = Array.isArray(dbData) ? dbData : dbData.data || [];
      var record = records[0];

      if (!record || !record.signed_pdf_base64) {
        return {
          success: false,
          error: "PDF assinado nao encontrado no banco de dados.",
        };
      }

      return {
        success: true,
        signedPdfBase64: record.signed_pdf_base64,
        message: "PDF assinado recuperado do banco de dados.",
      };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  }

  /* ================================================================== */
  /*  ROUTER                                                             */
  /* ================================================================== */
  var result;
  if (action === "validate") {
    result = await handleValidate();
  } else if (action === "sign") {
    result = await handleSign();
  } else if (action === "download") {
    result = await handleDownload();
  } else {
    result = {
      success: false,
      error:
        "Acao desconhecida: " + action + ". Use: validate, sign, download.",
      receivedBody: JSON.stringify(body).substring(0, 200),
    };
  }

  return [{ json: result }];

  // ══════════════════════════════════════════════════════════
} catch (fatalError) {
  return [
    {
      json: {
        success: false,
        error: "FATAL: " + (fatalError.message || String(fatalError)),
        stack: String(fatalError.stack || "").substring(0, 500),
      },
    },
  ];
}
