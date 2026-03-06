/**
 * Migration: Permission CRUD Matrix Restructuring
 *
 * Migrates the permissions table from the old READ/WRITE/DELETE format
 * to the new VIEW/CREATE/EDIT/DELETE CRUD matrix format.
 *
 * Operations:
 * 1. RENAME: `.read` → `.view` (keeps DB row ID + role_permissions intact)
 * 2. SPLIT:  `.write` → `.edit` (rename) + `.create` (new row)
 *    - All roles that had `.write` get both `.create` and `.edit`
 * 3. `.delete` codes stay unchanged
 * 4. Special action codes stay unchanged
 * 5. Insert new codes that didn't have old equivalents (syncPermissions handles this too)
 *
 * This script is IDEMPOTENT — safe to run multiple times.
 *
 * Usage: node scripts/migrate-permissions-crud-matrix.js
 */

const axios = require("axios");

// ── Load API key ──
let apiKey = process.env.EXPO_PUBLIC_N8N_API_KEY;
if (!apiKey) {
  try {
    const fs = require("fs");
    const envContent = fs.readFileSync(".env", "utf8");
    const match = envContent.match(/EXPO_PUBLIC_N8N_API_KEY=(.+)/);
    if (match) apiKey = match[1].trim();
  } catch {}
}
if (!apiKey) {
  console.error(
    "❌ No API key found. Set EXPO_PUBLIC_N8N_API_KEY or add to .env",
  );
  process.exit(1);
}

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  "https://sos-api-crud.raulcamilotti-c44.workers.dev";

const API_DINAMICO = `${API_BASE}/api_dinamico`;
const headers = { "X-Api-Key": apiKey };

