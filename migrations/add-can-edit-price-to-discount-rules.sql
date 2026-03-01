-- Migration: Add can_edit_price to discount_rules
-- Allows controlling whether a role can edit the sell price in the PDV
-- This is in the SAME table as the discount permission for consistency

ALTER TABLE discount_rules
  ADD COLUMN IF NOT EXISTS can_edit_price BOOLEAN DEFAULT false;

COMMENT ON COLUMN discount_rules.can_edit_price IS
  'Whether this role can edit item sell prices in the PDV. Default false = uses catalog price.';
