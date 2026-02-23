const axios = require("axios");

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "https://sos-api-crud.raulcamilotti-c44.workers.dev";
const API_KEY = process.env.SOS_API_KEY;
if (!API_KEY) {
  console.error("Missing SOS_API_KEY env var");
  process.exit(1);
}

async function verifyTables() {
  try {
    const sql = `
      SELECT table_name, 
             (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public' 
        AND table_name LIKE 'purchase_request%'
      ORDER BY table_name;
    `;

    const response = await axios.post(
      `${API_BASE}/api_dinamico`,
      { sql },
      { headers: { "X-Api-Key": API_KEY } },
    );

    console.log("✅ Tabelas de purchase_requests criadas com sucesso:");
    console.log(JSON.stringify(response.data, null, 2));

    // Verificar índices
    const indexSql = `
      SELECT indexname, tablename
      FROM pg_indexes
      WHERE tablename LIKE 'purchase_request%'
      ORDER BY tablename, indexname;
    `;

    const indexResponse = await axios.post(
      `${API_BASE}/api_dinamico`,
      { sql: indexSql },
      { headers: { "X-Api-Key": API_KEY } },
    );

    console.log("\n✅ Índices criados:");
    console.log(JSON.stringify(indexResponse.data, null, 2));
  } catch (error) {
    console.error(
      "❌ Erro ao verificar tabelas:",
      error.response?.data || error.message,
    );
  }
}

verifyTables();
