-- ==========================================================================
-- ACCOUNTS PAYABLE & RECEIVABLE
-- Adds: accounts_payable, accounts_receivable tables
-- Integrates with: invoices, partner_earnings, customers, service_orders
-- ==========================================================================

BEGIN;

-- =========================
-- ENUMS
-- =========================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_entry_type') THEN
    CREATE TYPE account_entry_type AS ENUM (
      'invoice',        -- venda / fatura emitida
      'service_fee',    -- taxa de serviço
      'partner_payment',-- pagamento a parceiro
      'expense',        -- despesa operacional
      'salary',         -- folha / pró-labore
      'tax',            -- imposto
      'refund',         -- reembolso
      'transfer',       -- transferência interna
      'other'           -- outros
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_entry_status') THEN
    CREATE TYPE account_entry_status AS ENUM (
      'pending',        -- aguardando
      'partial',        -- parcialmente pago/recebido
      'paid',           -- pago / recebido
      'overdue',        -- vencido
      'cancelled'       -- cancelado
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recurrence_type') THEN
    CREATE TYPE recurrence_type AS ENUM (
      'none',           -- sem recorrência
      'weekly',         -- semanal
      'monthly',        -- mensal
      'quarterly',      -- trimestral
      'semiannual',     -- semestral
      'annual'          -- anual
    );
  END IF;
END$$;

-- =========================
-- ACCOUNTS PAYABLE (Contas a Pagar)
-- =========================
-- Tracks money going OUT: partner payments, expenses, taxes, salaries, etc.

CREATE TABLE IF NOT EXISTS accounts_payable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),

  -- What / who we're paying
  description text NOT NULL DEFAULT '',
  type account_entry_type NOT NULL DEFAULT 'expense',
  category text,                              -- free-text grouping (e.g., "Aluguel", "Software", "Impostos")

  -- Linked entities (optional, for traceability)
  partner_id uuid REFERENCES partners(id),
  partner_earning_id uuid REFERENCES partner_earnings(id),
  service_order_id uuid REFERENCES service_orders(id),
  supplier_name text,                         -- for non-partner suppliers

  -- Financial
  amount numeric(12,2) NOT NULL DEFAULT 0,
  amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  status account_entry_status NOT NULL DEFAULT 'pending',
  currency text NOT NULL DEFAULT 'BRL',

  -- Dates
  due_date date NOT NULL DEFAULT CURRENT_DATE,
  paid_at timestamptz,
  competence_date date,                       -- competência contábil (month/year)

  -- Recurrence
  recurrence recurrence_type NOT NULL DEFAULT 'none',
  recurrence_parent_id uuid REFERENCES accounts_payable(id),  -- links recurring entries to parent

  -- Payment details
  payment_method text,                        -- pix, boleto, transfer, cash, etc.
  pix_key text,
  pix_key_type text CHECK (pix_key_type IN ('cpf', 'cnpj', 'email', 'phone', 'random')),
  pix_payload text,                           -- BRCode EMV string (auto-generated)
  bank_info text,                             -- banco/agência/conta for boleto/transfer

  -- Attachments (NF, comprovante, boleto PDF)
  attachment_url text,
  attachment_name text,

  -- Approval
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,

  notes text,
  tags text[],                                -- flexible tagging

  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TRIGGER trg_accounts_payable_updated_at
BEFORE UPDATE ON accounts_payable
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_ap_tenant_status
  ON accounts_payable (tenant_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ap_tenant_due
  ON accounts_payable (tenant_id, due_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ap_tenant_partner
  ON accounts_payable (tenant_id, partner_id)
  WHERE deleted_at IS NULL AND partner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ap_tenant_type
  ON accounts_payable (tenant_id, type)
  WHERE deleted_at IS NULL;

-- =========================
-- ACCOUNTS RECEIVABLE (Contas a Receber)
-- =========================
-- Tracks money coming IN: invoices, service fees, installments, etc.

CREATE TABLE IF NOT EXISTS accounts_receivable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),

  -- What / who is paying us
  description text NOT NULL DEFAULT '',
  type account_entry_type NOT NULL DEFAULT 'invoice',
  category text,                              -- free-text grouping

  -- Linked entities (optional)
  customer_id uuid REFERENCES customers(id),
  invoice_id uuid REFERENCES invoices(id),
  service_order_id uuid REFERENCES service_orders(id),
  quote_id uuid REFERENCES quotes(id),

  -- Financial
  amount numeric(12,2) NOT NULL DEFAULT 0,
  amount_received numeric(12,2) NOT NULL DEFAULT 0,
  status account_entry_status NOT NULL DEFAULT 'pending',
  currency text NOT NULL DEFAULT 'BRL',

  -- Dates
  due_date date NOT NULL DEFAULT CURRENT_DATE,
  received_at timestamptz,
  competence_date date,

  -- Recurrence
  recurrence recurrence_type NOT NULL DEFAULT 'none',
  recurrence_parent_id uuid REFERENCES accounts_receivable(id),

  -- Payment details
  payment_method text,
  pix_key text,
  pix_key_type text CHECK (pix_key_type IN ('cpf', 'cnpj', 'email', 'phone', 'random')),
  pix_payload text,                           -- BRCode EMV auto-generated
  pix_qr_base64 text,                        -- QR code image (base64 data URI)

  -- Attachments (NF, comprovante, boleto)
  attachment_url text,
  attachment_name text,

  -- Confirmation
  confirmed_by uuid REFERENCES users(id),
  confirmed_at timestamptz,

  notes text,
  tags text[],

  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TRIGGER trg_accounts_receivable_updated_at
BEFORE UPDATE ON accounts_receivable
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_ar_tenant_status
  ON accounts_receivable (tenant_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ar_tenant_due
  ON accounts_receivable (tenant_id, due_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ar_tenant_customer
  ON accounts_receivable (tenant_id, customer_id)
  WHERE deleted_at IS NULL AND customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ar_tenant_invoice
  ON accounts_receivable (tenant_id, invoice_id)
  WHERE deleted_at IS NULL AND invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ar_tenant_type
  ON accounts_receivable (tenant_id, type)
  WHERE deleted_at IS NULL;

COMMIT;
