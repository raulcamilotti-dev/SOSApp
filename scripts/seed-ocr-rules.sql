-- ============================================================
-- Seed: Regras OCR para Regularização Imobiliária
-- Date: 2026-02-15
-- Especialidade: Direito Imobiliário Brasileiro
-- ============================================================
-- Este script insere regras de OCR para leitura automatizada
-- de documentos jurídicos utilizados em processos de
-- regularização de imóveis (escrituração, registro, usucapião,
-- inventário, compra e venda, retificação, georreferenciamento,
-- regularização urbana e rural).
--
-- USO:
--   node scripts/run-api-dinamico-sql.js scripts/seed-ocr-rules.sql
--
-- Ou via psql:
--   psql -U postgres -d sosapp -f scripts/seed-ocr-rules.sql
-- ============================================================

BEGIN;

-- 1. Matrícula do Imóvel (Certidão de Inteiro Teor)
INSERT INTO ocr_config (name, description, document_types, extract_features, lang, is_active)
VALUES (
  'Matrícula do Imóvel / Certidão de Inteiro Teor',
  'Extrai dados da matrícula do imóvel emitida pelo Cartório de Registro de Imóveis. Documento essencial para qualquer processo de regularização — contém todo o histórico do imóvel, cadeia dominial, ônus e averbações. Aplicar sempre que houver upload de certidão de inteiro teor ou matrícula atualizada.',
  '["matricula_imovel", "certidao_inteiro_teor", "certidao_matricula"]'::JSONB,
  '["cpf", "cnpj", "nome", "data", "endereco", "area_imovel", "matricula_imovel", "numero_documento", "cartorio", "municipio", "estado", "confrontantes", "proprietarios", "estado_civil", "regime_bens"]'::JSONB,
  'por',
  true
);

-- 2. Escritura Pública de Compra e Venda
INSERT INTO ocr_config (name, description, document_types, extract_features, lang, is_active)
VALUES (
  'Escritura Pública de Compra e Venda',
  'Extrai dados da escritura pública lavrada em Tabelionato de Notas para transferência de propriedade imobiliária. Documento obrigatório para imóveis acima de 30 salários mínimos (art. 108, CC). Contém dados completos das partes, descrição do imóvel, valor da transação e condições.',
  '["escritura_publica", "escritura_compra_venda", "escritura"]'::JSONB,
  '["cpf", "cnpj", "nome", "data", "valor", "endereco", "area_imovel", "matricula_imovel", "numero_documento", "cartorio", "municipio", "estado", "proprietarios", "estado_civil", "regime_bens"]'::JSONB,
  'por',
  true
);

-- 3. Contrato Particular de Compra e Venda
INSERT INTO ocr_config (name, description, document_types, extract_features, lang, is_active)
VALUES (
  'Contrato Particular de Compra e Venda',
  'Extrai dados de contratos particulares de compra e venda (''contrato de gaveta''). Muito comum em transações informais. Embora não tenha fé pública, é documento fundamental para comprovação de posse em processos de usucapião e regularização. Extrair partes envolvidas, valores e descrição do imóvel.',
  '["contrato_particular", "contrato_compra_venda", "contrato_gaveta", "promessa_compra_venda"]'::JSONB,
  '["cpf", "cnpj", "nome", "data", "valor", "endereco", "area_imovel", "matricula_imovel", "municipio", "estado", "proprietarios", "estado_civil", "regime_bens"]'::JSONB,
  'por',
  true
);

-- 4. Certidão Negativa de Débitos Municipais (IPTU)
INSERT INTO ocr_config (name, description, document_types, extract_features, lang, is_active)
VALUES (
  'Certidão Negativa de Débitos Municipais (IPTU)',
  'Extrai dados da CND municipal, exigida para lavratura de escritura e registro de imóvel (Lei 7.433/85). Comprova inexistência de débitos de IPTU e taxas municipais. Documento com validade limitada — verificar data de emissão e validade.',
  '["certidao_negativa_debitos", "cnd_municipal", "cnd_iptu", "certidao_tributos_municipais"]'::JSONB,
  '["cpf", "cnpj", "nome", "data", "valor", "endereco", "numero_documento", "municipio", "estado"]'::JSONB,
  'por',
  true
);

