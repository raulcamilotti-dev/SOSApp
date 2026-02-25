const axios = require("axios");

const API_BASE =
  process.env.API_BASE_URL ||
  "https://sos-api-crud.raulcamilotti-c44.workers.dev";
const API_KEY = process.env.N8N_API_KEY || process.env.API_KEY || "";
const TENANT_ID = process.env.TENANT_ID || "";
const CRUD_ENDPOINT = `${API_BASE}/api_crud`;

if (!API_KEY || !TENANT_ID) {
  console.error("Missing API_KEY/N8N_API_KEY or TENANT_ID env vars.");
  process.exit(1);
}

const headers = { "X-Api-Key": API_KEY };

(async () => {
  const payload = {
    tenant_id: TENANT_ID,
    name: "Lead Parceiro Teste",
    email: "parceiro.teste@example.com",
    phone: "11999999999",
    source: "site_parceiros",
    status: "novo",
    priority: "alta",
    notes: JSON.stringify({
      partner_type: "contador",
      company_name: "Contabil Teste",
      document_number: "00.000.000/0000-00",
      audience_size: "11-50",
      message: "Teste automatizado",
      submitted_at: new Date().toISOString(),
    }),
  };

  const res = await axios.post(
    CRUD_ENDPOINT,
    { action: "create", table: "leads", payload },
    { headers },
  );

  const created = Array.isArray(res.data) ? res.data[0] : res.data;
  console.log("Lead criado:", created?.id || created);
})().catch((err) => {
  console.error(
    "Erro ao criar lead:",
    err?.response?.data || err?.message || err,
  );
  process.exit(1);
});
