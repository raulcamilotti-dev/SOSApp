-- ==========================================================================
-- FINANCIAL & PARTNER EARNINGS
-- Adds: partner PIX info, partner_earnings, invoices, invoice_items, payments
-- Depends on: partners, service_orders, service_appointments, customers, tenants
-- ==========================================================================

BEGIN;

-- =========================
-- PIX FIELDS ON PARTNERS
-- =========================

DO $$
BEGIN
  -- pix_key: the actual PIX key (email, phone, CPF/CNPJ, random)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partners' AND column_name = 'pix_key'
  ) THEN
    ALTER TABLE partners ADD COLUMN pix_key text;
  END IF;

  -- pix_key_type: type of PIX key
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partners' AND column_name = 'pix_key_type'
  ) THEN
    ALTER TABLE partners ADD COLUMN pix_key_type text
      CHECK (pix_key_type IN ('cpf', 'cnpj', 'email', 'phone', 'random'));
  END IF;

  -- bank_name: optional, for display purposes
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partners' AND column_name = 'bank_name'
  ) THEN
    ALTER TABLE partners ADD COLUMN bank_name text;
  END IF;
END$$;

-- =========================
-- ENUMS
-- =========================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'earning_type') THEN
    CREATE TYPE earning_type AS ENUM ('commission', 'fee', 'bonus', 'deduction');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'earning_status') THEN
    CREATE TYPE earning_status AS ENUM ('pending', 'approved', 'paid', 'cancelled');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_status') THEN
    CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'paid', 'overdue', 'cancelled');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    CREATE TYPE payment_status AS ENUM ('pending', 'confirmed', 'failed', 'refunded');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
    CREATE TYPE payment_method AS ENUM ('pix', 'credit_card', 'boleto', 'transfer', 'cash', 'other');
  END IF;
END$$;

-- =========================
-- PARTNER EARNINGS
-- =========================
-- Tracks what each partner earns per service/appointment.
-- Partners can attach NF/nota de débito documents.

CREATE TABLE IF NOT EXISTS partner_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  partner_id uuid NOT NULL REFERENCES partners(id),

  -- Link to service context (at least one should be set)
  service_order_id uuid REFERENCES service_orders(id),
  appointment_id uuid REFERENCES service_appointments(id),

  -- Financial
  description text NOT NULL DEFAULT '',
  amount numeric(12,2) NOT NULL DEFAULT 0,
  type earning_type NOT NULL DEFAULT 'commission',
  status earning_status NOT NULL DEFAULT 'pending',

  -- PIX info (copied from partner at creation time, can be overridden)
  pix_key text,
  pix_key_type text CHECK (pix_key_type IN ('cpf', 'cnpj', 'email', 'phone', 'random')),

  -- Payment tracking
  paid_at timestamptz,
  paid_by uuid REFERENCES users(id),
  payment_reference text, -- transaction ID, comprovante number, etc.

  -- Document attachment (NF, nota de débito, recibo)
  attachment_url text,
  attachment_name text,
  attachment_type text, -- 'nf', 'nota_debito', 'recibo', 'other'

  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TRIGGER trg_partner_earnings_updated_at
BEFORE UPDATE ON partner_earnings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_partner_earnings_tenant_partner
  ON partner_earnings (tenant_id, partner_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_partner_earnings_tenant_status
  ON partner_earnings (tenant_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_partner_earnings_tenant_so
  ON partner_earnings (tenant_id, service_order_id)
  WHERE deleted_at IS NULL AND service_order_id IS NOT NULL;

-- =========================
-- INVOICES
-- =========================
-- Invoices issued by the tenant to customers (or internally).

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),

  -- References
  customer_id uuid REFERENCES customers(id),
  service_order_id uuid REFERENCES service_orders(id),
  quote_id uuid REFERENCES quotes(id),

  -- Header
  invoice_number text, -- auto-generated or manual
  title text NOT NULL DEFAULT '',
  description text,
  status invoice_status NOT NULL DEFAULT 'draft',

  -- Amounts
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  tax numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,

  -- Dates
  issued_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,

  -- PIX info for payment
  pix_key text,
  pix_key_type text CHECK (pix_key_type IN ('cpf', 'cnpj', 'email', 'phone', 'random')),
  pix_qr_code text, -- QR code payload for copy/paste

  -- Document attachment (NF emitida, comprovante, etc.)
  attachment_url text,
  attachment_name text,

  notes text,
  created_by uuid REFERENCES users(id),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TRIGGER trg_invoices_updated_at
BEFORE UPDATE ON invoices
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_invoices_tenant_status
  ON invoices (tenant_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_tenant_customer
  ON invoices (tenant_id, customer_id)
  WHERE deleted_at IS NULL AND customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_tenant_so
  ON invoices (tenant_id, service_order_id)
  WHERE deleted_at IS NULL AND service_order_id IS NOT NULL;

-- =========================
-- INVOICE ITEMS
-- =========================

CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,

  description text NOT NULL DEFAULT '',
  quantity numeric(10,2) NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TRIGGER trg_invoice_items_updated_at
BEFORE UPDATE ON invoice_items
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice
  ON invoice_items (invoice_id)
  WHERE deleted_at IS NULL;

-- =========================
-- PAYMENTS
-- =========================
-- Tracks actual payment transactions (for invoices or partner earnings).

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),

  -- Link to what was paid
  invoice_id uuid REFERENCES invoices(id),
  partner_earning_id uuid REFERENCES partner_earnings(id),

  -- Payment details
  amount numeric(12,2) NOT NULL DEFAULT 0,
  method payment_method NOT NULL DEFAULT 'pix',
  status payment_status NOT NULL DEFAULT 'pending',

  -- Gateway/external reference
  gateway_reference text, -- MercadoPago ID, bank transaction, etc.
  gateway_payload jsonb, -- raw gateway response

  -- PIX details
  pix_key text,
  pix_transaction_id text,

  -- Document attachment (comprovante)
  attachment_url text,
  attachment_name text,

  paid_at timestamptz,
  confirmed_by uuid REFERENCES users(id),
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TRIGGER trg_payments_updated_at
BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_payments_tenant_status
  ON payments (tenant_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payments_tenant_invoice
  ON payments (tenant_id, invoice_id)
  WHERE deleted_at IS NULL AND invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_tenant_earning
  ON payments (tenant_id, partner_earning_id)
  WHERE deleted_at IS NULL AND partner_earning_id IS NOT NULL;

COMMIT;
