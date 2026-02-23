-- ============================================================
-- Update: Preencher dados faltantes nas regras OCR
-- Date: 2026-02-15
-- USO:
--   node scripts/run-api-dinamico-sql.js scripts/update-ocr-rules.sql
-- ============================================================

-- 1. Matrícula do Imóvel / Certidão de Inteiro Teor
UPDATE ocr_config SET
  description = 'Extrai dados da matrícula do imóvel emitida pelo Cartório de Registro de Imóveis. Documento essencial para qualquer processo de regularização — contém todo o histórico do imóvel, cadeia dominial, ônus e averbações. Aplicar sempre que houver upload de certidão de inteiro teor ou matrícula atualizada.',
  document_types = '["matricula_imovel","certidao_inteiro_teor","certidao_matricula"]'::JSONB,
  extract_features = '["cpf","cnpj","nome","data","endereco","area_imovel","matricula_imovel","numero_documento","cartorio","municipio","estado","confrontantes","proprietarios","estado_civil","regime_bens"]'::JSONB,
  lang = 'por',
  updated_at = NOW()
WHERE name = 'Matrícula do Imóvel / Certidão de Inteiro Teor' AND deleted_at IS NULL;

-- 2. Escritura Pública de Compra e Venda
UPDATE ocr_config SET
  description = 'Extrai dados da escritura pública lavrada em Tabelionato de Notas para transferência de propriedade imobiliária. Documento obrigatório para imóveis acima de 30 salários mínimos (art. 108, CC). Contém dados completos das partes, descrição do imóvel, valor da transação e condições.',
  document_types = '["escritura_publica","escritura_compra_venda","escritura"]'::JSONB,
  extract_features = '["cpf","cnpj","nome","data","valor","endereco","area_imovel","matricula_imovel","numero_documento","cartorio","municipio","estado","proprietarios","estado_civil","regime_bens"]'::JSONB,
  lang = 'por',
  updated_at = NOW()
WHERE name = 'Escritura Pública de Compra e Venda' AND deleted_at IS NULL;

-- 3. Contrato Particular de Compra e Venda
UPDATE ocr_config SET
  description = 'Extrai dados de contratos particulares de compra e venda (''contrato de gaveta''). Muito comum em transações informais. Embora não tenha fé pública, é documento fundamental para comprovação de posse em processos de usucapião e regularização.',
  document_types = '["contrato_particular","contrato_compra_venda","contrato_gaveta","promessa_compra_venda"]'::JSONB,
  extract_features = '["cpf","cnpj","nome","data","valor","endereco","area_imovel","matricula_imovel","municipio","estado","proprietarios","estado_civil","regime_bens"]'::JSONB,
  lang = 'por',
  updated_at = NOW()
WHERE name = 'Contrato Particular de Compra e Venda' AND deleted_at IS NULL;

-- 4. Certidão Negativa de Débitos Municipais (IPTU)
UPDATE ocr_config SET
  description = 'Extrai dados da CND municipal, exigida para lavratura de escritura e registro de imóvel (Lei 7.433/85). Comprova inexistência de débitos de IPTU e taxas municipais. Documento com validade limitada — verificar data de emissão e validade.',
  document_types = '["certidao_negativa_debitos","cnd_municipal","cnd_iptu","certidao_tributos_municipais"]'::JSONB,
  extract_features = '["cpf","cnpj","nome","data","valor","endereco","numero_documento","municipio","estado"]'::JSONB,
  lang = 'por',
  updated_at = NOW()
WHERE name = 'Certidão Negativa de Débitos Municipais (IPTU)' AND deleted_at IS NULL;

-- 5. Certidão de Ônus Reais
UPDATE ocr_config SET
  description = 'Extrai dados da certidão que informa a existência de ônus reais (hipoteca, penhora, alienação fiduciária, usufruto, servidão etc.) sobre o imóvel. Documento essencial para due diligence imobiliária e exigido em financiamentos. Emitida pelo Cartório de Registro de Imóveis.',
  document_types = '["certidao_onus_reais","certidao_onus"]'::JSONB,
  extract_features = '["cpf","cnpj","nome","data","valor","matricula_imovel","numero_documento","cartorio","municipio","estado","proprietarios"]'::JSONB,
  lang = 'por',
  updated_at = NOW()
