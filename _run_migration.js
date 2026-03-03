const axios = require("axios");

// Load API key from .env or fallback
let apiKey = process.env.EXPO_PUBLIC_N8N_API_KEY;
if (!apiKey) {
  try {
    const fs = require("fs");
    const envContent = fs.readFileSync(".env", "utf8");
    const match = envContent.match(/EXPO_PUBLIC_N8N_API_KEY=(.+)/);
    if (match) apiKey = match[1].trim();
  } catch {}
}
if (!apiKey) {
  console.error("No API key found");
  process.exit(1);
}

const sql = `
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'api_keys') THEN
        RAISE NOTICE 'Table api_keys already exists -- skipping creation';
    ELSE
        CREATE TABLE api_keys (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id),
            name VARCHAR(255) NOT NULL,
            key_hash VARCHAR(255) NOT NULL,
            key_prefix VARCHAR(20) NOT NULL,
            environment VARCHAR(10) NOT NULL DEFAULT 'live',
            scopes JSONB NOT NULL DEFAULT '["read"]',
            allowed_tables JSONB DEFAULT '[]',
            rate_limit_per_minute INTEGER DEFAULT 60,
            last_used_at TIMESTAMPTZ,
            expires_at TIMESTAMPTZ,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_by UUID REFERENCES users(id),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            deleted_at TIMESTAMPTZ,
            UNIQUE(key_prefix)
        );
        CREATE INDEX idx_api_keys_tenant ON api_keys(tenant_id);
        CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
        CREATE INDEX idx_api_keys_active ON api_keys(tenant_id, is_active) WHERE deleted_at IS NULL;
        RAISE NOTICE 'Table api_keys created successfully';
    END IF;
END $$;
`;

async function run() {
  try {
    const res = await axios.post(
      "https://sos-api-crud.raulcamilotti-c44.workers.dev/api_dinamico",
      { sql },
      {
        headers: { "X-Api-Key": apiKey },
      },
    );
    console.log("Migration SUCCESS:", JSON.stringify(res.data));
  } catch (e) {
    console.error(
      "Migration FAILED:",
      e.response ? JSON.stringify(e.response.data) : e.message,
    );
  }
}

run();
