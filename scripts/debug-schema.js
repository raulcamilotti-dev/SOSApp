const axios = require("axios");
const API = "https://n8n.sosescritura.com.br/webhook/api_dinamico";

(async () => {
  // 1. Check deadline_rules schema
  const r1 = await axios.post(API, {
    sql: "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='deadline_rules' ORDER BY ordinal_position",
  });
  console.log("=== deadline_rules columns ===");
  console.log(JSON.stringify(r1.data, null, 2));

  // 2. Check tenant_modules schema
  const r2 = await axios.post(API, {
    sql: "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='tenant_modules' ORDER BY ordinal_position",
  });
  console.log("\n=== tenant_modules columns ===");
  console.log(JSON.stringify(r2.data, null, 2));

  // 3. Check process_deadlines schema (the real deadlines table)
  const r3 = await axios.post(API, {
    sql: "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='process_deadlines' ORDER BY ordinal_position",
  });
  console.log("\n=== process_deadlines columns ===");
  console.log(JSON.stringify(r3.data, null, 2));

  // 4. Which tables exist?
  const r4 = await axios.post(API, {
    sql: "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('deadline_rules','tenant_modules','process_deadlines') ORDER BY table_name",
  });
  console.log("\n=== tables that exist ===");
  console.log(JSON.stringify(r4.data, null, 2));
})().catch((e) => console.error("Error:", e.response?.data || e.message));
