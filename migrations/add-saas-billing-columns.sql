-- Migration: Add SaaS billing columns to tenants table
-- Date: 2026-02-19
--
-- Adds columns to support pre-paid user seat billing:
-- - max_users: hard limit on user_tenants count (null = plan default from PLAN_MAP)
-- - extra_users_purchased: how many extra user seats beyond the plan limit were bought
-- - price_per_extra_user: cost per additional user seat (default R$ 29.90)
--
-- The Radul super-admin tenant stores its PIX key in tenants.config JSONB:
--   config.billing.pix_key
--   config.billing.pix_key_type
--   config.billing.pix_merchant_name
--   config.billing.pix_merchant_city
--
-- No DDL changes needed for these ^ (already JSONB).
-- The columns below are physical for fast enforcement:

-- max_users: explicit hard limit. NULL means "use plan default from PLAN_MAP"
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_users integer DEFAULT NULL;

-- extra_users_purchased: count of extra seats bought beyond the plan base
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS extra_users_purchased integer DEFAULT 0;

-- price_per_extra_user: unit price in BRL for each additional user seat
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS price_per_extra_user numeric(10,2) DEFAULT 29.90;

-- Add comment for documentation
COMMENT ON COLUMN tenants.max_users IS 'Hard user limit. NULL = plan default. Computed as plan_base + extra_users_purchased';
COMMENT ON COLUMN tenants.extra_users_purchased IS 'Number of additional user seats purchased beyond plan base limit';
COMMENT ON COLUMN tenants.price_per_extra_user IS 'Unit price in BRL per extra user seat. Default R$ 29.90';

-- ============================================================
-- Configure the Radul super-admin tenant billing PIX key
-- Update this with the actual Radul tenant ID and PIX key
-- ============================================================
-- Example (run manually with correct values):
-- UPDATE tenants
-- SET config = jsonb_set(
--   COALESCE(config::jsonb, '{}'),
--   '{billing}',
--   '{
--     "pix_key": "YOUR_PIX_KEY_HERE",
--     "pix_key_type": "cnpj",
--     "pix_merchant_name": "Radul Tecnologia",
--     "pix_merchant_city": "Curitiba"
--   }'::jsonb
-- )
-- WHERE slug = 'radul' OR company_name ILIKE '%radul%';
