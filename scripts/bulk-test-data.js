/**
 * BULK TEST DATA CREATOR — Escritório Modelo (v3 — all FKs & enums verified)
 *
 * Creates 700+ records across 15 tables to stress-test UI.
 * Run: node scripts/bulk-test-data.js
 */

const TENANT_ID = "ab32913b-33d2-411d-af3d-e8b945a744fa";
const API_URL = "https://sos-api-crud.raulcamilotti-c44.workers.dev/api_crud";
const API_KEY = "pnZdAqNqmtSPfHHUMsjAs1pFaygbyjd8Jd66QZXYwvg";

// ── REAL user IDs from user_tenants (verified via DB) ──
const USER_IDS = [
  "ad53827e-f012-4c28-8786-c9f39fbaf962",
  "85c7d69b-2aef-46bb-ab89-3ffccca6f909",
  "ea0c4011-28dc-4fc5-b07b-8d43a4dca5a6",
  "073f2e72-d046-4ec3-9488-bfbd554c61b4",
];

// ── REAL service_type IDs for this tenant (verified via DB) ──
const SERVICE_TYPE_IDS = [
  "5fe90cc8-b088-4164-8892-a24efff4eb04", // Produto Físico
  "ccf5a39b-818d-4dce-a69e-5f0411986279", // Produto Digital
  "64398730-5f63-4f3d-a2b4-fa170afdfebb", // Instalação
  "73d84016-400b-448f-8a89-303b5b2f2294", // Manutenção / Reparo
  "1ec410cb-afa5-45a7-8570-e6c82b746b18", // Consultoria / Assessoria
  "c714ba57-fd9c-421d-9353-add0d0bce336", // Kit / Combo
  "2e8f40c1-7ee2-462c-9ba9-5bd5b1a60524", // Entrega / Frete
  "69a7f9e5-6598-484b-a7c6-d865d4c5c3b6", // Troca / Devolução
  "f47328e5-3459-42a3-9171-2b5bffcbbfa5", // Garantia
  "228426e7-3f04-437f-bcdb-511e52100034", // Cobrança Amigável
  "46696a19-b690-47bb-bcc3-ea9a1c7b3dd7", // Cobrança Recorrente
  "059bd380-833e-465c-9892-77e8577c9a7e", // Cobrança Judicial
  "90a22f47-bd51-4b69-b0e8-bcadb73b4329", // Renegociação de Dívida
  "19c34463-168b-4f7b-ae1c-1f86f82e0c4e", // Análise de Crédito
  "e498fa9d-d102-43a9-a8ac-716f23ef83d3", // Protesto de Título
];

// ── REAL workflow template + steps (verified) ──
const WORKFLOW_TEMPLATE_ID = "af0b3f5e-175f-4f6e-841f-3997d5255883";
const WORKFLOW_STEPS = [
  "f46a1f9e-c5e1-4f13-b83b-e27fbe5dc21f",
  "df4c9f85-c2b9-4694-9daa-dd2e9e3e2d21",
  "2afbd7a8-5ab2-4b0b-9bbb-09bd9e78d0ab",
  "aba2b636-6fc6-41b1-a2b3-0f15e6c1c866",
];

