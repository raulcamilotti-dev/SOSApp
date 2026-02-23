/**
 * ONR / SREI — Operador Nacional do Registro de Imóveis
 *
 * Integration with the Brazilian national electronic real-estate registry
 * system (Sistema de Registro Eletrônico de Imóveis).
 *
 * By law (Lei 14.382/2022, "Marco Legal dos Registros Públicos"),
 * all Brazilian property registries must provide electronic services
 * through the ONR/SREI platform.
 *
 * This service handles:
 * - Property registration (matrícula) lookup
 * - Electronic protocol submission (protocolo eletrônico)
 * - Certificate requests (certidão de matrícula)
 * - Registration status tracking
 * - Registry office (cartório) directory
 *
 * Docs: https://www.onr.org.br/
 * SREI API: Available to authorized partners (requires convênio)
 *
 * NOTE: Production access requires a signed agreement (convênio) with ONR.
 *       This service is structured for easy activation once credentials are obtained.
 */

import { api } from "@/services/api";
import { CRUD_ENDPOINT } from "@/services/crud";
import axios from "axios";

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

/**
 * ONR environments.
 * In production, switch to the real ONR endpoint after convênio approval.
 */
const ONR_CONFIG = {
  /** ONR SREI API base URL. Replace with production URL after convênio. */
  baseUrl:
    process.env.EXPO_PUBLIC_ONR_API_URL ?? "https://api.onr.org.br/srei/v1",
  /** Partner API key (from convênio). */
  apiKey: process.env.EXPO_PUBLIC_ONR_API_KEY ?? "",
  /** Partner certificate PFX path (for mTLS). */
  certPath: process.env.EXPO_PUBLIC_ONR_CERT_PATH ?? "",
  /** N8N webhook for ONR operations (proxy through backend). */
  n8nWebhook: "https://n8n.sosescritura.com.br/webhook/onr_srei",
} as const;

