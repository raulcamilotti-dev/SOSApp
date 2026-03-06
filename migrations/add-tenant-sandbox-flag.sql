-- Migration: Add is_sandbox flag to tenants
-- Purpose: Allow "builder/sandbox" tenants for template pack development
-- that don't count in SaaS metrics and can't operate as real businesses.
--
-- Run via api_dinamico: POST /api_dinamico { "sql": "<contents>" }

-- Step 1: Add the column (idempotent — IF NOT EXISTS)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_sandbox BOOLEAN DEFAULT false;

-- Step 2: Index for fast filtering in dashboard/billing queries
CREATE INDEX IF NOT EXISTS idx_tenants_is_sandbox ON tenants (is_sandbox) WHERE is_sandbox = true;

-- Verification query (run separately):
-- SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'is_sandbox';