// ── Verified ENUM values ──
const ACCOUNT_ENTRY_STATUS = [
  "pending",
  "partial",
  "paid",
  "overdue",
  "cancelled",
];
const ACCOUNT_ENTRY_TYPE = [
  "invoice",
  "service_fee",
  "partner_payment",
  "expense",
  "salary",
  "tax",
  "refund",
  "transfer",
  "other",
];
const INVOICE_STATUS = ["draft", "sent", "paid", "overdue", "cancelled"];
const NOTIFICATION_TYPES = [
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
const PAYMENT_STATUS = ["pending", "confirmed", "failed", "refunded"];
const PAYMENT_METHOD = [
  "pix",
  "credit_card",
  "boleto",
  "transfer",
  "cash",
  "other",
];
const EARNING_STATUS = ["pending", "approved", "paid", "cancelled"];
const EARNING_TYPE = ["commission", "fee", "bonus", "deduction"];
const BANK_TX_TYPES = ["credit", "debit"]; // check constraint

// ── Helpers ──
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randAmount = (min, max) =>
  +(Math.random() * (max - min) + min).toFixed(2);
const pastDate = (daysBack) => {
  const d = new Date();
  d.setDate(d.getDate() - randInt(0, daysBack));
  return d.toISOString();
};
const pastDateOnly = (daysBack) => {
  const d = new Date();
  d.setDate(d.getDate() - randInt(0, daysBack));
  return d.toISOString().split("T")[0];
};
const futureDate = (daysAhead) => {
  const d = new Date();
  d.setDate(d.getDate() + randInt(1, daysAhead));
  return d.toISOString();
};
const futureDateOnly = (daysAhead) => {
  const d = new Date();
  d.setDate(d.getDate() + randInt(1, daysAhead));
  return d.toISOString().split("T")[0];
};
const now = () => new Date().toISOString();

let requestCount = 0;
let errorCount = 0;

async function apiPost(body) {
  requestCount++;
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": API_KEY },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    errorCount++;
    console.log(`  ✗ ${res.status}: ${text.slice(0, 200)}`);
    return null;
  }
  try {
    return text ? JSON.parse(text) : [];
  } catch {
    return text;
  }
}

async function batchCreate(table, items, label, chunkSize = 20) {
  let total = 0;
  const chunks = [];
  for (let i = 0; i < items.length; i += chunkSize)
    chunks.push(items.slice(i, i + chunkSize));
  for (let i = 0; i < chunks.length; i++) {
    const res = await apiPost({
      action: "batch_create",
      table,
      payload: chunks[i],
    });
    const created = Array.isArray(res) ? res.length : 0;
    total += created;
    console.log(`  batch ${i + 1}/${chunks.length} — ${created} criados`);
    if (i < chunks.length - 1) await sleep(500);
  }
  console.log(`  ✓ ${total} ${label} criados`);
  return total;
}

async function singleCreate(table, payload) {
  const res = await apiPost({ action: "create", table, payload });
  if (!res) return null;
  const item = Array.isArray(res) ? res[0] : res;
  return item?.id || null;
}

// ── Name generators ──
const FIRST_NAMES = [
  "Lucas",
  "Ana",
  "Pedro",
  "Mariana",
  "Carlos",
  "Julia",
  "Rafael",
  "Beatriz",
  "Fernando",
  "Camila",
  "Gabriel",
  "Larissa",
  "Thiago",
  "Amanda",
  "Diego",
  "Isabela",
  "Bruno",
  "Leticia",
  "Matheus",
  "Patricia",
  "André",
  "Vanessa",
  "Rodrigo",
  "Daniela",
  "Gustavo",
  "Fernanda",
  "Leonardo",
  "Carolina",
  "Marcos",
  "Tatiana",
  "Victor",
  "Renata",
  "Henrique",
  "Aline",
  "Eduardo",
  "Natalia",
  "Ricardo",
  "Priscila",
  "Alexandre",
  "Monica",
];
const LAST_NAMES = [
  "Silva",
  "Santos",
  "Oliveira",
  "Souza",
  "Rodrigues",
  "Ferreira",
  "Almeida",
  "Nascimento",
  "Lima",
  "Araújo",
  "Melo",
  "Barbosa",
  "Ribeiro",
  "Martins",
  "Carvalho",
  "Gomes",
  "Lopes",
  "Costa",
  "Pereira",
  "Moreira",
];

// ══════════════════════════════════════════════
// GENERATORS — all column names verified via /tables_info
// ══════════════════════════════════════════════

// partners: display_name, user_id (NOT NULL FK→users), tenant_id, is_active, pix_key, pix_key_type, bank_name
function genPartner(userId) {
  const fn = pick(FIRST_NAMES),
    ln = pick(LAST_NAMES);
  return {
    tenant_id: TENANT_ID,
    display_name: `${fn} ${ln} — Parceiro`,
    user_id: userId, // MUST be a real user ID
    is_active: Math.random() > 0.15,
    pix_key: `${fn.toLowerCase()}.${ln.toLowerCase()}@email.com`,
    pix_key_type: "email",
    bank_name: pick([
      "Banco do Brasil",
      "Itaú",
      "Bradesco",
      "Nubank",
      "Caixa",
      "Santander",
    ]),
    created_at: pastDate(180),
    updated_at: now(),
  };
}

