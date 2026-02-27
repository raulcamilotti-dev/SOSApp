-- Migration: Contract Management — Billing, Hours, Dashboard
-- Date: 2026-02-26
-- Purpose: Extend contracts for full lifecycle management:
--   - Billing models (fixed, hourly, fixed+excess, per_delivery)
--   - Hours tracking via tasks.actual_hours
--   - Contract invoicing (contract_invoices junction)
--   - Monthly report template
--   - Suspended status
--   - Included hours and hourly rate

-- ============================================================
-- 1. Add billing & hours columns to contracts
-- ============================================================

-- Billing model: fixed_monthly | hourly | fixed_plus_excess | per_delivery
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS billing_model TEXT DEFAULT 'fixed_monthly';

-- Hourly rate (for hourly / fixed_plus_excess models)
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(10,2) DEFAULT 0;

-- Monthly included hours (for fixed_plus_excess model)
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS included_hours_monthly NUMERIC(10,2) DEFAULT 0;

-- Excess hourly rate (for fixed_plus_excess — rate charged above included hours)
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS excess_hourly_rate NUMERIC(10,2) DEFAULT 0;

-- Monthly report document template (separate from contract document template)
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS report_template_id UUID REFERENCES document_templates(id);

-- Contact person at customer (name / email / phone for contract communication)
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contact_phone TEXT;

-- Add 'suspended' status support (CHECK constraint update not needed — status is TEXT)
-- Allowed statuses: draft, active, suspended, expired, cancelled, renewed, completed

-- ============================================================
-- 2. Add actual_hours to tasks
-- ============================================================

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actual_hours NUMERIC(10,2) DEFAULT 0;

-- ============================================================
-- 3. Contract ↔ Invoice junction table
-- ============================================================

CREATE TABLE IF NOT EXISTS contract_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id),
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  -- Period this invoice covers
  period_start DATE,
  period_end DATE,
  -- Hours summary for this period
  hours_consumed NUMERIC(10,2) DEFAULT 0,
  hours_included NUMERIC(10,2) DEFAULT 0,
  hours_excess NUMERIC(10,2) DEFAULT 0,
  -- Notes
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(contract_id, invoice_id)
);

-- ============================================================
-- 4. Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_contracts_billing_model ON contracts(tenant_id, billing_model);
CREATE INDEX IF NOT EXISTS idx_contract_invoices_contract ON contract_invoices(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_invoices_invoice ON contract_invoices(invoice_id);
CREATE INDEX IF NOT EXISTS idx_tasks_actual_hours ON tasks(service_order_id) WHERE actual_hours > 0;
