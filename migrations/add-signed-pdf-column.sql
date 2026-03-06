-- Migration: Add signed_pdf_base64 column to document_signatures
-- Stores the signed PDF content (base64) directly in the database
-- so it persists and can be downloaded anytime after signing.

ALTER TABLE document_signatures
ADD COLUMN IF NOT EXISTS signed_pdf_base64 TEXT;

COMMENT ON COLUMN document_signatures.signed_pdf_base64 IS 'Base64-encoded signed PDF, populated after ICP-Brasil signing';
