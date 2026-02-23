-- ============================================================
-- Migration: Store file content directly in the database
-- Date: 2026-02-15
-- Run:
--   node scripts/run-api-dinamico-sql.js scripts/migrate-file-data.sql
--
-- Adds file_data (base64 TEXT) and storage_type columns to
-- property_process_update_files and process_document_responses
-- so files can be stored in DB instead of Google Drive.
-- ============================================================

ALTER TABLE property_process_update_files
  ADD COLUMN IF NOT EXISTS file_data TEXT;

ALTER TABLE property_process_update_files
  ADD COLUMN IF NOT EXISTS storage_type VARCHAR(20) DEFAULT 'drive';

ALTER TABLE process_document_responses
  ADD COLUMN IF NOT EXISTS file_data TEXT;

ALTER TABLE process_document_responses
  ADD COLUMN IF NOT EXISTS storage_type VARCHAR(20) DEFAULT 'drive';
