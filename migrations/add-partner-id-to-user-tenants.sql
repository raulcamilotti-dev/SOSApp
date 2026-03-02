-- Add partner_id to user_tenants for N:1 partner relationships
-- This allows multiple users to work under the same partner within a tenant
-- Separates role-based permissions (role_id) from operational partner relationships (partner_id)

ALTER TABLE user_tenants 
ADD COLUMN partner_id UUID REFERENCES partners(id) ON DELETE SET NULL;

-- Index for performance when filtering by partner
CREATE INDEX idx_user_tenants_partner_id ON user_tenants(partner_id);

-- Comment explaining the field's purpose
COMMENT ON COLUMN user_tenants.partner_id IS 
'Links user to a partner within this tenant context. NULL for non-partner users (admin, internal staff). Multiple users can share the same partner_id. This is separate from role_id - role controls UI permissions, partner_id controls data scope/operational relationships.';
