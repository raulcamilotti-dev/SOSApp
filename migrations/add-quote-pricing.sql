-- ──────────────────────────────────────────────────────────────────
-- Migration: Quote-based pricing for services
-- Adds pricing_type (fixed/quote) and quote_template_id to services
-- ──────────────────────────────────────────────────────────────────

-- 1. pricing_type: 'fixed' (default, existing behavior) or 'quote' (requires quote)
ALTER TABLE services ADD COLUMN IF NOT EXISTS pricing_type TEXT DEFAULT 'fixed';

-- 2. quote_template_id: optional FK to quote_templates for auto-populating quotes
ALTER TABLE services ADD COLUMN IF NOT EXISTS quote_template_id UUID REFERENCES quote_templates(id);

-- 3. Index for quick filtering of quote-based services
CREATE INDEX IF NOT EXISTS idx_services_pricing_type ON services(pricing_type) WHERE deleted_at IS NULL;