const onrClient = axios.create({
  baseURL: ONR_CONFIG.baseUrl,
  timeout: 30_000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// Add API key to all requests when available
onrClient.interceptors.request.use((config) => {
  if (ONR_CONFIG.apiKey) {
    config.headers["X-API-Key"] = ONR_CONFIG.apiKey;
  }
  return config;
});

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Property registration (matrícula) data. */
export interface Matricula {
  numero: string;
  livro: string;
  cartorio: string;
  cartorio_cns: string; // CNS = Código Nacional de Serventia
  comarca: string;
  uf: string;
  situacao: "ativa" | "cancelada" | "bloqueada";
  tipo_imovel: string;
  area_total?: string;
  endereco?: string;
  proprietarios: Proprietario[];
  onus: Onus[];
  averbacoes: Averbacao[];
  ultima_atualizacao: string;
}

/** Property owner from registry. */
export interface Proprietario {
  nome: string;
  cpf_cnpj: string;
  tipo: "pessoa_fisica" | "pessoa_juridica";
  percentual?: number;
  regime_bens?: string;
  data_aquisicao?: string;
}

/** Encumbrance/lien on property. */
export interface Onus {
  tipo: string; // hipoteca, penhora, alienação fiduciária, etc.
  descricao: string;
  valor?: number;
  beneficiario: string;
  data_registro: string;
  situacao: "ativo" | "cancelado";
}

/** Annotation on the registration. */
export interface Averbacao {
  tipo: string;
  descricao: string;
  data_registro: string;
  numero_registro: string;
}

/** Electronic protocol submission. */
export interface ProtocoloEletronico {
  id: string;
  numero_protocolo: string;
  cartorio_cns: string;
  tipo_ato: TipoAto;
  status: ProtocoloStatus;
  data_protocolo: string;
  data_previsao?: string;
  data_conclusao?: string;
  observacoes?: string;
  documentos: ProtocoloDocumento[];
  exigencias?: Exigencia[];
  valor_emolumentos?: number;
}

export type ProtocoloStatus =
  | "protocolado"
  | "em_analise"
  | "com_exigencia"
  | "registrado"
  | "devolvido"
  | "cancelado";

export type TipoAto =
  | "registro"
  | "averbacao"
  | "cancelamento"
  | "retificacao"
  | "usucapiao"
  | "regularizacao"
  | "outros";

export interface ProtocoloDocumento {
  id: string;
  nome: string;
  tipo: string;
  url?: string;
  hash?: string;
}

export interface Exigencia {
  id: string;
  descricao: string;
  data_exigencia: string;
  prazo: string;
  cumprida: boolean;
}

/** Registry office data. */
export interface Cartorio {
  cns: string; // Código Nacional de Serventia
  nome: string;
  tipo: "registro_imoveis" | "tabelionato_notas" | "registro_civil" | "outros";
  endereco: string;
  cidade: string;
  uf: string;
  cep: string;
  telefone: string;
  email: string;
  responsavel: string;
  comarca: string;
  circunscricao?: string;
  aceita_protocolo_eletronico: boolean;
}

/** Certificate request. */
export interface CertidaoRequest {
  tipo: "inteiro_teor" | "onus_reais" | "vintenaria" | "negativa" | "positiva";
  matricula: string;
  cartorio_cns: string;
  finalidade?: string;
  solicitante: {
    nome: string;
    cpf_cnpj: string;
    email: string;
  };
}

export interface Certidao {
  id: string;
  tipo: string;
  numero: string;
  matricula: string;
  cartorio_cns: string;
  data_emissao: string;
  data_validade: string;
  pdf_url?: string;
  hash_verificacao?: string;
  status: "solicitada" | "emitida" | "expirada" | "cancelada";
  valor: number;
}

/* ------------------------------------------------------------------ */
/*  ONR via N8N (recommended: backend proxies all ONR calls)           */
/* ------------------------------------------------------------------ */

/**
 * All ONR operations run through the N8N backend to protect credentials
 * and handle mTLS certificate authentication.
 */
async function onrViaBackend<T = any>(
  action: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const { data } = await api.post(ONR_CONFIG.n8nWebhook, {
    action,
    ...payload,
  });
  // N8N wrapper may nest the response
  const result = data?.data ?? data?.result ?? data;
  return result as T;
}

/* ------------------------------------------------------------------ */
/*  Matrícula (Property Registration)                                  */
/* ------------------------------------------------------------------ */

/**
 * Look up a property registration (matrícula) by number + registry office.
 */
export async function consultarMatricula(
  matricula: string,
  cartorioCns: string,
): Promise<Matricula> {
  return onrViaBackend<Matricula>("consultar_matricula", {
    matricula,
    cartorio_cns: cartorioCns,
  });
}

/**
 * Search properties by address or owner CPF/CNPJ.
 */
export async function pesquisarImovel(params: {
  cpf_cnpj?: string;
  endereco?: string;
  municipio?: string;
  uf?: string;
}): Promise<Matricula[]> {
  return onrViaBackend<Matricula[]>("pesquisar_imovel", params);
}

/* ------------------------------------------------------------------ */
/*  Protocolo Eletrônico (Electronic Protocol)                         */
/* ------------------------------------------------------------------ */

/**
 * Submit an electronic protocol to a registry office.
 */
export async function submeterProtocolo(params: {
  cartorio_cns: string;
  tipo_ato: TipoAto;
  matricula?: string;
  documentos: { nome: string; base64: string; tipo: string }[];
  observacoes?: string;
  property_id?: string;
}): Promise<ProtocoloEletronico> {
  return onrViaBackend<ProtocoloEletronico>("submeter_protocolo", params);
}

/**
 * Check the status of a submitted protocol.
 */
export async function consultarProtocolo(
  numeroProtocolo: string,
  cartorioCns: string,
): Promise<ProtocoloEletronico> {
  return onrViaBackend<ProtocoloEletronico>("consultar_protocolo", {
    numero_protocolo: numeroProtocolo,
    cartorio_cns: cartorioCns,
  });
}

/**
 * Respond to an exigência (requirement) on a protocol.
 */
export async function responderExigencia(params: {
  numero_protocolo: string;
  cartorio_cns: string;
  exigencia_id: string;
  documentos: { nome: string; base64: string; tipo: string }[];
  observacoes?: string;
}): Promise<{ success: boolean; message: string }> {
  return onrViaBackend("responder_exigencia", params);
}

/**
 * List all protocols for the current tenant.
 */
export async function listarProtocolos(params?: {
  status?: ProtocoloStatus;
  cartorio_cns?: string;
  data_inicio?: string;
  data_fim?: string;
}): Promise<ProtocoloEletronico[]> {
  return onrViaBackend<ProtocoloEletronico[]>(
    "listar_protocolos",
    params ?? {},
  );
}

/* ------------------------------------------------------------------ */
/*  Certidões (Certificates)                                           */
/* ------------------------------------------------------------------ */

/**
 * Request a certificate (certidão) for a property registration.
 */
export async function solicitarCertidao(
  request: CertidaoRequest,
): Promise<Certidao> {
  return onrViaBackend<Certidao>(
    "solicitar_certidao",
    request as unknown as Record<string, unknown>,
  );
}

/**
 * Check certificate status and download link.
 */
export async function consultarCertidao(certidaoId: string): Promise<Certidao> {
  return onrViaBackend<Certidao>("consultar_certidao", {
    certidao_id: certidaoId,
  });
}

/* ------------------------------------------------------------------ */
/*  Cartórios (Registry Office Directory)                              */
/* ------------------------------------------------------------------ */

/**
 * Search registry offices by city/state/type.
 */
export async function pesquisarCartorios(params: {
  municipio?: string;
  uf?: string;
  tipo?: Cartorio["tipo"];
  aceita_protocolo_eletronico?: boolean;
}): Promise<Cartorio[]> {
  return onrViaBackend<Cartorio[]>("pesquisar_cartorios", params);
}

/**
 * Get details of a specific registry office by CNS.
 */
export async function getCartorio(cns: string): Promise<Cartorio> {
  return onrViaBackend<Cartorio>("get_cartorio", { cns });
}

/* ------------------------------------------------------------------ */
/*  Process Integration Helpers                                        */
/* ------------------------------------------------------------------ */

/**
 * Link ONR protocol to an existing SOS Escritura process/property.
 * Stores the protocol reference in the property's process metadata.
 */
export async function vincularProtocoloAoProcesso(
  propertyId: string,
  protocolo: ProtocoloEletronico,
): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "properties",
    payload: {
      id: propertyId,
      onr_protocolo_numero: protocolo.numero_protocolo,
      onr_protocolo_status: protocolo.status,
      onr_cartorio_cns: protocolo.cartorio_cns,
      onr_protocolo_data: protocolo.data_protocolo,
    },
  });
}

