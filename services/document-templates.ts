/**
 * Document Templates Service
 *
 * Manages document templates with variable placeholders,
 * generates filled documents, and requests PDF generation.
 */
import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList as normalizeList,
} from "@/services/crud";

const PDF_ENDPOINT = "https://n8n.sosescritura.com.br/webhook/generate_pdf";

const DEFAULT_PAGE_CONFIG: PageConfig = {
  size: "A4",
  orientation: "portrait",
  margins: { top: 20, right: 20, bottom: 20, left: 20 },
};

/** Safely parse page_config from string or object, always returns valid config */
function parsePageConfig(raw: unknown): PageConfig {
  if (!raw) return DEFAULT_PAGE_CONFIG;
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    return {
      size: obj?.size ?? "A4",
      orientation: obj?.orientation ?? "portrait",
      margins: {
        top: obj?.margins?.top ?? 20,
        right: obj?.margins?.right ?? 20,
        bottom: obj?.margins?.bottom ?? 20,
        left: obj?.margins?.left ?? 20,
      },
    };
  } catch {
    return DEFAULT_PAGE_CONFIG;
  }
}

/** Safely parse variables from string or array */
export function parseVariables(raw: unknown): TemplateVariable[] {
  if (!raw) return [];
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/* ─── Types ──────────────────────────────────────────────────────────── */

export type VariableSource =
  | "manual"
  | "property"
  | "customer"
  | "process"
  | "user";

export interface TemplateVariable {
  key: string; // e.g. "nome_cliente"
  label: string; // e.g. "Nome do Cliente"
  type: "text" | "number" | "date" | "currency" | "cpf" | "cnpj" | "textarea";
  source: VariableSource; // where data comes from
  sourceField?: string; // e.g. "name" from properties table
  defaultValue?: string;
  required?: boolean;
}

export interface PageConfig {
  size: "A4" | "Letter" | "Legal";
  orientation: "portrait" | "landscape";
  margins: { top: number; right: number; bottom: number; left: number };
}

export interface DocumentTemplate {
  id: string;
  tenant_id?: string;
  name: string;
  description?: string;
  category: string;
  content_html: string;
  variables: TemplateVariable[];
  header_html?: string;
  footer_html?: string;
  page_config?: PageConfig;
  is_active?: boolean;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface GeneratedDocument {
  id: string;
  tenant_id?: string;
  template_id: string;
  property_id?: string;
  name: string;
  filled_html: string;
  variables_used: Record<string, string>;
  pdf_url?: string;
  pdf_base64?: string;
  status: "draft" | "generated" | "sent" | "signed";
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

/* ─── Pre-defined variable sources ───────────────────────────────────── */

export const PROPERTY_VARIABLES: TemplateVariable[] = [
  {
    key: "imovel_endereco",
    label: "Endereço do Imóvel",
    type: "text",
    source: "property",
    sourceField: "address",
  },
  {
    key: "imovel_numero",
    label: "Número",
    type: "text",
    source: "property",
    sourceField: "number",
  },
  {
    key: "imovel_cidade",
    label: "Cidade",
    type: "text",
    source: "property",
    sourceField: "city",
  },
  {
    key: "imovel_estado",
    label: "Estado",
    type: "text",
    source: "property",
    sourceField: "state",
  },
  {
    key: "imovel_cep",
    label: "CEP",
    type: "text",
    source: "property",
    sourceField: "zip_code",
  },
  {
    key: "imovel_bairro",
    label: "Bairro",
    type: "text",
    source: "property",
    sourceField: "neighborhood",
  },
  {
    key: "imovel_matricula",
    label: "Matrícula",
    type: "text",
    source: "property",
    sourceField: "registration_number",
  },
];

export const CUSTOMER_VARIABLES: TemplateVariable[] = [
  {
    key: "cliente_nome",
    label: "Nome do Cliente",
    type: "text",
    source: "customer",
    sourceField: "name",
  },
  {
    key: "cliente_cpf",
    label: "CPF do Cliente",
    type: "cpf",
    source: "customer",
    sourceField: "cpf",
  },
  {
    key: "cliente_cnpj",
    label: "CNPJ do Cliente",
    type: "cnpj",
    source: "customer",
    sourceField: "cnpj",
  },
  {
    key: "cliente_email",
    label: "Email do Cliente",
    type: "text",
    source: "customer",
    sourceField: "email",
  },
  {
    key: "cliente_telefone",
    label: "Telefone do Cliente",
    type: "text",
    source: "customer",
    sourceField: "phone",
  },
  {
    key: "cliente_endereco",
    label: "Endereço do Cliente",
    type: "text",
    source: "customer",
    sourceField: "address",
  },
  {
    key: "cliente_rg",
    label: "RG do Cliente",
    type: "text",
    source: "customer",
    sourceField: "rg",
  },
];

export const PROCESS_VARIABLES: TemplateVariable[] = [
  {
    key: "processo_data",
    label: "Data do Processo",
    type: "date",
    source: "process",
    sourceField: "created_at",
  },
  {
    key: "processo_status",
    label: "Status do Processo",
    type: "text",
    source: "process",
    sourceField: "status",
  },
];

export const COMMON_VARIABLES: TemplateVariable[] = [
  {
    key: "data_atual",
    label: "Data Atual",
    type: "date",
    source: "manual",
    defaultValue: new Date().toLocaleDateString("pt-BR"),
  },
  {
    key: "data_extenso",
    label: "Data por Extenso",
    type: "text",
    source: "manual",
  },
  {
    key: "cidade_estado",
    label: "Cidade/Estado (local)",
    type: "text",
    source: "manual",
  },
  {
    key: "valor",
    label: "Valor (R$)",
    type: "currency",
    source: "manual",
  },
  {
    key: "valor_extenso",
    label: "Valor por Extenso",
    type: "text",
    source: "manual",
  },
];

export const ESTIMATE_VARIABLES: TemplateVariable[] = [
  {
    key: "estimativa_custo",
    label: "Custo Estimado (R$)",
    type: "currency",
    source: "process",
    sourceField: "estimated_cost",
  },
  {
    key: "estimativa_prazo_dias",
    label: "Prazo Estimado (dias)",
    type: "number",
    source: "process",
    sourceField: "estimated_duration_days",
  },
  {
    key: "estimativa_data_conclusao",
    label: "Data Prevista de Conclusão",
    type: "date",
    source: "process",
    sourceField: "estimated_completion_date",
  },
];

export const EMPRESA_VARIABLES: TemplateVariable[] = [
  {
    key: "company_name",
    label: "Nome da Empresa",
    type: "text",
    source: "manual",
  },
  {
    key: "company_cnpj",
    label: "CNPJ da Empresa",
    type: "cnpj",
    source: "manual",
  },
  {
    key: "company_address",
    label: "Endereço da Empresa",
    type: "text",
    source: "manual",
  },
  {
    key: "company_phone",
    label: "Telefone da Empresa",
    type: "text",
    source: "manual",
  },
  {
    key: "company_email",
    label: "E-mail da Empresa",
    type: "text",
    source: "manual",
  },
];

export const PARTNER_VARIABLES: TemplateVariable[] = [
  {
    key: "parceiro_nome",
    label: "Nome do Parceiro",
    type: "text",
    source: "manual",
  },
  {
    key: "parceiro_email",
    label: "E-mail do Parceiro",
    type: "text",
    source: "manual",
  },
  {
    key: "parceiro_telefone",
    label: "Telefone do Parceiro",
    type: "text",
    source: "manual",
  },
];

export const ALL_AVAILABLE_VARIABLES: TemplateVariable[] = [
  ...PROPERTY_VARIABLES,
  ...CUSTOMER_VARIABLES,
  ...PROCESS_VARIABLES,
  ...COMMON_VARIABLES,
  ...ESTIMATE_VARIABLES,
  ...EMPRESA_VARIABLES,
  ...PARTNER_VARIABLES,
];

/* ─── Template Categories ────────────────────────────────────────────── */

export const TEMPLATE_CATEGORIES = [
  { value: "geral", label: "Geral" },
  { value: "contrato", label: "Contrato" },
  { value: "procuracao", label: "Procuração" },
  { value: "declaracao", label: "Declaração" },
  { value: "requerimento", label: "Requerimento" },
  { value: "notificacao", label: "Notificação" },
  { value: "recibo", label: "Recibo" },
  { value: "orcamento", label: "Orçamento" },
  { value: "outro", label: "Outro" },
];

/* ─── CRUD: Document Templates ───────────────────────────────────────── */

export async function listTemplates(
  tenantId?: string,
): Promise<DocumentTemplate[]> {
  const filters = tenantId
    ? buildSearchParams([{ field: "tenant_id", value: tenantId }], {
        sortColumn: "name",
      })
    : { sort_column: "name" };
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "document_templates",
    ...filters,
  });
  return normalizeList<DocumentTemplate>(res.data).filter((t) => !t.deleted_at);
}

export async function getTemplate(
  id: string,
): Promise<DocumentTemplate | null> {
  const all = await listTemplates();
  return all.find((t) => t.id === id) ?? null;
}

export async function createTemplate(
  payload: Partial<DocumentTemplate>,
): Promise<unknown> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "document_templates",
    payload: {
      ...payload,
      variables:
        typeof payload.variables === "string"
          ? payload.variables
          : JSON.stringify(payload.variables ?? []),
      page_config:
        typeof payload.page_config === "string"
          ? payload.page_config
          : JSON.stringify(
              payload.page_config ?? {
                size: "A4",
                orientation: "portrait",
                margins: { top: 20, right: 20, bottom: 20, left: 20 },
              },
            ),
    },
  });
  return res.data;
}

