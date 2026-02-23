-- ═══════════════════════════════════════════════════════════════════
-- Migration: Pré-Venda (Pre-Sale / Comanda / Tab System)
-- Date: 2026-02-21
-- Description: Creates pre_sales + pre_sale_items tables for an open-tab
--              system where operators add items over time and close
--              the tab later at the PDV (register).
-- ═══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────
-- 1. PRE_SALES (the open tab / comanda)
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pre_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  -- Identification
  label TEXT NOT NULL DEFAULT '',           -- e.g. "Mesa 5", "Balcão 2", "Receita #42"
  customer_id UUID REFERENCES customers(id),
  partner_id UUID REFERENCES partners(id),  -- operator/waiter
  opened_by UUID REFERENCES users(id),
  -- Financials (kept in sync via triggers or service layer)
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  discount_percent NUMERIC(5,2) DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- State
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed', 'cancelled')),
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES users(id),
  sale_id UUID REFERENCES sales(id),        -- FK to final sale when closed
  notes TEXT,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pre_sales_tenant ON pre_sales(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pre_sales_status ON pre_sales(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_pre_sales_partner ON pre_sales(tenant_id, partner_id);
CREATE INDEX IF NOT EXISTS idx_pre_sales_open ON pre_sales(tenant_id, status)
  WHERE status = 'open';

-- ──────────────────────────────────────────────────────────────────
-- 2. PRE_SALE_ITEMS (items added to the tab)
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pre_sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pre_sale_id UUID NOT NULL REFERENCES pre_sales(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id),
  item_kind TEXT NOT NULL CHECK (item_kind IN ('product', 'service')),
  description TEXT,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_price NUMERIC(12,2) DEFAULT 0,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  added_by UUID REFERENCES users(id),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pre_sale_items_pre_sale ON pre_sale_items(pre_sale_id);
CREATE INDEX IF NOT EXISTS idx_pre_sale_items_service ON pre_sale_items(service_id);

-- ──────────────────────────────────────────────────────────────────
-- 3. PERMISSIONS
-- ──────────────────────────────────────────────────────────────────

INSERT INTO permissions (code, display_name, description) VALUES
  ('presale.read',   'Ver Pré-Vendas',     'Pode visualizar comandas/pré-vendas abertas'),
  ('presale.write',  'Criar Pré-Vendas',   'Pode abrir comandas e adicionar itens'),
  ('presale.close',  'Fechar Pré-Vendas',  'Pode fechar comanda e gerar venda no caixa')
ON CONFLICT (code) DO NOTHING;
