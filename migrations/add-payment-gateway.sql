/**
 * Migration: Add Payment Gateway Tables
 * 
 * Creates tables for flexible payment processing:
 * - payments: transaction records
 * - payment_split_logs: commission tracking
 * - payment_metadata: extensible context storage
 */

-- payments table (flexible payment processing)
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  
  -- Payment identification
  payment_id VARCHAR(255) NOT NULL UNIQUE,
  transaction_id VARCHAR(255) UNIQUE,
  
  -- Amount (in cents, e.g., 10000 = R$ 100.00)
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  
  -- Payment method
  method VARCHAR(50) NOT NULL CHECK (method IN ('credit_card', 'pix', 'boleto', 'manual')),
  
  -- Customer information
  customer_id UUID NOT NULL REFERENCES customers(id),
  customer_email VARCHAR(255),
  customer_name VARCHAR(255),
  
  -- Payment status lifecycle
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',      -- awaiting confirmation
    'approved',     -- transaction approved
    'processing',   -- being processed
    'failed',       -- transaction failed
    'cancelled',    -- cancelled by user
    'refunded'      -- refunded back to customer
  )),
  
  -- Payment context (for routing & reporting)
  context VARCHAR(50) NOT NULL CHECK (context IN (
    'marketplace',
    'plan_subscription',
    'process_charge',
    'manual_invoice'
  )),
  context_reference_id UUID,
  
  -- Card details (if credit_card)
  card_brand VARCHAR(20),  -- visa, mastercard, amex, elo, hipercard
  card_last4 VARCHAR(4),
  card_holder_name VARCHAR(255),
  
  -- PIX details
  pix_qr_code TEXT,        -- full QR code (for rendering)
  pix_copy_paste VARCHAR(255),  -- copy-paste safe code
  pix_expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '30 minutes'),
  
  -- Boleto details
  boleto_barcode VARCHAR(255),
  boleto_pdf_url TEXT,
  boleto_due_date DATE,
  
  -- Installments (credit card)
  installments INTEGER DEFAULT 1,
  installment_amount_cents INTEGER,
  
  -- Split/commission tracking (denormalized for perf)
  splits JSONB DEFAULT '[]',  -- [{recipient_type, recipient_id, amount_cents, percentage}, ...]
  
  -- Metadata & extensibility
  metadata JSONB DEFAULT '{}',  -- {order_id, invoice_id, custom_fields}
  
  -- Audit trail
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  
  CONSTRAINT payments_customer_fk FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT payments_tenant_context_ref UNIQUE (tenant_id, payment_id)
);

CREATE INDEX idx_payments_tenant_id ON payments(tenant_id);
CREATE INDEX idx_payments_customer_id ON payments(customer_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_context ON payments(context);
CREATE INDEX idx_payments_method ON payments(method);
CREATE INDEX idx_payments_created_at ON payments(created_at DESC);
CREATE INDEX idx_payments_payment_id ON payments(payment_id);

-- payment_split_logs: commission tracking
CREATE TABLE IF NOT EXISTS payment_split_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  
  -- Who receives the money
  recipient_type VARCHAR(50) NOT NULL CHECK (recipient_type IN (
    'tenant',      -- platform operator
    'partner',     -- field partner earning commission
    'platform',    -- internal platform account
    'financial'    -- financial recipient
  )),
  recipient_id UUID NOT NULL,
  recipient_email VARCHAR(255),
  
  -- Amount split
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  percentage NUMERIC(5, 2),  -- 85.50 = 85.50%
  
  -- Split status
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'scheduled',
    'processing',
    'completed',
    'failed',
    'cancelled'
  )),
  
  -- Payment method for recipient
  payout_method VARCHAR(50),  -- pix, bank_transfer, credit, etc.
  payout_reference VARCHAR(255),  -- CPF, bank account, etc.
  scheduled_at TIMESTAMP,
  completed_at TIMESTAMP,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT split_recipient_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE INDEX idx_payment_split_logs_payment_id ON payment_split_logs(payment_id);
CREATE INDEX idx_payment_split_logs_recipient_id ON payment_split_logs(recipient_id);
CREATE INDEX idx_payment_split_logs_status ON payment_split_logs(status);
CREATE INDEX idx_payment_split_logs_tenant_id ON payment_split_logs(tenant_id);

-- payment_metadata: extensible context storage
CREATE TABLE IF NOT EXISTS payment_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  
  -- Metadata key-value pairs
  key VARCHAR(255) NOT NULL,
  value TEXT,
  
  -- Type for flexible querying
  value_type VARCHAR(50) DEFAULT 'string' CHECK (value_type IN (
    'string',
    'integer',
    'decimal',
    'boolean',
    'timestamp',
    'json'
  )),
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT payment_metadata_unique UNIQUE (payment_id, key)
);

CREATE INDEX idx_payment_metadata_payment_id ON payment_metadata(payment_id);
CREATE INDEX idx_payment_metadata_key ON payment_metadata(key);

-- Updated payments table with updated_at trigger
CREATE OR REPLACE FUNCTION update_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_payments_updated_at ON payments;
CREATE TRIGGER tr_payments_updated_at
BEFORE UPDATE ON payments
FOR EACH ROW
EXECUTE FUNCTION update_payments_updated_at();

-- Soft delete function for payments
CREATE OR REPLACE FUNCTION soft_delete_payment(payment_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE payments SET deleted_at = NOW() WHERE id = payment_id;
END;
$$ LANGUAGE plpgsql;

-- Split calculation function
CREATE OR REPLACE FUNCTION calculate_payment_splits(
  payment_amount_cents INTEGER,
  context VARCHAR(50),
  out_splits JSONB
) RETURNS JSONB AS $$
DECLARE
  splits JSONB DEFAULT '[]'::jsonb;
BEGIN
  -- Default: 100% to tenant platform
  -- (overrides should come from application layer)
  splits := jsonb_build_array(
    jsonb_build_object(
      'recipient_type', 'platform',
      'percentage', 100.00,
      'amount_cents', payment_amount_cents
    )
  );
  
  RETURN splits;
END;
$$ LANGUAGE plpgsql;
