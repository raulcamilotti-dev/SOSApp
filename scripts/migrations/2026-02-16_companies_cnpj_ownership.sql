-- ================================================================
-- Migration: Companies & Company Members + Properties owner_kind
-- Date: 2026-02-16
-- Purpose: Support CNPJ (PJ) ownership alongside CPF (PF)
-- ================================================================

-- ----------------------------------------------------------------
-- 1. companies table
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID REFERENCES tenants(id),
  cnpj         VARCHAR(14) NOT NULL,           -- digits only
  razao_social VARCHAR(255) NOT NULL,
  nome_fantasia VARCHAR(255),
  email        VARCHAR(255),
  phone        VARCHAR(30),
  address      VARCHAR(500),
  number       VARCHAR(20),
  complement   VARCHAR(100),
  neighborhood VARCHAR(100),
  city         VARCHAR(100),
  state        VARCHAR(2),
  postal_code  VARCHAR(8),
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW(),
  deleted_at   TIMESTAMP,
  UNIQUE(tenant_id, cnpj)
);

CREATE INDEX IF NOT EXISTS idx_companies_tenant  ON companies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_companies_cnpj    ON companies(cnpj);
CREATE INDEX IF NOT EXISTS idx_companies_deleted  ON companies(deleted_at);

-- ----------------------------------------------------------------
-- 2. company_members table
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS company_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES users(id),     -- null if invited but no account yet
  cpf          VARCHAR(11) NOT NULL,           -- always present (digits only)
  role         VARCHAR(20) NOT NULL DEFAULT 'member'
                 CHECK (role IN ('admin', 'member')),
  invited_by   UUID REFERENCES users(id),
  tenant_id    UUID REFERENCES tenants(id),
  created_at   TIMESTAMP DEFAULT NOW(),
  deleted_at   TIMESTAMP,
  UNIQUE(company_id, cpf)
);

CREATE INDEX IF NOT EXISTS idx_company_members_company   ON company_members(company_id);
CREATE INDEX IF NOT EXISTS idx_company_members_user      ON company_members(user_id);
CREATE INDEX IF NOT EXISTS idx_company_members_cpf       ON company_members(cpf);
CREATE INDEX IF NOT EXISTS idx_company_members_tenant    ON company_members(tenant_id);
CREATE INDEX IF NOT EXISTS idx_company_members_deleted   ON company_members(deleted_at);

-- ----------------------------------------------------------------
-- 3. Add owner_kind + company_id to properties
-- ----------------------------------------------------------------
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS owner_kind  VARCHAR(4) DEFAULT 'cpf'
    CHECK (owner_kind IN ('cpf', 'cnpj'));

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS company_id  UUID REFERENCES companies(id);

CREATE INDEX IF NOT EXISTS idx_properties_owner_kind ON properties(owner_kind);
CREATE INDEX IF NOT EXISTS idx_properties_company_id ON properties(company_id);

-- ----------------------------------------------------------------
-- 4. Backfill: all existing properties → owner_kind = 'cpf'
-- ----------------------------------------------------------------
UPDATE properties
SET owner_kind = 'cpf'
WHERE owner_kind IS NULL;

-- ----------------------------------------------------------------
-- 5. Auto-link: after a user registers, link company_members
--    This is done in application code (AuthContext / register flow),
--    but here's a helper function for manual/N8N use:
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION link_user_to_company_memberships(p_user_id UUID, p_cpf VARCHAR)
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE company_members
  SET user_id = p_user_id
  WHERE cpf = p_cpf
    AND user_id IS NULL
    AND deleted_at IS NULL;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- Done. Run with: node scripts/run-api-dinamico-sql.js scripts/migrations/2026-02-16_companies_cnpj_ownership.sql
-- ================================================================
