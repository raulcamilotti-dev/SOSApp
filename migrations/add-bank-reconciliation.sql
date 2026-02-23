-- Bank Reconciliation Tables
-- Stores OFX import history and per-transaction reconciliation status.
-- Used by the Conciliador Bancário screen in the financial module.

-- Table: bank_reconciliation_imports
-- Tracks each OFX file upload (one row per file).
CREATE TABLE IF NOT EXISTS bank_reconciliation_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  file_name text NOT NULL,
  bank_id text,
  account_id text,
  period_start date,
  period_end date,
  total_transactions integer NOT NULL DEFAULT 0,
  total_credits integer NOT NULL DEFAULT 0,
  total_debits integer NOT NULL DEFAULT 0,
  credit_amount numeric(12,2) NOT NULL DEFAULT 0,
  debit_amount numeric(12,2) NOT NULL DEFAULT 0,
  reconciled_count integer NOT NULL DEFAULT 0,
  imported_at timestamptz NOT NULL DEFAULT now(),
  imported_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- Table: bank_reconciliation_items
-- One row per bank transaction from an OFX import.
-- Tracks reconciliation status (pending, matched, created, ignored)
-- and links to the AR/AP entry that was matched or created.
CREATE TABLE IF NOT EXISTS bank_reconciliation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  import_id uuid NOT NULL REFERENCES bank_reconciliation_imports(id),
  fit_id text NOT NULL,                          -- OFX FITID (unique per bank statement)
  transaction_date date NOT NULL,
  transaction_amount numeric(12,2) NOT NULL,
  transaction_description text,
  transaction_type text NOT NULL,                -- 'credit' or 'debit'
  status text NOT NULL DEFAULT 'pending',        -- pending, matched, created, ignored
  linked_entry_id uuid,                          -- FK to accounts_receivable.id or accounts_payable.id
  linked_entry_table text,                       -- 'accounts_receivable' or 'accounts_payable'
  match_score integer,                           -- confidence score 0-100
  notes text,
  reconciled_by uuid REFERENCES users(id),
  reconciled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bank_recon_imports_tenant
  ON bank_reconciliation_imports(tenant_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bank_recon_items_tenant
  ON bank_reconciliation_items(tenant_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bank_recon_items_import
  ON bank_reconciliation_items(import_id)
  WHERE deleted_at IS NULL;

-- Unique constraint: prevent duplicate FITID per tenant
-- (same bank transaction should not be imported twice)
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_recon_items_fitid_tenant
  ON bank_reconciliation_items(tenant_id, fit_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bank_recon_items_status
  ON bank_reconciliation_items(tenant_id, status)
  WHERE deleted_at IS NULL;
