const axios = require("axios");
const API_DIN = "https://n8n.sosescritura.com.br/webhook/api_dinamico";
const API_CRUD = "https://n8n.sosescritura.com.br/webhook/api_crud";

async function run() {
  // 1. Verify all tables exist
  console.log("=== VERIFYING TABLES ===");
  const tables = [
    "measurement_units",
    "discount_rules",
    "service_compositions",
    "sales",
    "sale_items",
    "stock_movements",
    "purchase_orders",
    "purchase_order_items",
  ];

  const r1 = await axios.post(API_DIN, {
    sql: `SELECT table_name FROM information_schema.tables 
          WHERE table_schema='public' 
          AND table_name IN (${tables.map((t) => `'${t}'`).join(",")})
          ORDER BY table_name`,
  });

  const found = (Array.isArray(r1.data) ? r1.data : []).map(
    (r) => r.table_name,
  );
  console.log("Found tables:", found);
  const missing = tables.filter((t) => !found.includes(t));
  if (missing.length > 0) {
    console.log("MISSING:", missing);
  } else {
    console.log("✅ All 8 tables exist!");
  }

  // 2. Verify new columns on services
  console.log("\n=== VERIFYING services COLUMNS ===");
  const r2 = await axios.post(API_DIN, {
    sql: `SELECT column_name FROM information_schema.columns 
          WHERE table_name='services' 
          AND column_name IN ('item_kind','sell_price','cost_price','sku','barcode','track_stock','stock_quantity','is_composition')
          ORDER BY column_name`,
  });
  const cols = (Array.isArray(r2.data) ? r2.data : []).map(
    (r) => r.column_name,
  );
  console.log("New columns on services:", cols);

  // 3. Verify new columns on partner_earnings, invoices, accounts_receivable
  console.log("\n=== VERIFYING FK COLUMNS ===");
  const r3 = await axios.post(API_DIN, {
    sql: `SELECT table_name, column_name FROM information_schema.columns 
          WHERE (table_name='partner_earnings' AND column_name='sale_id')
          OR (table_name='invoices' AND column_name='sale_id')
          OR (table_name='accounts_receivable' AND column_name='sale_id')
          OR (table_name='customers' AND column_name='identification_level')
          ORDER BY table_name`,
  });
  console.log("FK columns:", Array.isArray(r3.data) ? r3.data : r3.data);

  // 4. Test CRUD API list on new tables
  console.log("\n=== TESTING CRUD API ===");
  for (const table of [
    "sales",
    "purchase_orders",
    "stock_movements",
    "measurement_units",
  ]) {
    try {
      const r = await axios.post(API_CRUD, {
        action: "list",
        table,
        sort_column: "created_at DESC",
        limit: 1,
      });
      const data = Array.isArray(r.data)
        ? r.data
        : r.data === ""
          ? []
          : [r.data];
      console.log(`✅ ${table}: list OK (${data.length} rows)`);
    } catch (e) {
      console.log(
        `❌ ${table}: ${e.response?.status} - ${JSON.stringify(e.response?.data).substring(0, 150)}`,
      );
    }
  }

  // 5. Verify permissions
  console.log("\n=== VERIFYING PERMISSIONS ===");
  const r5 = await axios.post(API_CRUD, {
    action: "list",
    table: "permissions",
    search_field1: "code",
    search_value1: "pdv.%",
    search_operator1: "like",
  });
  const permData = Array.isArray(r5.data) ? r5.data : [];
  console.log(`PDV permissions found: ${permData.length}`);
  permData.forEach((p) => console.log(`  - ${p.code}: ${p.display_name}`));

  console.log("\n=== ALL CHECKS DONE ===");
}

run().catch((e) => console.error("Error:", e.message));