// customers: name, phone, email, cpf, tenant_id
function genCustomer(i) {
  const fn = pick(FIRST_NAMES),
    ln = pick(LAST_NAMES);
  return {
    tenant_id: TENANT_ID,
    name: `${fn} ${ln}`,
    email: `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@teste.com`,
    phone: `119${randInt(10000000, 99999999)}`,
    cpf: `${randInt(100, 999)}${randInt(100, 999)}${randInt(100, 999)}${randInt(10, 99)}`,
    created_at: pastDate(365),
    updated_at: now(),
  };
}

// banks: bank_code, name, ispb_code, is_active, tenant_id
function genBank(i) {
  const banks = [
    { name: "Banco do Brasil", bank_code: "001", ispb_code: "00000000" },
    { name: "Itaú Unibanco", bank_code: "341", ispb_code: "60701190" },
    { name: "Bradesco", bank_code: "237", ispb_code: "60746948" },
    {
      name: "Caixa Econômica Federal",
      bank_code: "104",
      ispb_code: "00360305",
    },
    { name: "Santander", bank_code: "033", ispb_code: "90400888" },
    { name: "Nubank", bank_code: "260", ispb_code: "18236120" },
    { name: "Inter", bank_code: "077", ispb_code: "00416968" },
    { name: "Sicoob", bank_code: "756", ispb_code: "02038232" },
  ];
  const b = banks[i % banks.length];
  return {
    tenant_id: TENANT_ID,
    name: b.name,
    bank_code: b.bank_code,
    ispb_code: b.ispb_code,
    is_active: true,
    created_at: now(),
    updated_at: now(),
  };
}

// bank_accounts: bank_id, account_name, account_type, agency_number, account_number, ...
function genBankAccount(bankId, i) {
  return {
    tenant_id: TENANT_ID,
    bank_id: bankId,
    account_name: `Conta ${pick(["Principal", "Operacional", "Reserva", "Investimentos", "Pagamentos", "Recebimentos"])} ${i + 1}`,
    account_type: pick(["checking", "savings", "investment"]),
    agency_number: `${randInt(1000, 9999)}`,
    account_number: `${randInt(10000, 99999)}`,
    account_digit: `${randInt(0, 9)}`,
    initial_balance: randAmount(1000, 50000),
    initial_balance_date: pastDateOnly(180),
    current_balance: randAmount(5000, 200000),
    currency: "BRL",
    is_default: i === 0,
    is_active: true,
    created_at: now(),
    updated_at: now(),
  };
}

// service_orders: template_id, current_step_id, process_status, title, description, customer_id, service_type_id, created_by
function genServiceOrder(customerIds, i) {
  const statuses = [
    "pending",
    "in_progress",
    "in_progress",
    "in_progress",
    "completed",
    "completed",
    "cancelled",
  ];
  const status = pick(statuses);
  const stepIdx =
    status === "completed" ? 3 : status === "cancelled" ? 0 : randInt(0, 2);
  return {
    tenant_id: TENANT_ID,
    customer_id: pick(customerIds),
    service_type_id: pick(SERVICE_TYPE_IDS),
    template_id: WORKFLOW_TEMPLATE_ID,
    current_step_id: WORKFLOW_STEPS[stepIdx],
    process_status: status,
    title: `OS-${String(i + 1).padStart(4, "0")} — ${pick(["Instalação", "Manutenção", "Consultoria", "Entrega", "Cobrança", "Reparo", "Vistoria", "Orçamento"])}`,
    description: `Ordem de serviço de teste #${i + 1} para stress testing.`,
    created_by: pick(USER_IDS),
    estimated_cost: randAmount(100, 5000),
    estimated_duration_days: randInt(1, 30),
    created_at: pastDate(180),
    updated_at: now(),
  };
}

