const axios = require("axios");
const API = "https://n8n.sosescritura.com.br/webhook/api_dinamico";

(async () => {
  // Check unique constraints on tenant_modules
  const r1 = await axios.post(API, {
    sql: "SELECT indexname, indexdef FROM pg_indexes WHERE tablename='tenant_modules'",
  });
  console.log("=== tenant_modules indexes ===");
  console.log(JSON.stringify(r1.data, null, 2));

  // Check if there are already rows
  const r2 = await axios.post(API, {
    sql: "SELECT * FROM tenant_modules LIMIT 10",
  });
  console.log("\n=== tenant_modules current data ===");
  console.log(JSON.stringify(r2.data, null, 2));

  // Try a test insert to see exact error
  try {
    const API_CRUD = "https://n8n.sosescritura.com.br/webhook/api_crud";
    await axios.post(API_CRUD, {
      action: "create",
      table: "tenant_modules",
      payload: {
        tenant_id: "00000000-0000-0000-0000-000000000001",
        module_key: "test_debug",
        enabled: true,
      },
    });
    console.log("\n=== test insert succeeded ===");
  } catch (e) {
    console.log("\n=== test insert error ===");
    console.log(JSON.stringify(e.response?.data, null, 2));
    console.log("Status:", e.response?.status);
  }
})().catch((e) => console.error("Error:", e.response?.data || e.message));
