/**
 * NF-e / NFC-e Payload Builder
 *
 * Transforms SOSApp invoice + tenant fiscal config into the JSON payload
 * expected by the PHP microservice (sped-nfe library).
 *
 * The PHP side receives this JSON and uses sped-nfe to:
 *   1. Build XML    → NFe\Make
 *   2. Sign XML     → NFe\Tools::signNFe()
 *   3. Send to SEFAZ → NFe\Tools::sefazEnviaLote()
 *
 * Payload structure follows the oficial NF-e 4.0 layout:
 *   infNFe → { ide, emit, dest, det[], total, transp, pag, infAdic }
 *
 * References:
 *   - Manual NF-e 4.0 (NT2016.002)
 *   - sped-nfe Make class: https://github.com/nfephp-org/sped-nfe
 */

import {
    getCRT,
    getDefaultItemTaxCodes,
    type TenantFiscalConfig,
} from "@/services/fiscal-config";

/* ================================================================== */
/*  TYPES — matches what the PHP microservice expects                  */
/* ================================================================== */

/** Payment method codes (tPag) used in NF-e 4.0 */
export type NFePaymentMethod =
  | "01" // Dinheiro
  | "02" // Cheque
  | "03" // Cartão de Crédito
  | "04" // Cartão de Débito
  | "05" // Crédito Loja
  | "10" // Vale Alimentação
  | "11" // Vale Refeição
  | "12" // Vale Presente
  | "13" // Vale Combustível
  | "15" // Boleto Bancário
  | "16" // Depósito Bancário
  | "17" // PIX
  | "18" // Transferência bancária
  | "90" // Sem pagamento
  | "99"; // Outros

/** Finality codes (finNFe) */
export type NFeFinality =
  | "1" // Normal
  | "2" // Complementar
  | "3" // Ajuste
  | "4"; // Devolução

/** Consumer presence indicator (indPres) */
export type NFePresenceIndicator =
  | "0" // Não se aplica
  | "1" // Presencial
  | "2" // Internet
  | "3" // Televendas
  | "4" // NFC-e entrega a domicílio
  | "5" // Presencial fora do estabelecimento
  | "9"; // Outros

/* ── Sub-payloads ── */

export interface NFeIDE {
  cUF: number; // IBGE UF code (e.g. 35 for SP)
  cNF: string; // Random 8-digit code
  natOp: string; // Natureza da operação
  mod: 55 | 65; // 55=NF-e, 65=NFC-e
  serie: number;
  nNF: number;
  dhEmi: string; // ISO datetime
  tpNF: 0 | 1; // 0=entrada, 1=saída
  idDest: 1 | 2 | 3; // 1=operação interna
  cMunFG: string; // IBGE municipality code (7 digits)
  tpImp: number; // DANFE print format
  tpEmis: 1; // Normal
  tpAmb: 1 | 2; // 1=production, 2=homologation
  finNFe: NFeFinality;
  indFinal: 0 | 1; // 1=consumidor final
  indPres: NFePresenceIndicator;
  procEmi: 0; // App do contribuinte
  verProc: string; // App version
}

export interface NFeEmit {
  CNPJ: string;
  xNome: string;
  xFant?: string;
  IE?: string;
  IM?: string;
  CRT: 1 | 2 | 3;
  enderEmit: {
    xLgr: string;
    nro: string;
    xCpl?: string;
    xBairro: string;
    cMun: string; // IBGE 7 digits
    xMun: string;
    UF: string;
    CEP: string;
    cPais: string; // "1058" = Brasil
    xPais: string; // "Brasil"
    fone?: string;
  };
}

export interface NFeDest {
  CNPJ?: string;
  CPF?: string;
  xNome: string;
  indIEDest: "1" | "2" | "9"; // 1=contrib, 2=isento, 9=não contrib
  IE?: string;
  email?: string;
  enderDest?: {
    xLgr: string;
    nro: string;
    xCpl?: string;
    xBairro: string;
    cMun: string;
    xMun: string;
    UF: string;
    CEP: string;
    cPais: string;
    xPais: string;
    fone?: string;
  };
}

export interface NFeDetProd {
  cProd: string; // Product/service code
  cEAN: string; // "SEM GTIN"
  xProd: string; // Description
  NCM: string; // 8-digit NCM
  CEST?: string;
  CFOP: string; // 4-digit CFOP
  uCom: string; // Unit (UN, KG, etc.)
  qCom: number;
  vUnCom: number;
  vProd: number;
  cEANTrib: string; // "SEM GTIN"
  uTrib: string;
  qTrib: number;
  vUnTrib: number;
  indTot: 0 | 1; // 1=compõe total
  vDesc?: number;
  vFrete?: number;
  vSeg?: number;
  vOutro?: number;
}

