-- Migration: Lead Forms (public capture), Quote Templates, Contracts
-- Date: 2026-02-XX
-- Gaps: 3 (CRM), 4 (Orçamentos), 5 (Contratos)

-- ============================================================
-- GAP 3: Lead Capture Forms (public `/f/:slug`)
-- ============================================================

CREATE TABLE IF NOT EXISTS lead_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  title TEXT NOT NULL,
  description TEXT,
  slug TEXT NOT NULL,
  -- JSON array of form field definitions:
  -- [{ "key": "name", "label": "Nome", "type": "text", "required": true },
  --  { "key": "email", "label": "E-mail", "type": "email", "required": false },
  --  { "key": "phone", "label": "Telefone", "type": "phone", "required": true },
  --  { "key": "message", "label": "Mensagem", "type": "textarea", "required": false }]
  fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Default lead values when form is submitted
  default_source TEXT DEFAULT 'formulario',
  default_priority TEXT DEFAULT 'media',
  assigned_to UUID REFERENCES users(id),
  campaign_id UUID REFERENCES campaigns(id),
  interested_service_type_id UUID REFERENCES service_types(id),
  -- Branding / appearance
  success_message TEXT DEFAULT 'Obrigado! Entraremos em contato em breve.',
  button_label TEXT DEFAULT 'Enviar',
  primary_color TEXT DEFAULT '#2563eb',
  -- Status
  is_active BOOLEAN DEFAULT true,
  -- Tracking
  submissions_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(tenant_id, slug)
);

-- Add lead_score to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_form_id UUID REFERENCES lead_forms(id);

-- ============================================================
-- GAP 4: Quote Templates
-- ============================================================

CREATE TABLE IF NOT EXISTS quote_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  description TEXT,
  -- JSON array of template items:
  -- [{ "description": "Consulta inicial", "quantity": 1, "unit_price": 150.00 }]
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_discount NUMERIC(10,2) DEFAULT 0,
  default_valid_days INTEGER DEFAULT 30,
  default_notes TEXT,
  -- For multi-option: group templates into packages
  is_package BOOLEAN DEFAULT false,
  package_name TEXT,
  package_description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Add template_group_id to quotes for multi-option grouping
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS quote_group_id TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS is_selected_option BOOLEAN DEFAULT false;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS option_label TEXT;

-- ============================================================
-- GAP 5: Contracts / SLA
-- ============================================================

CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  -- Contract details
  title TEXT NOT NULL,
  description TEXT,
  contract_type TEXT DEFAULT 'prestacao_servico',
  -- Values
  total_value NUMERIC(12,2),
  monthly_value NUMERIC(12,2),
  -- Dates
  start_date DATE,
  end_date DATE,
  renewal_date DATE,
  signed_at TIMESTAMPTZ,
  -- Status: draft, active, expired, cancelled, renewed
  status TEXT DEFAULT 'draft',
  -- Auto-renewal
  auto_renew BOOLEAN DEFAULT false,
  renewal_period_months INTEGER DEFAULT 12,
  renewal_alert_days INTEGER DEFAULT 30,
  -- SLA tracking
  sla_response_hours INTEGER,
  sla_resolution_hours INTEGER,
  -- Links
  document_template_id UUID REFERENCES document_templates(id),
  document_signature_id UUID REFERENCES document_signatures(id),
  generated_document_id UUID REFERENCES generated_documents(id),
  -- Notes / terms
  terms TEXT,
  notes TEXT,
  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Link contracts to service orders (many-to-many)
CREATE TABLE IF NOT EXISTS contract_service_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id),
  service_order_id UUID NOT NULL REFERENCES service_orders(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(contract_id, service_order_id)
);

-- Add contract_id to service_orders for direct 1:1 link (optional)
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES contracts(id);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_lead_forms_tenant ON lead_forms(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_forms_slug ON lead_forms(tenant_id, slug);
CREATE INDEX IF NOT EXISTS idx_leads_lead_form ON leads(lead_form_id);
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(tenant_id, lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_quote_templates_tenant ON quote_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contracts_tenant ON contracts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contracts_customer ON contracts(customer_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_contract_so_contract ON contract_service_orders(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_so_order ON contract_service_orders(service_order_id);
