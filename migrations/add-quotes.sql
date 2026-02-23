-- ============================================
-- Fase 2.2: Quotes (Orçamentos) System
-- ============================================
-- Run via api_dinamico: node scripts/run-api-dinamico-sql.js migrations/add-quotes.sql

-- Quotes table (links to service_order + optional workflow_step + optional template)
CREATE TABLE IF NOT EXISTS quotes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  service_order_id UUID NOT NULL REFERENCES service_orders(id),
  workflow_step_id UUID REFERENCES workflow_steps(id),
  template_id UUID REFERENCES document_templates(id),

  -- Token for public access
  token VARCHAR(64) NOT NULL UNIQUE,

  -- Quote details
  title TEXT NOT NULL,
  description TEXT,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  valid_until DATE,
  notes TEXT,

  -- Status lifecycle: draft → sent → viewed → approved/rejected/expired
  status TEXT NOT NULL DEFAULT 'draft',

  -- Approval/rejection tracking
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Rendered document (from template)
  filled_html TEXT,
  pdf_url TEXT,

  -- Audit
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Quote line items
CREATE TABLE IF NOT EXISTS quote_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,

  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,

  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_quotes_service_order ON quotes(service_order_id);
CREATE INDEX IF NOT EXISTS idx_quotes_tenant ON quotes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quotes_token ON quotes(token);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items(quote_id);