WHERE name = 'Certidão de Ônus Reais' AND deleted_at IS NULL;

-- 6. Certidão de Ações Reais e Pessoais Reipersecutórias
UPDATE ocr_config SET
  description = 'Extrai dados da certidão que informa a existência de ações judiciais que possam afetar o imóvel (ações de usucapião, reivindicatórias, possessórias, etc.). Exigida pelo art. 1º da Lei 7.433/85. Emitida pela Justiça Estadual e Federal.',
  document_types = '["certidao_acoes_reais","certidao_reipersecutorias","certidao_acoes_pessoais"]'::JSONB,
  extract_features = '["cpf","cnpj","nome","data","matricula_imovel","numero_documento","cartorio","municipio","estado"]'::JSONB,
  lang = 'por',
  updated_at = NOW()
WHERE name = 'Certidão de Ações Reais e Pessoais Reipersecutórias' AND deleted_at IS NULL;

-- 7. Certidão de Casamento
UPDATE ocr_config SET
  description = 'Extrai dados da certidão de casamento, documento essencial para identificar o regime de bens entre cônjuges (comunhão parcial, universal, separação total, participação final nos aquestos). O regime de bens impacta diretamente a forma de transferência do imóvel e a necessidade de outorga conjugal.',
  document_types = '["certidao_casamento"]'::JSONB,
  extract_features = '["cpf","nome","data","numero_documento","cartorio","municipio","estado","estado_civil","regime_bens"]'::JSONB,
  lang = 'por',
  updated_at = NOW()
WHERE name = 'Certidão de Casamento' AND deleted_at IS NULL;

-- 8. Certidão de Nascimento
UPDATE ocr_config SET
  description = 'Extrai dados da certidão de nascimento, utilizada para comprovação de filiação, identificação civil e verificação de estado civil (solteiro). Necessária em inventários, usucapião e para partes que nunca se casaram.',
  document_types = '["certidao_nascimento"]'::JSONB,
  extract_features = '["cpf","nome","data","numero_documento","cartorio","municipio","estado"]'::JSONB,
  lang = 'por',
  updated_at = NOW()
WHERE name = 'Certidão de Nascimento' AND deleted_at IS NULL;

-- 9. Certidão de Óbito
UPDATE ocr_config SET
  description = 'Extrai dados da certidão de óbito, documento obrigatório para abertura de inventário (judicial ou extrajudicial) e transferência de bens aos herdeiros. Contém dados do falecido, data e local do óbito, estado civil e informação sobre existência de bens.',
  document_types = '["certidao_obito"]'::JSONB,
  extract_features = '["cpf","nome","data","numero_documento","cartorio","municipio","estado","estado_civil"]'::JSONB,
  lang = 'por',
  updated_at = NOW()
WHERE name = 'Certidão de Óbito' AND deleted_at IS NULL;

-- 10. RG / CPF — Documento de Identidade
UPDATE ocr_config SET
  description = 'Extrai dados de documentos de identidade (RG, CPF, CNH). Necessário para qualificação completa das partes em qualquer ato notarial ou registral. A qualificação correta é exigência do art. 176, §1º, III, da Lei 6.015/73 (Lei de Registros Públicos).',
  document_types = '["rg","cpf","cnh","documento_identidade","identidade"]'::JSONB,
  extract_features = '["cpf","nome","data","numero_documento","municipio","estado"]'::JSONB,
  lang = 'por',
  updated_at = NOW()
WHERE name = 'RG / CPF — Documento de Identidade' AND deleted_at IS NULL;

-- 11. Planta e Memorial Descritivo
UPDATE ocr_config SET
  description = 'Extrai dados de plantas e memoriais descritivos elaborados por profissional habilitado (engenheiro/arquiteto). Documentos obrigatórios para retificação de área, desmembramento, unificação e georreferenciamento. Contêm medidas perimetrais, área, confrontantes e coordenadas georreferenciadas (INCRA/SIGEF para rurais).',
  document_types = '["planta","memorial_descritivo","planta_topografica","levantamento"]'::JSONB,
  extract_features = '["nome","data","endereco","area_imovel","matricula_imovel","numero_documento","municipio","estado","coordenadas","confrontantes"]'::JSONB,
  lang = 'por',
  updated_at = NOW()
