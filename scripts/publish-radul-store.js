/**
 * Script: Publish Radul Store
 * Configures and publishes the Radul marketplace with real products,
 * categories, banner, and about text.
 */
const axios = require("axios");

const API_KEY = process.env.SOS_API_KEY;
if (!API_KEY) {
  console.error("Missing SOS_API_KEY env var");
  process.exit(1);
}
const API =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "https://sos-api-crud.raulcamilotti-c44.workers.dev";
const HEADERS = {
  "X-Api-Key": API_KEY,
};

const TENANT_ID = "0bc867c7-082b-4d6f-a240-405f01b2941e";

// Category IDs (existing)
const CAT_PLANOS = "99c64cf9-ece8-4db8-bac1-0b341c7e595b";
const CAT_SERVICOS = "0b9e6b44-34aa-4e0a-b17b-5b9b7415bb30";
const CAT_SOLUCOES = "3d7237bb-a45f-4876-8a2c-b848acd38487";
const CAT_POS_VENDA = "8fa1d37a-0faf-48db-a0e5-d6651a07f269";
const CAT_ENTREGA = "954684e9-2a7a-4b33-937e-69d30254db68";

async function update(table, payload) {
  const res = await axios.post(
    `${API}/api_crud`,
    { action: "update", table, payload },
    { headers: HEADERS },
  );
  return res.data;
}

async function updateTenantConfig(tenantId, configPatch) {
  // Read current config
  const listRes = await axios.post(
    `${API}/api_crud`,
    {
      action: "list",
      table: "tenants",
      search_field1: "id",
      search_value1: tenantId,
      search_operator1: "equal",
    },
    { headers: HEADERS },
  );
  const tenants = Array.isArray(listRes.data) ? listRes.data : [];
  const tenant = tenants[0];
  if (!tenant) throw new Error("Tenant not found");

  const currentConfig =
    typeof tenant.config === "object" && tenant.config !== null
      ? tenant.config
      : {};

  // Merge marketplace config
  const newConfig = {
    ...currentConfig,
    marketplace: {
      ...(currentConfig.marketplace || {}),
      ...configPatch,
    },
  };

  await update("tenants", { id: tenantId, config: newConfig });
  return newConfig;
}

