-- ============================================================================
-- Fiscal certificate, CSC, IBGE code and NF-e/NFC-e numbering for tenants
-- Extends the fiscal readiness migration (2026-03-05) with fields required
-- by sped-nfe (nfephp-org) for NF-e and NFC-e emission.
-- Safe migration: only additive changes with IF NOT EXISTS
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- tenants: certificate, CSC, IBGE, series & numbering
-- ----------------------------------------------------------------------------
ALTER TABLE tenants
  -- IBGE city code (7 digits) — mandatory for NF-e/NFC-e XML <cMunFG>
  ADD COLUMN IF NOT EXISTS ibge_city_code VARCHAR(7),

  -- CSC (Código de Segurança do Contribuinte) — mandatory for NFC-e QR Code
  ADD COLUMN IF NOT EXISTS nfce_csc TEXT,
  ADD COLUMN IF NOT EXISTS nfce_csc_id VARCHAR(10),

  -- Digital certificate (A1 .pfx) stored as base64
  -- The password is stored encrypted (app-level encryption recommended)
  ADD COLUMN IF NOT EXISTS fiscal_certificate_pfx TEXT,
  ADD COLUMN IF NOT EXISTS fiscal_certificate_password TEXT,
  ADD COLUMN IF NOT EXISTS fiscal_certificate_expires_at TIMESTAMPTZ,

  -- NF-e series and numbering control (per tenant)
  ADD COLUMN IF NOT EXISTS nfe_series INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS nfe_next_number INTEGER DEFAULT 1,

  -- NFC-e series and numbering control (per tenant)
  ADD COLUMN IF NOT EXISTS nfce_series INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS nfce_next_number INTEGER DEFAULT 1,

  -- Homologation toggle (tenant-level default for new invoices)
  -- Individual invoices can still override via fiscal_environment column
  ADD COLUMN IF NOT EXISTS fiscal_default_environment TEXT DEFAULT 'homologation';

-- Constraint for fiscal_default_environment
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_tenants_fiscal_default_environment'
  ) THEN
    ALTER TABLE tenants
      ADD CONSTRAINT chk_tenants_fiscal_default_environment
      CHECK (fiscal_default_environment IN ('production', 'homologation'));
  END IF;
END$$;

-- Constraint for tax_regime values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_tenants_tax_regime'
  ) THEN
    ALTER TABLE tenants
      ADD CONSTRAINT chk_tenants_tax_regime
      CHECK (
        tax_regime IS NULL OR tax_regime IN (
          'simples_nacional',       -- CRT 1 - Simples Nacional
          'simples_excesso',        -- CRT 2 - Simples Nacional excesso sublimite
          'regime_normal',          -- CRT 3 - Regime Normal (Lucro Real ou Presumido)
          'mei'                     -- MEI (Microempreendedor Individual)
        )
      );
  END IF;
END$$;

-- ----------------------------------------------------------------------------
-- invoices: add recipient IBGE code for XML generation
-- ----------------------------------------------------------------------------
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS recipient_ibge_city_code VARCHAR(7),
  ADD COLUMN IF NOT EXISTS recipient_ibge_state_code VARCHAR(2);

-- ----------------------------------------------------------------------------
-- invoice_items: ensure quantity and unit_price exist for NF-e item calc
-- ----------------------------------------------------------------------------
ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS item_description TEXT,
  ADD COLUMN IF NOT EXISTS icms_base_value NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS icms_value NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS icms_rate NUMERIC(7,4),
  ADD COLUMN IF NOT EXISTS pis_value NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS pis_rate NUMERIC(7,4),
  ADD COLUMN IF NOT EXISTS cofins_value NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS cofins_rate NUMERIC(7,4),
  ADD COLUMN IF NOT EXISTS ipi_value NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS ipi_rate NUMERIC(7,4);

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tenants_ibge_city_code
  ON tenants (ibge_city_code)
  WHERE ibge_city_code IS NOT NULL;

COMMIT;
