/**
 * Seed OCR rules via api_crud endpoint (N8N)
 *
 * Cria 20 regras de OCR para documentos de regularização imobiliária.
 * Usa o endpoint dinâmico — não precisa de acesso direto ao banco.
 *
 * USO:
 *   node scripts/seed-ocr-rules-api.js
 *   node scripts/seed-ocr-rules-api.js --tenant <TENANT_ID>
 *   node scripts/seed-ocr-rules-api.js --dry-run
 */

const https = require("https");
const { Buffer } = require("buffer");

const ENDPOINT =
  process.env.API_CRUD_URL ||
  "https://n8n.sosescritura.com.br/webhook/api_crud";

// Parse args
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const tenantIdx = args.indexOf("--tenant");
const tenantId = tenantIdx !== -1 ? args[tenantIdx + 1] : null;

// ============================================================
// 20 Regras OCR — Regularização Imobiliária
// ============================================================

const OCR_RULES = [
  {
    name: "Matrícula do Imóvel / Certidão de Inteiro Teor",
    description:
      "Extrai dados da matrícula do imóvel emitida pelo Cartório de Registro de Imóveis. Documento essencial para qualquer processo de regularização — contém todo o histórico do imóvel, cadeia dominial, ônus e averbações. Aplicar sempre que houver upload de certidão de inteiro teor ou matrícula atualizada.",
    document_types: [
      "matricula_imovel",
      "certidao_inteiro_teor",
      "certidao_matricula",
    ],
    extract_features: [
      "cpf",
      "cnpj",
      "nome",
      "data",
      "endereco",
      "area_imovel",
      "matricula_imovel",
      "numero_documento",
      "cartorio",
      "municipio",
      "estado",
      "confrontantes",
      "proprietarios",
      "estado_civil",
      "regime_bens",
    ],
  },
  {
    name: "Escritura Pública de Compra e Venda",
    description:
      "Extrai dados da escritura pública lavrada em Tabelionato de Notas para transferência de propriedade imobiliária. Documento obrigatório para imóveis acima de 30 salários mínimos (art. 108, CC). Contém dados completos das partes, descrição do imóvel, valor da transação e condições.",
    document_types: [
      "escritura_publica",
      "escritura_compra_venda",
      "escritura",
    ],
    extract_features: [
      "cpf",
      "cnpj",
      "nome",
      "data",
      "valor",
      "endereco",
      "area_imovel",
      "matricula_imovel",
      "numero_documento",
      "cartorio",
      "municipio",
      "estado",
      "proprietarios",
      "estado_civil",
      "regime_bens",
    ],
  },
  {
    name: "Contrato Particular de Compra e Venda",
    description:
      "Extrai dados de contratos particulares de compra e venda ('contrato de gaveta'). Muito comum em transações informais. Embora não tenha fé pública, é documento fundamental para comprovação de posse em processos de usucapião e regularização.",
    document_types: [
      "contrato_particular",
      "contrato_compra_venda",
      "contrato_gaveta",
      "promessa_compra_venda",
    ],
    extract_features: [
      "cpf",
      "cnpj",
      "nome",
      "data",
      "valor",
      "endereco",
      "area_imovel",
      "matricula_imovel",
      "municipio",
      "estado",
      "proprietarios",
      "estado_civil",
      "regime_bens",
    ],
  },
  {
    name: "Certidão Negativa de Débitos Municipais (IPTU)",
    description:
      "Extrai dados da CND municipal, exigida para lavratura de escritura e registro de imóvel (Lei 7.433/85). Comprova inexistência de débitos de IPTU e taxas municipais. Documento com validade limitada — verificar data de emissão e validade.",
    document_types: [
      "certidao_negativa_debitos",
      "cnd_municipal",
      "cnd_iptu",
      "certidao_tributos_municipais",
    ],
    extract_features: [
      "cpf",
      "cnpj",
      "nome",
      "data",
      "valor",
      "endereco",
      "numero_documento",
      "municipio",
      "estado",
    ],
  },
  {
    name: "Certidão de Ônus Reais",
    description:
      "Extrai dados da certidão que informa a existência de ônus reais (hipoteca, penhora, alienação fiduciária, usufruto, servidão etc.) sobre o imóvel. Documento essencial para due diligence imobiliária e exigido em financiamentos.",
    document_types: ["certidao_onus_reais", "certidao_onus"],
    extract_features: [
      "cpf",
      "cnpj",
      "nome",
      "data",
      "valor",
      "matricula_imovel",
      "numero_documento",
      "cartorio",
      "municipio",
      "estado",
      "proprietarios",
    ],
  },
  {
    name: "Certidão de Ações Reais e Pessoais Reipersecutórias",
    description:
      "Extrai dados da certidão que informa a existência de ações judiciais que possam afetar o imóvel (ações de usucapião, reivindicatórias, possessórias, etc.). Exigida pelo art. 1º da Lei 7.433/85.",
    document_types: [
      "certidao_acoes_reais",
      "certidao_reipersecutorias",
      "certidao_acoes_pessoais",
    ],
    extract_features: [
      "cpf",
      "cnpj",
      "nome",
      "data",
      "matricula_imovel",
      "numero_documento",
      "cartorio",
      "municipio",
      "estado",
    ],
  },
  {
    name: "Certidão de Casamento",
    description:
      "Extrai dados da certidão de casamento. O regime de bens impacta diretamente a forma de transferência do imóvel e a necessidade de outorga conjugal (art. 1.647, CC).",
    document_types: ["certidao_casamento"],
    extract_features: [
      "cpf",
      "nome",
      "data",
      "numero_documento",
      "cartorio",
      "municipio",
      "estado",
      "estado_civil",
      "regime_bens",
    ],
  },
  {
    name: "Certidão de Nascimento",
    description:
      "Extrai dados da certidão de nascimento, utilizada para comprovação de filiação, identificação civil e verificação de estado civil (solteiro). Necessária em inventários, usucapião e para partes que nunca se casaram.",
    document_types: ["certidao_nascimento"],
    extract_features: [
      "cpf",
      "nome",
      "data",
      "numero_documento",
      "cartorio",
      "municipio",
      "estado",
    ],
  },
  {
    name: "Certidão de Óbito",
    description:
      "Extrai dados da certidão de óbito, documento obrigatório para abertura de inventário (judicial ou extrajudicial) e transferência de bens aos herdeiros.",
    document_types: ["certidao_obito"],
    extract_features: [
      "cpf",
      "nome",
      "data",
      "numero_documento",
      "cartorio",
      "municipio",
      "estado",
      "estado_civil",
    ],
  },
  {
    name: "RG / CPF — Documento de Identidade",
    description:
      "Extrai dados de documentos de identidade (RG, CPF, CNH). Necessário para qualificação completa das partes em qualquer ato notarial ou registral (art. 176, §1º, III, Lei 6.015/73).",
    document_types: ["rg", "cpf", "cnh", "documento_identidade", "identidade"],
    extract_features: [
      "cpf",
      "nome",
      "data",
      "numero_documento",
      "municipio",
      "estado",
    ],
  },
  {
    name: "Planta e Memorial Descritivo",
    description:
      "Extrai dados de plantas e memoriais descritivos elaborados por profissional habilitado. Documentos obrigatórios para retificação de área, desmembramento, unificação e georreferenciamento.",
    document_types: [
      "planta",
      "memorial_descritivo",
      "planta_topografica",
      "levantamento",
    ],
    extract_features: [
      "nome",
      "data",
      "endereco",
      "area_imovel",
      "matricula_imovel",
      "numero_documento",
      "municipio",
      "estado",
      "coordenadas",
      "confrontantes",
    ],
  },
  {
    name: "ART / RRT — Responsabilidade Técnica",
    description:
      "Extrai dados da ART (CREA) ou RRT (CAU). Documento obrigatório para validar autoria de plantas, memoriais descritivos e laudos técnicos. Exigido pelo cartório no ato da averbação ou registro.",
    document_types: [
      "art",
      "rrt",
      "anotacao_responsabilidade_tecnica",
      "registro_responsabilidade_tecnica",
    ],
    extract_features: [
      "cpf",
      "cnpj",
      "nome",
      "data",
      "numero_documento",
      "municipio",
      "estado",
    ],
  },
  {
    name: "CCIR / ITR — Documentos de Imóvel Rural",
    description:
      "Extrai dados do CCIR (INCRA) e comprovante de quitação do ITR (Receita Federal). Obrigatórios para qualquer transferência de imóvel rural (art. 22, Lei 4.947/66 e art. 21, Lei 9.393/96).",
    document_types: [
      "ccir",
      "itr",
      "certificado_imovel_rural",
      "imposto_territorial_rural",
    ],
    extract_features: [
      "cpf",
      "cnpj",
      "nome",
      "data",
      "valor",
      "endereco",
      "area_imovel",
      "numero_documento",
      "municipio",
      "estado",
      "coordenadas",
    ],
  },
  {
    name: "CAR — Cadastro Ambiental Rural",
    description:
      "Extrai dados do CAR, registro obrigatório para todos os imóveis rurais (Lei 12.651/12 — Código Florestal). Contém delimitação do imóvel, APP, reserva legal e áreas de uso restrito.",
    document_types: ["car", "cadastro_ambiental_rural"],
    extract_features: [
      "cpf",
      "cnpj",
      "nome",
      "data",
      "endereco",
      "area_imovel",
      "numero_documento",
      "municipio",
      "estado",
      "coordenadas",
    ],
  },
  {
    name: "Declaração de Posse",
    description:
      "Extrai dados de declarações de posse, comuns em processos de usucapião e regularização fundiária. Pode ser declaração particular, de vizinhos/confrontantes ou registrada em cartório.",
    document_types: [
      "declaracao_posse",
      "declaracao_ocupacao",
      "declaracao_vizinhos",
    ],
    extract_features: [
      "cpf",
      "nome",
      "data",
      "endereco",
      "area_imovel",
      "matricula_imovel",
      "municipio",
      "estado",
      "confrontantes",
      "proprietarios",
    ],
  },
  {
    name: "Formal de Partilha / Inventário",
    description:
      "Extrai dados do formal de partilha (judicial) ou escritura de inventário (extrajudicial). Formaliza a divisão de bens do de cujus entre os herdeiros. Título hábil para registro na matrícula.",
    document_types: [
      "formal_partilha",
      "inventario",
      "escritura_inventario",
      "alvara_judicial",
    ],
    extract_features: [
      "cpf",
      "cnpj",
      "nome",
      "data",
      "valor",
      "endereco",
      "area_imovel",
      "matricula_imovel",
      "numero_documento",
      "cartorio",
      "municipio",
      "estado",
      "proprietarios",
      "estado_civil",
      "regime_bens",
    ],
  },
  {
    name: "Usucapião — Ata Notarial",
    description:
      "Extrai dados da ata notarial lavrada para fins de usucapião extrajudicial (art. 216-A, Lei 6.015/73). Atesta tempo de posse, forma de utilização e demais fatos relevantes.",
    document_types: ["usucapiao", "ata_notarial", "usucapiao_extrajudicial"],
    extract_features: [
      "cpf",
      "nome",
      "data",
      "endereco",
      "area_imovel",
      "matricula_imovel",
      "numero_documento",
      "cartorio",
      "municipio",
      "estado",
      "coordenadas",
      "confrontantes",
      "proprietarios",
      "estado_civil",
    ],
  },
  {
    name: "Comprovante de Endereço",
    description:
      "Extrai dados de comprovantes de endereço (conta de luz, água, gás, telefone, correspondência bancária). Utilizado para comprovar domicílio e, em usucapião, corroborar posse no imóvel.",
    document_types: [
      "comprovante_endereco",
      "conta_luz",
      "conta_agua",
      "correspondencia",
    ],
    extract_features: [
      "cpf",
      "cnpj",
      "nome",
      "data",
      "endereco",
      "municipio",
      "estado",
    ],
  },
  {
    name: "Espelho do IPTU",
    description:
      "Extrai dados do espelho/carnê do IPTU — inscrição imobiliária, área do terreno e construção, localização, valor venal e contribuinte. Utilizado para verificar situação cadastral e identificar divergências entre cadastro municipal e matrícula.",
    document_types: [
      "espelho_iptu",
      "carne_iptu",
      "iptu_espelho",
      "cadastro_imobiliario",
    ],
    extract_features: [
      "cpf",
      "cnpj",
      "nome",
      "data",
      "valor",
      "endereco",
      "area_imovel",
      "numero_documento",
      "municipio",
      "estado",
      "proprietarios",
    ],
  },
  {
    name: "Procuração Pública",
    description:
      "Extrai dados de procurações públicas lavradas em Tabelionato de Notas. Necessária quando uma das partes é representada por procurador em atos de compra/venda, escrituração ou inventário. Verificar poderes específicos e prazo de validade.",
    document_types: ["procuracao_publica", "procuracao", "substabelecimento"],
    extract_features: [
      "cpf",
      "cnpj",
      "nome",
      "data",
      "numero_documento",
      "cartorio",
      "municipio",
      "estado",
      "estado_civil",
    ],
  },
];

