-- Migration: Add can_view_all_partners flag to users table
-- Purpose: Allow specific users (even partner operators) to bypass partner scope filtering
--          and see all partners' data for a general overview.
-- Date: 2026-02-28
--
-- How it works:
--   - When false (default): user sees only their partner's data (if they have a partner_id)
--   - When true: user sees ALL partners' data regardless of their own partner_id
--   - Admin/tenant users without partner_id already see everything — this flag only matters
--     for users who are linked to a specific partner but need a panoramic view.

ALTER TABLE users ADD COLUMN IF NOT EXISTS can_view_all_partners BOOLEAN DEFAULT false;

COMMENT ON COLUMN users.can_view_all_partners IS 'When true, user bypasses partner scope filtering and sees all partners data';
