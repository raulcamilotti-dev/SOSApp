-- ============================================================
-- Migration: Lotes (Batches) + Tabelas de Preço (Price Lists)
-- Date: 2026-06
-- Purpose: Add batch/lot tracking with FEFO and price lists
-- ============================================================

-- 1. stock_batches: tracks individual product batches with expiry
CREATE TABLE IF NOT EXISTS stock_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    service_id UUID NOT NULL REFERENCES services(id),
    batch_number TEXT NOT NULL,
    expiry_date DATE,                           -- NULL = no expiry (goes to end of FEFO queue)
    quantity NUMERIC NOT NULL DEFAULT 0,         -- current batch stock (decremented on sale, incremented on receive)
    purchase_order_id UUID REFERENCES purchase_orders(id),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- 2. Add batch_id to stock_movements for audit trail
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES stock_batches(id);

-- 3. Add track_batch flag to service_types (cascade control)
ALTER TABLE service_types ADD COLUMN IF NOT EXISTS track_batch BOOLEAN DEFAULT false;

-- 4. Add track_batch override to services (product-level)
-- NULL = inherit from service_type, true/false = explicit override
ALTER TABLE services ADD COLUMN IF NOT EXISTS track_batch BOOLEAN;

-- 5. price_lists: named price lists with priority and validity
CREATE TABLE IF NOT EXISTS price_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    description TEXT,
    priority INTEGER NOT NULL DEFAULT 1,        -- higher number wins (1-100)
    valid_from DATE,
    valid_until DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- 6. price_list_items: individual pricing rules per list
CREATE TABLE IF NOT EXISTS price_list_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    price_list_id UUID NOT NULL REFERENCES price_lists(id),
    service_id UUID REFERENCES services(id),                -- specific product (most specific wins)
    service_category_id UUID REFERENCES service_categories(id), -- category-wide rule
    price_type TEXT NOT NULL DEFAULT 'fixed',                -- 'fixed' | 'discount_percent' | 'markup_percent'
    price_value NUMERIC NOT NULL DEFAULT 0,                  -- the value (absolute price, % discount, or % markup)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    -- At least one scope must be set
    CONSTRAINT price_list_item_scope CHECK (service_id IS NOT NULL OR service_category_id IS NOT NULL)
);

-- 7. customer_price_lists: link customers to price lists (many-to-many)
CREATE TABLE IF NOT EXISTS customer_price_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    price_list_id UUID NOT NULL REFERENCES price_lists(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(customer_id, price_list_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_stock_batches_tenant ON stock_batches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_batches_service ON stock_batches(service_id);
CREATE INDEX IF NOT EXISTS idx_stock_batches_expiry ON stock_batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_stock_movements_batch ON stock_movements(batch_id);
CREATE INDEX IF NOT EXISTS idx_price_lists_tenant ON price_lists(tenant_id);
CREATE INDEX IF NOT EXISTS idx_price_list_items_list ON price_list_items(price_list_id);
CREATE INDEX IF NOT EXISTS idx_price_list_items_service ON price_list_items(service_id);
CREATE INDEX IF NOT EXISTS idx_price_list_items_category ON price_list_items(service_category_id);
CREATE INDEX IF NOT EXISTS idx_customer_price_lists_customer ON customer_price_lists(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_price_lists_list ON customer_price_lists(price_list_id);
