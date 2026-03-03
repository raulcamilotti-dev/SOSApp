#!/usr/bin/env node
/**
 * Run marketplace packs migration — executes each SQL statement separately.
 */
const https = require("https");

const API_KEY = "pnZdAqNqmtSPfHHUMsjAs1pFaygbyjd8Jd66QZXYwvg";
const HOST = "sos-api-crud.raulcamilotti-c44.workers.dev";

function runSQL(sql) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ sql });
    const opts = {
      hostname: HOST,
      path: "/api_dinamico",
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": API_KEY },
    };
    const req = https.request(opts, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        } else {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

const statements = [
  // 1. marketplace_packs table
  `CREATE TABLE IF NOT EXISTS marketplace_packs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    builder_id UUID NOT NULL REFERENCES users(id),
    builder_tenant_id UUID REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    long_description TEXT,
    icon VARCHAR(50) DEFAULT '📦',
    category VARCHAR(50) NOT NULL,
    tags JSONB DEFAULT '[]',
    pack_data JSONB NOT NULL,
    agent_pack_data JSONB,
    version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    rejection_reason TEXT,
    pricing_type VARCHAR(20) NOT NULL DEFAULT 'free',
    price_cents INTEGER DEFAULT 0,
    download_count INTEGER DEFAULT 0,
    rating_avg NUMERIC(3,2) DEFAULT 0,
    rating_count INTEGER DEFAULT 0,
    is_official BOOLEAN DEFAULT false,
    preview_images JSONB DEFAULT '[]',
    requirements JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
  )`,

  // 2. marketplace_installs table
  `CREATE TABLE IF NOT EXISTS marketplace_installs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    pack_id UUID NOT NULL REFERENCES marketplace_packs(id),
    installed_version VARCHAR(20) NOT NULL,
    installed_by UUID REFERENCES users(id),
    installed_at TIMESTAMPTZ DEFAULT NOW(),
    uninstalled_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'active',
    UNIQUE(tenant_id, pack_id)
  )`,

  // 3. Indexes
  `CREATE INDEX IF NOT EXISTS idx_mp_category ON marketplace_packs(category) WHERE deleted_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_mp_status ON marketplace_packs(status) WHERE deleted_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_mp_slug ON marketplace_packs(slug) WHERE deleted_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_mp_official ON marketplace_packs(is_official) WHERE deleted_at IS NULL AND status = 'published'`,
  `CREATE INDEX IF NOT EXISTS idx_mp_builder ON marketplace_packs(builder_id) WHERE deleted_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_mi_tenant ON marketplace_installs(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_mi_pack ON marketplace_installs(pack_id)`,
  `CREATE INDEX IF NOT EXISTS idx_mi_status ON marketplace_installs(status)`,
];

(async () => {
  for (let i = 0; i < statements.length; i++) {
    const label = statements[i].substring(0, 60).replace(/\n/g, " ").trim();
    try {
      const result = await runSQL(statements[i]);
      console.log(
        `✅ [${i + 1}/${statements.length}] ${label}... (${result.status})`,
      );
    } catch (err) {
      console.error(
        `❌ [${i + 1}/${statements.length}] ${label}...`,
        err.message,
      );
    }
  }

  // Verify
  try {
    const result = await runSQL(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('marketplace_packs','marketplace_installs') ORDER BY table_name",
    );
    console.log("\n📋 Verification:", result.body);
  } catch (err) {
    console.error("❌ Verification failed:", err.message);
  }
})();
