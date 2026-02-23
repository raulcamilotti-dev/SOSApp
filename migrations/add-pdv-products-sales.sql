-- ═══════════════════════════════════════════════════════════════════
-- Migration: PDV — Produtos, Vendas, Estoque, Compras
-- Date: 2026-02-20
-- Description: Creates all tables and columns for the unified PDV
--              (Point of Sale) supporting products + services.
-- ═══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────
-- 1. SUPPORT TABLES
-- ──────────────────────────────────────────────────────────────────

-- 1.1 Measurement units (configurable lookup)
CREATE TABLE IF NOT EXISTS measurement_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),     -- NULL = global (system)
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Seed global units (tenant_id IS NULL)
INSERT INTO measurement_units (tenant_id, code, label, abbreviation, sort_order) VALUES
  (NULL, 'un',   'Unidade',     'un',   1),
  (NULL, 'hr',   'Hora',        'hr',   2),
  (NULL, 'min',  'Minuto',      'min',  3),
  (NULL, 'kg',   'Quilograma',  'kg',   4),
  (NULL, 'g',    'Grama',       'g',    5),
  (NULL, 'lt',   'Litro',       'lt',   6),
  (NULL, 'ml',   'Mililitro',   'ml',   7),
  (NULL, 'm',    'Metro',       'm',    8),
  (NULL, 'm2',   'Metro²',      'm²',   9),
  (NULL, 'pct',  'Pacote',      'pct',  10),
  (NULL, 'cx',   'Caixa',       'cx',   11),
  (NULL, 'par',  'Par',         'par',  12),
  (NULL, 'dose', 'Dose',        'dose', 13),
  (NULL, 'amp',  'Ampola',      'amp',  14),
  (NULL, 'fl',   'Frasco',      'fl',   15)
ON CONFLICT DO NOTHING;