export interface NFeDetImposto {
  // ICMS — depends on CRT
  ICMS?: Record<string, unknown>;
  // PIS
  PIS?: Record<string, unknown>;
  // COFINS
  COFINS?: Record<string, unknown>;
  // IPI (optional)
  IPI?: Record<string, unknown>;
}

export interface NFeDet {
  nItem: number;
  prod: NFeDetProd;
  imposto: NFeDetImposto;
  infAdProd?: string; // Additional info per item
}

export interface NFeTotal {
  ICMSTot: {
    vBC: number;
    vICMS: number;
    vICMSDeson: number;
    vFCP: number;
    vBCST: number;
    vST: number;
    vFCPST: number;
    vFCPSTRet: number;
    vProd: number;
    vFrete: number;
    vSeg: number;
    vDesc: number;
    vII: number;
    vIPI: number;
    vIPIDevol: number;
    vPIS: number;
    vCOFINS: number;
    vOutro: number;
    vNF: number;
  };
}

export interface NFeTransp {
  modFrete: 0 | 1 | 2 | 3 | 4 | 9; // 9=sem frete
}

export interface NFePag {
  detPag: {
    tPag: NFePaymentMethod;
    vPag: number;
  }[];
}

export interface NFeInfAdic {
  infCpl?: string; // Complementary info
}

/** Full payload sent to the PHP microservice */
export interface NFePayload {
  /** Document type: "nfe" (mod 55) or "nfce" (mod 65) */
  type: "nfe" | "nfce";
  /** SEFAZ environment: 1=production, 2=homologation */
  environment: 1 | 2;
  /** Certificate .pfx content as base64 */
  certificate_pfx_base64: string;
  /** Certificate password */
  certificate_password: string;
  /** NFC-e CSC (only for nfce) */
  csc?: string;
  /** NFC-e CSC ID (only for nfce) */
  csc_id?: string;
  /** The NF-e data */
  infNFe: {
    ide: NFeIDE;
    emit: NFeEmit;
    dest: NFeDest;
    det: NFeDet[];
    total: NFeTotal;
    transp: NFeTransp;
    pag: NFePag;
    infAdic?: NFeInfAdic;
  };
}

/** Invoice item from SOSApp database */
export interface InvoiceItemRow {
  id: string;
  description?: string;
  item_description?: string;
  quantity?: number;
  unit_price?: number;
  total?: number;
  ncm?: string;
  cest?: string;
  cfop?: string;
  cst_icms?: string;
  csosn?: string;
  cst_pis?: string;
  cst_cofins?: string;
  unit_code?: string;
  gross_value?: number;
  discount_value?: number;
  freight_value?: number;
  insurance_value?: number;
  other_expenses_value?: number;
  icms_base_value?: number;
  icms_value?: number;
  icms_rate?: number;
  pis_value?: number;
  pis_rate?: number;
  cofins_value?: number;
  cofins_rate?: number;
  ipi_value?: number;
  ipi_rate?: number;
  fiscal_notes?: string;
}

/** Invoice row from SOSApp database */
export interface InvoiceRow {
  id: string;
  tenant_id: string;
  document_type: string;
  fiscal_environment?: string;
  operation_nature?: string;
  total_amount?: number;
  additional_info?: string;
  recipient_name?: string;
  recipient_cpf_cnpj?: string;
  recipient_ie?: string;
  recipient_email?: string;
  recipient_phone?: string;
  recipient_address_line1?: string;
  recipient_address_line2?: string;
  recipient_city?: string;
  recipient_state?: string;
  recipient_zip_code?: string;
  recipient_ibge_city_code?: string;
  recipient_ibge_state_code?: string;
  // Payment
  payment_method?: string;
}

/* ================================================================== */
/*  HELPERS                                                            */
/* ================================================================== */

const digits = (v: unknown): string => String(v ?? "").replace(/\D/g, "");

const num = (v: unknown): number => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Generate random 8-digit code for cNF */
const randomCNF = (): string =>
  String(Math.floor(10000000 + Math.random() * 90000000));

/** Map UF abbreviation to IBGE UF code */
const UF_TO_CODE: Record<string, number> = {
  AC: 12,
  AL: 27,
  AM: 13,
  AP: 16,
  BA: 29,
  CE: 23,
  DF: 53,
  ES: 32,
  GO: 52,
  MA: 21,
  MG: 31,
  MS: 50,
  MT: 51,
  PA: 15,
  PB: 25,
  PE: 26,
  PI: 22,
  PR: 41,
  RJ: 33,
  RN: 24,
  RO: 11,
  RR: 14,
  RS: 43,
  SC: 42,
  SE: 28,
  SP: 35,
  TO: 17,
};

