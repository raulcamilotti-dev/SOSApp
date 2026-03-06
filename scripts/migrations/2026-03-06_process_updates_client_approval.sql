-- ============================================================================
-- Process updates: client authorization flow
-- Adds optional approval requirement and approval audit fields
-- ============================================================================

BEGIN;

ALTER TABLE process_updates
  ADD COLUMN IF NOT EXISTS requires_client_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_note text;

-- Note: check constraint intentionally omitted for compatibility with
-- api_dinamico runners that reject DO $$ blocks.
-- Accepted values enforced in app layer:
-- not_required | pending | approved | rejected

UPDATE process_updates
SET approval_status = CASE
  WHEN requires_client_approval THEN 'pending'
  ELSE 'not_required'
END
WHERE approval_status IS NULL
   OR approval_status = '';

CREATE INDEX IF NOT EXISTS idx_process_updates_service_order_approval
  ON process_updates (service_order_id, approval_status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_process_updates_requires_approval
  ON process_updates (requires_client_approval)
  WHERE deleted_at IS NULL;

COMMIT;
