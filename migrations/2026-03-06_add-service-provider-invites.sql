-- Migration: Service Providers (terceirizados internos do tenant)
-- Objetivo:
-- 1) Marcar roles de terceirização via roles.is_service_provider
-- 2) Criar pré-vínculo por CPF para auto-link após login/registro

ALTER TABLE roles
ADD COLUMN IF NOT EXISTS is_service_provider BOOLEAN DEFAULT false;

COMMENT ON COLUMN roles.is_service_provider IS
'Marca roles de terceirização interna do tenant (ex.: contabilidade), distintas do modelo partners.';

CREATE TABLE IF NOT EXISTS service_provider_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  role_id UUID NOT NULL REFERENCES roles(id),
  cpf VARCHAR(11) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  invited_by UUID REFERENCES users(id),
  linked_user_id UUID REFERENCES users(id),
  linked_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Garante unicidade por tenant/role/cpf apenas para registros ativos (não deletados)
CREATE UNIQUE INDEX IF NOT EXISTS idx_sp_invites_unique_active
  ON service_provider_invites(tenant_id, role_id, cpf)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sp_invites_tenant_role_status
  ON service_provider_invites(tenant_id, role_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sp_invites_cpf_status
  ON service_provider_invites(cpf, status)
  WHERE deleted_at IS NULL;