-- 5. Certidão de Ônus Reais
INSERT INTO ocr_config (name, description, document_types, extract_features, lang, is_active)
VALUES (
  'Certidão de Ônus Reais',
  'Extrai dados da certidão que informa a existência de ônus reais (hipoteca, penhora, alienação fiduciária, usufruto, servidão etc.) sobre o imóvel. Documento essencial para due diligence imobiliária e exigido em financiamentos. Emitida pelo Cartório de Registro de Imóveis.',
  '["certidao_onus_reais", "certidao_onus"]'::JSONB,
  '["cpf", "cnpj", "nome", "data", "valor", "matricula_imovel", "numero_documento", "cartorio", "municipio", "estado", "proprietarios"]'::JSONB,
  'por',
  true
);

-- 6. Certidão de Ações Reais e Pessoais Reipersecutórias
INSERT INTO ocr_config (name, description, document_types, extract_features, lang, is_active)
VALUES (
  'Certidão de Ações Reais e Pessoais Reipersecutórias',
  'Extrai dados da certidão que informa a existência de ações judiciais que possam afetar o imóvel (ações de usucapião, reivindicatórias, possessórias, etc.). Exigida pelo art. 1º da Lei 7.433/85. Emitida pela Justiça Estadual e Federal.',
  '["certidao_acoes_reais", "certidao_reipersecutorias", "certidao_acoes_pessoais"]'::JSONB,
  '["cpf", "cnpj", "nome", "data", "matricula_imovel", "numero_documento", "cartorio", "municipio", "estado"]'::JSONB,
  'por',
  true
);

-- 7. Certidão de Casamento
INSERT INTO ocr_config (name, description, document_types, extract_features, lang, is_active)
VALUES (
  'Certidão de Casamento',
  'Extrai dados da certidão de casamento, documento essencial para identificar o regime de bens entre cônjuges (comunhão parcial, universal, separação total, participação final nos aquestos). O regime de bens impacta diretamente a forma de transferência do imóvel e a necessidade de outorga conjugal.',
  '["certidao_casamento"]'::JSONB,
  '["cpf", "nome", "data", "numero_documento", "cartorio", "municipio", "estado", "estado_civil", "regime_bens"]'::JSONB,
  'por',
  true
);

-- 8. Certidão de Nascimento
INSERT INTO ocr_config (name, description, document_types, extract_features, lang, is_active)
VALUES (
  'Certidão de Nascimento',
  'Extrai dados da certidão de nascimento, utilizada para comprovação de filiação, identificação civil e verificação de estado civil (solteiro). Necessária em inventários, usucapião e para partes que nunca se casaram.',
  '["certidao_nascimento"]'::JSONB,
  '["cpf", "nome", "data", "numero_documento", "cartorio", "municipio", "estado"]'::JSONB,
  'por',
  true
);

-- 9. Certidão de Óbito
INSERT INTO ocr_config (name, description, document_types, extract_features, lang, is_active)
VALUES (
  'Certidão de Óbito',
  'Extrai dados da certidão de óbito, documento obrigatório para abertura de inventário (judicial ou extrajudicial) e transferência de bens aos herdeiros. Contém dados do falecido, data e local do óbito, estado civil e informação sobre existência de bens.',
  '["certidao_obito"]'::JSONB,
  '["cpf", "nome", "data", "numero_documento", "cartorio", "municipio", "estado", "estado_civil"]'::JSONB,
  'por',
  true
);

-- 10. RG / CPF (Documento de Identidade)
INSERT INTO ocr_config (name, description, document_types, extract_features, lang, is_active)
VALUES (
  'RG / CPF — Documento de Identidade',
  'Extrai dados de documentos de identidade (RG, CPF, CNH). Necessário para qualificação completa das partes em qualquer ato notarial ou registral. A qualificação correta é exigência do art. 176, §1º, III, da Lei 6.015/73 (Lei de Registros Públicos).',
  '["rg", "cpf", "cnh", "documento_identidade", "identidade"]'::JSONB,
  '["cpf", "nome", "data", "numero_documento", "municipio", "estado"]'::JSONB,
  'por',
  true
);

