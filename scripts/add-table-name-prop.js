#!/usr/bin/env node
/**
 * Script to add `tableName` prop to all CrudScreen usages.
 * Run: node scripts/add-table-name-prop.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const MAPPING = [
  { file: "app/(app)/Administrador/Agenda.tsx", table: "service_appointments" },
  {
    file: "app/(app)/Administrador/agent-channel-bindings.tsx",
    table: "agent_channel_bindings",
  },
  {
    file: "app/(app)/Administrador/agent-handoff-policies.tsx",
    table: "agent_handoff_policies",
  },
  {
    file: "app/(app)/Administrador/agent-playbook-rules.tsx",
    table: "agent_playbook_rules",
  },
  {
    file: "app/(app)/Administrador/agent-playbook-tables.tsx",
    table: "agent_playbook_tables",
  },
  {
    file: "app/(app)/Administrador/agent-playbooks.tsx",
    table: "agent_playbooks",
  },
  {
    file: "app/(app)/Administrador/agent-state-steps.tsx",
    table: "agent_state_steps",
  },
  { file: "app/(app)/Administrador/agent_states.tsx", table: "agent_states" },
  { file: "app/(app)/Administrador/Agents.tsx", table: "agents" },
  { file: "app/(app)/Administrador/auth_codes.tsx", table: "auth_codes" },
  { file: "app/(app)/Administrador/auth_tokens.tsx", table: "auth_tokens" },
  { file: "app/(app)/Administrador/automations.tsx", table: "automations" },
  {
    file: "app/(app)/Administrador/AvaliacoesServico.tsx",
    table: "service_reviews",
  },
  { file: "app/(app)/Administrador/bancos.tsx", table: "banks" },
  {
    file: "app/(app)/Administrador/campaign-items.tsx",
    table: "campaign_items",
  },
  { file: "app/(app)/Administrador/campaigns.tsx", table: "campaigns" },
  { file: "app/(app)/Administrador/cartorios.tsx", table: "cartorios" },
  {
    file: "app/(app)/Administrador/channel-partners.tsx",
    table: "channel_partners",
  },
  { file: "app/(app)/Administrador/companies.tsx", table: "companies" },
  {
    file: "app/(app)/Administrador/company-members.tsx",
    table: "company_members",
  },
  {
    file: "app/(app)/Administrador/Composicoes.tsx",
    table: "service_compositions",
  },
  { file: "app/(app)/Administrador/Compras.tsx", table: "purchase_orders" },
  {
    file: "app/(app)/Administrador/contas-bancarias.tsx",
    table: "bank_accounts",
  },
  {
    file: "app/(app)/Administrador/ContasAPagar.tsx",
    table: "accounts_payable",
  },
  {
    file: "app/(app)/Administrador/ContasAReceber.tsx",
    table: "accounts_receivable",
  },
  { file: "app/(app)/Administrador/content-pages.tsx", table: "content_pages" },
  { file: "app/(app)/Administrador/contracts.tsx", table: "contracts" },
  { file: "app/(app)/Administrador/crm-leads.tsx", table: "leads" },
  {
    file: "app/(app)/Administrador/customer-contracts.tsx",
    table: "contracts",
  },
  { file: "app/(app)/Administrador/customer-payments.tsx", table: "payments" },
  {
    file: "app/(app)/Administrador/customer-processes.tsx",
    table: "service_orders",
  },
  {
    file: "app/(app)/Administrador/customer-properties.tsx",
    table: "properties",
  },
  { file: "app/(app)/Administrador/customer-quotes.tsx", table: "quotes" },
  { file: "app/(app)/Administrador/customer-sales.tsx", table: "invoices" },
  { file: "app/(app)/Administrador/customers.tsx", table: "customers" },
  {
    file: "app/(app)/Administrador/document-signatures.tsx",
    table: "document_signatures",
  },
  { file: "app/(app)/Administrador/Estoque.tsx", table: "services" },
  {
    file: "app/(app)/Administrador/ExecucoesServico.tsx",
    table: "service_executions",
  },
  {
    file: "app/(app)/Administrador/extrato-bancario.tsx",
    table: "bank_transactions",
  },
  { file: "app/(app)/Administrador/Faturas.tsx", table: "invoices" },
  {
    file: "app/(app)/Administrador/FolgasParceiro.tsx",
    table: "partner_time_off",
  },
  { file: "app/(app)/Administrador/Fornecedores.tsx", table: "suppliers" },
  {
    file: "app/(app)/Administrador/GanhosParceiros.tsx",
    table: "partner_earnings",
  },
  { file: "app/(app)/Administrador/gestao-de-usuarios.tsx", table: "users" },
  { file: "app/(app)/Administrador/lead-forms.tsx", table: "lead_forms" },
  {
    file: "app/(app)/Administrador/LogsAgendamentos.tsx",
    table: "appointment_logs",
  },
  { file: "app/(app)/Administrador/LogsAvaliacoes.tsx", table: "review_logs" },
  {
    file: "app/(app)/Administrador/MovimentacoesEstoque.tsx",
    table: "stock_movements",
  },
  { file: "app/(app)/Administrador/ocr-config.tsx", table: "ocr_config" },
  { file: "app/(app)/Administrador/ocr-results.tsx", table: "ocr_results" },
  { file: "app/(app)/Administrador/onr-certidoes.tsx", table: "onr_certidoes" },
  {
    file: "app/(app)/Administrador/onr-protocolos.tsx",
    table: "onr_protocolos",
  },
  { file: "app/(app)/Administrador/orcamentos.tsx", table: "quotes" },
  { file: "app/(app)/Administrador/Pagamentos.tsx", table: "payments" },
  { file: "app/(app)/Administrador/Parceiros.tsx", table: "partners" },
  { file: "app/(app)/Administrador/permissions.tsx", table: "permissions" },
  {
    file: "app/(app)/Administrador/plano-contas.tsx",
    table: "chart_of_accounts",
  },
  {
    file: "app/(app)/Administrador/quote-templates.tsx",
    table: "quote_templates",
  },
  {
    file: "app/(app)/Administrador/RegrasDesconto.tsx",
    table: "discount_rules",
  },
  {
    file: "app/(app)/Administrador/ResumoAvaliacaoParceiro.tsx",
    table: "partner_rating_summary",
  },
  {
    file: "app/(app)/Administrador/role_permissions.tsx",
    table: "role_permissions",
  },
  { file: "app/(app)/Administrador/roles.tsx", table: "roles" },
  {
    file: "app/(app)/Administrador/ServiceCategories.tsx",
    table: "service_categories",
  },
  { file: "app/(app)/Administrador/services.tsx", table: "services" },
  { file: "app/(app)/Administrador/ServiceTypes.tsx", table: "service_types" },
  {
    file: "app/(app)/Administrador/SolicitacaoCompras.tsx",
    table: "purchase_requests",
  },
  {
    file: "app/(app)/Administrador/SolicitacoesCompras.tsx",
    table: "purchase_requests",
  },
  {
    file: "app/(app)/Administrador/split-servicos.tsx",
    table: "service_split_rules",
  },
  { file: "app/(app)/Administrador/tenants.tsx", table: "tenants" },
  { file: "app/(app)/Administrador/user_tenants.tsx", table: "user_tenants" },
  { file: "app/(app)/Administrador/Vendas.tsx", table: "sales" },
  {
    file: "app/(app)/Administrador/workflow_steps.tsx",
    table: "workflow_steps",
  },
  {
    file: "app/(app)/Administrador/workflow_templates.tsx",
    table: "workflow_templates",
  },
  { file: "app/(app)/Servicos/Imoveis.tsx", table: "properties" },
  { file: "app/(app)/Servicos/MinhasVendas.tsx", table: "sales" },
];

let success = 0;
let skipped = 0;
let failed = 0;

for (const { file, table } of MAPPING) {
  const fullPath = path.join(ROOT, file);

  if (!fs.existsSync(fullPath)) {
    console.log(`[SKIP] File not found: ${file}`);
    skipped++;
    continue;
  }

  let content = fs.readFileSync(fullPath, "utf-8");

  // Check if tableName already exists
  if (content.includes("tableName=")) {
    console.log(`[SKIP] Already has tableName: ${file}`);
    skipped++;
    continue;
  }

  // Pattern 1: <CrudScreen<SomeType>\n  (with generic type)
  // Pattern 2: <CrudScreen\n  (without generic)
  // We match the opening tag line and add tableName as the first prop
  const regex = /(<CrudScreen(?:<[^>]*>)?)\s*\n(\s+)/;
  const match = content.match(regex);

  if (!match) {
    console.log(`[WARN] No CrudScreen JSX tag found: ${file}`);
    failed++;
    continue;
  }

  const indent = match[2]; // whitespace before next prop
  const replacement = `${match[1]}\n${indent}tableName="${table}"\n${indent}`;
  content = content.replace(regex, replacement);

  fs.writeFileSync(fullPath, content, "utf-8");
  console.log(`[OK]   ${file} → tableName="${table}"`);
  success++;
}

console.log(
  `\nDone: ${success} updated, ${skipped} skipped, ${failed} warnings`,
);
