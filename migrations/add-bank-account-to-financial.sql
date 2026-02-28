-- Add bank_account_id to accounts_receivable and accounts_payable
-- Allows linking each financial entry to a specific bank account (conta corrente).

-- ═══════════════════════════════════════════════════════
-- accounts_receivable: add bank_account_id
-- ═══════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounts_receivable' AND column_name = 'bank_account_id'
  ) THEN
    ALTER TABLE accounts_receivable
      ADD COLUMN bank_account_id UUID REFERENCES bank_accounts(id);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════
-- accounts_payable: add bank_account_id
-- ═══════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounts_payable' AND column_name = 'bank_account_id'
  ) THEN
    ALTER TABLE accounts_payable
      ADD COLUMN bank_account_id UUID REFERENCES bank_accounts(id);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════
-- invoices: add bank_account_id
-- ═══════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'bank_account_id'
  ) THEN
    ALTER TABLE invoices
      ADD COLUMN bank_account_id UUID REFERENCES bank_accounts(id);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════
-- payments: add bank_account_id
-- ═══════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payments' AND column_name = 'bank_account_id'
  ) THEN
    ALTER TABLE payments
      ADD COLUMN bank_account_id UUID REFERENCES bank_accounts(id);
  END IF;
END $$;

-- Indexes for fast lookups by bank account
CREATE INDEX IF NOT EXISTS idx_ar_bank_account
  ON accounts_receivable(bank_account_id)
  WHERE bank_account_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ap_bank_account
  ON accounts_payable(bank_account_id)
  WHERE bank_account_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_bank_account
  ON invoices(bank_account_id)
  WHERE bank_account_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payments_bank_account
  ON payments(bank_account_id)
  WHERE bank_account_id IS NOT NULL AND deleted_at IS NULL;
