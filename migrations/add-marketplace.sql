-- ═══════════════════════════════════════════════════════════════════
-- Migration: Marketplace / E-Commerce Digital Channel
-- Date: 2026-02-28
-- Description: Adds marketplace columns to services (catalog),
--              sales (channel/shipping), and creates shopping cart
--              tables for the public online store.
-- ═══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────
-- 1. EXPAND services TABLE (marketplace catalog)
-- ──────────────────────────────────────────────────────────────────

-- Flag: product/service is visible on the public marketplace
ALTER TABLE services ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;

-- Online-specific price (may differ from sell_price used in PDV)
ALTER TABLE services ADD COLUMN IF NOT EXISTS online_price NUMERIC(12,2);

-- SEO-friendly URL slug (unique per tenant)
ALTER TABLE services ADD COLUMN IF NOT EXISTS slug TEXT;

-- Weight in grams (for Correios shipping calculation)
ALTER TABLE services ADD COLUMN IF NOT EXISTS weight_grams INTEGER DEFAULT 0;

-- Package dimensions in cm (for Correios)
ALTER TABLE services ADD COLUMN IF NOT EXISTS dimension_length_cm INTEGER DEFAULT 0;
ALTER TABLE services ADD COLUMN IF NOT EXISTS dimension_width_cm INTEGER DEFAULT 0;
ALTER TABLE services ADD COLUMN IF NOT EXISTS dimension_height_cm INTEGER DEFAULT 0;

-- Marketplace indexes
CREATE INDEX IF NOT EXISTS idx_services_published
  ON services(tenant_id, is_published) WHERE is_published = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_services_slug_unique
  ON services(tenant_id, slug) WHERE slug IS NOT NULL AND deleted_at IS NULL;

-- ──────────────────────────────────────────────────────────────────
-- 2. EXPAND sales TABLE (online channel + shipping)
-- ──────────────────────────────────────────────────────────────────

-- Sales channel: 'pdv' (in-store) or 'online' (marketplace)
ALTER TABLE sales ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'pdv'
  CHECK (channel IN ('pdv', 'online'));

-- Shipping address (JSONB for flexibility)
-- Structure: { cep, street, number, complement, neighborhood, city, state, has_portaria }
ALTER TABLE sales ADD COLUMN IF NOT EXISTS shipping_address JSONB;

-- Shipping cost charged to customer
ALTER TABLE sales ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC(12,2) DEFAULT 0;

-- Correios tracking code
ALTER TABLE sales ADD COLUMN IF NOT EXISTS tracking_code TEXT;

-- Estimated delivery date
ALTER TABLE sales ADD COLUMN IF NOT EXISTS estimated_delivery_date DATE;

-- Online-specific status (extends existing sale status for the lifecycle)
-- pending_payment → paid → processing → shipped → delivered → completed
ALTER TABLE sales ADD COLUMN IF NOT EXISTS online_status TEXT
  CHECK (online_status IN (
    'pending_payment', 'payment_confirmed', 'processing',
    'shipped', 'delivered', 'completed', 'cancelled', 'return_requested'
  ));

CREATE INDEX IF NOT EXISTS idx_sales_channel ON sales(tenant_id, channel);
CREATE INDEX IF NOT EXISTS idx_sales_online_status ON sales(tenant_id, online_status)
  WHERE online_status IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────
-- 3. SHOPPING CARTS
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS shopping_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  -- Logged-in user (NULL for guest)
  user_id UUID REFERENCES users(id),
  -- Anonymous session ID (stored in localStorage)
  session_id TEXT,
  -- Cart expiration (items are released from stock reservation after this)
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shopping_carts_tenant ON shopping_carts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shopping_carts_user ON shopping_carts(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shopping_carts_session ON shopping_carts(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shopping_carts_expires ON shopping_carts(expires_at);

CREATE TABLE IF NOT EXISTS shopping_cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID NOT NULL REFERENCES shopping_carts(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id),
  -- Which partner is selling this item (NULL = tenant default/self-partner)
  partner_id UUID REFERENCES partners(id),
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  -- Price snapshot at time of add (may change if cart is old)
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Timestamp when stock was reserved for this item
  reserved_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shopping_cart_items_cart ON shopping_cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_shopping_cart_items_service ON shopping_cart_items(service_id);

-- ──────────────────────────────────────────────────────────────────
-- 4. MARKETPLACE CONFIGURATION (in tenants.config JSONB)
-- ──────────────────────────────────────────────────────────────────
-- No DDL needed — marketplace config stored in tenants.config:
-- {
--   "marketplace": {
--     "enabled": true,
--     "commission_percent": 10,
--     "pix_key": "...",
--     "pix_key_type": "cpf|cnpj|email|phone|random",
--     "pix_merchant_name": "...",
--     "pix_merchant_city": "...",
--     "min_order_value": 0,
--     "free_shipping_above": null,
--     "default_partner_id": null,
--     "correios_cep_origin": "80000000",
--     "banner_url": null,
--     "about_text": null
--   }
-- }

-- ──────────────────────────────────────────────────────────────────
-- 5. SERVICE CATEGORIES: add slug for SEO-friendly URLs
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_service_categories_slug_unique
  ON service_categories(tenant_id, slug) WHERE slug IS NOT NULL AND deleted_at IS NULL;