/** Map SOSApp payment_method string to tPag NF-e code */
function mapPaymentMethod(method?: string): NFePaymentMethod {
  const m = String(method ?? "").toLowerCase();
  if (m.includes("pix")) return "17";
  if (m.includes("credito") || m.includes("credit")) return "03";
  if (m.includes("debito") || m.includes("debit")) return "04";
  if (m.includes("boleto")) return "15";
  if (m.includes("transferencia") || m.includes("transfer")) return "18";
  if (m.includes("dinheiro") || m.includes("cash")) return "01";
  if (m.includes("cheque")) return "02";
  return "99"; // Outros
}

/** Format phone number for XML (digits only, 10–11) */
const formatPhone = (phone?: string | null): string | undefined => {
  if (!phone) return undefined;
  const d = digits(phone);
  return d.length >= 10 ? d : undefined;
};

/* ================================================================== */
/*  BUILDER — Main function                                            */
/* ================================================================== */

export interface BuildNFeResult {
  ok: boolean;
  payload?: NFePayload;
  error?: string;
}

/**
 * Build the complete NF-e / NFC-e payload from SOSApp data.
 *
 * @param invoice     — Invoice row with recipient data
 * @param items       — Invoice item rows with product/tax data
 * @param tenant      — Tenant fiscal configuration
 * @param series      — Series number (from consumeNextFiscalNumber)
 * @param nfNumber    — NF number (from consumeNextFiscalNumber)
 */