export async function updateTemplate(
  payload: Partial<DocumentTemplate> & { id: string },
): Promise<unknown> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "document_templates",
    payload: {
      ...payload,
      variables:
        payload.variables !== undefined
          ? typeof payload.variables === "string"
            ? payload.variables
            : JSON.stringify(payload.variables)
          : undefined,
      page_config:
        payload.page_config !== undefined
          ? typeof payload.page_config === "string"
            ? payload.page_config
            : JSON.stringify(payload.page_config)
          : undefined,
    },
  });
  return res.data;
}

export async function deleteTemplate(id: string): Promise<unknown> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "document_templates",
    payload: { id },
  });
  return res.data;
}

/* ─── CRUD: Generated Documents ──────────────────────────────────────── */

export async function listGeneratedDocuments(
  tenantId?: string,
): Promise<GeneratedDocument[]> {
  const filters = tenantId
    ? buildSearchParams([{ field: "tenant_id", value: tenantId }], {
        sortColumn: "created_at DESC",
      })
    : { sort_column: "created_at DESC" };
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "generated_documents",
    ...filters,
  });
  return normalizeList<GeneratedDocument>(res.data).filter(
    (d) => !d.deleted_at,
  );
}

export async function deleteGeneratedDocument(id: string): Promise<unknown> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "generated_documents",
    payload: { id },
  });
  return res.data;
}

