-- ═══════════════════════════════════════════════════════════════════
-- Migration: Suppliers + Product Cost History (CMPM)
-- Date: 2026-02-21
-- Description: Creates dedicated suppliers table, product_cost_history
--   for weighted average cost tracking (Custo Médio Ponderado Móvel),
--   adds average_cost to services, and links purchase_orders to suppliers.
-- ═══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────
-- 1. SUPPLIERS TABLE (dedicated, separate from partners)
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  trade_name TEXT,                           -- nome fantasia
  document TEXT,                             -- CNPJ/CPF
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  contact_person TEXT,
  payment_terms TEXT,                        -- ex: "30/60/90 dias"
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON suppliers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_document ON suppliers(tenant_id, document) WHERE document IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(tenant_id, name);

-- ──────────────────────────────────────────────────────────────────
-- 2. ADD average_cost TO services (CMPM value)
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE services ADD COLUMN IF NOT EXISTS average_cost NUMERIC(12,4) DEFAULT 0;

-- ──────────────────────────────────────────────────────────────────
-- 3. PRODUCT COST HISTORY (audit trail for CMPM changes)
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_cost_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  service_id UUID NOT NULL REFERENCES services(id),
  movement_type TEXT NOT NULL
    CHECK (movement_type IN ('purchase', 'adjustment', 'initial', 'return')),
  quantity NUMERIC(12,4) NOT NULL,
  unit_cost NUMERIC(12,4) NOT NULL,
  previous_average_cost NUMERIC(12,4) NOT NULL DEFAULT 0,
  new_average_cost NUMERIC(12,4) NOT NULL DEFAULT 0,
  previous_stock_qty NUMERIC(12,4) NOT NULL DEFAULT 0,
  new_stock_qty NUMERIC(12,4) NOT NULL DEFAULT 0,
  stock_value_before NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock_value_after NUMERIC(12,2) NOT NULL DEFAULT 0,
  purchase_order_id UUID REFERENCES purchase_orders(id),
  purchase_order_item_id UUID REFERENCES purchase_order_items(id),
  reference TEXT,                            -- NF number, adjustment reason, etc.
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_history_service ON product_cost_history(service_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_history_tenant ON product_cost_history(tenant_id, created_at DESC);

-- ──────────────────────────────────────────────────────────────────
-- 4. ADD supplier_id FK TO purchase_orders
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_new ON purchase_orders(supplier_id) WHERE supplier_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────
-- 5. ADD average_cost snapshot TO stock_movements
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS average_cost_snapshot NUMERIC(12,4);

-- ──────────────────────────────────────────────────────────────────
-- 6. SUPPLIER PERMISSIONS
-- ──────────────────────────────────────────────────────────────────

INSERT INTO permissions (code, display_name, description, category) VALUES
  ('supplier.read',  'Ver Fornecedores',      'Pode visualizar cadastro de fornecedores',       'Compras'),
  ('supplier.write', 'Gerenciar Fornecedores', 'Pode criar e editar cadastro de fornecedores',  'Compras')
ON CONFLICT (code) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────
-- 7. INITIALIZE average_cost FROM EXISTING cost_price
-- ──────────────────────────────────────────────────────────────────

UPDATE services SET average_cost = cost_price WHERE cost_price > 0 AND (average_cost IS NULL OR average_cost = 0);

-- Done!
