-- Migration: Add workflow_scope to workflow_templates
-- Purpose: Distinguish operational workflows (customer-facing) from
--          administrative workflows (internal: RH, compras, etc.)
-- Date: 2026-02-26

ALTER TABLE workflow_templates
  ADD COLUMN IF NOT EXISTS workflow_scope VARCHAR(20) DEFAULT 'operational';

-- Add CHECK constraint (idempotent: only if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workflow_templates_scope_check'
  ) THEN
    ALTER TABLE workflow_templates
      ADD CONSTRAINT workflow_templates_scope_check
      CHECK (workflow_scope IN ('operational', 'administrative'));
  END IF;
END
$$;

-- Index for filtering by scope (used by kanban to load only relevant workflows)
CREATE INDEX IF NOT EXISTS idx_workflow_templates_scope
  ON workflow_templates (workflow_scope);

COMMENT ON COLUMN workflow_templates.workflow_scope IS
  'operational = customer-facing processes (default), administrative = internal processes (RH, compras, etc.)';
