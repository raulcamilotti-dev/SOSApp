/**
 * Fix script for the 6 tables that failed in bulk-test-data.js v3.
 * Correct column names discovered via /tables_info queries.
 *
 * Fixes:
 * 1. service_orders — use correct template+step pairs from DB
 * 2. invoices — due_at (not due_date), no service_order_id required
 * 3. quotes — no customer_id (quotes link via service_order_id or standalone)
 * 4. notifications — no updated_at column
 * 5. process_updates — created_by (not user_id)
 * 6. payments — method (not payment_method)
 */

const BASE = "https://sos-api-crud.raulcamilotti-c44.workers.dev";
const KEY = "pnZdAqNqmtSPfHHUMsjAs1pFaygbyjd8Jd66QZXYwvg";
const TENANT_ID = "ab32913b-33d2-411d-af3d-e8b945a744fa";

const USER_IDS = [
  "ad53827e-f012-4c28-8786-c9f39fbaf962",
  "85c7d69b-2aef-46bb-ab89-3ffccca6f909",
  "ea0c4011-28dc-4fc5-b07b-8d43a4dca5a6",
  "073f2e72-d046-4ec3-9488-bfbd554c61b4",
];

const SERVICE_TYPE_IDS = [
  "04b0d2f4-9c5a-4ee7-87e2-6de70e66e5f3",
  "34b01ac8-c88b-4eab-9aaf-6e7208b5e9b6",
  "423f2866-eb37-4bff-9a88-ae1e4e7e3b2e",
  "4ea69506-1b3b-494a-affa-4e2b9b27b6e0",
  "5b33ab96-37e4-4ff4-ad6e-37fc2e9d2dc7",
  "66e2303f-ab24-4770-b17c-bcb2113e99d2",
  "6aa07e85-b0a4-4f45-b155-78c2e11b84f5",
  "7c9f3f78-1ee7-472a-a2a9-73a209e1f96e",
  "7ff86b0e-1ce7-4c46-ab05-d19f09e7e3be",
  "acf93b33-3aab-4bf2-9e22-de3ed55e44d3",
  "b89a4fa2-8ab3-4393-921b-0e1e05e6a3ac",
  "e0ae7ad4-3cb4-4ef6-9c09-e5e3e0279f49",
  "e59fbb5e-aeba-4af4-8502-c5b1e6e75419",
  "e6024fc7-8e37-46c7-a72b-c82cdcbf8efe",
  "fb8e3f6d-0c8e-43f2-b5a4-45e95e8c4f12",
];

