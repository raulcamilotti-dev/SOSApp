-- Migration: Create contracts and quote_templates tables
-- Date: 2025-01-XX
-- Purpose: Support Contracts management and Quote Templates screens

-- ══════════════════════════════════════════════════
-- CONTRACTS
-- ══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID REFERENCES customers(id),
  title TEXT NOT NULL,
  description TEXT,
  contract_type TEXT DEFAULT 'prestacao_servico',
  status TEXT DEFAULT 'draft',
  total_value NUMERIC(12,2),
  monthly_value NUMERIC(12,2),
  start_date DATE,
  end_date DATE,
  auto_renew BOOLEAN DEFAULT false,
  renewal_period_months INTEGER DEFAULT 12,
  renewal_alert_days INTEGER DEFAULT 30,
  sla_response_hours INTEGER,
  sla_resolution_hours INTEGER,
  document_template_id UUID REFERENCES document_templates(id),
  terms TEXT,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  renewed_from_id UUID REFERENCES contracts(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_contracts_tenant_id ON contracts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contracts_customer_id ON contracts(customer_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);

-- ══════════════════════════════════════════════════
-- QUOTE TEMPLATES
-- ══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS quote_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  description TEXT,
  items JSONB DEFAULT '[]'::jsonb,
  default_discount NUMERIC(12,2) DEFAULT 0,
  default_valid_days INTEGER DEFAULT 30,
  default_notes TEXT,
  is_package BOOLEAN DEFAULT false,
  package_name TEXT,
  package_description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_quote_templates_tenant_id ON quote_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quote_templates_is_active ON quote_templates(is_active);
