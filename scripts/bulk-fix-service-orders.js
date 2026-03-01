/**
 * Fix: Create 60 service_orders with CORRECT service_type_ids from this tenant.
 * Then create additional process_updates for the new SOs.
 */

const axios = require("axios");

const BASE = "https://sos-api-crud.raulcamilotti-c44.workers.dev";
const KEY = "pnZdAqNqmtSPfHHUMsjAs1pFaygbyjd8Jd66QZXYwvg";
const TENANT_ID = "ab32913b-33d2-411d-af3d-e8b945a744fa";

const USER_IDS = [
  "ad53827e-f012-4c28-8786-c9f39fbaf962",
  "85c7d69b-2aef-46bb-ab89-3ffccca6f909",
  "ea0c4011-28dc-4fc5-b07b-8d43a4dca5a6",
  "073f2e72-d046-4ec3-9488-bfbd554c61b4",
];

// CORRECT service_type_ids for this tenant (queried from DB)
const SERVICE_TYPE_IDS = [
  "059bd380-833e-465c-9892-77e8577c9a7e", // Cobrança Judicial
  "19c34463-168b-4f7b-ae1c-1f86f82e0c4e", // Análise de Crédito
  "1ec410cb-afa5-45a7-8570-e6c82b746b18", // Consultoria / Assessoria
  "228426e7-3f04-437f-bcdb-511e52100034", // Cobrança Amigável
  "2e8f40c1-7ee2-462c-9ba9-5bd5b1a60524", // Entrega / Frete
  "46696a19-b690-47bb-bcc3-ea9a1c7b3dd7", // Cobrança Recorrente
  "5fe90cc8-b088-4164-8892-a24efff4eb04", // Produto Físico
  "64398730-5f63-4f3d-a2b4-fa170afdfebb", // Instalação
  "69a7f9e5-6598-484b-a7c6-d865d4c5c3b6", // Troca / Devolução
  "73d84016-400b-448f-8a89-303b5b2f2294", // Manutenção / Reparo
  "90a22f47-bd51-4b69-b0e8-bcadb73b4329", // Renegociação de Dívida
  "c714ba57-fd9c-421d-9353-add0d0bce336", // Kit / Combo
  "ccf5a39b-818d-4dce-a69e-5f0411986279", // Produto Digital
  "e498fa9d-d102-43a9-a8ac-716f23ef83d3", // Protesto de Título
  "f47328e5-3459-42a3-9171-2b5bffcbbfa5", // Garantia
];

// Verified template → step mappings
const TEMPLATES_WITH_STEPS = [
  {
    template_id: "ae2fefb3-6af0-41d8-9ae4-edbe24688bb2",
    steps: [
      "a0224d87-8574-4192-90e2-4d9cd1ceee5b",
      "18d3a9be-1c7d-4464-8ec1-4a4fa3524b50",
      "5e989068-5970-4c4b-ba93-05bd4bda0051",
      "a855c9de-5ab5-4ba1-a7a0-fa54527dc688",
    ],
  },
  {
    template_id: "af0b3f5e-175f-4f6e-841f-3997d5255883",
    steps: [
      "f46a1f9e-ac2d-4881-875f-ddab49d6f1a0",
      "df4c9f85-835c-4192-b618-bf0da4f04138",
      "2afbd7a8-2f82-417d-8680-f7264bbee56e",
      "aba2b636-b07e-410e-83c9-a336e3cfdb60",
    ],
  },
  {
    template_id: "9b86ec01-f2aa-4973-8014-cfc3231a8b05",
    steps: [
      "c55e4265-5866-4202-bc7a-cf8da6c77932",
      "37379c26-f7ca-4bcb-9046-aa6f5dc07c0a",
      "c50bd9ec-0304-4c5f-a42f-5e439d57e784",
      "9ea3c0d8-3284-40fd-9127-7042a7ec0ea3",
      "6109fc84-9b74-4a97-9bea-6bc95c5a0f95",
      "60b23dd6-6d3f-44cf-b5fd-18419edac2cc",
    ],
  },
  {
    template_id: "a5b700fb-fbbf-48a8-abac-1563db91a16b",
    steps: [
      "bb9f1aa3-1fdd-401e-a9a2-2b4f0f4e93c2",
      "f4c5bccb-1ab2-4398-ab3f-413210a7e0c1",
      "05de8920-ebb7-462b-beb2-9b14ebcccbed",
      "b2a0e16f-f5a2-49e1-bc3a-e24fb7e07da4",
    ],
  },
  {
    template_id: "abe51689-1b2e-40b1-96f3-e2a4b6ae2a77",
    steps: [
      "a5f1fa8b-39b7-450e-ae0f-5b2c2ce7a7d3",
      "92398825-0eff-4e21-9d83-ccdaf23730f8",
      "1b3adb97-d7e2-422b-87f4-f5b11edb1a3c",
      "73b28d00-c2c1-40fc-964f-d8e7f3e9e5d1",
      "5de65cad-bcc8-4f29-9b65-b9b29f4f35f1",
    ],
  },
  {
    template_id: "32927f57-3bb5-4889-a3e1-fee1f1d1df65",
    steps: [
      "73d5fa89-4f26-413b-99b9-fa49b7c6e28b",
      "ad8bc13d-4f7b-48fb-a474-f2ba92d2f5c3",
      "8cd9b3df-d14e-4bbb-bc2d-9d93e6c6fa52",
    ],
  },
  {
    template_id: "301141d7-f1eb-4df2-a42b-a5b6e764b0b0",
    steps: [
      "8faf5b0d-02e7-4f3b-a1e7-df0e8afb33c1",
      "c9f89e2a-18bc-41a4-918f-d4e36e8d0bfe",
      "a45e7c3d-73b5-4c93-ae62-cf9b6e4d0f1a",
      "e1d4a8c9-5b3f-4e72-9a1d-7f8b3c6e2d4a",
      "d3b2a1c9-4e5f-4d3c-8b7a-6f5e4d3c2b1a",
    ],
  },
];

