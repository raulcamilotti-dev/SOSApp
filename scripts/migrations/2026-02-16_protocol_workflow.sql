-- ================================================================
-- Migration: Protocol Workflow Integration
-- Date: 2026-02-16
-- Purpose: 
--   1. Add has_protocol flag to workflow_steps
--   2. Add include_in_protocol flag to property_process_update_files
--   3. Create protocol_documents junction table
--   4. Add protocol_id FK to onr_certidoes
-- ================================================================

-- 1. workflow_steps: flag to enable protocol compilation on a step
ALTER TABLE workflow_steps
  ADD COLUMN IF NOT EXISTS has_protocol BOOLEAN NOT NULL DEFAULT false;

-- 2. property_process_update_files: flag to mark docs for protocol
ALTER TABLE property_process_update_files
  ADD COLUMN IF NOT EXISTS include_in_protocol BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_ppuf_include_protocol
  ON property_process_update_files(include_in_protocol)
  WHERE include_in_protocol = true;

-- 3. protocol_documents: links a protocol to its compiled files
CREATE TABLE IF NOT EXISTS protocol_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_id  UUID NOT NULL REFERENCES onr_protocolos(id) ON DELETE CASCADE,
  file_id      UUID NOT NULL REFERENCES property_process_update_files(id) ON DELETE CASCADE,
  added_at     TIMESTAMP DEFAULT NOW(),
  added_by     UUID REFERENCES users(id),
  tenant_id    UUID REFERENCES tenants(id),
  UNIQUE(protocol_id, file_id)
);

CREATE INDEX IF NOT EXISTS idx_protocol_docs_protocol ON protocol_documents(protocol_id);
CREATE INDEX IF NOT EXISTS idx_protocol_docs_file     ON protocol_documents(file_id);

-- 4. onr_certidoes: optional link to originating protocol
ALTER TABLE onr_certidoes
  ADD COLUMN IF NOT EXISTS protocol_id UUID REFERENCES onr_protocolos(id);

-- ================================================================
-- Done.
-- Run: node scripts/run-api-dinamico-sql.js scripts/migrations/2026-02-16_protocol_workflow.sql