WHERE name = 'Planta e Memorial Descritivo' AND deleted_at IS NULL;

-- 12. ART / RRT — Responsabilidade Técnica
UPDATE ocr_config SET
  description = 'Extrai dados da Anotação de Responsabilidade Técnica (ART/CREA) ou Registro de Responsabilidade Técnica (RRT/CAU). Documento obrigatório para validar a autoria de plantas, memoriais descritivos e laudos técnicos. Exigido pelo cartório no ato da averbação ou registro.',
  document_types = '["art","rrt","anotacao_responsabilidade_tecnica","registro_responsabilidade_tecnica"]'::JSONB,
  extract_features = '["cpf","cnpj","nome","data","numero_documento","municipio","estado"]'::JSONB,
  lang = 'por',
  updated_at = NOW()
WHERE name = 'ART / RRT — Responsabilidade Técnica' AND deleted_at IS NULL;

-- 13. CCIR / ITR — Documentos de Imóvel Rural
UPDATE ocr_config SET
  description = 'Extrai dados do CCIR (Certificado de Cadastro de Imóvel Rural) emitido pelo INCRA e comprovante de quitação do ITR (Imposto Territorial Rural) da Receita Federal. Documentos obrigatórios para qualquer ato de transferência de imóvel rural (art. 22 da Lei 4.947/66 e art. 21 da Lei 9.393/96).',
  document_types = '["ccir","itr","certificado_imovel_rural","imposto_territorial_rural"]'::JSONB,
  extract_features = '["cpf","cnpj","nome","data","valor","endereco","area_imovel","numero_documento","municipio","estado","coordenadas"]'::JSONB,
  lang = 'por',
  updated_at = NOW()
WHERE name = 'CCIR / ITR — Documentos de Imóvel Rural' AND deleted_at IS NULL;

-- 14. CAR — Cadastro Ambiental Rural
UPDATE ocr_config SET
  description = 'Extrai dados do CAR (Cadastro Ambiental Rural), registro obrigatório para todos os imóveis rurais (Lei 12.651/12 — Código Florestal). Contém delimitação do imóvel, áreas de preservação permanente (APP), reserva legal e áreas de uso restrito. Exigido para regularização fundiária rural.',
  document_types = '["car","cadastro_ambiental_rural"]'::JSONB,
  extract_features = '["cpf","cnpj","nome","data","endereco","area_imovel","numero_documento","municipio","estado","coordenadas"]'::JSONB,
  lang = 'por',
  updated_at = NOW()
WHERE name = 'CAR — Cadastro Ambiental Rural' AND deleted_at IS NULL;

-- 15. Declaração de Posse
UPDATE ocr_config SET
  description = 'Extrai dados de declarações de posse, comuns em processos de usucapião e regularização fundiária. Pode ser declaração particular, declaração de vizinhos/confrontantes ou declaração registrada em cartório. Comprova o exercício de posse mansa e pacífica sobre o imóvel.',
  document_types = '["declaracao_posse","declaracao_ocupacao","declaracao_vizinhos"]'::JSONB,
  extract_features = '["cpf","nome","data","endereco","area_imovel","matricula_imovel","municipio","estado","confrontantes","proprietarios"]'::JSONB,
  lang = 'por',
  updated_at = NOW()
WHERE name = 'Declaração de Posse' AND deleted_at IS NULL;

-- 16. Formal de Partilha / Inventário
UPDATE ocr_config SET
  description = 'Extrai dados do formal de partilha (judicial) ou escritura de inventário (extrajudicial). Documento que formaliza a divisão de bens do de cujus entre os herdeiros. Título hábil para registro na matrícula do imóvel. Pode conter múltiplos imóveis e herdeiros com quinhões distintos.',
  document_types = '["formal_partilha","inventario","escritura_inventario","alvara_judicial"]'::JSONB,
  extract_features = '["cpf","cnpj","nome","data","valor","endereco","area_imovel","matricula_imovel","numero_documento","cartorio","municipio","estado","proprietarios","estado_civil","regime_bens"]'::JSONB,
  lang = 'por',
  updated_at = NOW()