-- 11. Planta e Memorial Descritivo
INSERT INTO ocr_config (name, description, document_types, extract_features, lang, is_active)
VALUES (
  'Planta e Memorial Descritivo',
  'Extrai dados de plantas e memoriais descritivos elaborados por profissional habilitado (engenheiro/arquiteto). Documentos obrigatórios para retificação de área, desmembramento, unificação e georreferenciamento. Contêm medidas perimetrais, área, confrontantes e coordenadas georreferenciadas (INCRA/SIGEF para rurais).',
  '["planta", "memorial_descritivo", "planta_topografica", "levantamento"]'::JSONB,
  '["nome", "data", "endereco", "area_imovel", "matricula_imovel", "numero_documento", "municipio", "estado", "coordenadas", "confrontantes"]'::JSONB,
  'por',
  true
);

-- 12. ART / RRT (Anotação/Registro de Responsabilidade Técnica)
INSERT INTO ocr_config (name, description, document_types, extract_features, lang, is_active)
VALUES (
  'ART / RRT — Responsabilidade Técnica',
  'Extrai dados da Anotação de Responsabilidade Técnica (ART/CREA) ou Registro de Responsabilidade Técnica (RRT/CAU). Documento obrigatório para validar a autoria de plantas, memoriais descritivos e laudos técnicos. Exigido pelo cartório no ato da averbação ou registro.',
  '["art", "rrt", "anotacao_responsabilidade_tecnica", "registro_responsabilidade_tecnica"]'::JSONB,
  '["cpf", "cnpj", "nome", "data", "numero_documento", "municipio", "estado"]'::JSONB,
  'por',
  true
);

-- 13. CCIR / ITR (Imóvel Rural)
INSERT INTO ocr_config (name, description, document_types, extract_features, lang, is_active)
VALUES (
  'CCIR / ITR — Documentos de Imóvel Rural',
  'Extrai dados do CCIR (Certificado de Cadastro de Imóvel Rural) emitido pelo INCRA e comprovante de quitação do ITR (Imposto Territorial Rural) da Receita Federal. Documentos obrigatórios para qualquer ato de transferência de imóvel rural (art. 22 da Lei 4.947/66 e art. 21 da Lei 9.393/96).',
  '["ccir", "itr", "certificado_imovel_rural", "imposto_territorial_rural"]'::JSONB,
  '["cpf", "cnpj", "nome", "data", "valor", "endereco", "area_imovel", "numero_documento", "municipio", "estado", "coordenadas"]'::JSONB,
  'por',
  true
);

-- 14. CAR (Cadastro Ambiental Rural)
INSERT INTO ocr_config (name, description, document_types, extract_features, lang, is_active)
VALUES (
  'CAR — Cadastro Ambiental Rural',
  'Extrai dados do CAR (Cadastro Ambiental Rural), registro obrigatório para todos os imóveis rurais (Lei 12.651/12 — Código Florestal). Contém delimitação do imóvel, áreas de preservação permanente (APP), reserva legal e áreas de uso restrito. Exigido para regularização fundiária rural.',
  '["car", "cadastro_ambiental_rural"]'::JSONB,
  '["cpf", "cnpj", "nome", "data", "endereco", "area_imovel", "numero_documento", "municipio", "estado", "coordenadas"]'::JSONB,
  'por',
  true
);

-- 15. Declaração de Posse
INSERT INTO ocr_config (name, description, document_types, extract_features, lang, is_active)
VALUES (
  'Declaração de Posse',
  'Extrai dados de declarações de posse, comuns em processos de usucapião e regularização fundiária. Pode ser declaração particular, declaração de vizinhos/confrontantes ou declaração registrada em cartório. Comprova o exercício de posse mansa e pacífica sobre o imóvel.',
  '["declaracao_posse", "declaracao_ocupacao", "declaracao_vizinhos"]'::JSONB,
  '["cpf", "nome", "data", "endereco", "area_imovel", "matricula_imovel", "municipio", "estado", "confrontantes", "proprietarios"]'::JSONB,
  'por',
  true
);