// ============================================================
// HTTP helper
// ============================================================

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const parsed = new URL(url);
    const mod = parsed.protocol === "https:" ? https : require("http");

    const req = mod.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          let parsed;
          try {
            parsed = JSON.parse(body);
          } catch {
            parsed = body;
          }
          resolve({ status: res.statusCode || 0, data: parsed });
        });
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log("========================================================");
  console.log("  SEED OCR RULES — Regularização Imobiliária (20 regras)");
  console.log("========================================================");
  console.log(`  Endpoint: ${ENDPOINT}`);
  console.log(`  Tenant:   ${tenantId || "(sem tenant — global)"}`);
  console.log(`  Dry-run:  ${dryRun}`);
  console.log("");

  let success = 0;
  let failed = 0;

  for (const rule of OCR_RULES) {
    const payload = {
      name: rule.name,
      description: rule.description,
      document_types: JSON.stringify(rule.document_types),
      extract_features: JSON.stringify(rule.extract_features),
      lang: "por",
      is_active: true,
    };

    if (tenantId) {
      payload.tenant_id = tenantId;
    }

    if (dryRun) {
      console.log(`[DRY-RUN] ${rule.name}`);
      console.log(
        `  doc_types: ${rule.document_types.length}  features: ${rule.extract_features.length}`,
      );
      success++;
      continue;
    }

    try {
      const res = await postJson(ENDPOINT, {
        action: "create",
        table: "ocr_config",
        payload,
      });

      if (res.status >= 200 && res.status < 300) {
        const id = res.data?.data?.id || res.data?.id || "?";
        console.log(`✅ ${rule.name}  (id: ${id})`);
        success++;
      } else {
        console.error(
          `❌ ${rule.name} — HTTP ${res.status}:`,
          JSON.stringify(res.data).substring(0, 200),
        );
        failed++;
      }
    } catch (err) {
      console.error(`❌ ${rule.name} — ${err.message}`);
      failed++;
    }
  }

  console.log("");
  console.log("========================================================");
  console.log(`  Resultado: ${success} criadas, ${failed} falharam`);
  console.log("========================================================");

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