export function buildNFePayload(
  invoice: InvoiceRow,
  items: InvoiceItemRow[],
  tenant: TenantFiscalConfig,
  series: number,
  nfNumber: number,
): BuildNFeResult {
  // ── Determine doc type & environment ──
  const docType = invoice.document_type === "nfce" ? "nfce" : "nfe";
  const mod: 55 | 65 = docType === "nfce" ? 65 : 55;
  const tpAmb: 1 | 2 =
    (invoice.fiscal_environment ?? tenant.fiscal_default_environment) ===
    "production"
      ? 1
      : 2;

  // ── Emitter (tenant) ──
  const emitCNPJ = digits(tenant.cnpj);
  const emitUF = String(tenant.fiscal_state ?? "").toUpperCase();
  const cUF = UF_TO_CODE[emitUF];
  if (!cUF) {
    return { ok: false, error: `UF inválida no emitente: "${emitUF}"` };
  }

  const crt = getCRT(tenant.tax_regime);
  const defaultTaxCodes = getDefaultItemTaxCodes(tenant.tax_regime);

  // ── IDE (identification) ──
  const ide: NFeIDE = {
    cUF,
    cNF: randomCNF(),
    natOp: invoice.operation_nature || "VENDA DE MERCADORIA",
    mod,
    serie: series,
    nNF: nfNumber,
    dhEmi: new Date().toISOString(),
    tpNF: 1, // saída
    idDest: 1, // operação interna
    cMunFG: tenant.ibge_city_code ?? "",
    tpImp: docType === "nfce" ? 4 : 1, // 4=DANFE NFC-e, 1=DANFE normal
    tpEmis: 1,
    tpAmb,
    finNFe: "1", // Normal
    indFinal: 1, // consumidor final
    indPres: docType === "nfce" ? "1" : "2", // 1=presencial, 2=internet
    procEmi: 0,
    verProc: "SOSApp 1.0",
  };

  // ── EMIT (emitter = tenant) ──
  const emit: NFeEmit = {
    CNPJ: emitCNPJ,
    xNome: tenant.legal_name ?? "",
    xFant: tenant.trade_name ?? undefined,
    IE: tenant.state_registration ?? undefined,
    IM: tenant.municipal_registration ?? undefined,
    CRT: crt,
    enderEmit: {
      xLgr: tenant.fiscal_street ?? "",
      nro: tenant.fiscal_number ?? "S/N",
      xCpl: tenant.fiscal_complement ?? undefined,
      xBairro: tenant.fiscal_neighborhood ?? "",
      cMun: tenant.ibge_city_code ?? "",
      xMun: tenant.fiscal_city ?? "",
      UF: emitUF,
      CEP: digits(tenant.fiscal_zip_code),
      cPais: "1058",
      xPais: "Brasil",
    },
  };

  // ── DEST (recipient = customer) ──
  const recipCpfCnpj = digits(invoice.recipient_cpf_cnpj);
  const isRecipCNPJ = recipCpfCnpj.length === 14;
  const isRecipCPF = recipCpfCnpj.length === 11;

  // In homologation, SEFAZ requires specific test name
  const recipName =
    tpAmb === 2
      ? "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL"
      : (invoice.recipient_name ?? "CONSUMIDOR NAO IDENTIFICADO");

  const dest: NFeDest = {
    ...(isRecipCNPJ ? { CNPJ: recipCpfCnpj } : {}),
    ...(isRecipCPF ? { CPF: recipCpfCnpj } : {}),
    xNome: recipName,
    indIEDest: isRecipCNPJ ? "1" : "9", // 1=contribuinte, 9=não contribuinte
    IE: isRecipCNPJ ? (invoice.recipient_ie ?? undefined) : undefined,
    email: invoice.recipient_email ?? undefined,
  };

  // NF-e requires full recipient address; NFC-e is optional
  if (docType === "nfe" && invoice.recipient_city) {
    dest.enderDest = {
      xLgr: invoice.recipient_address_line1 ?? "",
      nro: invoice.recipient_address_line2 ?? "S/N",
      xBairro: "", // Bairro — same field split not available, use empty
      cMun: invoice.recipient_ibge_city_code ?? "",
      xMun: invoice.recipient_city ?? "",
      UF: (invoice.recipient_state ?? "").toUpperCase(),
      CEP: digits(invoice.recipient_zip_code),
      cPais: "1058",
      xPais: "Brasil",
      fone: formatPhone(invoice.recipient_phone),
    };
  }

  // ── DET (items) ──
  if (!items.length) {
    return { ok: false, error: "A nota precisa de pelo menos um item" };
  }

  let totalVProd = 0;
  let totalVDesc = 0;
  let totalVFrete = 0;
  let totalVSeg = 0;
  let totalVOutro = 0;
  let totalVBC = 0;
  let totalVICMS = 0;
  let totalVPIS = 0;
  let totalVCOFINS = 0;
  let totalVIPI = 0;

  const det: NFeDet[] = items.map((item, idx) => {
    const qty = num(item.quantity ?? 1);
    const unitPrice = num(item.unit_price);
    const vProd = round2(qty * unitPrice);
    const vDesc = round2(num(item.discount_value));
    const vFrete = round2(num(item.freight_value));
    const vSeg = round2(num(item.insurance_value));
    const vOutro = round2(num(item.other_expenses_value));

    totalVProd += vProd;
    totalVDesc += vDesc;
    totalVFrete += vFrete;
    totalVSeg += vSeg;
    totalVOutro += vOutro;

    // Tax calculations
    const icmsBase = round2(num(item.icms_base_value) || vProd - vDesc);
    const icmsRate = num(item.icms_rate);
    const icmsValue = round2(
      num(item.icms_value) || (icmsRate > 0 ? icmsBase * (icmsRate / 100) : 0),
    );
    const pisRate = num(item.pis_rate);
    const pisValue = round2(
      num(item.pis_value) ||
        (pisRate > 0 ? (vProd - vDesc) * (pisRate / 100) : 0),
    );
    const cofinsRate = num(item.cofins_rate);
    const cofinsValue = round2(
      num(item.cofins_value) ||
        (cofinsRate > 0 ? (vProd - vDesc) * (cofinsRate / 100) : 0),
    );
    const ipiRate = num(item.ipi_rate);
    const ipiValue = round2(
      num(item.ipi_value) || (ipiRate > 0 ? vProd * (ipiRate / 100) : 0),
    );

    totalVBC += icmsBase;
    totalVICMS += icmsValue;
    totalVPIS += pisValue;
    totalVCOFINS += cofinsValue;
    totalVIPI += ipiValue;

    // Build tax structure based on CRT
    const itemCstIcms = item.cst_icms || defaultTaxCodes.cst_icms;
    const itemCsosn = item.csosn || defaultTaxCodes.csosn;
    const itemCstPis = item.cst_pis || defaultTaxCodes.cst_pis;
    const itemCstCofins = item.cst_cofins || defaultTaxCodes.cst_cofins;

    const imposto: NFeDetImposto = {};

    // ICMS
    if (crt === 1) {
      // Simples Nacional — uses CSOSN
      imposto.ICMS = {
        ICMSSN102: {
          orig: "0", // Nacional
          CSOSN: itemCsosn || "102",
        },
      };
    } else {
      // Regime Normal — uses CST
      const cstKey = `ICMS${itemCstIcms || "00"}`;
      imposto.ICMS = {
        [cstKey]: {
          orig: "0",
          CST: itemCstIcms || "00",
          modBC: "3", // Valor da operação
          vBC: icmsBase,
          pICMS: icmsRate,
          vICMS: icmsValue,
        },
      };
    }

    // PIS
    if (["01", "02"].includes(itemCstPis)) {
      imposto.PIS = {
        PISAliq: {
          CST: itemCstPis,
          vBC: round2(vProd - vDesc),
          pPIS: pisRate,
          vPIS: pisValue,
        },
      };
    } else {
      imposto.PIS = {
        PISOutr: {
          CST: itemCstPis || "99",
          vPIS: pisValue,
        },
      };
    }

    // COFINS
    if (["01", "02"].includes(itemCstCofins)) {
      imposto.COFINS = {
        COFINSAliq: {
          CST: itemCstCofins,
          vBC: round2(vProd - vDesc),
          pCOFINS: cofinsRate,
          vCOFINS: cofinsValue,
        },
      };
    } else {
      imposto.COFINS = {
        COFINSOutr: {
          CST: itemCstCofins || "99",
          vCOFINS: cofinsValue,
        },
      };
    }

    // IPI (optional, only if rate > 0)
    if (ipiRate > 0) {
      imposto.IPI = {
        IPITrib: {
          CST: "50",
          vBC: vProd,
          pIPI: ipiRate,
          vIPI: ipiValue,
        },
      };
    }

    return {
      nItem: idx + 1,
      prod: {
        cProd: item.id || String(idx + 1),
        cEAN: "SEM GTIN",
        xProd: item.item_description || item.description || `Item ${idx + 1}`,
        NCM: item.ncm || "00000000",
        CEST: item.cest ?? undefined,
        CFOP: item.cfop || (crt === 1 ? "5102" : "5102"),
        uCom: item.unit_code || "UN",
        qCom: qty,
        vUnCom: unitPrice,
        vProd,
        cEANTrib: "SEM GTIN",
        uTrib: item.unit_code || "UN",
        qTrib: qty,
        vUnTrib: unitPrice,
        indTot: 1,
        vDesc: vDesc > 0 ? vDesc : undefined,
        vFrete: vFrete > 0 ? vFrete : undefined,
        vSeg: vSeg > 0 ? vSeg : undefined,
        vOutro: vOutro > 0 ? vOutro : undefined,
      },
      imposto,
      infAdProd: item.fiscal_notes ?? undefined,
    };
  });

  // ── TOTAL ──
  const vNF = round2(
    totalVProd - totalVDesc + totalVFrete + totalVSeg + totalVOutro + totalVIPI,
  );

  const total: NFeTotal = {
    ICMSTot: {
      vBC: round2(totalVBC),
      vICMS: round2(totalVICMS),
      vICMSDeson: 0,
      vFCP: 0,
      vBCST: 0,
      vST: 0,
      vFCPST: 0,
      vFCPSTRet: 0,
      vProd: round2(totalVProd),
      vFrete: round2(totalVFrete),
      vSeg: round2(totalVSeg),
      vDesc: round2(totalVDesc),
      vII: 0,
      vIPI: round2(totalVIPI),
      vIPIDevol: 0,
      vPIS: round2(totalVPIS),
      vCOFINS: round2(totalVCOFINS),
      vOutro: round2(totalVOutro),
      vNF,
    },
  };

  // ── TRANSP ──
  const transp: NFeTransp = { modFrete: 9 }; // Sem frete

  // ── PAG ──
  const tPag = mapPaymentMethod(invoice.payment_method);
  const pag: NFePag = {
    detPag: [
      {
        tPag: vNF > 0 ? tPag : "90", // "90"=sem pagamento if 0
        vPag: vNF > 0 ? vNF : 0,
      },
    ],
  };

  // ── INF ADIC ──
  const infAdic: NFeInfAdic | undefined = invoice.additional_info
    ? { infCpl: invoice.additional_info }
    : undefined;

  // ── Assemble payload ──
  const payload: NFePayload = {
    type: docType,
    environment: tpAmb,
    certificate_pfx_base64: tenant.fiscal_certificate_pfx ?? "",
    certificate_password: tenant.fiscal_certificate_password ?? "",
    ...(docType === "nfce" ? { csc: tenant.nfce_csc ?? "" } : {}),
    ...(docType === "nfce" ? { csc_id: tenant.nfce_csc_id ?? "" } : {}),
    infNFe: {
      ide,
      emit,
      dest,
      det,
      total,
      transp,
      pag,
      ...(infAdic ? { infAdic } : {}),
    },
  };

  return { ok: true, payload };
}
