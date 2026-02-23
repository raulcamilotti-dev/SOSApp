/**
 * Add supplier_id and purchase_order_id columns to accounts_payable table
 */
const axios = require("axios");
const KEY = process.env.SOS_API_KEY;
if (!KEY) {
  console.error("Missing SOS_API_KEY env var");
  process.exit(1);
}
const API = process.env.EXPO_PUBLIC_API_BASE_URL
  ? `${process.env.EXPO_PUBLIC_API_BASE_URL}/api_dinamico`
  : "https://n8n.sosescritura.com.br/webhook/api_dinamico";

async function runSQL(sql) {
  console.log("SQL:", sql.substring(0, 100));
  const r = await axios.post(API, { sql }, { headers: { "X-Api-Key": KEY } });
  const out = typeof r.data === "string" ? r.data : JSON.stringify(r.data);
  console.log("OK:", out.substring(0, 100));
}

async function main() {
  await runSQL(
    "ALTER TABLE accounts_payable ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id)",
  );
  await runSQL(
    "ALTER TABLE accounts_payable ADD COLUMN IF NOT EXISTS purchase_order_id UUID REFERENCES purchase_orders(id)",
  );
  await runSQL(
    "CREATE INDEX IF NOT EXISTS idx_ap_tenant_supplier ON accounts_payable(tenant_id, supplier_id) WHERE deleted_at IS NULL AND supplier_id IS NOT NULL",
  );
  await runSQL(
    "CREATE INDEX IF NOT EXISTS idx_ap_purchase_order ON accounts_payable(purchase_order_id) WHERE deleted_at IS NULL AND purchase_order_id IS NOT NULL",
  );
  console.log("ALL DONE");
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
