-- ============================================================
-- Migration: Documenso + OCR integration tables
-- Date: 2026-02-14
-- Description:
--   1. ocr_config        — standalone OCR configuration rules
--   2. workflow_steps.ocr_enabled — quick toggle per step
--   3. document_signatures — tracks Documenso signing requests
--      linked to process_document_requests or standalone
-- ============================================================

BEGIN;

-- ============================================================
-- 1. ocr_config — flexible, decoupled OCR configuration
-- ============================================================

CREATE TABLE IF NOT EXISTS ocr_config (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id),

  -- Optional link to a workflow step (NULL = standalone rule)
  workflow_step_id UUID REFERENCES workflow_steps(id) ON DELETE SET NULL,

  -- Human-readable rule name, e.g. "OCR em documentos de identidade"
  name          VARCHAR(255) NOT NULL,
  description   TEXT,

  -- Which document types trigger OCR (NULL = all)
  -- Stored as a JSON array, e.g. ["RG","CPF","certidao"]
  document_types JSONB DEFAULT '[]'::JSONB,

  -- Extraction features to run after OCR
  -- e.g. ["cpf","cnpj","dates","currency"]
  extract_features JSONB DEFAULT '["cpf","cnpj","dates","currency"]'::JSONB,

  -- Target language for Tesseract
  lang          VARCHAR(10) NOT NULL DEFAULT 'por',

  -- Enable/disable without deleting
  is_active     BOOLEAN NOT NULL DEFAULT true,

  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at    TIMESTAMP DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_ocr_config_tenant
  ON ocr_config(tenant_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ocr_config_step
  ON ocr_config(workflow_step_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE ocr_config IS
  'Flexible OCR rules — can be linked to a workflow_step or used standalone.';


-- ============================================================
-- 2. workflow_steps.ocr_enabled — quick per-step toggle
-- ============================================================

ALTER TABLE workflow_steps
  ADD COLUMN IF NOT EXISTS ocr_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN workflow_steps.ocr_enabled IS
  'When true, any document uploaded in this step will be processed via Tesseract OCR.';


-- ============================================================
-- 3. ocr_results — stores OCR output per document response
-- ============================================================

CREATE TABLE IF NOT EXISTS ocr_results (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID REFERENCES tenants(id),

  -- Which document response was OCR'd
  document_response_id  UUID NOT NULL,

  -- Full extracted text
  extracted_text        TEXT,

  -- Confidence 0–100
  confidence            NUMERIC(5,2),

  -- Structured extractions (JSON)
  extracted_cpf         JSONB DEFAULT '[]'::JSONB,
  extracted_cnpj        JSONB DEFAULT '[]'::JSONB,
  extracted_dates       JSONB DEFAULT '[]'::JSONB,
  extracted_currency    JSONB DEFAULT '[]'::JSONB,

  -- Which ocr_config rule triggered this (nullable for ad-hoc)
  ocr_config_id         UUID REFERENCES ocr_config(id) ON DELETE SET NULL,

  lang                  VARCHAR(10) NOT NULL DEFAULT 'por',
  processed_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at            TIMESTAMP DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_ocr_results_response
  ON ocr_results(document_response_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE ocr_results IS
  'Stores Tesseract OCR output per document response, including structured data extractions.';


-- ============================================================
-- 4. document_signatures — tracks Documenso signing requests
-- ============================================================

CREATE TABLE IF NOT EXISTS document_signatures (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID REFERENCES tenants(id),

  -- Link to the document request that needs a signature
  -- NULL for standalone signatures not tied to a process
  document_request_id       UUID,

  -- Link to a specific document response (the uploaded file being signed)
  document_response_id      UUID,

  -- Documenso document ID (from their API)
  documenso_document_id     INTEGER,

  -- Documenso recipient ID (signer)
  documenso_recipient_id    INTEGER,

  -- Signer info
  signer_name               VARCHAR(255),
  signer_email              VARCHAR(255),

  -- Signing URL to embed or share
  signing_url               TEXT,

  -- Status tracking
  status                    VARCHAR(50) NOT NULL DEFAULT 'pending',
  -- possible values: 'pending', 'sent', 'viewed', 'signed', 'rejected', 'expired'

  signed_at                 TIMESTAMP,
  sent_at                   TIMESTAMP,

  -- Document title in Documenso
  document_title            VARCHAR(500),

  -- Metadata
  created_by                UUID,
  notes                     TEXT,

  created_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at                TIMESTAMP DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_document_signatures_request
  ON document_signatures(document_request_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_document_signatures_response
  ON document_signatures(document_response_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_document_signatures_status
  ON document_signatures(status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_document_signatures_tenant
  ON document_signatures(tenant_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE document_signatures IS
  'Tracks Documenso electronic signature requests linked to document flows.';


-- ============================================================
-- Verify
-- ============================================================

SELECT 'ocr_config' AS tbl,
       COUNT(*) AS cols
  FROM information_schema.columns
 WHERE table_name = 'ocr_config'
UNION ALL
SELECT 'ocr_results',
       COUNT(*)
  FROM information_schema.columns
 WHERE table_name = 'ocr_results'
UNION ALL
SELECT 'document_signatures',
       COUNT(*)
  FROM information_schema.columns
 WHERE table_name = 'document_signatures'
UNION ALL
SELECT 'workflow_steps.ocr_enabled',
       COUNT(*)
  FROM information_schema.columns
 WHERE table_name = 'workflow_steps'
   AND column_name = 'ocr_enabled';

COMMIT;