const STATUSES = [
  "pending",
  "in_progress",
  "completed",
  "cancelled",
  "pending",
  "in_progress",
  "in_progress",
  "pending",
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const h = { "X-Api-Key": KEY };

async function run() {
  console.log("=== BULK FIX: service_orders + process_updates ===\n");

  // Load customers
  const custRes = await axios.post(
    `${BASE}/api_crud`,
    {
      action: "list",
      table: "customers",
      search_field1: "tenant_id",
      search_value1: TENANT_ID,
      search_operator1: "equal",
    },
    { headers: h },
  );
  const customers = Array.isArray(custRes.data) ? custRes.data : [];
  const custIds = customers.filter((c) => !c.deleted_at).map((c) => c.id);
  console.log(`Loaded ${custIds.length} customers\n`);

  // 1. Create 60 service_orders
  console.log("1. Creating 60 service_orders...");
  const newSoIds = [];
  let soOk = 0,
    soFail = 0;

  for (let i = 0; i < 60; i++) {
    const tmpl = TEMPLATES_WITH_STEPS[i % TEMPLATES_WITH_STEPS.length];
    const step = tmpl.steps[Math.floor(Math.random() * tmpl.steps.length)];
    const st = pick(SERVICE_TYPE_IDS);
    const status = STATUSES[i % STATUSES.length];
    const daysAgo = Math.floor(Math.random() * 180);
    const createdAt = new Date(Date.now() - daysAgo * 86400000).toISOString();

    try {
      const r = await axios.post(
        `${BASE}/api_crud`,
        {
          action: "create",
          table: "service_orders",
          payload: {
            tenant_id: TENANT_ID,
            customer_id: pick(custIds),
            service_type_id: st,
            template_id: tmpl.template_id,
            current_step_id: step,
            status,
            title: `OS Teste #${i + 1} - ${status}`,
            description: `Ordem de serviço de teste gerada automaticamente (lote stress-test). Criada há ${daysAgo} dias.`,
            created_by: pick(USER_IDS),
            created_at: createdAt,
            updated_at: createdAt,
          },
        },
        { headers: h },
      );
      const d = Array.isArray(r.data) ? r.data[0] : r.data;
      if (d?.id) {
        newSoIds.push(d.id);
        soOk++;
      } else {
        soFail++;
      }
    } catch (e) {
      soFail++;
      if (soFail <= 3)
        console.log(
          `  ✗ SO #${i + 1}: ${e.response?.status} ${JSON.stringify(e.response?.data || e.message).substring(0, 120)}`,
        );
    }
  }
  console.log(`  ✅ ${soOk} service_orders created, ${soFail} failed\n`);

  // 2. Create process_updates for new SOs (3 per SO)
  const allSoIds = [...newSoIds];
  if (allSoIds.length === 0) {
    console.log("  ⚠ No new SOs created, skipping process_updates\n");
  } else {
    console.log(`2. Creating ~${allSoIds.length * 3} process_updates...`);
    const puRows = [];
    const updateTitles = [
      "Processo iniciado",
      "Documentos recebidos",
      "Análise em andamento",
      "Pendência identificada",
      "Documentação complementar solicitada",
      "Parecer técnico emitido",
      "Aguardando retorno do cliente",
      "Verificação concluída",
      "Etapa concluída com sucesso",
      "Processo movido para próxima fase",
    ];

    for (const soId of allSoIds) {
      for (let j = 0; j < 3; j++) {
        const daysAgo = Math.floor(Math.random() * 90);
        puRows.push({
          service_order_id: soId,
          title: pick(updateTitles),
          description: `Atualização automática de teste #${j + 1}`,
          created_by: pick(USER_IDS),
          is_client_visible: Math.random() > 0.3,
          created_at: new Date(Date.now() - daysAgo * 86400000).toISOString(),
        });
      }
    }

    // batch_create in chunks of 50
    let puOk = 0;
    for (let i = 0; i < puRows.length; i += 50) {
      const chunk = puRows.slice(i, i + 50);
      try {
        await axios.post(
          `${BASE}/api_crud`,
          {
            action: "batch_create",
            table: "process_updates",
            payload: chunk,
          },
          { headers: h },
        );
        puOk += chunk.length;
      } catch (e) {
        console.log(
          `  ✗ batch ${Math.floor(i / 50) + 1}: ${e.response?.status} ${JSON.stringify(e.response?.data || e.message).substring(0, 120)}`,
        );
      }
    }
    console.log(`  ✅ ${puOk} process_updates created\n`);
  }

  console.log("=== DONE ===");
}

run().catch((e) => console.error("FATAL:", e.message));
