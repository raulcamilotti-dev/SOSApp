-- ============================================================
-- Migration: Chart of Accounts (Plano de Contas)
-- ============================================================
-- Hierarchical chart of accounts with 3 levels:
--   Level 1: Groups (Receitas, Custos, Despesas)
--   Level 2: Sub-groups (Receitas Operacionais, Despesas Administrativas, etc.)
--   Level 3: Leaf accounts (Honorários, Aluguel, etc.) — where entries are posted
--
-- Default accounts are seeded for every tenant via is_system_default = true.
-- Tenants can add/edit/remove accounts as needed.
-- ============================================================

-- 1. Create the chart_of_accounts table
CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    parent_id UUID REFERENCES chart_of_accounts(id),
    code VARCHAR(20) NOT NULL,           -- e.g. "1", "1.1", "1.1.01"
    name VARCHAR(150) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('revenue', 'cost', 'expense')),
    level INTEGER NOT NULL DEFAULT 1,    -- 1=group, 2=subgroup, 3=leaf
    is_leaf BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_system_default BOOLEAN NOT NULL DEFAULT false,
    display_order INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(tenant_id, code)
);

-- 2. Add chart_account_id FK to financial tables
ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS chart_account_id UUID REFERENCES chart_of_accounts(id);

ALTER TABLE accounts_receivable
  ADD COLUMN IF NOT EXISTS chart_account_id UUID REFERENCES chart_of_accounts(id);

ALTER TABLE accounts_payable
  ADD COLUMN IF NOT EXISTS chart_account_id UUID REFERENCES chart_of_accounts(id);