/**
 * Sync ONR protocol status back into the SOS process.
 * Useful on a cron/webhook to keep process status updated.
 */
export async function sincronizarStatusProtocolo(
  propertyId: string,
  numeroProtocolo: string,
  cartorioCns: string,
): Promise<ProtocoloEletronico> {
  const protocolo = await consultarProtocolo(numeroProtocolo, cartorioCns);

  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "properties",
    payload: {
      id: propertyId,
      onr_protocolo_status: protocolo.status,
      onr_protocolo_previsao: protocolo.data_previsao ?? null,
      onr_protocolo_conclusao: protocolo.data_conclusao ?? null,
      onr_valor_emolumentos: protocolo.valor_emolumentos ?? null,
    },
  });

  return protocolo;
}

/* ------------------------------------------------------------------ */
/*  Utility                                                            */
/* ------------------------------------------------------------------ */

/** Check if ONR integration is configured (has API key). */
export function isOnrConfigured(): boolean {
  return !!ONR_CONFIG.apiKey;
}

/** Human-readable status labels (Portuguese). */
export const PROTOCOLO_STATUS_LABELS: Record<ProtocoloStatus, string> = {
  protocolado: "Protocolado",
  em_analise: "Em Análise",
  com_exigencia: "Com Exigência",
  registrado: "Registrado",
  devolvido: "Devolvido",
  cancelado: "Cancelado",
};

/** Human-readable act type labels. */
export const TIPO_ATO_LABELS: Record<TipoAto, string> = {
  registro: "Registro",
  averbacao: "Averbação",
  cancelamento: "Cancelamento",
  retificacao: "Retificação",
  usucapiao: "Usucapião",
  regularizacao: "Regularização",
  outros: "Outros",
};
