-- Bank Management Tables
-- Banks, bank accounts, and bank transactions (extrato) for tenant financial management.

-- ═══════════════════════════════════════════════════════
-- Table: banks
-- Tenant bank registry — stores which banks the tenant works with.
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS banks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(120) NOT NULL,                   -- Bank display name (e.g. "Banco do Brasil", "Nubank")
  bank_code VARCHAR(10),                        -- COMPE code (e.g. "001", "260")
  ispb_code VARCHAR(10),                        -- ISPB code for PIX routing
  logo_url TEXT,                                -- Bank logo URL (optional)
  notes TEXT,                                   -- Free-form notes
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_banks_tenant
  ON banks(tenant_id)
  WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════
-- Table: bank_accounts
-- Bank accounts within each bank. Supports initial balance,
-- account type, default flag, PIX key, etc.
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  bank_id UUID NOT NULL REFERENCES banks(id),
  account_name VARCHAR(120) NOT NULL,           -- Friendly label (e.g. "Conta Principal", "Conta PJ")
  account_type VARCHAR(30) NOT NULL DEFAULT 'checking',
    -- checking, savings, investment, payment, salary
  agency_number VARCHAR(20),                    -- Branch/agency number
  account_number VARCHAR(30),                   -- Account number
  account_digit VARCHAR(5),                     -- Check digit
  pix_key TEXT,                                 -- PIX key registered for this account
  pix_key_type VARCHAR(20),                     -- cpf, cnpj, email, phone, random
  initial_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  initial_balance_date DATE,                    -- Date the initial balance refers to
  current_balance NUMERIC(14,2) NOT NULL DEFAULT 0,  -- Cached balance (updated by transactions)
  currency VARCHAR(3) NOT NULL DEFAULT 'BRL',
  is_default BOOLEAN NOT NULL DEFAULT false,    -- Default account for the tenant
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Ensure only ONE default account per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_accounts_default_tenant
  ON bank_accounts(tenant_id)
  WHERE is_default = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bank_accounts_tenant
  ON bank_accounts(tenant_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bank_accounts_bank
  ON bank_accounts(bank_id)
  WHERE deleted_at IS NULL;

-- Check constraint for account_type
ALTER TABLE bank_accounts
  ADD CONSTRAINT chk_bank_accounts_type
  CHECK (account_type IN ('checking', 'savings', 'investment', 'payment', 'salary'));

-- Check constraint for pix_key_type
ALTER TABLE bank_accounts
  ADD CONSTRAINT chk_bank_accounts_pix_key_type
  CHECK (pix_key_type IS NULL OR pix_key_type IN ('cpf', 'cnpj', 'email', 'phone', 'random'));

-- ═══════════════════════════════════════════════════════
-- Table: bank_transactions
-- Transaction history / extrato for each bank account.
-- Tracks all movements (credits/debits), categories, and
-- links to financial records (invoices, payments, AR/AP).
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  bank_account_id UUID NOT NULL REFERENCES bank_accounts(id),
  transaction_date DATE NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,                -- Always positive; direction from transaction_type
  transaction_type VARCHAR(10) NOT NULL DEFAULT 'debit',
    -- 'credit' or 'debit'
  category VARCHAR(60),                          -- Free-form category (e.g. "Fornecedor", "Salário", "Receita")
  reference_type VARCHAR(40),                   -- invoice, payment, accounts_receivable, accounts_payable, transfer, manual
  reference_id UUID,                            -- FK to linked record (invoice, payment, AR, AP, etc.)
  balance_after NUMERIC(14,2),                  -- Balance after this transaction (for statement display)
  notes TEXT,
  reconciled BOOLEAN NOT NULL DEFAULT false,
  reconciled_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Check constraint for transaction_type
ALTER TABLE bank_transactions
  ADD CONSTRAINT chk_bank_transactions_type
  CHECK (transaction_type IN ('credit', 'debit'));

CREATE INDEX IF NOT EXISTS idx_bank_transactions_tenant
  ON bank_transactions(tenant_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_account
  ON bank_transactions(bank_account_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_date
  ON bank_transactions(bank_account_id, transaction_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_reference
  ON bank_transactions(reference_type, reference_id)
  WHERE deleted_at IS NULL AND reference_id IS NOT NULL;
