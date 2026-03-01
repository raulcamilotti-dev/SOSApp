/**
 * Final bulk data creation script for Escritório Modelo tenant.
 * Creates service_orders (50) + process_updates (100) + more tasks (30)
 * Uses CORRECT column names verified from /tables_info.
 */
const axios = require("axios");

const API = "https://sos-api-crud.raulcamilotti-c44.workers.dev";
const KEY = "pnZdAqNqmtSPfHHUMsjAs1pFaygbyjd8Jd66QZXYwvg";
const H = { headers: { "X-Api-Key": KEY } };
const TENANT = "ab32913b-33d2-411d-af3d-e8b945a744fa";

// Real user IDs from user_tenants
const USER_IDS = [
  "85c7d69b-2aef-46bb-ab89-3ffccca6f909",
  "ad53827e-f012-4c28-8786-c9f39fbaf962",
  "ea0c4011-28dc-4fc5-b07b-8d43a4dca5a6",
];

// Real customer IDs (first 20)
const CUSTOMER_IDS = [
  "7cc56080-37bd-4af9-a429-0f9deff766b6",
  "523e1e9e-d8ba-4225-83ce-1d287bf96969",
  "fef6f4e4-1516-4bff-b014-0d63f87a711e",
  "8b75bebe-1cff-4d0e-9cbb-f7b844be726b",
  "71169bb1-e8e4-41bb-93e3-98ab860d4595",
  "760e3d7d-16ae-43d9-99f7-983880c23949",
  "d6d773b5-13eb-4024-aa7a-e9b3ca564d46",
  "bbe1ec6a-ce0d-4f16-b616-aee35d5e3e6a",
  "251acc6d-b329-42b5-9d58-8330975e87c7",
];

// Real service type IDs
const SERVICE_TYPE_IDS = [
  "059bd380-833e-465c-9892-77e8577c9a7e", // Cobrança Judicial
  "19c34463-168b-4f7b-ae1c-1f86f82e0c4e", // Análise de Crédito
  "1ec410cb-afa5-45a7-8570-e6c82b746b18", // Consultoria / Assessoria
  "228426e7-3f04-437f-bcdb-511e52100034", // Cobrança Amigável
  "2e8f40c1-7ee2-462c-9ba9-5bd5b1a60524", // Entrega / Frete
  "46696a19-b690-47bb-bcc3-ea9a1c7b3dd7", // Cobrança Recorrente
  "64398730-5f63-4f3d-a2b4-fa170afdfebb", // Instalação
  "73d84016-400b-448f-8a89-303b5b2f2294", // Manutenção / Reparo
  "90a22f47-bd51-4b69-b0e8-bcadb73b4329", // Renegociação de Dívida
  "e498fa9d-d102-43a9-a8ac-716f23ef83d3", // Protesto de Título
];

// Template + steps mapping (verified)
const TEMPLATES = [
  {
    id: "af0b3f5e-175f-4f6e-841f-3997d5255883", // Serviço Padrão
    steps: [
      "f46a1f9e-ac2d-4881-875f-ddab49d6f1a0", // Agendamento
      "df4c9f85-835c-4192-b618-bf0da4f04138", // Em Execução
      "2afbd7a8-2f82-417d-8680-f7264bbee56e", // Validação
      "aba2b636-b07e-410e-83c9-a336e3cfdb60", // Concluído
    ],
  },
  {
    id: "9b86ec01-f2aa-4973-8014-cfc3231a8b05", // Cobrança Completa
    steps: [
      "c55e4265-5866-4202-bc7a-cf8da6c77932", // Análise do Débito
      "37379c26-f7ca-4bcb-9046-aa6f5dc07c0a", // Notificação ao Devedor
      "c50bd9ec-0304-4c5f-a42f-5e439d57e784", // Negociação
      "9ea3c0d8-3284-40fd-9127-7042a7ec0ea3", // Acordo Formalizado
      "6109fc84-9b74-4a97-9bea-6bc95c5a0f95", // Acompanhamento
      "60b23dd6-6d3f-44cf-b5fd-18419edac2cc", // Quitação
      "cd8457a9-a6ab-477f-8914-a6cf60af9375", // Judicial
    ],
  },
  {
    id: "a5b700fb-fbbf-48a8-abac-1563db91a16b", // Cobrança Rápida
    steps: null, // will fetch
  },
  {
    id: "32927f57-d420-4519-8f87-e9769fe35730", // Análise Rápida
    steps: null,
  },
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

async function fetchMissingSteps() {
  for (const tmpl of TEMPLATES) {
    if (tmpl.steps) continue;
    try {
      const res = await axios.post(
        `${API}/api_crud`,
        {
          action: "list",
          table: "workflow_steps",
          search_field1: "template_id",
          search_value1: tmpl.id,
          search_operator1: "equal",
          sort_column: "step_order ASC",
        },
        H,
      );
      const rows = Array.isArray(res.data) ? res.data : [];
      tmpl.steps = rows.map((r) => r.id);
      console.log(
        `  Fetched ${tmpl.steps.length} steps for template ${tmpl.id}`,
      );
    } catch {
      tmpl.steps = [];
    }
  }
}

async function batchCreate(table, items) {
  const CHUNK = 20;
  let ok = 0;
  let fail = 0;
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    try {
      await axios.post(
        `${API}/api_crud`,
        { action: "batch_create", table, payload: chunk },
        H,
      );
      ok += chunk.length;
    } catch (e) {
      // Try individual inserts on batch failure
      for (const item of chunk) {
        try {
          await axios.post(
            `${API}/api_crud`,
            { action: "create", table, payload: item },
            H,
          );
          ok++;
        } catch (e2) {
          fail++;
          if (fail <= 3)
            console.error(
              `  FAIL ${table}:`,
              e2.response?.data?.error || e2.message,
            );
        }
      }
    }
  }
  return { ok, fail };
}

