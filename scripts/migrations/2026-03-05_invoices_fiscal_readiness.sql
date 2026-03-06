-- ============================================================================
-- Fiscal readiness for invoice issuance (NFS-e / NF-e / NFC-e / coupons)
-- Safe migration: only additive changes with IF NOT EXISTS
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- invoices: fiscal configuration + issuance lifecycle
-- ----------------------------------------------------------------------------
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS document_type text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS fiscal_environment text DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS operation_nature text,
  ADD COLUMN IF NOT EXISTS service_code_lc116 text,
  ADD COLUMN IF NOT EXISTS service_city_code text,
  ADD COLUMN IF NOT EXISTS iss_rate numeric(7,4),
  ADD COLUMN IF NOT EXISTS iss_withheld boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS additional_info text,

  ADD COLUMN IF NOT EXISTS recipient_name text,
  ADD COLUMN IF NOT EXISTS recipient_cpf_cnpj text,
  ADD COLUMN IF NOT EXISTS recipient_ie text,
  ADD COLUMN IF NOT EXISTS recipient_im text,
  ADD COLUMN IF NOT EXISTS recipient_email text,
  ADD COLUMN IF NOT EXISTS recipient_phone text,
  ADD COLUMN IF NOT EXISTS recipient_address_line1 text,
  ADD COLUMN IF NOT EXISTS recipient_address_number text,
  ADD COLUMN IF NOT EXISTS recipient_address_complement text,
  ADD COLUMN IF NOT EXISTS recipient_neighborhood text,
  ADD COLUMN IF NOT EXISTS recipient_city text,
  ADD COLUMN IF NOT EXISTS recipient_state text,
  ADD COLUMN IF NOT EXISTS recipient_zip_code text,
  ADD COLUMN IF NOT EXISTS recipient_country text DEFAULT 'Brasil',

  ADD COLUMN IF NOT EXISTS fiscal_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS fiscal_number text,
  ADD COLUMN IF NOT EXISTS fiscal_series text,
  ADD COLUMN IF NOT EXISTS fiscal_access_key text,
  ADD COLUMN IF NOT EXISTS fiscal_protocol text,
  ADD COLUMN IF NOT EXISTS fiscal_verification_code text,
  ADD COLUMN IF NOT EXISTS fiscal_xml_url text,
  ADD COLUMN IF NOT EXISTS fiscal_pdf_url text,
  ADD COLUMN IF NOT EXISTS fiscal_json_response jsonb,
  ADD COLUMN IF NOT EXISTS fiscal_error_message text,
  ADD COLUMN IF NOT EXISTS fiscal_last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS fiscal_authorized_at timestamptz,
  ADD COLUMN IF NOT EXISTS fiscal_cancelled_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_invoices_document_type'
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT chk_invoices_document_type
      CHECK (
        document_type IN (
          'none',
          'nfse',
          'nfe',
          'nfce',
          'service_coupon',
          'product_coupon'
        )
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_invoices_fiscal_environment'
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT chk_invoices_fiscal_environment
      CHECK (fiscal_environment IN ('production', 'homologation'));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_invoices_fiscal_status'
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT chk_invoices_fiscal_status
      CHECK (
        fiscal_status IN (
          'pending',
          'ready',
          'processing',
          'authorized',
          'rejected',
          'cancelled',
          'error'
        )
      );
  END IF;
END$$;

-- ----------------------------------------------------------------------------
-- invoice_items: item-level tax hints for NF-e/NFC-e/NFS-e integrations
-- ----------------------------------------------------------------------------
ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS ncm text,
  ADD COLUMN IF NOT EXISTS cest text,
  ADD COLUMN IF NOT EXISTS cfop text,
  ADD COLUMN IF NOT EXISTS cst_icms text,
  ADD COLUMN IF NOT EXISTS csosn text,
  ADD COLUMN IF NOT EXISTS cst_pis text,
  ADD COLUMN IF NOT EXISTS cst_cofins text,
  ADD COLUMN IF NOT EXISTS unit_code text,
  ADD COLUMN IF NOT EXISTS gross_value numeric(14,2),
  ADD COLUMN IF NOT EXISTS discount_value numeric(14,2),
  ADD COLUMN IF NOT EXISTS freight_value numeric(14,2),
  ADD COLUMN IF NOT EXISTS insurance_value numeric(14,2),
  ADD COLUMN IF NOT EXISTS other_expenses_value numeric(14,2),
  ADD COLUMN IF NOT EXISTS fiscal_notes text;

-- ----------------------------------------------------------------------------
-- customers: recipient tax/address enrichment
-- ----------------------------------------------------------------------------
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS state_registration text,
  ADD COLUMN IF NOT EXISTS municipal_registration text,
  ADD COLUMN IF NOT EXISTS street text,
  ADD COLUMN IF NOT EXISTS number text,
  ADD COLUMN IF NOT EXISTS complement text,
  ADD COLUMN IF NOT EXISTS neighborhood text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS zip_code text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'Brasil';

-- ----------------------------------------------------------------------------
-- tenants: issuer fiscal profile and integration settings
-- ----------------------------------------------------------------------------
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS trade_name text,
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS state_registration text,
  ADD COLUMN IF NOT EXISTS municipal_registration text,
  ADD COLUMN IF NOT EXISTS tax_regime text,
  ADD COLUMN IF NOT EXISTS fiscal_street text,
  ADD COLUMN IF NOT EXISTS fiscal_number text,
  ADD COLUMN IF NOT EXISTS fiscal_complement text,
  ADD COLUMN IF NOT EXISTS fiscal_neighborhood text,
  ADD COLUMN IF NOT EXISTS fiscal_city text,
  ADD COLUMN IF NOT EXISTS fiscal_state text,
  ADD COLUMN IF NOT EXISTS fiscal_zip_code text,
  ADD COLUMN IF NOT EXISTS fiscal_country text DEFAULT 'Brasil',
  ADD COLUMN IF NOT EXISTS fiscal_provider text,
  ADD COLUMN IF NOT EXISTS fiscal_endpoint text,
  ADD COLUMN IF NOT EXISTS fiscal_api_token text;

-- ----------------------------------------------------------------------------
-- Backfill and indexes
-- ----------------------------------------------------------------------------
UPDATE invoices
SET document_type = 'none'
WHERE document_type IS NULL;

UPDATE invoices
SET fiscal_status = 'pending'
WHERE fiscal_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_tenant_document_type
  ON invoices (tenant_id, document_type)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_tenant_fiscal_status
  ON invoices (tenant_id, fiscal_status)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_invoices_fiscal_access_key
  ON invoices (fiscal_access_key)
  WHERE fiscal_access_key IS NOT NULL;

COMMIT;

