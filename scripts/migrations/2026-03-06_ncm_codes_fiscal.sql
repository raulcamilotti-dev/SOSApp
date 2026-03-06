-- ==========================================================================
-- Migration: NCM Codes + Fiscal fields on services
-- Date: 2026-03-06
-- Purpose: Create ncm_codes reference table and add fiscal columns to
--          services table for future NFe/NFSe emission.
-- ==========================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 1. Create ncm_codes table (Nomenclatura Comum do Mercosul)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ncm_codes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID REFERENCES tenants(id),
  code       TEXT NOT NULL,
  description TEXT,
  cest       TEXT,                          -- Código Especificador da Substituição Tributária
  ex_tipi    TEXT,                          -- Exceção TIPI (tabela de IPI)
  aliq_ipi   NUMERIC(5,2),                  -- Alíquota IPI padrão (%)
  notes      TEXT,                          -- Observações livres
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Unique per tenant (same NCM can exist in multiple tenants)
CREATE UNIQUE INDEX IF NOT EXISTS uidx_ncm_codes_tenant_code
  ON ncm_codes (tenant_id, code)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ncm_codes_tenant
  ON ncm_codes (tenant_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ncm_codes_code
  ON ncm_codes (code)
  WHERE deleted_at IS NULL;

-- --------------------------------------------------------------------------
-- 2. Add fiscal columns to services table (products/services catalog)
-- --------------------------------------------------------------------------
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS ncm_id       UUID REFERENCES ncm_codes(id),
  ADD COLUMN IF NOT EXISTS ncm_code     TEXT,          -- denormalized for performance / pack-export
  ADD COLUMN IF NOT EXISTS origem       TEXT,          -- Origem da mercadoria (0-8)
  ADD COLUMN IF NOT EXISTS cest         TEXT,          -- CEST do produto
  ADD COLUMN IF NOT EXISTS cfop_padrao  TEXT,          -- CFOP padrão (ex: 5102, 6102)
  ADD COLUMN IF NOT EXISTS cst_icms     TEXT,          -- CST ICMS (ex: 00, 20, 60)
  ADD COLUMN IF NOT EXISTS csosn        TEXT,          -- CSOSN para Simples Nacional
  ADD COLUMN IF NOT EXISTS cst_pis      TEXT,          -- CST PIS
  ADD COLUMN IF NOT EXISTS cst_cofins   TEXT,          -- CST COFINS
  ADD COLUMN IF NOT EXISTS aliq_icms    NUMERIC(5,2),  -- Alíquota ICMS (%)
  ADD COLUMN IF NOT EXISTS aliq_pis     NUMERIC(5,4),  -- Alíquota PIS (%)
  ADD COLUMN IF NOT EXISTS aliq_cofins  NUMERIC(5,4),  -- Alíquota COFINS (%)
  ADD COLUMN IF NOT EXISTS aliq_ipi     NUMERIC(5,2),  -- Alíquota IPI (%)
  ADD COLUMN IF NOT EXISTS fiscal_unit  TEXT;           -- Unidade fiscal (UN, KG, LT, etc.)

CREATE INDEX IF NOT EXISTS idx_services_ncm_id
  ON services (ncm_id)
  WHERE ncm_id IS NOT NULL;

COMMIT;