async function main() {
  console.log("=== BULK FINAL DATA CREATION ===\n");

  // 1. Fetch missing steps
  console.log("1. Fetching missing workflow steps...");
  await fetchMissingSteps();

  // Filter templates that have steps
  const validTemplates = TEMPLATES.filter((t) => t.steps && t.steps.length > 0);
  console.log(`   ${validTemplates.length} templates with steps ready.\n`);

  // 2. Create 50 service orders spread across templates & steps
  console.log("2. Creating 50 service_orders...");
  const statuses = ["active", "active", "active", "completed", "cancelled"];
  const serviceNames = [
    "Consultoria Financeira",
    "Análise de Crédito Empresarial",
    "Cobrança Extrajudicial",
    "Assessoria Jurídica",
    "Revisão Contratual",
    "Análise de Risco",
    "Due Diligence",
    "Planejamento Tributário",
    "Reestruturação de Dívida",
    "Mediação de Conflito",
    "Verificação Cadastral",
    "Parecer Técnico",
    "Auditoria Interna",
    "Compliance Check",
    "Negociação de Acordo",
    "Recuperação de Crédito",
    "Monitoramento Judicial",
    "Gestão de Ativos",
    "Avaliação Patrimonial",
    "Consultoria Estratégica",
  ];

  const soItems = [];
  const soCreatedIds = [];
  for (let i = 0; i < 50; i++) {
    const tmpl = pick(validTemplates);
    const step = pick(tmpl.steps);
    const customer = pick(CUSTOMER_IDS);
    const stype = pick(SERVICE_TYPE_IDS);
    const status = pick(statuses);
    const createdDaysAgo = randInt(1, 90);
    const item = {
      tenant_id: TENANT,
      customer_id: customer,
      service_type_id: stype,
      template_id: tmpl.id,
      current_step_id: step,
      process_status: status,
      title: `${pick(serviceNames)} #${1000 + i}`,
      description: `Ordem de serviço de teste ${i + 1} para verificação de estabilidade.`,
      created_by: pick(USER_IDS),
      estimated_cost: randInt(500, 50000),
      estimated_duration_days: randInt(5, 60),
      started_at: daysAgo(createdDaysAgo),
      finished_at:
        status === "completed" ? daysAgo(randInt(0, createdDaysAgo - 1)) : null,
      created_at: daysAgo(createdDaysAgo),
      updated_at: daysAgo(randInt(0, createdDaysAgo)),
    };
    soItems.push(item);
  }

  // Insert one by one to collect IDs
  for (const item of soItems) {
    try {
      const res = await axios.post(
        `${API}/api_crud`,
        { action: "create", table: "service_orders", payload: item },
        H,
      );
      const rows = Array.isArray(res.data) ? res.data : [];
      if (rows[0]?.id) soCreatedIds.push(rows[0].id);
    } catch (e) {
      console.error(
        "  SO fail:",
        (e.response?.data?.error || e.message).substring(0, 80),
      );
    }
  }
  console.log(`   Created ${soCreatedIds.length}/50 service_orders\n`);

  // Get ALL service order IDs (existing + new)
  let allSoIds = [...soCreatedIds];
  try {
    const existRes = await axios.post(
      `${API}/api_crud`,
      {
        action: "list",
        table: "service_orders",
        search_field1: "tenant_id",
        search_value1: TENANT,
        search_operator1: "equal",
        fields: "id",
      },
      H,
    );
    const existing = Array.isArray(existRes.data) ? existRes.data : [];
    allSoIds = existing.map((r) => r.id);
  } catch {}
  console.log(`   Total service_orders available: ${allSoIds.length}\n`);

  // 3. Create 100 process_updates (no tenant_id column on this table)
  console.log("3. Creating 100 process_updates...");
  const updateTypes = [
    "status_change",
    "note",
    "document",
    "step_change",
    "comment",
  ];
  const puItems = [];
  for (let i = 0; i < 100; i++) {
    puItems.push({
      service_order_id: pick(allSoIds),
      created_by: pick(USER_IDS),
      update_type: pick(updateTypes),
      content: `Atualização de processo #${i + 1}: ${pick([
        "Documento recebido e validado",
        "Cliente notificado por email",
        "Prazo de resposta enviado",
        "Status alterado conforme análise",
        "Parecer técnico anexado",
        "Reunião realizada com cliente",
        "Acordo proposto ao devedor",
        "Pagamento parcial recebido",
        "Deadline estendido a pedido do cliente",
        "Documentação complementar solicitada",
      ])}`,
      created_at: daysAgo(randInt(0, 60)),
    });
  }
  const puResult = await batchCreate("process_updates", puItems);
  console.log(`   Created ${puResult.ok}/100, failed: ${puResult.fail}\n`);

  // 4. Create 30 tasks linked to service orders
  console.log("4. Creating 30 tasks...");
  const taskItems = [];
  const taskTitles = [
    "Ligar para cliente",
    "Enviar notificação",
    "Preparar relatório",
    "Revisar documentação",
    "Agendar reunião",
    "Coletar assinatura",
    "Verificar pagamento",
    "Atualizar cadastro",
    "Enviar lembrete",
    "Formalizar acordo",
    "Protocolar petição",
    "Acompanhar prazo",
    "Emitir parecer",
    "Consultar jurisprudência",
    "Preparar defesa",
  ];
  for (let i = 0; i < 30; i++) {
    taskItems.push({
      tenant_id: TENANT,
      service_order_id: pick(allSoIds),
      title: `${pick(taskTitles)} — #${2000 + i}`,
      description: `Tarefa de teste ${i + 1}`,
      assigned_to: pick(USER_IDS),
      created_by: pick(USER_IDS),
      status: pick([
        "pending",
        "in_progress",
        "completed",
        "pending",
        "pending",
      ]),
      due_date: daysAgo(-randInt(1, 30)), // future dates
      created_at: daysAgo(randInt(0, 30)),
      updated_at: daysAgo(randInt(0, 10)),
    });
  }
  const taskResult = await batchCreate("tasks", taskItems);
  console.log(`   Created ${taskResult.ok}/30, failed: ${taskResult.fail}\n`);

  // 5. Create more invoices linked to new SOs
  console.log("5. Creating 30 more invoices...");
  const invoiceStatuses = ["draft", "sent", "paid", "overdue", "cancelled"];
  const invItems = [];
  for (let i = 0; i < 30; i++) {
    const st = pick(invoiceStatuses);
    invItems.push({
      tenant_id: TENANT,
      customer_id: pick(CUSTOMER_IDS),
      service_order_id: pick(allSoIds),
      invoice_number: `INV-TEST-${3000 + i}`,
      amount: randInt(200, 25000),
      status: st,
      due_at: daysAgo(-randInt(-30, 30)),
      paid_at: st === "paid" ? daysAgo(randInt(0, 15)) : null,
      notes: `Fatura de teste #${3000 + i}`,
      created_by: pick(USER_IDS),
      created_at: daysAgo(randInt(5, 60)),
      updated_at: daysAgo(randInt(0, 5)),
    });
  }
  const invResult = await batchCreate("invoices", invItems);
  console.log(`   Created ${invResult.ok}/30, failed: ${invResult.fail}\n`);

  // 6. More accounts_receivable
  console.log("6. Creating 30 more accounts_receivable...");
  const arItems = [];
  for (let i = 0; i < 30; i++) {
    const st = pick(["pending", "paid", "overdue", "partial", "cancelled"]);
    arItems.push({
      tenant_id: TENANT,
      customer_id: pick(CUSTOMER_IDS),
      service_order_id: pick(allSoIds),
      description: `Recebível teste #${4000 + i}`,
      amount: randInt(100, 20000),
      status: st,
      due_date: daysAgo(-randInt(-20, 40)),
      paid_at: st === "paid" ? daysAgo(randInt(0, 10)) : null,
      created_by: pick(USER_IDS),
      created_at: daysAgo(randInt(5, 60)),
      updated_at: daysAgo(randInt(0, 5)),
    });
  }
  const arResult = await batchCreate("accounts_receivable", arItems);
  console.log(`   Created ${arResult.ok}/30, failed: ${arResult.fail}\n`);

  // Final count check
  console.log("=== FINAL COUNTS ===");
  const countTables = [
    "service_orders",
    "invoices",
    "payments",
    "quotes",
    "accounts_receivable",
    "accounts_payable",
    "leads",
    "tasks",
    "notifications",
    "contracts",
    "partners",
  ];
  for (const t of countTables) {
    try {
      const res = await axios.post(
        `${API}/api_crud`,
        {
          action: "count",
          table: t,
          search_field1: "tenant_id",
          search_value1: TENANT,
          search_operator1: "equal",
        },
        H,
      );
      console.log(`  ${t.padEnd(22)} ${res.data?.[0]?.count ?? "?"}`);
    } catch {
      console.log(`  ${t.padEnd(22)} (no tenant_id)`);
    }
  }
}

main().catch(console.error);
