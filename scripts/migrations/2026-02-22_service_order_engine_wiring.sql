-- ============================================================
-- Migration: Wire Workflow Engine to service_orders
-- Date: 2026-02-22
-- Purpose: 
--   1. Add service_order_id to tables that only had property_id
--   2. Make property_id nullable (backward compat, not primary key)
--   3. The new service-order-engine.ts will use service_order_id
-- ============================================================

-- ── process_logs: Add service_order_id ──
ALTER TABLE process_logs
  ADD COLUMN IF NOT EXISTS service_order_id UUID REFERENCES service_orders(id);

CREATE INDEX IF NOT EXISTS idx_process_logs_service_order_id
  ON process_logs(service_order_id);

-- Make property_id nullable (was NOT NULL FK to properties)
ALTER TABLE process_logs
  ALTER COLUMN property_id DROP NOT NULL;

-- ── step_form_responses: Add service_order_id ──
ALTER TABLE step_form_responses
  ADD COLUMN IF NOT EXISTS service_order_id UUID REFERENCES service_orders(id);

CREATE INDEX IF NOT EXISTS idx_step_form_responses_service_order_id
  ON step_form_responses(service_order_id);

-- Make property_id nullable
ALTER TABLE step_form_responses
  ALTER COLUMN property_id DROP NOT NULL;

-- ── process_deadlines: Make property_id nullable ──
-- (service_order_id column already exists on this table)
ALTER TABLE process_deadlines
  ALTER COLUMN property_id DROP NOT NULL;

-- ── tasks: ensure workflow columns have indexes ──
CREATE INDEX IF NOT EXISTS idx_tasks_service_order_id
  ON tasks(service_order_id);

CREATE INDEX IF NOT EXISTS idx_tasks_workflow_step_id
  ON tasks(workflow_step_id);

-- ============================================================
-- Summary of columns after migration:
--   process_deadlines:    property_id (nullable), service_order_id (nullable, exists)
--   process_logs:         property_id (nullable), service_order_id (nullable, new)
--   step_form_responses:  property_id (nullable), service_order_id (nullable, new)
--   tasks:                property_id (nullable), service_order_id (nullable, exists)
-- ============================================================
