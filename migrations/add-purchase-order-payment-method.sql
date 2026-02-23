-- Add payment_method and installments to purchase_orders table
-- payment_method: Tracks how the supplier will be paid (pix, boleto, credit_card, transfer, cash, a_prazo, other)
-- installments: Number of installments (null or 1 = à vista, 2+ = parcelado)
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS installments INTEGER;

-- Optional: index for filtering/segmentation
CREATE INDEX IF NOT EXISTS idx_purchase_orders_payment_method ON purchase_orders (payment_method) WHERE payment_method IS NOT NULL;
