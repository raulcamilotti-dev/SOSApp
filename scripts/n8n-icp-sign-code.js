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
    const SIGNATURE_LENGTH = 8192;
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
      return { success: true, certificateInfo: result.info };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  }

  async function handleSign() {
    var signatureId = body.signatureId;
    var documensoDocumentId = body.documensoDocumentId;
    var certificate = body.certificate;
    var password = body.password;

    if (!signatureId || !documensoDocumentId || !certificate || !password) {
      return {
        success: false,
        error:
          "signatureId, documensoDocumentId, certificate e password sao obrigatorios.",
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

      var pdfBuffer = await downloadPdfFromDocumenso(documensoDocumentId);
      var signedPdf = signPdf(
        pdfBuffer,
        parsed.cert,
        parsed.privateKey,
        parsed.certBag,
      );
      var signedPdfBase64 = signedPdf.toString("base64");
      var signedAt = new Date().toISOString();

      // Update DB
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
          },
        }),
      });

      return {
        success: true,
        signedAt: signedAt,
        certificateInfo: parsed.info,
        signedPdfBase64: signedPdfBase64,
        message:
          "Documento assinado por " +
          parsed.info.name +
          " com certificado ICP-Brasil.",
      };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  }

  async function handleDownload() {
    if (!body.signatureId) {
      return { success: false, error: "signatureId e obrigatorio." };
    }
    return {
      success: false,
      error: "Use a acao sign para gerar e obter o PDF assinado.",
    };
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
