const axios = require("axios");

const ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";

async function testAggregate() {
  console.log("=== Teste 1: COUNT(*) de service_orders ===");
  try {
    const r1 = await axios.post(ENDPOINT, {
      action: "aggregate",
      table: "service_orders",
      aggregates: [{ function: "COUNT", field: "*", alias: "total" }],
    });
    console.log("✅ Resultado:", JSON.stringify(r1.data, null, 2));
  } catch (e) {
    console.log("❌ Erro:", e.response?.status, e.response?.data || e.message);
  }

  console.log("\n=== Teste 2: COUNT agrupado por process_status ===");
  try {
    const r2 = await axios.post(ENDPOINT, {
      action: "aggregate",
      table: "service_orders",
      aggregates: [{ function: "COUNT", field: "*", alias: "qty" }],
      group_by: ["process_status"],
      sort_column: "qty DESC",
    });
    console.log("✅ Resultado:", JSON.stringify(r2.data, null, 2));
  } catch (e) {
    console.log("❌ Erro:", e.response?.status, e.response?.data || e.message);
  }

  console.log(
    "\n=== Teste 3: COUNT de customers com filtro deleted_at IS NULL ===",
  );
  try {
    const r3 = await axios.post(ENDPOINT, {
      action: "aggregate",
      table: "customers",
      aggregates: [{ function: "COUNT", field: "*", alias: "total_active" }],
      search_field1: "deleted_at",
      search_value1: "",
      search_operator1: "is_null",
    });
    console.log("✅ Resultado:", JSON.stringify(r3.data, null, 2));
  } catch (e) {
    console.log("❌ Erro:", e.response?.status, e.response?.data || e.message);
  }

  console.log("\n=== Teste 4: MIN/MAX de datas em service_orders ===");
  try {
    const r4 = await axios.post(ENDPOINT, {
      action: "aggregate",
      table: "service_orders",
      aggregates: [
        { function: "MIN", field: "created_at", alias: "primeiro" },
        { function: "MAX", field: "created_at", alias: "ultimo" },
        { function: "COUNT", field: "*", alias: "total" },
      ],
      search_field1: "deleted_at",
      search_value1: "",
      search_operator1: "is_null",
    });
    console.log("✅ Resultado:", JSON.stringify(r4.data, null, 2));
  } catch (e) {
    console.log("❌ Erro:", e.response?.status, e.response?.data || e.message);
  }
}

testAggregate();
