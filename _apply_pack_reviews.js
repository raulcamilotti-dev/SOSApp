const axios = require("axios");
const BASE = "https://sos-api-crud.raulcamilotti-c44.workers.dev";
const KEY = "pnZdAqNqmtSPfHHUMsjAs1pFaygbyjd8Jd66QZXYwvg";
const headers = { "X-Api-Key": KEY, "Content-Type": "application/json" };

async function run() {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS pack_reviews (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pack_id UUID NOT NULL REFERENCES marketplace_packs(id),
        install_id UUID NOT NULL REFERENCES marketplace_installs(id),
        tenant_id UUID NOT NULL REFERENCES tenants(id),
        reviewer_id UUID NOT NULL REFERENCES users(id),
        rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        title VARCHAR(255),
        comment TEXT,
        is_verified_purchase BOOLEAN DEFAULT true,
        helpful_count INTEGER DEFAULT 0,
        builder_response TEXT,
        builder_responded_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        deleted_at TIMESTAMPTZ,
        UNIQUE(install_id, reviewer_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pack_reviews_pack ON pack_reviews(pack_id) WHERE deleted_at IS NULL`,
    `CREATE INDEX IF NOT EXISTS idx_pack_reviews_tenant ON pack_reviews(tenant_id) WHERE deleted_at IS NULL`,
    `ALTER TABLE marketplace_packs ADD COLUMN IF NOT EXISTS rating_avg NUMERIC(3,2) DEFAULT 0`,
    `ALTER TABLE marketplace_packs ADD COLUMN IF NOT EXISTS rating_count INTEGER DEFAULT 0`,
  ];

  for (let i = 0; i < stmts.length; i++) {
    try {
      const r = await axios.post(
        BASE + "/api_dinamico",
        { sql: stmts[i] },
        { headers },
      );
      console.log(`[${i + 1}/${stmts.length}] OK`);
    } catch (e) {
      console.error(
        `[${i + 1}/${stmts.length}] FAIL:`,
        e.response?.data || e.message,
      );
    }
  }

  // Verify
  const v = await axios.post(
    BASE + "/tables_info",
    { table_name: "pack_reviews" },
    { headers },
  );
  console.log(
    "\npack_reviews columns:",
    v.data.map((c) => c.column_name).join(", "),
  );

  const v2 = await axios.post(
    BASE + "/tables_info",
    { table_name: "marketplace_packs" },
    { headers },
  );
  const ratingCols = v2.data.filter((c) => c.column_name.includes("rating"));
  console.log(
    "marketplace_packs rating cols:",
    ratingCols.map((c) => `${c.column_name} (${c.data_type})`).join(", "),
  );
}
run().catch((e) => console.error(e));