// Correct template → step mappings (from DB)
const TEMPLATES_WITH_STEPS = [
  {
    template_id: "ae2fefb3-6af0-41d8-9ae4-edbe24688bb2",
    name: "Serviço Padrão A",
    steps: [
      "a0224d87-8574-4192-90e2-4d9cd1ceee5b", // Agendamento
      "18d3a9be-1c7d-4464-8ec1-4a4fa3524b50", // Em Execução
      "5e989068-5970-4c4b-ba93-05bd4bda0051", // Validação
      "a855c9de-5ab5-4ba1-a7a0-fa54527dc688", // Concluído
    ],
  },
  {
    template_id: "af0b3f5e-175f-4f6e-841f-3997d5255883",
    name: "Serviço Padrão B",
    steps: [
      "f46a1f9e-ac2d-4881-875f-ddab49d6f1a0", // Agendamento
      "df4c9f85-835c-4192-b618-bf0da4f04138", // Em Execução
      "2afbd7a8-2f82-417d-8680-f7264bbee56e", // Validação
      "aba2b636-b07e-410e-83c9-a336e3cfdb60", // Concluído
    ],
  },
  {
    template_id: "9b86ec01-f2aa-4973-8014-cfc3231a8b05",
    name: "Cobrança Completa",
    steps: [
      "c55e4265-5866-4202-bc7a-cf8da6c77932", // Análise do Débito
      "37379c26-f7ca-4bcb-9046-aa6f5dc07c0a", // Notificação
      "c50bd9ec-0304-4c5f-a42f-5e439d57e784", // Negociação
      "9ea3c0d8-3284-40fd-9127-7042a7ec0ea3", // Acordo Formalizado
      "6109fc84-9b74-4a97-9bea-6bc95c5a0f95", // Acompanhamento
      "60b23dd6-6d3f-44cf-b5fd-18419edac2cc", // Quitação
    ],
  },
  {
    template_id: "a5b700fb-fbbf-48a8-abac-1563db91a16b",
    name: "Cobrança Rápida",
    steps: [
      "8896bb63-585e-49e3-b320-011678fb944d", // Abertura
      "6439f072-177d-49ec-95b7-5bbdf8dc4717", // Contato
      "21c86103-c790-46da-8d04-00ddd97a1d6f", // Aguardando Pagamento
      "fea9505d-dabf-4139-8aa7-dc014c4ca8aa", // Concluído
    ],
  },
  {
    template_id: "32927f57-d420-4519-8f87-e9769fe35730",
    name: "Análise Rápida",
    steps: [
      "730091a9-b810-4c26-ad72-1a705945dae1", // Solicitação
      "81e106df-23c7-4732-a1e1-d305e830a5da", // Em Análise
      "a35ea228-453f-4ed9-b66d-6a429c05fa1f", // Concluído
    ],
  },
  {
    template_id: "301141d7-eb70-4602-82ca-1d94f45f0aba",
    name: "Entrega A",
    steps: [
      "826f07ef-e0eb-4837-8c7d-5ccd6dff8499", // Aguardando Separação
      "664741b8-ed70-4060-962a-894355ad2597", // Separação em Andamento
      "ea5349dc-b8a0-47f9-9037-ea660c51f216", // Pronto para Entrega
      "e8599c30-5a63-4745-9ae0-0f359b17d4ff", // Em Trânsito
    ],
  },
  {
    template_id: "abe51689-4641-467e-ad75-dfa697252d42",
    name: "Cobrança Judicial",
    steps: [
      "a0ea6f8e-293b-47d8-9194-abc075d1101d", // Análise e Petição
      "cf11a487-82ba-4c37-bf29-1961fed485ba", // Protocolo
      "a106bf54-b6df-4492-b58b-be3a2c2a5d78", // Citação
      "0db46bd4-5098-48eb-a21f-de4b9316b0c3", // Execução
    ],
  },
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();

let totalCreated = 0;
let totalErrors = 0;

async function apiPost(endpoint, body) {
  const r = await fetch(`${BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": KEY },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!r.ok)
    throw new Error(
      `HTTP ${r.status}: ${typeof data === "object" ? JSON.stringify(data) : text}`,
    );
  return data;
}

async function batchCreate(table, records) {
  const CHUNK = 20;
  let created = 0;
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    try {
      await apiPost("/api_crud", {
        action: "batch_create",
        table,
        payload: chunk,
      });
      created += chunk.length;
    } catch (e) {
      console.error(
        `  ❌ ${table} chunk ${i}-${i + chunk.length}: ${e.message}`,
      );
      totalErrors++;
      // Try individual creates as fallback
      for (const rec of chunk) {
        try {
          await apiPost("/api_crud", { action: "create", table, payload: rec });
          created++;
        } catch (e2) {
          console.error(`    ❌ individual: ${e2.message.slice(0, 120)}`);
          totalErrors++;
        }
      }
    }
  }
  return created;
}

async function getCustomerIds() {
  const d = await apiPost("/api_crud", {
    action: "list",
    table: "customers",
    search_field1: "tenant_id",
    search_value1: TENANT_ID,
    search_operator1: "equal",
    auto_exclude_deleted: true,
  });
  return (Array.isArray(d) ? d : []).map((c) => c.id);
}

async function main() {
  console.log("=== BULK FIX: 6 remaining tables ===\n");

  // Pre-load customer IDs
  const customerIds = await getCustomerIds();
  console.log(`Loaded ${customerIds.length} customers for reference\n`);

  // ─── 1. SERVICE ORDERS (60 records) ───
  console.log("1. service_orders (60 records)...");
  const soRecords = [];
  const createdSoIds = [];
  const statuses = [
    "active",
    "active",
    "active",
    "active",
    "completed",
    "cancelled",
  ];
  const soTitles = [
    "Cobrança Extrajudicial",
    "Análise de Crédito",
    "Consultoria Financeira",
    "Serviço de Manutenção",
    "Avaliação Técnica",
    "Notificação Judicial",
    "Acordo de Pagamento",
    "Revisão Contratual",
    "Suporte ao Cliente",
    "Vistoria Técnica",
    "Perícia Contábil",
    "Mediação de Conflito",
    "Due Diligence",
    "Auditoria Interna",
    "Planejamento Estratégico",
  ];
  for (let i = 0; i < 60; i++) {
    const tmpl = TEMPLATES_WITH_STEPS[i % TEMPLATES_WITH_STEPS.length];
    const stepIdx = i % tmpl.steps.length;
    const customerId = pick(customerIds);
    soRecords.push({
      tenant_id: TENANT_ID,
      customer_id: customerId,
      service_type_id: pick(SERVICE_TYPE_IDS),
      template_id: tmpl.template_id,
      current_step_id: tmpl.steps[stepIdx],
      process_status: pick(statuses),
      title: `${pick(soTitles)} #${100 + i}`,
      description: `Processo de teste gerado automaticamente. Template: ${tmpl.name}`,
      created_by: pick(USER_IDS),
      created_at: new Date(
        Date.now() - Math.random() * 90 * 86400000,
      ).toISOString(),
      updated_at: now(),
    });
  }
  // Create individually to capture IDs
  for (const rec of soRecords) {
    try {
      const result = await apiPost("/api_crud", {
        action: "create",
        table: "service_orders",
        payload: rec,
      });
      const created = Array.isArray(result) ? result[0] : result;
      if (created?.id) createdSoIds.push(created.id);
      totalCreated++;
    } catch (e) {
      console.error(`  ❌ service_order: ${e.message.slice(0, 150)}`);
      totalErrors++;
    }
  }
  console.log(`  ✅ ${createdSoIds.length} service_orders created`);
  await sleep(500);

  // Merge with existing SO IDs
  const existingSoIds = [
    "0e9f4d24-6fe3-4ee5-97e0-83cc97a7986b",
    "3b71ddc5-237f-4d42-8c93-1830982dd41a",
    "4d9d73ac-4e40-4cc9-8b58-811f1de1668a",
    "517eadfc-eeef-4adb-a48f-5e8786eb3d5d",
    "5afecc93-e1b1-4614-afac-03a2cb4f09b5",
    "5f9eef73-a83b-42a5-98df-ee449cec25ea",
    "bc37f777-1864-469c-8959-8663cc0a57ac",
    "cc6c7300-d7f0-4c12-a5db-ba0426eaae35",
    "f75da81f-e5a9-470c-89dc-5c066bebb721",
  ];
  const allSoIds = [...existingSoIds, ...createdSoIds];

  // ─── 2. INVOICES (80 records) — due_at, not due_date ───
  console.log("\n2. invoices (80 records)...");
  const invoiceStatuses = ["draft", "sent", "paid", "overdue", "cancelled"];
  const invoiceRecords = [];
  const createdInvoiceIds = [];
  for (let i = 0; i < 80; i++) {
    const status = pick(invoiceStatuses);
    const subtotal = Math.round((500 + Math.random() * 9500) * 100) / 100;
    const discount = Math.round(Math.random() * subtotal * 0.15 * 100) / 100;
    const tax = Math.round(subtotal * 0.05 * 100) / 100;
    const total = Math.round((subtotal - discount + tax) * 100) / 100;
    const daysAgo = Math.floor(Math.random() * 120);
    const issuedAt = new Date(Date.now() - daysAgo * 86400000).toISOString();
    const dueAt = new Date(
      Date.now() - (daysAgo - 30) * 86400000,
    ).toISOString();

    invoiceRecords.push({
      tenant_id: TENANT_ID,
      customer_id: pick(customerIds),
      service_order_id: pick(allSoIds),
      invoice_number: `FAT-${String(2000 + i).padStart(5, "0")}`,
      title: `Fatura #${2000 + i}`,
      description: `Fatura de teste ${i + 1}`,
      status,
      subtotal,
      discount,
      tax,
      total,
      issued_at: issuedAt,
      due_at: dueAt, // FIXED: was due_date
      paid_at:
        status === "paid"
          ? new Date(
              Date.now() - Math.random() * daysAgo * 86400000,
            ).toISOString()
          : null,
      notes: i % 3 === 0 ? "Pagamento via PIX" : null,
      created_by: pick(USER_IDS),
      created_at: issuedAt,
      updated_at: now(),
    });
  }
  // Create individually to capture IDs
  for (const rec of invoiceRecords) {
    try {
      const result = await apiPost("/api_crud", {
        action: "create",
        table: "invoices",
        payload: rec,
      });
      const created = Array.isArray(result) ? result[0] : result;
      if (created?.id) createdInvoiceIds.push(created.id);
      totalCreated++;
    } catch (e) {
      console.error(`  ❌ invoice: ${e.message.slice(0, 150)}`);
      totalErrors++;
    }
  }
  console.log(`  ✅ ${createdInvoiceIds.length} invoices created`);
  await sleep(500);

  const allInvoiceIds = [
    "eb64b01f-ce13-4bff-b299-fa51f6adbdf3",
    ...createdInvoiceIds,
  ];

  // ─── 3. QUOTES (50 records) — no customer_id, uses service_order_id ───
  console.log("\n3. quotes (50 records)...");
  const quoteStatuses = ["draft", "sent", "approved", "rejected", "expired"];
  const quoteRecords = [];
  for (let i = 0; i < 50; i++) {
    const status = pick(quoteStatuses);
    const subtotal = Math.round((300 + Math.random() * 5000) * 100) / 100;
    const discount = Math.round(Math.random() * subtotal * 0.1 * 100) / 100;
    const total = Math.round((subtotal - discount) * 100) / 100;
    const token = `qt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}_${i}`;
    const validUntil = new Date(
      Date.now() + (15 + Math.random() * 30) * 86400000,
    )
      .toISOString()
      .split("T")[0];

    quoteRecords.push({
      tenant_id: TENANT_ID,
      service_order_id: pick(allSoIds),
      // NO customer_id — quotes table doesn't have this column
      token,
      title: `Orçamento #${3000 + i}`,
      description: `Proposta de serviço ${i + 1}`,
      subtotal,
      discount,
      total,
      valid_until: validUntil,
      status,
      approved_at: status === "approved" ? now() : null,
      rejected_at: status === "rejected" ? now() : null,
      rejection_reason:
        status === "rejected" ? "Valor acima do esperado" : null,
      notes: i % 4 === 0 ? "Válido por 30 dias" : null,
      created_by: pick(USER_IDS),
      created_at: new Date(
        Date.now() - Math.random() * 60 * 86400000,
      ).toISOString(),
      updated_at: now(),
    });
  }
  const quotesCreated = await batchCreate("quotes", quoteRecords);
  console.log(`  ✅ ${quotesCreated} quotes created`);
  totalCreated += quotesCreated;
  await sleep(500);

  // ─── 4. NOTIFICATIONS (80 records) — no updated_at column ───
  console.log("\n4. notifications (80 records)...");
  const notifTypes = [
    "new_process",
    "process_update",
    "document_requested",
    "document_received",
    "document_fulfilled",
    "process_status_changed",
    "appointment_scheduled",
    "appointment_reminder",
    "general_alert",
  ];
  const notifRecords = [];
  for (let i = 0; i < 80; i++) {
    const type = pick(notifTypes);
    const titles = {
      new_process: "Novo processo criado",
      process_update: "Atualização no processo",
      document_requested: "Documento solicitado",
      document_received: "Documento recebido",
      document_fulfilled: "Documento atendido",
      process_status_changed: "Status do processo alterado",
      appointment_scheduled: "Agendamento confirmado",
      appointment_reminder: "Lembrete de agendamento",
      general_alert: "Alerta geral",
    };
    notifRecords.push({
      tenant_id: TENANT_ID,
      user_id: pick(USER_IDS),
      type,
      title: titles[type] || "Notificação",
      message: `Notificação de teste #${i + 1} — ${type}`,
      related_table: "service_orders",
      related_id: pick(allSoIds),
      is_read: Math.random() > 0.6,
      created_at: new Date(
        Date.now() - Math.random() * 30 * 86400000,
      ).toISOString(),
      // NO updated_at — column doesn't exist on notifications
    });
  }
  const notifsCreated = await batchCreate("notifications", notifRecords);
  console.log(`  ✅ ${notifsCreated} notifications created`);
  totalCreated += notifsCreated;
  await sleep(500);

  // ─── 5. PROCESS UPDATES (100 records) — created_by, not user_id ───
  console.log("\n5. process_updates (100 records)...");
  const puRecords = [];
  const updateTitles = [
    "Documentos recebidos",
    "Análise concluída",
    "Contato realizado com o cliente",
    "Aguardando retorno",
    "Parecer emitido",
    "Prazo atualizado",
    "Nova evidência anexada",
    "Reunião agendada",
    "Protocolo registrado",
    "Providência tomada",
    "Diligência realizada",
    "Cálculo atualizado",
    "Notificação enviada",
    "Resposta recebida",
    "Encaminhado para revisão",
  ];
  for (let i = 0; i < 100; i++) {
    puRecords.push({
      service_order_id: pick(allSoIds),
      title: pick(updateTitles),
      description: `Atualização de processo de teste #${i + 1}. Detalhe automático para stress test.`,
      created_by: pick(USER_IDS), // FIXED: was user_id
      is_client_visible: Math.random() > 0.5,
      created_at: new Date(
        Date.now() - Math.random() * 60 * 86400000,
      ).toISOString(),
      updated_at: now(),
    });
  }
  const puCreated = await batchCreate("process_updates", puRecords);
  console.log(`  ✅ ${puCreated} process_updates created`);
  totalCreated += puCreated;
  await sleep(500);

  // ─── 6. PAYMENTS (60 records) — method, not payment_method ───
  console.log("\n6. payments (60 records)...");
  const paymentMethods = [
    "pix",
    "credit_card",
    "boleto",
    "transfer",
    "cash",
    "other",
  ];
  const paymentStatuses = ["pending", "confirmed", "failed", "refunded"];
  const payRecords = [];
  for (let i = 0; i < 60; i++) {
    const status = pick(paymentStatuses);
    const amount = Math.round((100 + Math.random() * 5000) * 100) / 100;
    payRecords.push({
      tenant_id: TENANT_ID,
      invoice_id: pick(allInvoiceIds),
      amount,
      method: pick(paymentMethods), // FIXED: was payment_method
      status,
      paid_at:
        status === "confirmed"
          ? new Date(Date.now() - Math.random() * 30 * 86400000).toISOString()
          : null,
      confirmed_by: status === "confirmed" ? pick(USER_IDS) : null,
      notes: i % 5 === 0 ? "Pagamento de teste" : null,
      created_at: new Date(
        Date.now() - Math.random() * 60 * 86400000,
      ).toISOString(),
      updated_at: now(),
    });
  }
  const paymentsCreated = await batchCreate("payments", payRecords);
  console.log(`  ✅ ${paymentsCreated} payments created`);
  totalCreated += paymentsCreated;

  // ─── Summary ───
  console.log("\n=== SUMMARY ===");
  console.log(`Total created: ${totalCreated}`);
  console.log(`Total errors:  ${totalErrors}`);
  console.log("Done!");
}

main().catch((e) => console.error("Fatal:", e));
