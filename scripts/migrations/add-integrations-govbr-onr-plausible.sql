-- ============================================================
-- Migration: Add Gov.br, ONR/SREI, BrasilAPI, Plausible support
-- Date: 2026-02-15
-- Run:
--   node scripts/run-api-dinamico-sql.js scripts/migrations/add-integrations-govbr-onr-plausible.sql
--
-- Adds:
--   1. Gov.br columns to users table
--   2. ONR/SREI columns to properties table
--   3. onr_protocolos table
--   4. onr_certidoes table
--   5. brasil_api_cache table (CEP/CNPJ cache)
--   6. analytics_events table (Plausible local mirror)
-- ============================================================

-- ============================================================
-- 1. GOV.BR — Colunas na tabela users
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS govbr_sub VARCHAR(20);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS govbr_nivel_confianca VARCHAR(10);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS govbr_access_token TEXT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS govbr_id_token TEXT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS govbr_last_login TIMESTAMPTZ;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS picture TEXT;

-- Índice para busca por CPF via Gov.br (sub = CPF)
CREATE INDEX IF NOT EXISTS idx_users_govbr_sub ON users (govbr_sub) WHERE govbr_sub IS NOT NULL;


-- ============================================================
-- 2. ONR/SREI — Colunas na tabela properties
-- ============================================================

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS onr_protocolo_numero VARCHAR(50);

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS onr_protocolo_status VARCHAR(30);

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS onr_cartorio_cns VARCHAR(30);

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS onr_protocolo_data TIMESTAMPTZ;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS onr_protocolo_previsao TIMESTAMPTZ;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS onr_protocolo_conclusao TIMESTAMPTZ;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS onr_valor_emolumentos NUMERIC(12,2);

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS onr_matricula_numero VARCHAR(30);

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS onr_matricula_livro VARCHAR(20);

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS onr_comarca VARCHAR(100);

-- Índice para busca por protocolo
CREATE INDEX IF NOT EXISTS idx_properties_onr_protocolo ON properties (onr_protocolo_numero) WHERE onr_protocolo_numero IS NOT NULL;


-- ============================================================
-- 3. ONR Protocolos — Tabela dedicada (histórico completo)
-- ============================================================

CREATE TABLE IF NOT EXISTS onr_protocolos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  property_id UUID REFERENCES properties(id),
  numero_protocolo VARCHAR(50) NOT NULL,
  cartorio_cns VARCHAR(30) NOT NULL,
  tipo_ato VARCHAR(30) NOT NULL DEFAULT 'regularizacao',
  status VARCHAR(30) NOT NULL DEFAULT 'protocolado',
  data_protocolo TIMESTAMPTZ DEFAULT NOW(),
  data_previsao TIMESTAMPTZ,
  data_conclusao TIMESTAMPTZ,
  observacoes TEXT,
  documentos JSONB DEFAULT '[]',
  exigencias JSONB DEFAULT '[]',
  valor_emolumentos NUMERIC(12,2),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_onr_protocolos_tenant ON onr_protocolos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_onr_protocolos_property ON onr_protocolos (property_id);
CREATE INDEX IF NOT EXISTS idx_onr_protocolos_status ON onr_protocolos (status);
CREATE INDEX IF NOT EXISTS idx_onr_protocolos_numero ON onr_protocolos (numero_protocolo);


-- ============================================================
-- 4. ONR Certidões — Tabela dedicada
-- ============================================================

CREATE TABLE IF NOT EXISTS onr_certidoes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  property_id UUID REFERENCES properties(id),
  tipo VARCHAR(30) NOT NULL,
  numero VARCHAR(50),
  matricula VARCHAR(30) NOT NULL,
  cartorio_cns VARCHAR(30) NOT NULL,
  data_emissao TIMESTAMPTZ,
  data_validade TIMESTAMPTZ,
  pdf_url TEXT,
  hash_verificacao VARCHAR(128),
  status VARCHAR(20) NOT NULL DEFAULT 'solicitada',
  valor NUMERIC(10,2),
  solicitante_nome VARCHAR(200),
  solicitante_cpf_cnpj VARCHAR(20),
  solicitante_email VARCHAR(200),
  finalidade VARCHAR(200),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_onr_certidoes_tenant ON onr_certidoes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_onr_certidoes_property ON onr_certidoes (property_id);
CREATE INDEX IF NOT EXISTS idx_onr_certidoes_matricula ON onr_certidoes (matricula);
CREATE INDEX IF NOT EXISTS idx_onr_certidoes_status ON onr_certidoes (status);


-- ============================================================
-- 5. BrasilAPI Cache — Cache local de consultas CEP/CNPJ
-- ============================================================

CREATE TABLE IF NOT EXISTS brasil_api_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo VARCHAR(10) NOT NULL,
  chave VARCHAR(20) NOT NULL,
  dados JSONB NOT NULL,
  consultado_em TIMESTAMPTZ DEFAULT NOW(),
  expira_em TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_brasil_api_cache_tipo_chave ON brasil_api_cache (tipo, chave);
CREATE INDEX IF NOT EXISTS idx_brasil_api_cache_expira ON brasil_api_cache (expira_em);


-- ============================================================
-- 6. Analytics Events — Espelho local de eventos Plausible
-- ============================================================

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  user_id UUID,
  event_name VARCHAR(100) NOT NULL,
  url VARCHAR(500),
  referrer VARCHAR(500),
  props JSONB DEFAULT '{}',
  revenue_currency VARCHAR(3),
  revenue_amount NUMERIC(12,2),
  platform VARCHAR(10),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_tenant ON analytics_events (tenant_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_name ON analytics_events (event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events (created_at);


-- ============================================================
-- 7. Cartórios — Diretório local de serventias
-- ============================================================

CREATE TABLE IF NOT EXISTS cartorios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cns VARCHAR(30) NOT NULL,
  nome VARCHAR(300) NOT NULL,
  tipo VARCHAR(30) DEFAULT 'registro_imoveis',
  endereco TEXT,
  cidade VARCHAR(100),
  uf VARCHAR(2),
  cep VARCHAR(10),
  telefone VARCHAR(30),
  email VARCHAR(200),
  responsavel VARCHAR(200),
  comarca VARCHAR(100),
  circunscricao VARCHAR(200),
  aceita_protocolo_eletronico BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cartorios_cns ON cartorios (cns);
CREATE INDEX IF NOT EXISTS idx_cartorios_uf_cidade ON cartorios (uf, cidade);
CREATE INDEX IF NOT EXISTS idx_cartorios_tipo ON cartorios (tipo);
