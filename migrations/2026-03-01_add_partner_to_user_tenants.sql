-- Add partner_id column to user_tenants table
ALTER TABLE user_tenants
ADD COLUMN partner_id UUID NULL REFERENCES partners(id) ON DELETE SET NULL;

-- Create index for partner lookups
CREATE INDEX idx_user_tenants_partner_id ON user_tenants(partner_id);
