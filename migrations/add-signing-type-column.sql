-- ============================================================
-- Migration: add signing_type column to document_signatures
-- Allows choosing between Documenso standard signing and
-- ICP-Brasil certificate-based signing.
-- ============================================================

-- Add signing_type column
ALTER TABLE document_signatures
  ADD COLUMN IF NOT EXISTS signing_type VARCHAR(20) NOT NULL DEFAULT 'documenso';
-- Values: 'documenso' (standard electronic) or 'icp_brasil' (ICP-Brasil certificate)

-- Add certificate_info JSONB for ICP-Brasil metadata
ALTER TABLE document_signatures
  ADD COLUMN IF NOT EXISTS certificate_info JSONB DEFAULT NULL;
-- Stores: { issuer, subject, serial, validFrom, validTo, cpf, cnpj }

COMMENT ON COLUMN document_signatures.signing_type IS
  'Signing mode: documenso (standard electronic) or icp_brasil (ICP-Brasil .p12 certificate)';

COMMENT ON COLUMN document_signatures.certificate_info IS
  'ICP-Brasil certificate metadata (issuer, subject, CPF/CNPJ, validity)';