// ── Helper to run SQL ──
async function runSQL(label, sql) {
  try {
    const res = await axios.post(API_DINAMICO, { sql }, { headers });
    const data = res.data;
    const isEmpty =
      !data || (Array.isArray(data) && data.length === 0) || data === "";
    console.log(`  ✅ ${label}${isEmpty ? " (no rows affected)" : ""}`);
    return data;
  } catch (e) {
    const msg = e.response ? JSON.stringify(e.response.data) : e.message;
    console.error(`  ❌ ${label}: ${msg}`);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════
// MAPPING: Old → New permission codes
// ══════════════════════════════════════════════════════════════

// Domains whose `.read` code should be RENAMED to `.view`
const READ_TO_VIEW = [
  { old: "customer.read", new_: "customer.view", desc: "Visualizar clientes" },
  {
    old: "document.read",
    new_: "document.view",
    desc: "Visualizar documentos",
  },
  { old: "project.read", new_: "project.view", desc: "Visualizar projetos" },
  { old: "task.read", new_: "task.view", desc: "Visualizar tarefas" },
  { old: "workflow.read", new_: "workflow.view", desc: "Visualizar workflows" },
  { old: "user.read", new_: "user.view", desc: "Visualizar usuários" },
  { old: "service.read", new_: "service.view", desc: "Visualizar serviços" },
  {
    old: "appointment.read",
    new_: "appointment.view",
    desc: "Visualizar agendamentos",
  },
  { old: "property.read", new_: "property.view", desc: "Visualizar imóveis" },
  { old: "company.read", new_: "company.view", desc: "Visualizar empresas" },
  {
    old: "process_update.read",
    new_: "process_update.view",
    desc: "Visualizar atualizações de processo",
  },
  {
    old: "financial.read",
    new_: "financial.view",
    desc: "Visualizar financeiro",
  },
  { old: "presale.read", new_: "presale.view", desc: "Visualizar pré-vendas" },
  { old: "sale.read", new_: "sale.view", desc: "Visualizar vendas" },
  { old: "stock.read", new_: "stock.view", desc: "Visualizar estoque" },
  { old: "purchase.read", new_: "purchase.view", desc: "Visualizar compras" },
  {
    old: "supplier.read",
    new_: "supplier.view",
    desc: "Visualizar fornecedores",
  },
];

// Domains whose `.write` code should be SPLIT into `.edit` (rename) + `.create` (new)
const WRITE_TO_CREATE_EDIT = [
  {
    old: "customer.write",
    edit: "customer.edit",
    editDesc: "Editar clientes",
    create: "customer.create",
    createDesc: "Criar clientes",
  },
  {
    old: "document.write",
    edit: "document.edit",
    editDesc: "Editar documentos",
    create: "document.create",
    createDesc: "Criar documentos",
  },
  {
    old: "project.write",
    edit: "project.edit",
    editDesc: "Editar projetos",
    create: "project.create",
    createDesc: "Criar projetos",
  },
  {
    old: "task.write",
    edit: "task.edit",
    editDesc: "Editar tarefas",
    create: "task.create",
    createDesc: "Criar tarefas",
  },
  {
    old: "workflow.write",
    edit: "workflow.edit",
    editDesc: "Editar workflows",
    create: "workflow.create",
    createDesc: "Criar workflows",
  },
  {
    old: "user.write",
    edit: "user.edit",
    editDesc: "Editar usuários",
    create: "user.create",
    createDesc: "Criar usuários",
  },
  {
    old: "appointment.write",
    edit: "appointment.edit",
    editDesc: "Editar agendamentos",
    create: "appointment.create",
    createDesc: "Criar agendamentos",
  },
  {
    old: "property.write",
    edit: "property.edit",
    editDesc: "Editar imóveis",
    create: "property.create",
    createDesc: "Criar imóveis",
  },
  {
    old: "company.write",
    edit: "company.edit",
    editDesc: "Editar empresas",
    create: "company.create",
    createDesc: "Criar empresas",
  },
  {
    old: "review.write",
    edit: "review.edit",
    editDesc: "Editar avaliações",
    create: "review.create",
    createDesc: "Criar avaliações",
  },
  {
    old: "process_update.write",
    edit: "process_update.edit",
    editDesc: "Editar atualizações de processo",
    create: "process_update.create",
    createDesc: "Criar atualizações de processo",
  },
  {
    old: "financial.write",
    edit: "financial.edit",
    editDesc: "Editar financeiro",
    create: "financial.create",
    createDesc: "Criar registros financeiros",
  },
  {
    old: "presale.write",
    edit: "presale.edit",
    editDesc: "Editar pré-vendas",
    create: "presale.create",
    createDesc: "Criar pré-vendas",
  },
  {
    old: "sale.write",
    edit: "sale.edit",
    editDesc: "Editar vendas",
    create: "sale.create",
    createDesc: "Criar vendas",
  },
  {
    old: "stock.write",
    edit: "stock.edit",
    editDesc: "Editar estoque",
    create: "stock.create",
    createDesc: "Criar movimentações de estoque",
  },
  {
    old: "purchase.write",
    edit: "purchase.edit",
    editDesc: "Editar compras",
    create: "purchase.create",
    createDesc: "Criar pedidos de compra",
  },
  {
    old: "supplier.write",
    edit: "supplier.edit",
    editDesc: "Editar fornecedores",
    create: "supplier.create",
    createDesc: "Criar fornecedores",
  },
];

// Entirely new permission codes (no old equivalent)
// syncPermissions() handles these too, but inserting for completeness
const NEW_CODES = [
  { code: "workflow.delete", desc: "Excluir workflows" },
  { code: "service.create", desc: "Criar serviços" },
  { code: "service.edit", desc: "Editar serviços" },
  { code: "service.delete", desc: "Excluir serviços" },
  { code: "appointment.delete", desc: "Excluir agendamentos" },
  { code: "property.delete", desc: "Excluir imóveis" },
  { code: "company.delete", desc: "Excluir empresas" },
  { code: "review.view", desc: "Visualizar avaliações" },
  { code: "review.delete", desc: "Excluir avaliações" },
  { code: "process_update.delete", desc: "Excluir atualizações de processo" },
  { code: "financial.delete", desc: "Excluir registros financeiros" },
  { code: "delinquency.view", desc: "Visualizar inadimplência" },
  { code: "delinquency.create", desc: "Criar registros de inadimplência" },
  { code: "delinquency.edit", desc: "Editar inadimplência" },
  { code: "delinquency.delete", desc: "Excluir registros de inadimplência" },
  { code: "partner.view", desc: "Visualizar parceiros" },
  { code: "partner.create", desc: "Criar parceiros" },
  { code: "partner.edit", desc: "Editar parceiros" },
  { code: "partner.delete", desc: "Excluir parceiros" },
  { code: "presale.delete", desc: "Excluir pré-vendas" },
  { code: "sale.delete", desc: "Excluir vendas" },
  { code: "stock.delete", desc: "Excluir movimentações de estoque" },
  { code: "purchase.delete", desc: "Excluir pedidos de compra" },
  { code: "supplier.delete", desc: "Excluir fornecedores" },
  { code: "atendimento.view", desc: "Visualizar atendimentos" },
  { code: "atendimento.create", desc: "Criar atendimentos" },
  { code: "atendimento.edit", desc: "Editar atendimentos" },
  { code: "atendimento.delete", desc: "Excluir atendimentos" },
  { code: "atendimento.dashboard", desc: "Acessar dashboard de atendimentos" },
];

async function migrate() {
  console.log("══════════════════════════════════════════════════════");
  console.log("  Permission CRUD Matrix Migration");
  console.log("══════════════════════════════════════════════════════\n");

  // ────────────────────────────────────────────────────────────
  // STEP 1: Rename .read → .view
  // ────────────────────────────────────────────────────────────
  console.log("── Step 1: Rename .read → .view ──");
  for (const mapping of READ_TO_VIEW) {
    await runSQL(
      `${mapping.old} → ${mapping.new_}`,
      `UPDATE permissions SET code = '${mapping.new_}', description = '${mapping.desc}' WHERE code = '${mapping.old}' AND NOT EXISTS (SELECT 1 FROM permissions WHERE code = '${mapping.new_}')`,
    );
  }

  // ────────────────────────────────────────────────────────────
  // STEP 2: Split .write → .edit (rename) + .create (new)
  // ────────────────────────────────────────────────────────────
  console.log("\n── Step 2: Split .write → .edit + .create ──");
  for (const mapping of WRITE_TO_CREATE_EDIT) {
    // 2a. Rename .write → .edit (preserves permission_id → role_permissions link)
    await runSQL(
      `${mapping.old} → ${mapping.edit}`,
      `UPDATE permissions SET code = '${mapping.edit}', description = '${mapping.editDesc}' WHERE code = '${mapping.old}' AND NOT EXISTS (SELECT 1 FROM permissions WHERE code = '${mapping.edit}')`,
    );

    // 2b. Insert new .create code
    await runSQL(
      `INSERT ${mapping.create}`,
      `INSERT INTO permissions (id, code, description) SELECT gen_random_uuid(), '${mapping.create}', '${mapping.createDesc}' WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = '${mapping.create}')`,
    );

    // 2c. Copy role_permissions: roles that had .write (now .edit) also get .create
    await runSQL(
      `Copy role_perms ${mapping.edit} → ${mapping.create}`,
      `INSERT INTO role_permissions (role_id, permission_id) SELECT rp.role_id, create_p.id FROM role_permissions rp JOIN permissions edit_p ON rp.permission_id = edit_p.id AND edit_p.code = '${mapping.edit}' CROSS JOIN permissions create_p WHERE create_p.code = '${mapping.create}' AND NOT EXISTS (SELECT 1 FROM role_permissions rp2 WHERE rp2.role_id = rp.role_id AND rp2.permission_id = create_p.id)`,
    );
  }

  // ────────────────────────────────────────────────────────────
  // STEP 3: Insert entirely new permission codes
  // ────────────────────────────────────────────────────────────
  console.log("\n── Step 3: Insert new permission codes ──");
  for (const entry of NEW_CODES) {
    await runSQL(
      `INSERT ${entry.code}`,
      `INSERT INTO permissions (id, code, description) SELECT gen_random_uuid(), '${entry.code}', '${entry.desc}' WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = '${entry.code}')`,
    );
  }

  // ────────────────────────────────────────────────────────────
  // STEP 4: Verify results
  // ────────────────────────────────────────────────────────────
  console.log("\n── Step 4: Verification ──");

  // Check no old .read codes remain
  const oldReads = await runSQL(
    "Check remaining .read codes",
    `SELECT code FROM permissions WHERE code LIKE '%.read'`,
  );
  if (oldReads && Array.isArray(oldReads) && oldReads.length > 0) {
    console.warn(
      `  ⚠️  Old .read codes still exist: ${oldReads.map((r) => r.code).join(", ")}`,
    );
  } else {
    console.log("  ✅ No old .read codes remain");
  }

  // Check no old .write codes remain
  const oldWrites = await runSQL(
    "Check remaining .write codes",
    `SELECT code FROM permissions WHERE code LIKE '%.write'`,
  );
  if (oldWrites && Array.isArray(oldWrites) && oldWrites.length > 0) {
    console.warn(
      `  ⚠️  Old .write codes still exist: ${oldWrites.map((r) => r.code).join(", ")}`,
    );
  } else {
    console.log("  ✅ No old .write codes remain");
  }

  // Count total permissions
  const total = await runSQL(
    "Total permission count",
    `SELECT count(*) as total FROM permissions`,
  );
  if (total && Array.isArray(total) && total.length > 0) {
    console.log(
      `  📊 Total permissions in DB: ${total[0].total ?? total[0].count}`,
    );
  }

  // Count .view codes
  const viewCount = await runSQL(
    "Count .view codes",
    `SELECT count(*) as total FROM permissions WHERE code LIKE '%.view'`,
  );
  if (viewCount && Array.isArray(viewCount) && viewCount.length > 0) {
    console.log(
      `  📊 .view codes: ${viewCount[0].total ?? viewCount[0].count}`,
    );
  }

  // Count .create codes
  const createCount = await runSQL(
    "Count .create codes",
    `SELECT count(*) as total FROM permissions WHERE code LIKE '%.create'`,
  );
  if (createCount && Array.isArray(createCount) && createCount.length > 0) {
    console.log(
      `  📊 .create codes: ${createCount[0].total ?? createCount[0].count}`,
    );
  }

  // Count .edit codes
  const editCount = await runSQL(
    "Count .edit codes",
    `SELECT count(*) as total FROM permissions WHERE code LIKE '%.edit'`,
  );
  if (editCount && Array.isArray(editCount) && editCount.length > 0) {
    console.log(
      `  📊 .edit codes: ${editCount[0].total ?? editCount[0].count}`,
    );
  }

  // Count .delete codes
  const deleteCount = await runSQL(
    "Count .delete codes",
    `SELECT count(*) as total FROM permissions WHERE code LIKE '%.delete'`,
  );
  if (deleteCount && Array.isArray(deleteCount) && deleteCount.length > 0) {
    console.log(
      `  📊 .delete codes: ${deleteCount[0].total ?? deleteCount[0].count}`,
    );
  }

  console.log("\n══════════════════════════════════════════════════════");
  console.log("  Migration complete!");
  console.log("  Note: Run syncPermissions() on first app load to");
  console.log("  create any remaining codes and assign defaults.");
  console.log("══════════════════════════════════════════════════════\n");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