// invoices: customer_id, tenant_id, status, total, due_date, created_by (nullable)
function genInvoice(customerIds, i) {
  return {
    tenant_id: TENANT_ID,
    customer_id: pick(customerIds),
    status: pick(INVOICE_STATUS),
    total: randAmount(100, 8000),
    due_date: Math.random() > 0.5 ? futureDateOnly(60) : pastDateOnly(30),
    notes: `Fatura de teste #${i + 1}`,
    created_by: pick(USER_IDS),
    created_at: pastDate(120),
    updated_at: now(),
  };
}

// quotes: customer_id, tenant_id, status, total, valid_until, created_by (nullable)
function genQuote(customerIds, i) {
  return {
    tenant_id: TENANT_ID,
    customer_id: pick(customerIds),
    status: pick(["draft", "sent", "approved", "rejected", "expired"]),
    total: randAmount(200, 15000),
    valid_until: futureDateOnly(30),
    notes: `Orçamento de teste #${i + 1}`,
    created_by: pick(USER_IDS),
    created_at: pastDate(90),
    updated_at: now(),
  };
}

// accounts_receivable: tenant_id, customer_id, amount, amount_received, due_date, status, type
function genAR(customerIds, i) {
  const status = pick(ACCOUNT_ENTRY_STATUS);
  const amount = randAmount(200, 10000);
  return {
    tenant_id: TENANT_ID,
    customer_id: pick(customerIds),
    amount,
    amount_received:
      status === "paid"
        ? amount
        : status === "partial"
          ? randAmount(50, amount * 0.8)
          : 0,
    due_date: Math.random() > 0.4 ? futureDateOnly(60) : pastDateOnly(30),
    status,
    type: pick(ACCOUNT_ENTRY_TYPE),
    description: `Conta a receber #${i + 1}`,
    created_at: pastDate(120),
    updated_at: now(),
  };
}

// accounts_payable: tenant_id, amount, amount_paid, due_date, status, type, description, category
function genAP(i) {
  const status = pick(ACCOUNT_ENTRY_STATUS);
  const amount = randAmount(50, 5000);
  return {
    tenant_id: TENANT_ID,
    amount,
    amount_paid:
      status === "paid"
        ? amount
        : status === "partial"
          ? randAmount(10, amount * 0.7)
          : 0,
    due_date: Math.random() > 0.4 ? futureDateOnly(60) : pastDateOnly(30),
    status,
    type: pick(ACCOUNT_ENTRY_TYPE),
    description: `Despesa de teste #${i + 1} — ${pick(["Aluguel", "Internet", "Energia", "Material", "Software", "Marketing", "Impostos", "Frete"])}`,
    category: pick([
      "operational",
      "administrative",
      "marketing",
      "taxes",
      "payroll",
      "utilities",
      "other",
    ]),
    created_at: pastDate(120),
    updated_at: now(),
  };
}

// contracts: tenant_id, customer_id, status, total_value, start_date, end_date, created_by (nullable)
function genContract(customerIds, i) {
  return {
    tenant_id: TENANT_ID,
    customer_id: pick(customerIds),
    status: pick([
      "draft",
      "active",
      "active",
      "active",
      "expired",
      "cancelled",
    ]),
    total_value: randAmount(1000, 50000),
    start_date: pastDateOnly(180),
    end_date: futureDateOnly(365),
    title: `Contrato #${i + 1} — ${pick(["Mensal", "Trimestral", "Anual", "Pontual", "Recorrente"])}`,
    created_by: pick(USER_IDS),
    created_at: pastDate(180),
    updated_at: now(),
  };
}

// leads: tenant_id, name, email, phone, status, source
function genLead(i) {
  const fn = pick(FIRST_NAMES),
    ln = pick(LAST_NAMES);
  return {
    tenant_id: TENANT_ID,
    name: `${fn} ${ln}`,
    email: `${fn.toLowerCase()}.${ln.toLowerCase()}.lead${i}@teste.com`,
    phone: `119${randInt(10000000, 99999999)}`,
    status: pick([
      "new",
      "contacted",
      "qualified",
      "proposal",
      "negotiation",
      "won",
      "lost",
    ]),
    source: pick([
      "website",
      "referral",
      "social_media",
      "whatsapp",
      "cold_call",
      "event",
      "partner",
    ]),
    notes: `Lead de teste #${i + 1} via ${pick(["site", "indicação", "WhatsApp", "Instagram", "Google"])}`,
    created_at: pastDate(90),
    updated_at: now(),
  };
}

