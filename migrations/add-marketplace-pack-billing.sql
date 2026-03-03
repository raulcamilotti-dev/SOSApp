-- B.1 Pack Pricing & Billing — Migration
-- Adds trial support for marketplace packs

-- Trial days for monthly packs (0 = no trial)
ALTER TABLE marketplace_packs ADD COLUMN IF NOT EXISTS
    trial_days INTEGER DEFAULT 0;