-- 1.2 Discount rules (per role)
CREATE TABLE IF NOT EXISTS discount_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  role_id UUID NOT NULL REFERENCES roles(id),
  max_discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  max_discount_amount NUMERIC(12,2),
  requires_approval_above NUMERIC(5,2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_discount_rules_unique
  ON discount_rules(tenant_id, role_id) WHERE deleted_at IS NULL;

-- ──────────────────────────────────────────────────────────────────
-- 2. EXPAND services TABLE (unified catalog)
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE services ADD COLUMN IF NOT EXISTS item_kind TEXT DEFAULT 'service'
  CHECK (item_kind IN ('product', 'service'));
ALTER TABLE services ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS sell_price NUMERIC(12,2) DEFAULT 0;
ALTER TABLE services ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2) DEFAULT 0;
ALTER TABLE services ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES measurement_units(id);
ALTER TABLE services ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS track_stock BOOLEAN DEFAULT false;
ALTER TABLE services ADD COLUMN IF NOT EXISTS stock_quantity NUMERIC(12,3) DEFAULT 0;
ALTER TABLE services ADD COLUMN IF NOT EXISTS min_stock NUMERIC(12,3) DEFAULT 0;
ALTER TABLE services ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 60;
ALTER TABLE services ADD COLUMN IF NOT EXISTS requires_scheduling BOOLEAN DEFAULT false;
ALTER TABLE services ADD COLUMN IF NOT EXISTS requires_separation BOOLEAN DEFAULT false;
ALTER TABLE services ADD COLUMN IF NOT EXISTS requires_delivery BOOLEAN DEFAULT false;
ALTER TABLE services ADD COLUMN IF NOT EXISTS delivery_service_type_id UUID REFERENCES service_types(id);
ALTER TABLE services ADD COLUMN IF NOT EXISTS commission_percent NUMERIC(5,2) DEFAULT 0;
ALTER TABLE services ADD COLUMN IF NOT EXISTS tax_percent NUMERIC(5,2) DEFAULT 0;
ALTER TABLE services ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE services ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS is_composition BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_services_sku ON services(tenant_id, sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_services_barcode ON services(tenant_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_services_item_kind ON services(tenant_id, item_kind);
CREATE INDEX IF NOT EXISTS idx_services_composition ON services(tenant_id, is_composition) WHERE is_composition = true;

-- ──────────────────────────────────────────────────────────────────
-- 3. SERVICE COMPOSITIONS (combo / kit)
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS service_compositions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  child_service_id UUID NOT NULL REFERENCES services(id),
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_service_compositions_parent ON service_compositions(parent_service_id);
CREATE INDEX IF NOT EXISTS idx_service_compositions_child ON service_compositions(child_service_id);

ALTER TABLE service_compositions
  ADD CONSTRAINT chk_no_self_composition
  CHECK (parent_service_id != child_service_id);

-- ──────────────────────────────────────────────────────────────────
-- 4. SALES + SALE_ITEMS
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  partner_id UUID REFERENCES partners(id),
  sold_by_user_id UUID REFERENCES users(id),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  discount_percent NUMERIC(5,2) DEFAULT 0,
  tax_amount NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'completed', 'cancelled', 'refunded', 'partial_refund')),
  invoice_id UUID REFERENCES invoices(id),
  payment_method TEXT,
  paid_at TIMESTAMPTZ,
  has_pending_services BOOLEAN DEFAULT false,
  has_pending_products BOOLEAN DEFAULT false,
  discount_approved_by UUID REFERENCES users(id),
  notes TEXT,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sales_tenant ON sales(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_partner ON sales(tenant_id, partner_id);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id),
  item_kind TEXT NOT NULL CHECK (item_kind IN ('product', 'service')),
  description TEXT,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  unit_id UUID REFERENCES measurement_units(id),
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_price NUMERIC(12,2) DEFAULT 0,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_percent NUMERIC(5,2) DEFAULT 0,
  commission_amount NUMERIC(12,2) DEFAULT 0,
  -- Service fulfillment
  service_order_id UUID REFERENCES service_orders(id),
  appointment_id UUID REFERENCES service_appointments(id),
  -- Product fulfillment
  separation_status TEXT DEFAULT 'not_required'
    CHECK (separation_status IN ('not_required', 'pending', 'in_progress', 'ready', 'delivered', 'cancelled')),
  separated_by_user_id UUID REFERENCES users(id),
  separated_at TIMESTAMPTZ,
  delivery_status TEXT DEFAULT 'not_required'
    CHECK (delivery_status IN ('not_required', 'pending', 'in_transit', 'delivered', 'failed', 'cancelled')),
  delivery_service_order_id UUID REFERENCES service_orders(id),
  delivered_at TIMESTAMPTZ,
  -- Unified fulfillment
  fulfillment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (fulfillment_status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  -- Composition tracking
  parent_sale_item_id UUID REFERENCES sale_items(id),
  is_composition_parent BOOLEAN DEFAULT false,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_service ON sale_items(service_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_fulfillment ON sale_items(fulfillment_status)
  WHERE fulfillment_status NOT IN ('completed', 'cancelled');

-- ──────────────────────────────────────────────────────────────────
-- 5. STOCK MOVEMENTS
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  service_id UUID NOT NULL REFERENCES services(id),
  movement_type TEXT NOT NULL
    CHECK (movement_type IN ('sale', 'purchase', 'adjustment', 'return', 'transfer', 'separation', 'correction')),
  quantity NUMERIC(12,3) NOT NULL,
  previous_quantity NUMERIC(12,3) NOT NULL,
  new_quantity NUMERIC(12,3) NOT NULL,
  unit_cost NUMERIC(12,2),
  sale_id UUID REFERENCES sales(id),
  sale_item_id UUID REFERENCES sale_items(id),
  purchase_order_id UUID,
  purchase_order_item_id UUID,
  reason TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_service ON stock_movements(service_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant ON stock_movements(tenant_id, created_at DESC);

-- ──────────────────────────────────────────────────────────────────
-- 6. PURCHASE ORDERS
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  supplier_partner_id UUID REFERENCES partners(id),
  supplier_name TEXT,
  supplier_document TEXT,
  invoice_number TEXT,
  invoice_date DATE,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  shipping_cost NUMERIC(12,2) DEFAULT 0,
  tax_amount NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ordered', 'partial_received', 'received', 'cancelled')),
  ordered_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  received_by UUID REFERENCES users(id),
  created_by UUID REFERENCES users(id),
  notes TEXT,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant ON purchase_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(tenant_id, status);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id),
  description TEXT,
  quantity_ordered NUMERIC(12,3) NOT NULL DEFAULT 0,
  quantity_received NUMERIC(12,3) NOT NULL DEFAULT 0,
  unit_id UUID REFERENCES measurement_units(id),
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  update_cost_price BOOLEAN DEFAULT true,
  received_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_po_items_service ON purchase_order_items(service_id);

-- FK for stock_movements → purchase_orders
ALTER TABLE stock_movements
  ADD CONSTRAINT fk_stock_movements_po
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id);
ALTER TABLE stock_movements
  ADD CONSTRAINT fk_stock_movements_poi
  FOREIGN KEY (purchase_order_item_id) REFERENCES purchase_order_items(id);

-- ──────────────────────────────────────────────────────────────────
-- 7. EXPAND EXISTING TABLES WITH sale_id FK
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE partner_earnings ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES sales(id);
CREATE INDEX IF NOT EXISTS idx_partner_earnings_sale ON partner_earnings(sale_id) WHERE sale_id IS NOT NULL;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES sales(id);
CREATE INDEX IF NOT EXISTS idx_invoices_sale ON invoices(sale_id) WHERE sale_id IS NOT NULL;

ALTER TABLE accounts_receivable ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES sales(id);
CREATE INDEX IF NOT EXISTS idx_ar_sale ON accounts_receivable(sale_id) WHERE sale_id IS NOT NULL;

-- Customer identification level
ALTER TABLE customers ADD COLUMN IF NOT EXISTS identification_level TEXT DEFAULT 'full'
  CHECK (identification_level IN ('full', 'partial', 'anonymous'));

-- ──────────────────────────────────────────────────────────────────
-- 8. NEW PERMISSIONS
-- ──────────────────────────────────────────────────────────────────

INSERT INTO permissions (code, display_name, description, category) VALUES
  ('pdv.access',       'Acessar PDV',          'Pode abrir e operar o Ponto de Venda',        'PDV'),
  ('sale.read',        'Ver Vendas',           'Pode visualizar vendas realizadas',            'PDV'),
  ('sale.write',       'Criar/Editar Vendas',  'Pode realizar vendas e editar vendas abertas', 'PDV'),
  ('sale.cancel',      'Cancelar Vendas',      'Pode cancelar ou estornar vendas',             'PDV'),
  ('sale.refund',      'Estornar Vendas',      'Pode fazer estorno total ou parcial',          'PDV'),
  ('stock.read',       'Ver Estoque',          'Pode visualizar posição de estoque',           'Estoque'),
  ('stock.write',      'Ajustar Estoque',      'Pode fazer ajustes manuais de estoque',        'Estoque'),
  ('purchase.read',    'Ver Compras',          'Pode visualizar ordens de compra',             'Compras'),
  ('purchase.write',   'Criar/Editar Compras', 'Pode criar e gerenciar ordens de compra',      'Compras'),
  ('purchase.receive', 'Receber Mercadoria',   'Pode confirmar recebimento de compras',        'Compras'),
  ('discount.approve', 'Aprovar Descontos',    'Pode aprovar descontos acima do limite',       'PDV')
ON CONFLICT (code) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────
-- 9. REGISTER NEW MODULES
-- ──────────────────────────────────────────────────────────────────

-- Ensure module keys exist in tenant_modules for activation.
-- Tenants activate via INSERT INTO tenant_modules(tenant_id, module_key, is_active).
-- The module keys are: pdv, products, stock, purchases, delivery
-- No DDL needed here — tenant_modules is a generic key/value table.

-- Done!
