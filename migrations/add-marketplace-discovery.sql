-- ============================================================
-- Marketplace Discovery (C.3)
-- Adds featured controls + indexes for discovery filters/sort.
-- ============================================================

ALTER TABLE marketplace_packs
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;

ALTER TABLE marketplace_packs
  ADD COLUMN IF NOT EXISTS featured_order INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_mp_featured
  ON marketplace_packs(is_featured, featured_order)
  WHERE deleted_at IS NULL AND status = 'published';

CREATE INDEX IF NOT EXISTS idx_mp_rating_avg
  ON marketplace_packs(rating_avg)
  WHERE deleted_at IS NULL AND status = 'published';

CREATE INDEX IF NOT EXISTS idx_mp_price
  ON marketplace_packs(price_cents)
  WHERE deleted_at IS NULL AND status = 'published';
