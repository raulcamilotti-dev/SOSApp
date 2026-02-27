const axios = require("axios");
const API_KEY = "pnZdAqNqmtSPfHHUMsjAs1pFaygbyjd8Jd66QZXYwvg";
const API_BASE = "https://sos-api-crud.raulcamilotti-c44.workers.dev";

const stmts = [
  "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS billing_model TEXT DEFAULT 'fixed_monthly'",
  "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(10,2) DEFAULT 0",
  "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS included_hours_monthly NUMERIC(10,2) DEFAULT 0",
  "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS excess_hourly_rate NUMERIC(10,2) DEFAULT 0",
  "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS report_template_id UUID REFERENCES document_templates(id)",
  "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contact_name TEXT",
  "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actual_hours NUMERIC(10,2) DEFAULT 0",
  `CREATE TABLE IF NOT EXISTS contract_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES contracts(id),
    invoice_id UUID NOT NULL REFERENCES invoices(id),
    period_start DATE,
    period_end DATE,
    hours_consumed NUMERIC(10,2) DEFAULT 0,
    hours_included NUMERIC(10,2) DEFAULT 0,
    hours_excess NUMERIC(10,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(contract_id, invoice_id)
  )`,
  "CREATE INDEX IF NOT EXISTS idx_contracts_billing_model ON contracts(tenant_id, billing_model)",
  "CREATE INDEX IF NOT EXISTS idx_contract_invoices_contract ON contract_invoices(contract_id)",
  "CREATE INDEX IF NOT EXISTS idx_contract_invoices_invoice ON contract_invoices(invoice_id)",
  "CREATE INDEX IF NOT EXISTS idx_tasks_actual_hours ON tasks(service_order_id) WHERE actual_hours > 0",
];

async function run() {
  for (let i = 0; i < stmts.length; i++) {
    const sql = stmts[i] + ";";
    const preview = stmts[i].substring(0, 80).replace(/\n/g, " ");
    process.stdout.write(`[${i + 1}/${stmts.length}] ${preview}... `);
    try {
      await axios.post(
        API_BASE + "/api_dinamico",
        { sql },
        { headers: { "X-Api-Key": API_KEY }, timeout: 30000 },
      );
      console.log("OK");
    } catch (e) {
      const m = e.response?.data?.error || e.message;
      if (m && m.includes("already exists")) console.log("SKIP (exists)");
      else console.log("ERR:", m);
    }
  }
  console.log("Done!");
}
run();
