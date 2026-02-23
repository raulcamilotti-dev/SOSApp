-- ============================================================
-- Polimorphic entity support for protocolos & certidoes
-- 
-- Adds entity_type + entity_id columns so protocols and
-- certificates can be linked to ANY entity (property, company,
-- processo, etc.) instead of only properties.
--
-- Also adds cartorio_id FK to protocolos for proper cartório
-- tracking (which cartório will I submit this to?).
--
-- Run: node scripts/run-api-dinamico-sql.js scripts/migrations/2026-02-16_polimorphic_protocolos_certidoes.sql
-- ============================================================

-- 1. Add entity_type + entity_id to onr_protocolos
ALTER TABLE onr_protocolos
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50) DEFAULT 'property',
  ADD COLUMN IF NOT EXISTS entity_id UUID;

-- Backfill: existing rows get entity_id = property_id
UPDATE onr_protocolos
  SET entity_id = property_id,
      entity_type = 'property'
  WHERE entity_id IS NULL AND property_id IS NOT NULL;

-- Index for fast polymorphic lookups
CREATE INDEX IF NOT EXISTS idx_onr_protocolos_entity
  ON onr_protocolos (entity_type, entity_id);

-- 2. Add entity_type + entity_id to onr_certidoes
ALTER TABLE onr_certidoes
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50) DEFAULT 'property',
  ADD COLUMN IF NOT EXISTS entity_id UUID;

-- Backfill: existing rows get entity_id = property_id
UPDATE onr_certidoes
  SET entity_id = property_id,
      entity_type = 'property'
  WHERE entity_id IS NULL AND property_id IS NOT NULL;

-- Index for fast polymorphic lookups
CREATE INDEX IF NOT EXISTS idx_onr_certidoes_entity
  ON onr_certidoes (entity_type, entity_id);

-- 3. Add cartorio_id FK to onr_protocolos (link to cartórios directory)
ALTER TABLE onr_protocolos
  ADD COLUMN IF NOT EXISTS cartorio_id UUID REFERENCES cartorios(id);

-- 4. Add cartorio_id FK to onr_certidoes too
ALTER TABLE onr_certidoes
  ADD COLUMN IF NOT EXISTS cartorio_id UUID REFERENCES cartorios(id);

-- 5. Add tenant_id to cartorios (was missing — allow tenant-scoped data)
ALTER TABLE cartorios
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- Add website and horario_funcionamento to cartorios if missing
ALTER TABLE cartorios
  ADD COLUMN IF NOT EXISTS website VARCHAR(300),
  ADD COLUMN IF NOT EXISTS horario_funcionamento VARCHAR(100);

-- Done!
-- property_id remains for backwards compat, but new code should use entity_type + entity_id
