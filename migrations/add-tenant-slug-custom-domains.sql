-- Migration: Add slug + custom_domains to tenants for multi-domain auth resolution
-- Purpose: Allow tenants to be identified by subdomain (slug) or custom domain
-- Run via: api_dinamico or psql

-- 1. Add slug column (unique identifier for subdomain routing)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug TEXT;

-- 2. Add custom_domains column (JSONB array of custom domains)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS custom_domains JSONB DEFAULT '[]'::jsonb;

-- 3. Add default_role column (role assigned to auto-linked users, default "client")
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS default_client_role TEXT DEFAULT 'client';

-- 4. Unique index on slug (only non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_slug
  ON tenants (slug)
  WHERE slug IS NOT NULL AND slug != '';

-- 5. GIN index on custom_domains for containment queries (@>)
CREATE INDEX IF NOT EXISTS idx_tenants_custom_domains
  ON tenants USING gin (custom_domains);

-- 6. Seed existing known tenants
-- UPDATE tenants SET slug = 'sos-escritura',
--   custom_domains = '["app.sosescritura.com.br"]'::jsonb
--   WHERE company_name ILIKE '%sos escritura%' AND slug IS NULL;
