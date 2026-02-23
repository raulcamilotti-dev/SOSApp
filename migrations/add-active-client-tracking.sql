-- ============================================================
-- Migration: Active Client Tracking
-- Adds columns for active-client-based billing model
-- ============================================================

-- 1. Add last_interaction_at to customers
-- Tracks the most recent interaction date for active client counting.
-- Updated nightly by N8N cron scanning all tables with customer_id.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS last_interaction_at TIMESTAMPTZ;

-- Index for efficient active client counting per tenant
CREATE INDEX IF NOT EXISTS idx_customers_tenant_last_interaction
  ON customers(tenant_id, last_interaction_at)
  WHERE deleted_at IS NULL;

-- 2. Add active_client_count to tenants
-- Cached count of active clients, updated by nightly cron.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS active_client_count INTEGER DEFAULT 0;

-- 3. Initialize last_interaction_at from existing data
-- Sets last_interaction_at to the most recent activity across all interaction tables.
-- This runs once to backfill existing data.
WITH all_interactions AS (
  SELECT customer_id, MAX(updated_at) AS last_activity FROM service_orders WHERE customer_id IS NOT NULL GROUP BY customer_id
  UNION ALL
  SELECT customer_id, MAX(updated_at) AS last_activity FROM invoices WHERE customer_id IS NOT NULL GROUP BY customer_id
  UNION ALL
  SELECT customer_id, MAX(created_at) AS last_activity FROM payments WHERE customer_id IS NOT NULL GROUP BY customer_id
  UNION ALL
  SELECT customer_id, MAX(created_at) AS last_activity FROM process_updates WHERE customer_id IS NOT NULL GROUP BY customer_id
  UNION ALL
  SELECT customer_id, MAX(updated_at) AS last_activity FROM quotes WHERE customer_id IS NOT NULL GROUP BY customer_id
  UNION ALL
  SELECT customer_id, MAX(created_at) AS last_activity FROM generated_documents WHERE customer_id IS NOT NULL GROUP BY customer_id
  UNION ALL
  SELECT customer_id, MAX(created_at) AS last_activity FROM client_files WHERE customer_id IS NOT NULL GROUP BY customer_id
),
latest_per_customer AS (
  SELECT customer_id, MAX(last_activity) AS last_activity
  FROM all_interactions
  GROUP BY customer_id
)
UPDATE customers c
SET last_interaction_at = lpc.last_activity
FROM latest_per_customer lpc
WHERE c.id = lpc.customer_id
  AND c.last_interaction_at IS NULL;

-- 4. Initialize active_client_count on tenants
UPDATE tenants t
SET active_client_count = sub.cnt
FROM (
  SELECT tenant_id, COUNT(*) AS cnt
  FROM customers
  WHERE last_interaction_at >= NOW() - INTERVAL '90 days'
    AND deleted_at IS NULL
  GROUP BY tenant_id
) sub
WHERE t.id = sub.tenant_id;

-- 5. For tenants with no active clients, set to 0 explicitly
UPDATE tenants
SET active_client_count = 0
WHERE active_client_count IS NULL;