WHERE name = 'Formal de Partilha / Inventário' AND deleted_at IS NULL;

-- 17. Usucapião — Ata Notarial
UPDATE ocr_config SET
  description = 'Extrai dados da ata notarial lavrada para fins de usucapião extrajudicial (art. 216-A da Lei 6.015/73). A ata notarial atesta o tempo de posse, a forma de utilização do imóvel e demais fatos relevantes. É peça central do procedimento de usucapião extrajudicial perante o Registro de Imóveis.',
  document_types = '["usucapiao","ata_notarial","usucapiao_extrajudicial"]'::JSONB,
  extract_features = '["cpf","nome","data","endereco","area_imovel","matricula_imovel","numero_documento","cartorio","municipio","estado","coordenadas","confrontantes","proprietarios","estado_civil"]'::JSONB,
  lang = 'por',
  updated_at = NOW()
WHERE name = 'Usucapião — Ata Notarial' AND deleted_at IS NULL;

-- 18. Comprovante de Endereço
UPDATE ocr_config SET
  description = 'Extrai dados de comprovantes de endereço (conta de luz, água, gás, telefone, correspondência bancária). Utilizado para comprovar domicílio das partes e, em processos de usucapião, para corroborar o exercício de posse no imóvel. Deve ser recente (geralmente últimos 3 meses).',
  document_types = '["comprovante_endereco","conta_luz","conta_agua","correspondencia"]'::JSONB,
  extract_features = '["cpf","cnpj","nome","data","endereco","municipio","estado"]'::JSONB,
  lang = 'por',
  updated_at = NOW()
WHERE name = 'Comprovante de Endereço' AND deleted_at IS NULL;

-- 19. Espelho do IPTU
UPDATE ocr_config SET
  description = 'Extrai dados do espelho/carnê do IPTU, que contém informações cadastrais do imóvel na prefeitura: inscrição imobiliária, área do terreno e construção, localização, valor venal e contribuinte. Utilizado para verificar a situação cadastral do imóvel e identificar divergências entre o cadastro municipal e a matrícula.',
  document_types = '["espelho_iptu","carne_iptu","iptu_espelho","cadastro_imobiliario"]'::JSONB,
  extract_features = '["cpf","cnpj","nome","data","valor","endereco","area_imovel","numero_documento","municipio","estado","proprietarios"]'::JSONB,
  lang = 'por',
  updated_at = NOW()
WHERE name = 'Espelho do IPTU' AND deleted_at IS NULL;

-- 20. Procuração Pública
UPDATE ocr_config SET
  description = 'Extrai dados de procurações públicas lavradas em Tabelionato de Notas. Necessária quando uma das partes é representada por procurador em atos de compra/venda, escrituração ou inventário. Deve conter poderes específicos para o ato (ad negotia). Verificar prazo de validade e se os poderes são suficientes para o ato pretendido.',
  document_types = '["procuracao_publica","procuracao","substabelecimento"]'::JSONB,
  extract_features = '["cpf","cnpj","nome","data","numero_documento","cartorio","municipio","estado","estado_civil"]'::JSONB,
  lang = 'por',
  updated_at = NOW()
WHERE name = 'Procuração Pública' AND deleted_at IS NULL;

-- ============================================================
-- Verificação
-- ============================================================
SELECT
  name,
  CASE WHEN description IS NOT NULL AND description <> '' THEN 'OK' ELSE 'FALTA' END AS descricao,
  CASE WHEN document_types IS NOT NULL AND document_types <> '[]'::JSONB THEN jsonb_array_length(document_types)::TEXT ELSE 'FALTA' END AS doc_types,
  CASE WHEN extract_features IS NOT NULL AND extract_features <> '[]'::JSONB THEN jsonb_array_length(extract_features)::TEXT ELSE 'FALTA' END AS features,
  lang,
  is_active
FROM ocr_config
WHERE deleted_at IS NULL
ORDER BY created_at;
