/**
 * Setup Receipt Automation
 *
 * Registers the automatic receipt (recibo) generation automation for tenants.
 * When enabled, a receipt document is auto-generated whenever an accounts_receivable
 * entry status changes to "paid".
 *
 * Usage:
 *   node scripts/setup-receipt-automation.js                 # all tenants
 *   node scripts/setup-receipt-automation.js <tenant_id>     # specific tenant
 *
 * What it does:
 *   1. Creates a default receipt document template (if not exists) for each tenant
 *   2. Registers an automation row: trigger="accounts_receivable.paid", action="generate_receipt"
 *   3. Skips tenants that already have the automation registered
 */

const axios = require("axios");

const CRUD_ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";

/* ------------------------------------------------------------------ */
/*  Receipt template HTML                                              */
/* ------------------------------------------------------------------ */

const RECEIPT_TEMPLATE_HTML = `<div style="text-align:center; margin-bottom:30px;">
  <h1 style="margin:0; font-size:28px; color:#1a1a1a;">RECIBO</h1>
  <p style="margin:4px 0 0; font-size:14px; color:#666;">Nº {{recibo_numero}}</p>
</div>

<div style="background:#f8f9fa; border-radius:8px; padding:20px; margin-bottom:24px;">
  <table style="width:100%; border-collapse:collapse;">
    <tr>
      <td style="padding:6px 0; font-weight:600; color:#333; width:140px;">Valor:</td>
      <td style="padding:6px 0; font-size:20px; font-weight:700; color:#0a7ea4;">{{valor}}</td>
    </tr>
    <tr>
      <td style="padding:6px 0; font-weight:600; color:#333;">Data:</td>
      <td style="padding:6px 0;">{{data_recebimento}}</td>
    </tr>
    <tr>
      <td style="padding:6px 0; font-weight:600; color:#333;">Forma de pagamento:</td>
      <td style="padding:6px 0;">{{forma_pagamento}}</td>
    </tr>
  </table>
</div>

<div style="margin-bottom:24px;">
  <h3 style="margin:0 0 12px; color:#333; border-bottom:1px solid #ddd; padding-bottom:6px;">Recebido de</h3>
  <table style="width:100%; border-collapse:collapse;">
    <tr>
      <td style="padding:4px 0; font-weight:600; color:#333; width:140px;">Nome:</td>
      <td style="padding:4px 0;">{{cliente_nome}}</td>
    </tr>
    <tr>
      <td style="padding:4px 0; font-weight:600; color:#333;">Documento:</td>
      <td style="padding:4px 0;">{{cliente_documento}}</td>
    </tr>
    <tr>
      <td style="padding:4px 0; font-weight:600; color:#333;">E-mail:</td>
      <td style="padding:4px 0;">{{cliente_email}}</td>
    </tr>
  </table>
</div>

<div style="margin-bottom:24px;">
  <h3 style="margin:0 0 12px; color:#333; border-bottom:1px solid #ddd; padding-bottom:6px;">Referente a</h3>
  <p style="margin:0; line-height:1.6;">{{descricao}}</p>
  <p style="margin:8px 0 0; color:#666; font-size:13px;">Categoria: {{categoria}} | Tipo: {{tipo}}</p>
</div>

{{#pix_info}}
<div style="margin-bottom:24px; background:#e8f5e9; border-radius:8px; padding:16px;">
  <h4 style="margin:0 0 8px; color:#2e7d32;">Dados PIX</h4>
  <p style="margin:0; font-size:13px; word-break:break-all;">{{pix_info}}</p>
</div>
{{/pix_info}}

{{#observacoes}}
<div style="margin-bottom:24px;">
  <h3 style="margin:0 0 8px; color:#333;">Observações</h3>
  <p style="margin:0; color:#555;">{{observacoes}}</p>
</div>
{{/observacoes}}

<div style="margin-top:40px; text-align:center;">
  <p style="margin:0; color:#666; font-size:13px;">{{empresa_nome}}</p>
  <p style="margin:4px 0 0; color:#999; font-size:12px;">Documento emitido em {{data_emissao}}</p>
</div>

<div style="margin-top:60px; text-align:center;">
  <div style="border-top:1px solid #333; width:250px; margin:0 auto; padding-top:8px;">
    <p style="margin:0; font-size:13px;">Assinatura / Carimbo</p>
  </div>
</div>`;