// bank_transactions: tenant_id, bank_account_id, transaction_type (credit|debit), amount, description, transaction_date
function genBankTx(bankAccountIds, i) {
  return {
    tenant_id: TENANT_ID,
    bank_account_id: pick(bankAccountIds),
    transaction_type: pick(BANK_TX_TYPES),
    amount: randAmount(10, 8000),
    description: `TX #${i + 1} — ${pick(["Pagamento", "Recebimento", "Transferência", "Tarifa", "Depósito", "Saque", "Estorno"])}`,
    transaction_date: pastDateOnly(90),
    created_at: pastDate(90),
    updated_at: now(),
  };
}

// notifications: tenant_id, user_id, type (enum), title, message, is_read
function genNotification(i) {
  return {
    tenant_id: TENANT_ID,
    user_id: pick(USER_IDS),
    type: pick(NOTIFICATION_TYPES),
    title: `Notificação de teste #${i + 1}`,
    message: `Esta é uma notificação de stress test para verificar a estabilidade da tela com alto volume de dados. Mensagem número ${i + 1}.`,
    is_read: Math.random() > 0.6,
    created_at: pastDate(60),
    updated_at: now(),
  };
}

// process_updates: service_order_id, user_id, update_type, content (NO tenant_id!)
function genProcessUpdate(serviceOrderIds, i) {
  return {
    service_order_id: pick(serviceOrderIds),
    user_id: pick(USER_IDS),
    update_type: pick([
      "note",
      "status_change",
      "document",
      "comment",
      "system",
    ]),
    content: `Atualização de teste #${i + 1} — ${pick(["Documento enviado", "Cliente entrou em contato", "Status atualizado", "Prazo prorrogado", "Reunião agendada", "Pagamento confirmado", "Serviço iniciado", "Vistoria realizada"])}`,
    created_at: pastDate(90),
    updated_at: now(),
  };
}

// payments: tenant_id, invoice_id, amount, payment_method, status, paid_at
function genPayment(invoiceIds, i) {
  const status = pick(PAYMENT_STATUS);
  return {
    tenant_id: TENANT_ID,
    invoice_id: pick(invoiceIds),
    amount: randAmount(50, 5000),
    payment_method: pick(PAYMENT_METHOD),
    status,
    paid_at: status === "confirmed" ? pastDate(30) : null,
    notes: `Pagamento de teste #${i + 1}`,
    created_at: pastDate(60),
    updated_at: now(),
  };
}

// partner_earnings: tenant_id, partner_id, service_order_id, amount, type, status
function genPartnerEarning(partnerIds, serviceOrderIds, i) {
  return {
    tenant_id: TENANT_ID,
    partner_id: pick(partnerIds),
    service_order_id: pick(serviceOrderIds),
    amount: randAmount(50, 2000),
    type: pick(EARNING_TYPE),
    status: pick(EARNING_STATUS),
    description: `Ganho de parceiro #${i + 1}`,
    created_at: pastDate(90),
    updated_at: now(),
  };
}

// ══════════════════════════════════════════════
// MAIN EXECUTION
// ══════════════════════════════════════════════