export async function createGeneratedDocument(
  payload: Partial<GeneratedDocument>,
): Promise<unknown> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "generated_documents",
    payload: {
      ...payload,
      variables_used:
        typeof payload.variables_used === "string"
          ? payload.variables_used
          : JSON.stringify(payload.variables_used ?? {}),
    },
  });
  return res.data;
}

export async function updateGeneratedDocument(
  payload: Partial<GeneratedDocument> & { id: string },
): Promise<unknown> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "generated_documents",
    payload: {
      ...payload,
      variables_used:
        payload.variables_used !== undefined
          ? typeof payload.variables_used === "string"
            ? payload.variables_used
            : JSON.stringify(payload.variables_used)
          : undefined,
    },
  });
  return res.data;
}

/* ─── Variable Interpolation ─────────────────────────────────────────── */

/**
 * Replace all {{variable_key}} placeholders in an HTML string
 * with the corresponding values from the supplied map.
 */
export function interpolateVariables(
  html: string,
  values: Record<string, string>,
): string {
  return html.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return values[key] ?? `{{${key}}}`;
  });
}

/**
 * Extract all {{variable_key}} from an HTML string.
 */
export function extractVariableKeys(html: string): string[] {
  const matches = html.match(/\{\{(\w+)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.replace(/\{|\}/g, "")))];
}

