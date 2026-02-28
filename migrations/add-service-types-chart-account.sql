-- Migration: Add default_chart_account_id to service_types
-- Purpose: Allow tenants to configure which chart of accounts entry
-- each service type defaults to for automatic financial classification.
-- "Bom cadastro" — configure once, classify automatically.

ALTER TABLE service_types
  ADD COLUMN IF NOT EXISTS default_chart_account_id UUID
    REFERENCES chart_of_accounts(id);

-- Index for FK lookups
CREATE INDEX IF NOT EXISTS idx_service_types_chart_account
  ON service_types(default_chart_account_id)
  WHERE default_chart_account_id IS NOT NULL;

COMMENT ON COLUMN service_types.default_chart_account_id IS
  'Plano de contas padrão para classificação automática de receitas geradas por este tipo de serviço';