async function main() {
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log("  BULK TEST DATA CREATOR v3 — Escritório Modelo");
  console.log(`  Tenant: ${TENANT_ID}`);
  console.log(`  Início: ${now()}`);
  console.log(
    "═══════════════════════════════════════════════════════════════\n",
  );

  const totals = {};

  // ── 1. PARTNERS (one per user — user_id is NOT NULL) ──
  console.log(`▶ Criando ${USER_IDS.length} parceiros (1 per user)...`);
  const partnerIds = [];
  for (let i = 0; i < USER_IDS.length; i++) {
    const id = await singleCreate("partners", genPartner(USER_IDS[i]));
    if (id) partnerIds.push(id);
    await sleep(300);
  }
  console.log(`  ✓ ${partnerIds.length} parceiros criados`);
  totals.partners = partnerIds.length;

  // ── 2. CUSTOMERS (80) ──
  console.log("\n▶ Criando 80 clientes...");
  const custItems = Array.from({ length: 80 }, (_, i) => genCustomer(i));
  await batchCreate("customers", custItems, "clientes");
  // Fetch all customer IDs
  const custRes = await apiPost({
    action: "list",
    table: "customers",
    search_field1: "tenant_id",
    search_value1: TENANT_ID,
    search_operator1: "equal",
  });
  const customerIds = (Array.isArray(custRes) ? custRes : [])
    .map((c) => c.id)
    .filter(Boolean);
  console.log(`  → ${customerIds.length} clientes disponíveis no total`);
  totals.customers = customerIds.length;

  // ── 3. BANKS (8) ──
  console.log("\n▶ Criando 8 bancos...");
  const bankIds = [];
  for (let i = 0; i < 8; i++) {
    const id = await singleCreate("banks", genBank(i));
    if (id) bankIds.push(id);
    await sleep(200);
  }
  console.log(`  ✓ ${bankIds.length} bancos criados`);
  totals.banks = bankIds.length;

  // ── 4. BANK ACCOUNTS (6) ──
  console.log("\n▶ Criando 6 contas bancárias...");
  const bankAccountIds = [];
  for (let i = 0; i < Math.min(6, bankIds.length); i++) {
    const id = await singleCreate(
      "bank_accounts",
      genBankAccount(bankIds[i % bankIds.length], i),
    );
    if (id) bankAccountIds.push(id);
    await sleep(200);
  }
  // If no new ones, fetch existing
  if (bankAccountIds.length === 0) {
    const baRes = await apiPost({
      action: "list",
      table: "bank_accounts",
      search_field1: "tenant_id",
      search_value1: TENANT_ID,
      search_operator1: "equal",
    });
    const existing = (Array.isArray(baRes) ? baRes : [])
      .map((b) => b.id)
      .filter(Boolean);
    bankAccountIds.push(...existing);
  }
  console.log(`  ✓ ${bankAccountIds.length} contas bancárias`);
  totals.bank_accounts = bankAccountIds.length;

  // ── 5. SERVICE ORDERS (60) ──
  console.log("\n▶ Criando 60 ordens de serviço...");
  const soItems = Array.from({ length: 60 }, (_, i) =>
    genServiceOrder(customerIds, i),
  );
  await batchCreate("service_orders", soItems, "ordens de serviço");
  // Fetch all SO IDs
  const soRes = await apiPost({
    action: "list",
    table: "service_orders",
    search_field1: "tenant_id",
    search_value1: TENANT_ID,
    search_operator1: "equal",
  });
  const serviceOrderIds = (Array.isArray(soRes) ? soRes : [])
    .map((s) => s.id)
    .filter(Boolean);
  console.log(`  → ${serviceOrderIds.length} OS disponíveis`);
  totals.service_orders = serviceOrderIds.length;

  // ── 6. INVOICES (50) ──
  console.log("\n▶ Criando 50 faturas...");
  const invItems = Array.from({ length: 50 }, (_, i) =>
    genInvoice(customerIds, i),
  );
  await batchCreate("invoices", invItems, "faturas");
  const invRes = await apiPost({
    action: "list",
    table: "invoices",
    search_field1: "tenant_id",
    search_value1: TENANT_ID,
    search_operator1: "equal",
  });
  const invoiceIds = (Array.isArray(invRes) ? invRes : [])
    .map((inv) => inv.id)
    .filter(Boolean);
  console.log(`  → ${invoiceIds.length} faturas disponíveis`);
  totals.invoices = invoiceIds.length;

  // ── 7. QUOTES (40) ──
  console.log("\n▶ Criando 40 orçamentos...");
  const quoteItems = Array.from({ length: 40 }, (_, i) =>
    genQuote(customerIds, i),
  );
  await batchCreate("quotes", quoteItems, "orçamentos");
  totals.quotes = 40;

  // ── 8. ACCOUNTS RECEIVABLE (60) ──
  console.log("\n▶ Criando 60 contas a receber...");
  const arItems = Array.from({ length: 60 }, (_, i) => genAR(customerIds, i));
  await batchCreate("accounts_receivable", arItems, "contas a receber");
  totals.accounts_receivable = 60;

  // ── 9. ACCOUNTS PAYABLE (50) ──
  console.log("\n▶ Criando 50 contas a pagar...");
  const apItems = Array.from({ length: 50 }, (_, i) => genAP(i));
  await batchCreate("accounts_payable", apItems, "contas a pagar");
  totals.accounts_payable = 50;

  // ── 10. CONTRACTS (30) ──
  console.log("\n▶ Criando 30 contratos...");
  const contractItems = Array.from({ length: 30 }, (_, i) =>
    genContract(customerIds, i),
  );
  await batchCreate("contracts", contractItems, "contratos");
  totals.contracts = 30;

  // ── 11. LEADS (50) ──
  console.log("\n▶ Criando 50 leads...");
  const leadItems = Array.from({ length: 50 }, (_, i) => genLead(i));
  await batchCreate("leads", leadItems, "leads");
  totals.leads = 50;

  // ── 12. BANK TRANSACTIONS (100) ──
  if (bankAccountIds.length > 0) {
    console.log("\n▶ Criando 100 transações bancárias...");
    const btItems = Array.from({ length: 100 }, (_, i) =>
      genBankTx(bankAccountIds, i),
    );
    await batchCreate("bank_transactions", btItems, "transações bancárias");
    totals.bank_transactions = 100;
  } else {
    console.log("\n⚠ Sem contas bancárias — pulando transações");
    totals.bank_transactions = 0;
  }

  // ── 13. NOTIFICATIONS (80) ──
  console.log("\n▶ Criando 80 notificações...");
  const notifItems = Array.from({ length: 80 }, (_, i) => genNotification(i));
  await batchCreate("notifications", notifItems, "notificações");
  totals.notifications = 80;

  // ── 14. PROCESS UPDATES (120) ──
  if (serviceOrderIds.length > 0) {
    console.log("\n▶ Criando 120 atualizações de processo...");
    const puItems = Array.from({ length: 120 }, (_, i) =>
      genProcessUpdate(serviceOrderIds, i),
    );
    await batchCreate("process_updates", puItems, "atualizações");
    totals.process_updates = 120;
  } else {
    console.log("\n⚠ Sem ordens de serviço — pulando atualizações");
    totals.process_updates = 0;
  }

  // ── 15. PAYMENTS (40) ──
  if (invoiceIds.length > 0) {
    console.log("\n▶ Criando 40 pagamentos...");
    const payItems = Array.from({ length: 40 }, (_, i) =>
      genPayment(invoiceIds, i),
    );
    await batchCreate("payments", payItems, "pagamentos");
    totals.payments = 40;
  } else {
    console.log("\n⚠ Sem faturas — pulando pagamentos");
    totals.payments = 0;
  }

  // ── 16. PARTNER EARNINGS (30) ──
  if (partnerIds.length > 0 && serviceOrderIds.length > 0) {
    console.log("\n▶ Criando 30 ganhos de parceiros...");
    const peItems = Array.from({ length: 30 }, (_, i) =>
      genPartnerEarning(partnerIds, serviceOrderIds, i),
    );
    await batchCreate("partner_earnings", peItems, "ganhos de parceiros");
    totals.partner_earnings = 30;
  } else {
    console.log("\n⚠ Sem parceiros ou OS — pulando ganhos");
    totals.partner_earnings = 0;
  }

  // ── SUMMARY ──
  console.log(
    "\n═══════════════════════════════════════════════════════════════",
  );
  console.log("  RESUMO DA CRIAÇÃO DE DADOS");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  let grandTotal = 0;
  for (const [table, count] of Object.entries(totals)) {
    console.log(`  ${table.padEnd(25)} ${count}`);
    grandTotal += count;
  }
  console.log(`  ${"─".repeat(40)}`);
  console.log(`  ${"TOTAL".padEnd(25)} ${grandTotal}`);
  console.log(`\n  Requests: ${requestCount}`);
  console.log(`  Erros: ${errorCount}`);
  console.log(`  Fim: ${now()}`);
  console.log(
    "═══════════════════════════════════════════════════════════════\n",
  );
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