/**
 * Auto-fill variable values from data sources (property, customer, etc.)
 */
export function autoFillVariables(
  variables: TemplateVariable[],
  context: {
    property?: Record<string, unknown>;
    customer?: Record<string, unknown>;
    process?: Record<string, unknown>;
    user?: Record<string, unknown>;
  },
): Record<string, string> {
  const values: Record<string, string> = {};

  for (const v of variables) {
    const src = v.source;
    const field = v.sourceField;

    if (src === "manual") {
      if (v.key === "data_atual") {
        values[v.key] = new Date().toLocaleDateString("pt-BR");
      } else if (v.key === "data_extenso") {
        values[v.key] = new Date().toLocaleDateString("pt-BR", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });
      } else if (v.defaultValue) {
        values[v.key] = v.defaultValue;
      }
      continue;
    }

    const dataSource =
      src === "property"
        ? context.property
        : src === "customer"
          ? context.customer
          : src === "process"
            ? context.process
            : src === "user"
              ? context.user
              : undefined;

    if (dataSource && field && dataSource[field] != null) {
      values[v.key] = String(dataSource[field]);
    }
  }

  return values;
}

/* ─── PDF Generation (via n8n backend) ───────────────────────────────── */

/**
 * Send filled HTML to n8n webhook to generate a PDF.
 * Returns the base64-encoded PDF data.
 */
export async function generatePdf(params: {
  html: string;
  documentName: string;
  pageConfig?: PageConfig;
}): Promise<{ pdf_base64: string; url?: string }> {
  const res = await api.post(PDF_ENDPOINT, {
    html: params.html,
    document_name: params.documentName,
    page_config: params.pageConfig ?? {
      size: "A4",
      orientation: "portrait",
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
    },
  });

  const data = res.data;
  return {
    pdf_base64: data?.pdf_base64 ?? data?.pdf ?? data?.data ?? "",
    url: data?.url ?? data?.pdf_url ?? undefined,
  };
}

/* ─── Build full HTML document for PDF generation ────────────────────── */

