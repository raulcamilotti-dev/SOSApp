const axios = require("axios");
const API = "https://sos-api-crud.raulcamilotti-c44.workers.dev";
const KEY = "pnZdAqNqmtSPfHHUMsjAs1pFaygbyjd8Jd66QZXYwvg";

async function run() {
  const sqls = [
    "ALTER TABLE services ADD COLUMN IF NOT EXISTS pricing_type TEXT DEFAULT 'fixed'",
    "ALTER TABLE services ADD COLUMN IF NOT EXISTS quote_template_id UUID REFERENCES quote_templates(id)",
    "CREATE INDEX IF NOT EXISTS idx_services_pricing_type ON services(pricing_type) WHERE deleted_at IS NULL",
  ];

  for (const sql of sqls) {
    console.log("Running:", sql.slice(0, 70) + "...");
    const r = await axios.post(
      API + "/api_dinamico",
      { sql },
      { headers: { "X-Api-Key": KEY } },
    );
    console.log("OK:", JSON.stringify(r.data).slice(0, 80));
  }
  console.log("Migration complete!");
}

run().catch((e) => console.error("FAIL:", e.response?.data || e.message));
