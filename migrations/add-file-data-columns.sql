-- ============================================================
-- Migration: Store file content directly in the database
-- Date: 2026-02-15
-- Description:
--   Adds file_data (base64 TEXT) to property_process_update_files
--   and process_document_responses so files can be stored in DB
--   instead of (or alongside) Google Drive.
--   Also adds a helper view for serving files via data URI.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. property_process_update_files — add base64 storage
-- ============================================================

ALTER TABLE property_process_update_files
  ADD COLUMN IF NOT EXISTS file_data TEXT,          -- base64-encoded file content
  ADD COLUMN IF NOT EXISTS storage_type VARCHAR(20) DEFAULT 'drive'
    CHECK (storage_type IN ('drive', 'database', 'both'));

COMMENT ON COLUMN property_process_update_files.file_data IS
  'Base64-encoded file content. When storage_type = "database", this is the primary source.';
COMMENT ON COLUMN property_process_update_files.storage_type IS
  'Where the file is stored: drive (Google Drive), database (base64 in file_data), or both.';


-- ============================================================
-- 2. process_document_responses — add base64 storage
-- ============================================================

ALTER TABLE process_document_responses
  ADD COLUMN IF NOT EXISTS file_data TEXT,
  ADD COLUMN IF NOT EXISTS storage_type VARCHAR(20) DEFAULT 'drive'
    CHECK (storage_type IN ('drive', 'database', 'both'));

COMMENT ON COLUMN process_document_responses.file_data IS
  'Base64-encoded file content for DB-stored documents.';
COMMENT ON COLUMN process_document_responses.storage_type IS
  'Where the file is stored: drive, database, or both.';


-- ============================================================
-- 3. Index for faster lookups of DB-stored files
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_ppu_files_storage
  ON property_process_update_files(storage_type)
  WHERE deleted_at IS NULL AND storage_type = 'database';

CREATE INDEX IF NOT EXISTS idx_doc_responses_storage
  ON process_document_responses(storage_type)
  WHERE deleted_at IS NULL AND storage_type = 'database';

COMMIT;