export function buildFullHtml(
  template: DocumentTemplate,
  filledContent: string,
): string {
  const config = parsePageConfig(template.page_config);
  const m = config.margins;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      size: ${config.size} ${config.orientation};
      margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      font-size: 12pt;
      line-height: 1.6;
      color: #222;
    }
    .doc-header { margin-bottom: 20px; text-align: center; }
    .doc-footer { margin-top: 30px; text-align: center; font-size: 10pt; color: #666; }
    .doc-body { min-height: 70vh; }
    h1 { font-size: 16pt; margin-bottom: 12px; }
    h2 { font-size: 14pt; margin-bottom: 10px; }
    h3 { font-size: 12pt; margin-bottom: 8px; }
    p { margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    .signature-line {
      margin-top: 60px;
      border-top: 1px solid #333;
      width: 300px;
      text-align: center;
      padding-top: 5px;
      font-size: 11pt;
    }
  </style>
</head>
<body>
  ${template.header_html ? `<div class="doc-header">${template.header_html}</div>` : ""}
  <div class="doc-body">${filledContent}</div>
  ${template.footer_html ? `<div class="doc-footer">${template.footer_html}</div>` : ""}
</body>
</html>`;
}

/* ─── Default template content (starter) ─────────────────────────────── */

export const STARTER_TEMPLATES = {
  contrato: `<h1 style="text-align:center;">CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1>

<p>Pelo presente instrumento particular, de um lado <strong>{{cliente_nome}}</strong>, inscrito no CPF sob nº <strong>{{cliente_cpf}}</strong>, residente e domiciliado em <strong>{{cliente_endereco}}</strong>, doravante denominado <strong>CONTRATANTE</strong>;</p>

<p>E de outro lado <strong>SOS Escritura</strong>, empresa especializada em regularização de imóveis urbanos e rurais, doravante denominada <strong>CONTRATADA</strong>;</p>

<p>Têm entre si justo e contratado o seguinte:</p>

<h2>CLÁUSULA 1ª - DO OBJETO</h2>
<p>O presente contrato tem por objeto a prestação de serviços de regularização do imóvel situado em <strong>{{imovel_endereco}}, {{imovel_numero}}</strong>, bairro <strong>{{imovel_bairro}}</strong>, na cidade de <strong>{{imovel_cidade}}/{{imovel_estado}}</strong>, CEP <strong>{{imovel_cep}}</strong>, matrícula nº <strong>{{imovel_matricula}}</strong>.</p>

<h2>CLÁUSULA 2ª - DO VALOR</h2>
<p>Pela prestação dos serviços descritos, o CONTRATANTE pagará à CONTRATADA o valor de <strong>R$ {{valor}}</strong> ({{valor_extenso}}), nas condições a seguir especificadas.</p>

<h2>CLÁUSULA 3ª - DO PRAZO</h2>
<p>O presente contrato terá vigência a partir da data de sua assinatura.</p>

<p style="text-align:center; margin-top:40px;">{{cidade_estado}}, {{data_extenso}}</p>

<div style="display:flex; justify-content:space-around; margin-top:60px;">
  <div class="signature-line">{{cliente_nome}}<br/>CONTRATANTE</div>
  <div class="signature-line">SOS Escritura<br/>CONTRATADA</div>
</div>`,

  procuracao: `<h1 style="text-align:center;">PROCURAÇÃO</h1>

<p>Eu, <strong>{{cliente_nome}}</strong>, portador(a) do CPF nº <strong>{{cliente_cpf}}</strong> e RG nº <strong>{{cliente_rg}}</strong>, residente e domiciliado(a) em <strong>{{cliente_endereco}}</strong>, pelo presente instrumento e na melhor forma de direito, nomeio e constituo meu(minha) bastante procurador(a):</p>

<p><strong>____________________________________________</strong></p>

<p>Para o fim especial de representar-me perante órgãos públicos, cartórios e repartições, com poderes para tratar de assuntos referentes ao imóvel situado em <strong>{{imovel_endereco}}, {{imovel_numero}}</strong>, na cidade de <strong>{{imovel_cidade}}/{{imovel_estado}}</strong>, podendo praticar todos os atos necessários ao fiel cumprimento deste mandato.</p>

<p style="text-align:center; margin-top:40px;">{{cidade_estado}}, {{data_extenso}}</p>

<div style="text-align:center; margin-top:60px;">
  <div class="signature-line" style="margin:0 auto;">{{cliente_nome}}<br/>OUTORGANTE</div>
</div>`,

  declaracao: `<h1 style="text-align:center;">DECLARAÇÃO</h1>

<p>Eu, <strong>{{cliente_nome}}</strong>, portador(a) do CPF nº <strong>{{cliente_cpf}}</strong>, declaro para os devidos fins que o imóvel situado em <strong>{{imovel_endereco}}, {{imovel_numero}}</strong>, bairro <strong>{{imovel_bairro}}</strong>, cidade de <strong>{{imovel_cidade}}/{{imovel_estado}}</strong>, CEP <strong>{{imovel_cep}}</strong>:</p>

<p>____________________________________________________________</p>
<p>____________________________________________________________</p>

<p>Por ser expressão da verdade, firmo a presente declaração.</p>

<p style="text-align:center; margin-top:40px;">{{cidade_estado}}, {{data_extenso}}</p>

<div style="text-align:center; margin-top:60px;">
  <div class="signature-line" style="margin:0 auto;">{{cliente_nome}}</div>
</div>`,

  requerimento: `<h1 style="text-align:center;">REQUERIMENTO</h1>

<p>Ilmo(a). Sr(a). ________________________________________</p>

<p><strong>{{cliente_nome}}</strong>, portador(a) do CPF nº <strong>{{cliente_cpf}}</strong>, residente e domiciliado(a) em <strong>{{cliente_endereco}}</strong>, vem respeitosamente requerer a Vossa Senhoria:</p>

<p>____________________________________________________________</p>
<p>____________________________________________________________</p>

<p>Nestes termos, pede deferimento.</p>

<p style="text-align:center; margin-top:40px;">{{cidade_estado}}, {{data_extenso}}</p>

<div style="text-align:center; margin-top:60px;">
  <div class="signature-line" style="margin:0 auto;">{{cliente_nome}}</div>
</div>`,

  recibo: `<h1 style="text-align:center;">RECIBO DE PAGAMENTO</h1>

<p>Recebi de <strong>{{cliente_nome}}</strong>, inscrito(a) no CPF sob nº <strong>{{cliente_cpf}}</strong>, a quantia de <strong>R$ {{valor}}</strong> ({{valor_extenso}}), referente a:</p>

<p>____________________________________________________________</p>

<p>Para maior clareza, firmo o presente recibo para que produza os efeitos legais.</p>

<p style="text-align:center; margin-top:40px;">{{cidade_estado}}, {{data_extenso}}</p>

<div style="text-align:center; margin-top:60px;">
  <div class="signature-line" style="margin:0 auto;">{{company_name}}</div>
</div>`,

  orcamento: `<h1 style="text-align:center;">ORÇAMENTO DE SERVIÇOS</h1>

<p><strong>Cliente:</strong> {{cliente_nome}}</p>
<p><strong>CPF/CNPJ:</strong> {{cliente_cpf}}</p>
<p><strong>Data:</strong> {{data_atual}}</p>

<h2>Serviço</h2>
<p>Descrição do serviço: ________________________________________</p>

<h2>Valor</h2>
<p>Valor total: <strong>R$ {{valor}}</strong> ({{valor_extenso}})</p>
<p>Prazo estimado: <strong>{{estimativa_prazo_dias}} dias úteis</strong></p>

<h2>Condições</h2>
<p>Este orçamento é válido por 30 dias a partir da data de emissão.</p>

<p style="text-align:center; margin-top:40px;">{{cidade_estado}}, {{data_extenso}}</p>

<div style="text-align:center; margin-top:60px;">
  <div class="signature-line" style="margin:0 auto;">{{company_name}}</div>
</div>`,

  notificacao: `<h1 style="text-align:center;">NOTIFICAÇÃO</h1>

<p><strong>Destinatário:</strong> {{cliente_nome}}</p>
<p><strong>CPF/CNPJ:</strong> {{cliente_cpf}}</p>
<p><strong>Endereço:</strong> {{cliente_endereco}}</p>

<p>Pela presente, fica Vossa Senhoria NOTIFICADO(A) para que, no prazo de ______ dias:</p>

<p>____________________________________________________________</p>
<p>____________________________________________________________</p>

<p>O não atendimento da presente notificação implicará nas medidas cabíveis previstas em lei.</p>

<p style="text-align:center; margin-top:40px;">{{cidade_estado}}, {{data_extenso}}</p>

<div style="text-align:center; margin-top:60px;">
  <div class="signature-line" style="margin:0 auto;">{{company_name}}</div>
</div>`,
};