-- 16. Formal de Partilha / Inventário
INSERT INTO ocr_config (name, description, document_types, extract_features, lang, is_active)
VALUES (
  'Formal de Partilha / Inventário',
  'Extrai dados do formal de partilha (judicial) ou escritura de inventário (extrajudicial). Documento que formaliza a divisão de bens do de cujus entre os herdeiros. Título hábil para registro na matrícula do imóvel. Pode conter múltiplos imóveis e herdeiros com quinhões distintos.',
  '["formal_partilha", "inventario", "escritura_inventario", "alvara_judicial"]'::JSONB,
  '["cpf", "cnpj", "nome", "data", "valor", "endereco", "area_imovel", "matricula_imovel", "numero_documento", "cartorio", "municipio", "estado", "proprietarios", "estado_civil", "regime_bens"]'::JSONB,
  'por',
  true
);

-- 17. Usucapião — Ata Notarial
INSERT INTO ocr_config (name, description, document_types, extract_features, lang, is_active)
VALUES (
  'Usucapião — Ata Notarial',
  'Extrai dados da ata notarial lavrada para fins de usucapião extrajudicial (art. 216-A da Lei 6.015/73). A ata notarial atesta o tempo de posse, a forma de utilização do imóvel e demais fatos relevantes. É peça central do procedimento de usucapião extrajudicial perante o Registro de Imóveis.',
  '["usucapiao", "ata_notarial", "usucapiao_extrajudicial"]'::JSONB,
  '["cpf", "nome", "data", "endereco", "area_imovel", "matricula_imovel", "numero_documento", "cartorio", "municipio", "estado", "coordenadas", "confrontantes", "proprietarios", "estado_civil"]'::JSONB,
  'por',
  true
);

-- 18. Comprovante de Endereço
INSERT INTO ocr_config (name, description, document_types, extract_features, lang, is_active)
VALUES (
  'Comprovante de Endereço',
  'Extrai dados de comprovantes de endereço (conta de luz, água, gás, telefone, correspondência bancária). Utilizado para comprovar domicílio das partes e, em processos de usucapião, para corroborar o exercício de posse no imóvel. Deve ser recente (geralmente últimos 3 meses).',
  '["comprovante_endereco", "conta_luz", "conta_agua", "correspondencia"]'::JSONB,
  '["cpf", "cnpj", "nome", "data", "endereco", "municipio", "estado"]'::JSONB,
  'por',
  true
);

-- 19. Espelho do IPTU
INSERT INTO ocr_config (name, description, document_types, extract_features, lang, is_active)
VALUES (
  'Espelho do IPTU',
  'Extrai dados do espelho/carnê do IPTU, que contém informações cadastrais do imóvel na prefeitura: inscrição imobiliária, área do terreno e construção, localização, valor venal e contribuinte. Utilizado para verificar a situação cadastral do imóvel e identificar divergências entre o cadastro municipal e a matrícula.',
  '["espelho_iptu", "carne_iptu", "iptu_espelho", "cadastro_imobiliario"]'::JSONB,
  '["cpf", "cnpj", "nome", "data", "valor", "endereco", "area_imovel", "numero_documento", "municipio", "estado", "proprietarios"]'::JSONB,
  'por',
  true
);

-- 20. Procuração Pública
INSERT INTO ocr_config (name, description, document_types, extract_features, lang, is_active)
VALUES (
  'Procuração Pública',
  'Extrai dados de procurações públicas lavradas em Tabelionato de Notas. Necessária quando uma das partes é representada por procurador em atos de compra/venda, escrituração ou inventário. Deve conter poderes específicos para o ato (ad negotia). Verificar prazo de validade e se os poderes são suficientes para o ato pretendido.',
  '["procuracao_publica", "procuracao", "substabelecimento"]'::JSONB,
  '["cpf", "cnpj", "nome", "data", "numero_documento", "cartorio", "municipio", "estado", "estado_civil"]'::JSONB,
  'por',
  true
);

-- ============================================================
-- Verificação final
-- ============================================================
SELECT
  name,
  jsonb_array_length(document_types) AS doc_types_count,
  jsonb_array_length(extract_features) AS features_count,
  is_active
FROM ocr_config
WHERE deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 20;

COMMIT;