const RECEIPT_TEMPLATE_VARIABLES = [
  { key: "recibo_numero", label: "Número do Recibo", defaultValue: "" },
  { key: "valor", label: "Valor Recebido", defaultValue: "R$ 0,00" },
  { key: "data_recebimento", label: "Data do Recebimento", defaultValue: "" },
  { key: "forma_pagamento", label: "Forma de Pagamento", defaultValue: "" },
  { key: "cliente_nome", label: "Nome do Cliente", defaultValue: "" },
  {
    key: "cliente_documento",
    label: "Documento do Cliente (CPF/CNPJ)",
    defaultValue: "",
  },
  { key: "cliente_email", label: "E-mail do Cliente", defaultValue: "" },
  { key: "descricao", label: "Descrição do Serviço", defaultValue: "" },
  { key: "categoria", label: "Categoria", defaultValue: "" },
  { key: "tipo", label: "Tipo de Receita", defaultValue: "" },
  { key: "pix_info", label: "Informações PIX", defaultValue: "" },
  { key: "observacoes", label: "Observações", defaultValue: "" },
  { key: "empresa_nome", label: "Nome da Empresa", defaultValue: "" },
  { key: "data_emissao", label: "Data de Emissão", defaultValue: "" },
  { key: "competencia", label: "Competência", defaultValue: "" },
  { key: "vencimento", label: "Data de Vencimento", defaultValue: "" },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function crudList(table, filters = [], options = {}) {
  const params = {};
  filters.forEach((f, i) => {
    const n = i + 1;
    params[`search_field${n}`] = f.field;
    params[`search_value${n}`] = f.value;
    params[`search_operator${n}`] = f.operator || "equal";
  });
  if (options.sortColumn) params.sort_column = options.sortColumn;
  if (options.combineType) params.combine_type = options.combineType;

  const res = await axios.post(CRUD_ENDPOINT, {
    action: "list",
    table,
    ...params,
  });

  const data = res.data;
  if (!data || data === "") return [];
  if (Array.isArray(data)) return data;
  if (data.data && Array.isArray(data.data)) return data.data;
  if (data.items && Array.isArray(data.items)) return data.items;
  if (data.value && Array.isArray(data.value)) return data.value;
  return [];
}

async function crudCreate(table, payload) {
  const res = await axios.post(CRUD_ENDPOINT, {
    action: "create",
    table,
    payload,
  });
  return res.data;
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

async function setupForTenant(tenantId) {
  console.log(`\n--- Tenant: ${tenantId} ---`);

  // 1. Check if receipt automation already exists
  const existingAutomations = await crudList("automations", [
    { field: "tenant_id", value: tenantId },
    { field: "trigger", value: "accounts_receivable.paid" },
  ]);

  const activeAutomation = existingAutomations.find(
    (a) => !a.deleted_at && a.action === "generate_receipt",
  );

  if (activeAutomation) {
    console.log("  ✓ Receipt automation already registered — skipping");
  } else {
    // Register automation
    await crudCreate("automations", {
      tenant_id: tenantId,
      name: "Gerar Recibo Automático",
      description:
        "Gera um recibo automaticamente quando uma conta a receber é marcada como paga",
      trigger: "accounts_receivable.paid",
      action: "generate_receipt",
      is_active: true,
      config: JSON.stringify({
        generatePdf: true,
        templateCategory: "recibo",
        notifyUser: true,
      }),
    });
    console.log("  ✓ Receipt automation registered");
  }

  // 2. Check if receipt template exists
  const existingTemplates = await crudList("document_templates", [
    { field: "tenant_id", value: tenantId },
    { field: "category", value: "recibo" },
  ]);

  const activeTemplate = existingTemplates.find((t) => !t.deleted_at);

  if (activeTemplate) {
    console.log(
      `  ✓ Receipt template already exists: "${activeTemplate.name}" — skipping`,
    );
  } else {
    await crudCreate("document_templates", {
      tenant_id: tenantId,
      name: "Recibo de Pagamento",
      description:
        "Modelo padrão de recibo gerado automaticamente quando um pagamento é confirmado",
      category: "recibo",
      html_content: RECEIPT_TEMPLATE_HTML,
      variables: JSON.stringify(RECEIPT_TEMPLATE_VARIABLES),
      is_active: true,
      version: 1,
    });
    console.log("  ✓ Receipt template created");
  }

  console.log("  ✓ Setup complete for tenant");
}

async function main() {
  const specificTenantId = process.argv[2];

  console.log("=== Receipt Automation Setup ===");
  console.log(
    "Auto-generates receipts when accounts_receivable status → paid\n",
  );

  if (specificTenantId) {
    // Single tenant
    await setupForTenant(specificTenantId);
  } else {
    // All tenants
    console.log("Fetching all tenants...");
    const tenants = await crudList("tenants");
    const activeTenants = tenants.filter((t) => !t.deleted_at);
    console.log(`Found ${activeTenants.length} active tenant(s)`);

    for (const tenant of activeTenants) {
      try {
        await setupForTenant(tenant.id);
      } catch (err) {
        console.error(`  ✗ Failed for tenant ${tenant.id}: ${err.message}`);
      }
    }
  }

  console.log("\n=== Done ===");
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
