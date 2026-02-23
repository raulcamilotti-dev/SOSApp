-- ============================================================
-- Migration: Add Gov.br + ONR/SREI + Plausible support columns
-- Date: 2026-02-15
-- ============================================================

-- ============================================================
-- 1. Gov.br authentication fields on users table
-- ============================================================

-- Gov.br trust level and metadata
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS govbr_sub           TEXT,          -- Gov.br sub (CPF)
  ADD COLUMN IF NOT EXISTS govbr_nivel         TEXT,          -- 'bronze' | 'prata' | 'ouro'
  ADD COLUMN IF NOT EXISTS govbr_verified_at   TIMESTAMPTZ,   -- When Gov.br verification occurred
  ADD COLUMN IF NOT EXISTS govbr_picture       TEXT,          -- Gov.br profile picture URL
  ADD COLUMN IF NOT EXISTS auth_provider       TEXT DEFAULT 'cpf'; -- 'cpf' | 'google' | 'govbr'

COMMENT ON COLUMN users.govbr_sub IS 'Gov.br subject identifier (CPF validated by government)';
COMMENT ON COLUMN users.govbr_nivel IS 'Gov.br trust level: bronze (basic), prata (bank/facial), ouro (ICP-Brasil)';
COMMENT ON COLUMN users.govbr_verified_at IS 'Timestamp when user was verified via Gov.br';
COMMENT ON COLUMN users.auth_provider IS 'Primary authentication provider used by the user';

-- Index for Gov.br lookups
CREATE INDEX IF NOT EXISTS idx_users_govbr_sub ON users (govbr_sub) WHERE govbr_sub IS NOT NULL;

-- ============================================================
-- 2. ONR/SREI protocol tracking columns on properties table
-- ============================================================

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS onr_protocolo_numero    TEXT,
  ADD COLUMN IF NOT EXISTS onr_protocolo_status    TEXT,          -- 'protocolado' | 'em_analise' | 'com_exigencia' | 'registrado' | 'devolvido' | 'cancelado'
  ADD COLUMN IF NOT EXISTS onr_cartorio_cns        TEXT,          -- Código Nacional de Serventia
  ADD COLUMN IF NOT EXISTS onr_protocolo_data      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onr_protocolo_previsao  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onr_protocolo_conclusao TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onr_valor_emolumentos   DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS onr_matricula_numero    TEXT,          -- Property registration number
  ADD COLUMN IF NOT EXISTS onr_matricula_livro     TEXT,          -- Registration book
  ADD COLUMN IF NOT EXISTS onr_comarca             TEXT;          -- Judicial district

COMMENT ON COLUMN properties.onr_protocolo_numero IS 'ONR electronic protocol number';
COMMENT ON COLUMN properties.onr_protocolo_status IS 'Current status from ONR/SREI system';
COMMENT ON COLUMN properties.onr_cartorio_cns IS 'Registry office CNS (Código Nacional de Serventia)';
COMMENT ON COLUMN properties.onr_matricula_numero IS 'Property registration (matrícula) number';

-- Index for ONR protocol lookups
CREATE INDEX IF NOT EXISTS idx_properties_onr_protocolo
  ON properties (onr_protocolo_numero)
  WHERE onr_protocolo_numero IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_properties_onr_cartorio
  ON properties (onr_cartorio_cns)
  WHERE onr_cartorio_cns IS NOT NULL;

-- ============================================================
-- 3. ONR Certidões (certificates) tracking table
-- ============================================================

CREATE TABLE IF NOT EXISTS onr_certidoes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL,
  property_id       UUID REFERENCES properties(id),
  tipo              TEXT NOT NULL,        -- 'inteiro_teor' | 'onus_reais' | 'vintenaria' | 'negativa' | 'positiva'
  numero            TEXT,
  matricula         TEXT NOT NULL,
  cartorio_cns      TEXT NOT NULL,
  data_emissao      TIMESTAMPTZ,
  data_validade     TIMESTAMPTZ,
  pdf_url           TEXT,
  hash_verificacao  TEXT,
  status            TEXT NOT NULL DEFAULT 'solicitada', -- 'solicitada' | 'emitida' | 'expirada' | 'cancelada'
  valor             DECIMAL(12,2),
  solicitante_nome  TEXT,
  solicitante_doc   TEXT,
  solicitante_email TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_onr_certidoes_tenant
  ON onr_certidoes (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_onr_certidoes_property
  ON onr_certidoes (property_id) WHERE deleted_at IS NULL;

-- ============================================================
-- 4. ONR Protocolos history table (full audit trail)
-- ============================================================

CREATE TABLE IF NOT EXISTS onr_protocolos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL,
  property_id         UUID REFERENCES properties(id),
  numero_protocolo    TEXT NOT NULL,
  cartorio_cns        TEXT NOT NULL,
  tipo_ato            TEXT NOT NULL,      -- 'registro' | 'averbacao' | 'cancelamento' | 'retificacao' | 'usucapiao' | 'regularizacao' | 'outros'
  status              TEXT NOT NULL DEFAULT 'protocolado',
  data_protocolo      TIMESTAMPTZ NOT NULL,
  data_previsao       TIMESTAMPTZ,
  data_conclusao      TIMESTAMPTZ,
  observacoes         TEXT,
  valor_emolumentos   DECIMAL(12,2),
  documentos          JSONB DEFAULT '[]', -- Array of { nome, url, hash }
  exigencias          JSONB DEFAULT '[]', -- Array of { descricao, data, prazo, cumprida }
  submitted_by        UUID,               -- User who submitted
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_onr_protocolos_tenant
  ON onr_protocolos (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_onr_protocolos_property
  ON onr_protocolos (property_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_onr_protocolos_numero
  ON onr_protocolos (numero_protocolo);

-- ============================================================
-- 5. Analytics events log (optional: local audit of Plausible events)
-- ============================================================

CREATE TABLE IF NOT EXISTS analytics_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID,
  user_id     UUID,
  event_name  TEXT NOT NULL,
  event_url   TEXT,
  props       JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_tenant
  ON analytics_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_name
  ON analytics_events (event_name, created_at DESC);

-- ============================================================
-- Done
-- ============================================================