(async () => {
  const now = new Date().toISOString();

  // ═══════════════════════════════════════════════════════════════
  // 1. UPDATE CATEGORIES
  // ═══════════════════════════════════════════════════════════════
  console.log("1. Updating categories...");

  await update("service_categories", {
    id: CAT_PLANOS,
    name: "Planos",
    slug: "planos",
    description: "Planos de assinatura da plataforma Radul",
    color: "#2563eb",
    icon: "rocket-outline",
    sort_order: 1,
  });

  await update("service_categories", {
    id: CAT_SERVICOS,
    name: "Serviços Profissionais",
    slug: "servicos",
    description: "Consultoria, implantação e treinamento",
    color: "#7c3aed",
    icon: "briefcase-outline",
    sort_order: 2,
  });

  await update("service_categories", {
    id: CAT_SOLUCOES,
    name: "Soluções",
    slug: "solucoes",
    description: "Pacotes e soluções completas",
    color: "#059669",
    icon: "layers-outline",
    sort_order: 3,
  });

  // Soft-delete unused categories
  await update("service_categories", { id: CAT_POS_VENDA, deleted_at: now });
  await update("service_categories", { id: CAT_ENTREGA, deleted_at: now });

  console.log("   ✓ Categories updated");

  // ═══════════════════════════════════════════════════════════════
  // 2. UPDATE PRODUCTS — PLANS
  // ═══════════════════════════════════════════════════════════════
  console.log("2. Updating plan products...");

  // Plano Grátis
  await update("services", {
    id: "ed86fafa-1b6e-422f-8db3-73c9d6339892",
    name: "Plano Grátis",
    description:
      "Ideal para começar. Até 20 clientes ativos e 3 usuários. Inclui CrudScreen, Workflow Engine, Kanban, Calendário e Notificações. Sem custo mensal — comece agora.",
    slug: "plano-gratis",
    item_kind: "service",
    sell_price: 0,
    online_price: 0,
    is_published: true,
    category_id: CAT_PLANOS,
    sort_order: 1,
    image_url:
      "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&h=400&fit=crop",
  });

  // Plano Starter
  await update("services", {
    id: "62e50cc7-63b0-43de-99d4-a93d9dfcb931",
    name: "Plano Starter",
    description:
      "Para pequenas empresas em crescimento. Até 100 clientes ativos, usuários ilimitados. Todos os módulos Core inclusos: Workflows, CRM, Financeiro e Portal do Cliente.",
    slug: "plano-starter",
    item_kind: "service",
    sell_price: 99,
    online_price: 99,
    is_published: true,
    category_id: CAT_PLANOS,
    sort_order: 2,
    image_url:
      "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&h=400&fit=crop",
  });

  // Plano Growth
  await update("services", {
    id: "a4663339-9dd6-494a-b5d5-d41bba9249cd",
    name: "Plano Growth",
    description:
      "Para empresas prontas para escalar. Até 500 clientes ativos, usuários ilimitados. Financeiro, CRM, Parceiros, Documentos avançados, IA e BI — todos os módulos inclusos.",
    slug: "plano-growth",
    item_kind: "service",
    sell_price: 249,
    online_price: 249,
    is_published: true,
    category_id: CAT_PLANOS,
    sort_order: 3,
    image_url:
      "https://images.unsplash.com/photo-1553877522-43269d4ea984?w=600&h=400&fit=crop",
  });

  // Plano Scale
  await update("services", {
    id: "bde9f2c2-dd87-4391-b1f5-dbbd631c5350",
    name: "Plano Scale",
    description:
      "Para operações robustas. Até 2.000 clientes ativos, usuários ilimitados. Todos os módulos, suporte prioritário e acesso antecipado a novas features. A plataforma completa.",
    slug: "plano-scale",
    item_kind: "service",
    sell_price: 499,
    online_price: 499,
    is_published: true,
    category_id: CAT_PLANOS,
    sort_order: 4,
    image_url:
      "https://images.unsplash.com/photo-1551434678-e076c223a692?w=600&h=400&fit=crop",
  });

  console.log("   ✓ Plans published");

  // ═══════════════════════════════════════════════════════════════
  // 3. UPDATE PRODUCTS — PROFESSIONAL SERVICES
  // ═══════════════════════════════════════════════════════════════
  console.log("3. Updating professional services...");

  // Consultoria de Implantação
  await update("services", {
    id: "de6fe0b8-b427-400b-8661-b499b6cfea13",
    name: "Consultoria de Implantação",
    description:
      "Sessão de consultoria 1-a-1 com especialista Radul. Análise do seu negócio, configuração personalizada da plataforma, criação de workflows e treinamento inicial. Duração: 2h.",
    slug: "consultoria-implantacao",
    item_kind: "service",
    sell_price: 497,
    online_price: 397,
    is_published: true,
    category_id: CAT_SERVICOS,
    sort_order: 10,
    duration_minutes: 120,
    image_url:
      "https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&h=400&fit=crop",
  });

  // Onboarding Assistido
  await update("services", {
    id: "45bc0090-12ed-4266-8419-1ca3d4a52c57",
    name: "Onboarding Assistido",
    description:
      "Configuração completa da sua conta: cadastro de clientes, serviços, workflows e permissões. Nosso time configura tudo para você começar a operar imediatamente.",
    slug: "onboarding-assistido",
    item_kind: "service",
    sell_price: 697,
    online_price: 597,
    is_published: true,
    category_id: CAT_SERVICOS,
    sort_order: 11,
    image_url:
      "https://images.unsplash.com/photo-1531482615713-2afd69097998?w=600&h=400&fit=crop",
  });

  // Migração de Dados
  await update("services", {
    id: "f5cde649-fb0b-4bb9-8fa4-a4ffb3c874fc",
    name: "Migração de Dados",
    description:
      "Importação completa dos seus dados do sistema anterior para a plataforma Radul. Inclui mapeamento de campos, limpeza de dados e validação pós-migração.",
    slug: "migracao-dados",
    item_kind: "service",
    sell_price: 1497,
    online_price: 997,
    is_published: true,
    category_id: CAT_SERVICOS,
    sort_order: 12,
    image_url:
      "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=600&h=400&fit=crop",
  });

  // Treinamento da Equipe
  await update("services", {
    id: "4bdd253e-39dc-47f2-bbe9-3a7ff09453b4",
    name: "Treinamento da Equipe",
    description:
      "Treinamento remoto para toda a sua equipe. Cobre operação diária, workflows, kanban, financeiro, CRM e boas práticas. Sessão de 1h30 com gravação inclusa.",
    slug: "treinamento-equipe",
    item_kind: "service",
    sell_price: 497,
    online_price: 397,
    is_published: true,
    category_id: CAT_SERVICOS,
    sort_order: 13,
    duration_minutes: 90,
    image_url:
      "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=600&h=400&fit=crop",
  });

  console.log("   ✓ Professional services published");

  // ═══════════════════════════════════════════════════════════════
  // 4. SOFT-DELETE UNUSED PRODUCTS
  // ═══════════════════════════════════════════════════════════════
  console.log("4. Cleaning up unused products...");

  // Entrega Expressa & Entrega Padrão — not relevant for SaaS store
  await update("services", {
    id: "12460902-768c-43ab-b883-9da794733032",
    deleted_at: now,
  });
  await update("services", {
    id: "8e9820b3-f19f-4d5d-81be-e604d39b60f6",
    deleted_at: now,
  });

  console.log("   ✓ Unused products soft-deleted");

  // ═══════════════════════════════════════════════════════════════
  // 5. UPDATE TENANT MARKETPLACE CONFIG (banner + about)
  // ═══════════════════════════════════════════════════════════════
  console.log("5. Updating marketplace config (banner + about)...");

  await updateTenantConfig(TENANT_ID, {
    enabled: true,
    banner_url:
      "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1400&h=400&fit=crop&q=80",
    about_text:
      "A Radul é a plataforma de operações que sua empresa precisa para funcionar — sem precisar de alguém para te ensinar a usar. Workflows, CRM, Financeiro, Portal do Cliente, IA e muito mais. Tudo em um só lugar, configurável para qualquer tipo de negócio.",
  });

  console.log("   ✓ Banner and about text configured");

  // ═══════════════════════════════════════════════════════════════
  // DONE
  // ═══════════════════════════════════════════════════════════════
  console.log("\n════════════════════════════════════");
  console.log("  ✅ Radul Store Published!");
  console.log("  URL: /loja/radul");
  console.log("  Products: 8 (4 plans + 4 services)");
  console.log("  Categories: 3 (Planos, Serviços, Soluções)");
  console.log("════════════════════════════════════");
})().catch((err) => {
  console.error("❌ Error:", err.response?.data || err.message);
  process.exit(1);
});
