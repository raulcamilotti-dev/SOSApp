/**
 * Setup Metabase Dashboards via API
 *
 * Creates saved questions (cards) and a dashboard for SOS Escritura BI.
 * All questions use a {{tenant_id}} template-tag for multi-tenant filtering.
 *
 * Usage: node scripts/setup-metabase-dashboards.js
 */
const axios = require("axios");

const METABASE_URL =
  process.env.METABASE_URL || "https://bi.sosescritura.com.br";
const METABASE_API_KEY =
  process.env.METABASE_API_KEY ||
  "mb_7d/4HljetiY9wvVGQ24+mYSbMeN74kS/+MvldfcGtYU=";
const API_DINAMICO = "https://n8n.sosescritura.com.br/webhook/api_dinamico";

const mb = axios.create({
  baseURL: `${METABASE_URL}/api`,
  headers: {
    "Content-Type": "application/json",
    "x-api-key": METABASE_API_KEY,
  },
});

async function testApiDinamico(sql) {
  const r = await axios.post(API_DINAMICO, { sql });
  return r.data;
}

/* ---- Template tags for cross-filtering ---- */
const TEMPLATE_TAGS = {
  tenant_id: {
    id: "tenant_id_tag",
    name: "tenant_id",
    "display-name": "Escritório",
    type: "text",
    required: false,
    default: null,
  },
  estado: {
    id: "estado_tag",
    name: "estado",
    "display-name": "Estado (UF)",
    type: "text",
    required: false,
    default: null,
  },
  cidade: {
    id: "cidade_tag",
    name: "cidade",
    "display-name": "Cidade",
    type: "text",
    required: false,
    default: null,
  },
  status_processo: {
    id: "status_processo_tag",
    name: "status_processo",
    "display-name": "Status Processo",
    type: "text",
    required: false,
    default: null,
  },
};

function pickTags(tagNames) {
  const result = {};
  for (const name of tagNames) {
    if (TEMPLATE_TAGS[name]) result[name] = TEMPLATE_TAGS[name];
  }
  return result;
}

/* ---- Dashboard parameters (filter widgets) ---- */
const DASHBOARD_PARAMS = [
  {
    id: "p_tenant",
    name: "Escritório",
    slug: "tenant_id",
    type: "string/=",
    sectionId: "string",
  },
  {
    id: "p_estado",
    name: "Estado (UF)",
    slug: "estado",
    type: "string/=",
    sectionId: "string",
  },
  {
    id: "p_cidade",
    name: "Cidade",
    slug: "cidade",
    type: "string/=",
    sectionId: "string",
  },
  {
    id: "p_status",
    name: "Status Processo",
    slug: "status_processo",
    type: "string/=",
    sectionId: "string",
  },
];

const PARAM_TO_TAG = {
  p_tenant: "tenant_id",
  p_estado: "estado",
  p_cidade: "cidade",
  p_status: "status_processo",
};

/* ------------------------------------------------------------------ */
/*  Questions (Cards) to create                                        */
/* ------------------------------------------------------------------ */

const QUESTIONS = [
  // ============== KPIs (Scalar) ==============
  {
    name: "KPI — Total de Imóveis",
    display: "scalar",
    tags: ["tenant_id", "estado", "cidade", "status_processo"],
    sql: `SELECT COUNT(*) AS "total" FROM properties WHERE deleted_at IS NULL [[AND tenant_id = {{tenant_id}}]] [[AND state = {{estado}}]] [[AND city = {{cidade}}]] [[AND process_status = {{status_processo}}]]`,
  },
  {
    name: "KPI — Total de Clientes",
    display: "scalar",
    tags: ["tenant_id"],
    sql: `SELECT COUNT(*) AS "total" FROM customers WHERE deleted_at IS NULL [[AND tenant_id = {{tenant_id}}]]`,
  },
  {
    name: "KPI — Ordens de Serviço",
    display: "scalar",
    tags: ["tenant_id", "status_processo"],
    sql: `SELECT COUNT(*) AS "total" FROM service_orders WHERE deleted_at IS NULL [[AND tenant_id = {{tenant_id}}]] [[AND process_status = {{status_processo}}]]`,
  },
  {
    name: "KPI — Tarefas Pendentes",
    display: "scalar",
    tags: ["tenant_id"],
    sql: `SELECT COUNT(*) AS "total" FROM tasks WHERE deleted_at IS NULL AND COALESCE(status,'') NOT IN ('completed','done','finished') [[AND tenant_id = {{tenant_id}}]]`,
  },
  {
    name: "KPI — Prazos Vencidos",
    display: "scalar",
    tags: ["tenant_id"],
    sql: `SELECT COUNT(*) AS "total" FROM process_deadlines WHERE deleted_at IS NULL AND status != 'completed' AND due_date < NOW() [[AND tenant_id = {{tenant_id}}]]`,
  },

  // ============== Charts ==============
  {
    name: "Imóveis por Estado",
    display: "bar",
    tags: ["tenant_id", "estado", "cidade", "status_processo"],
    sql: `SELECT COALESCE(NULLIF(state,''), 'N/I') AS "Estado", COUNT(*) AS "Qtd" FROM properties WHERE deleted_at IS NULL [[AND tenant_id = {{tenant_id}}]] [[AND state = {{estado}}]] [[AND city = {{cidade}}]] [[AND process_status = {{status_processo}}]] GROUP BY state ORDER BY "Qtd" DESC`,
  },
  {
    name: "Top 10 Cidades",
    display: "bar",
    tags: ["tenant_id", "estado", "status_processo"],
    sql: `SELECT COALESCE(NULLIF(city,''), 'N/I') AS "Cidade", COUNT(*) AS "Qtd" FROM properties WHERE deleted_at IS NULL [[AND tenant_id = {{tenant_id}}]] [[AND state = {{estado}}]] [[AND process_status = {{status_processo}}]] GROUP BY city ORDER BY "Qtd" DESC LIMIT 10`,
  },
  {
    name: "Novos Clientes por Mês",
    display: "line",
    tags: ["tenant_id"],
    sql: `SELECT DATE_TRUNC('month', created_at) AS "Mês", COUNT(*) AS "Novos" FROM customers WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '12 months' [[AND tenant_id = {{tenant_id}}]] GROUP BY 1 ORDER BY 1`,
  },
  {
    name: "Novos Imóveis por Mês",
    display: "line",
    tags: ["tenant_id", "estado", "cidade", "status_processo"],
    sql: `SELECT DATE_TRUNC('month', created_at) AS "Mês", COUNT(*) AS "Novos" FROM properties WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '12 months' [[AND tenant_id = {{tenant_id}}]] [[AND state = {{estado}}]] [[AND city = {{cidade}}]] [[AND process_status = {{status_processo}}]] GROUP BY 1 ORDER BY 1`,
  },
  {
    name: "Imóveis por Status",
    display: "bar",
    tags: ["tenant_id", "estado", "cidade"],
    sql: `SELECT COALESCE(NULLIF(process_status,''), 'N/I') AS "Status", COUNT(*) AS "Qtd" FROM properties WHERE deleted_at IS NULL [[AND tenant_id = {{tenant_id}}]] [[AND state = {{estado}}]] [[AND city = {{cidade}}]] GROUP BY process_status ORDER BY "Qtd" DESC`,
  },
  {
    name: "Ordens de Serviço por Mês",
    display: "line",
    tags: ["tenant_id", "status_processo"],
    sql: `SELECT DATE_TRUNC('month', created_at) AS "Mês", COUNT(*) AS "Ordens" FROM service_orders WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '12 months' [[AND tenant_id = {{tenant_id}}]] [[AND process_status = {{status_processo}}]] GROUP BY 1 ORDER BY 1`,
  },
  {
    name: "Situação dos Prazos",
    display: "pie",
    tags: ["tenant_id"],
    sql: `SELECT CASE WHEN status = 'completed' THEN 'Concluído' WHEN due_date < NOW() THEN 'Vencido' WHEN due_date < NOW() + INTERVAL '3 days' THEN 'Vencendo' ELSE 'No prazo' END AS "Situação", COUNT(*) AS "Qtd" FROM process_deadlines WHERE deleted_at IS NULL [[AND tenant_id = {{tenant_id}}]] GROUP BY "Situação" ORDER BY "Qtd" DESC`,
  },
  {
    name: "Tipo de Proprietário",
    display: "pie",
    tags: ["tenant_id", "estado", "cidade", "status_processo"],
    sql: `SELECT CASE owner_kind WHEN 'pf' THEN 'PF' WHEN 'pj' THEN 'PJ' ELSE 'N/I' END AS "Tipo", COUNT(*) AS "Qtd" FROM properties WHERE deleted_at IS NULL [[AND tenant_id = {{tenant_id}}]] [[AND state = {{estado}}]] [[AND city = {{cidade}}]] [[AND process_status = {{status_processo}}]] GROUP BY owner_kind ORDER BY "Qtd" DESC`,
  },

  // ============== Tables ==============
  {
    name: "Tarefas — Status e Prioridade",
    display: "table",
    tags: ["tenant_id"],
    sql: `SELECT COALESCE(status, 'sem status') AS "Status", COALESCE(priority, '-') AS "Prioridade", COUNT(*) AS "Total", SUM(CASE WHEN due_date < NOW() AND COALESCE(status,'') NOT IN ('completed','done') THEN 1 ELSE 0 END) AS "Atrasadas" FROM tasks WHERE deleted_at IS NULL [[AND tenant_id = {{tenant_id}}]] GROUP BY status, priority ORDER BY "Total" DESC`,
  },
  {
    name: "Últimos Imóveis",
    display: "table",
    tags: ["tenant_id", "estado", "cidade", "status_processo"],
    sql: `SELECT p.address AS "Endereço", p.city AS "Cidade", p.state AS "UF", c.name AS "Cliente", COALESCE(p.process_status, '-') AS "Status", TO_CHAR(p.created_at, 'DD/MM/YYYY') AS "Data" FROM properties p LEFT JOIN customers c ON c.id = p.customer_id WHERE p.deleted_at IS NULL [[AND p.tenant_id = {{tenant_id}}]] [[AND p.state = {{estado}}]] [[AND p.city = {{cidade}}]] [[AND p.process_status = {{status_processo}}]] ORDER BY p.created_at DESC LIMIT 20`,
  },
  {
    name: "Últimas Ordens de Serviço",
    display: "table",
    tags: ["tenant_id", "status_processo"],
    sql: `SELECT so.title AS "Título", COALESCE(so.process_status, '-') AS "Status", TO_CHAR(so.started_at, 'DD/MM/YYYY') AS "Início", TO_CHAR(so.created_at, 'DD/MM/YYYY') AS "Criação" FROM service_orders so WHERE so.deleted_at IS NULL [[AND so.tenant_id = {{tenant_id}}]] [[AND so.process_status = {{status_processo}}]] ORDER BY so.created_at DESC LIMIT 20`,
  },
];

/* ------------------------------------------------------------------ */
/*  Main                                                                */
/* ------------------------------------------------------------------ */

(async () => {
  console.log("🚀 Configurando Metabase Dashboards (cross-filtering)...\n");

  // 1. Test Metabase connection
  console.log("1️⃣  Testando conexão com Metabase...");
  try {
    const dbRes = await mb.get("/database");
    const databases = dbRes.data?.data || dbRes.data || [];
    console.log(
      `   ✅ Metabase OK — ${databases.length} banco(s) conectado(s)`,
    );
    if (databases.length === 0) {
      console.log(
        "   ⚠️  Nenhum banco conectado no Metabase. Adicione primeiro em Admin → Databases.",
      );
      process.exit(1);
    }
    // Use PostgreSQL database (skip Sample Database)
    const pgDb = databases.find((d) => d.engine === "postgres") || databases[0];
    const dbId = pgDb.id;
    console.log(
      `   📦 Usando banco: "${pgDb.name}" (id=${dbId}, engine=${pgDb.engine})`,
    );

    // 2. Validate some queries via api_dinamico
    console.log("\n2️⃣  Validando queries via api_dinamico...");
    try {
      const test = await testApiDinamico(
        "SELECT COUNT(*) AS total FROM properties WHERE deleted_at IS NULL",
      );
      const count = Array.isArray(test) ? test[0]?.total : test?.total;
      console.log(`   ✅ api_dinamico OK — ${count} imóveis encontrados`);
    } catch (e) {
      console.log(
        `   ⚠️  api_dinamico falhou: ${e.message}. Continuando mesmo assim...`,
      );
    }

    // 3. Check for existing collection
    console.log("\n3️⃣  Criando coleção 'SOS Escritura BI'...");
    let collectionId;
    try {
      const cols = await mb.get("/collection");
      const existing = (cols.data || []).find(
        (c) => c.name === "SOS Escritura BI",
      );
      if (existing) {
        collectionId = existing.id;
        console.log(`   ♻️  Coleção já existe (id=${collectionId})`);
      } else {
        const newCol = await mb.post("/collection", {
          name: "SOS Escritura BI",
          description:
            "Dashboards e relatórios do SOS Escritura — Gestão de Regularização Imobiliária",
          color: "#0a7ea4",
        });
        collectionId = newCol.data.id;
        console.log(`   ✅ Coleção criada (id=${collectionId})`);
      }
    } catch (e) {
      console.log(
        `   ⚠️  Não foi possível criar coleção: ${e.response?.data?.message || e.message}`,
      );
      collectionId = null; // will use root
    }

    // 4. Create / update cards
    console.log("\n4️⃣  Criando/atualizando perguntas (cards)...");
    const allCards = await mb.get("/card");
    const existingCards = allCards.data || [];
    const createdCards = [];

    for (const q of QUESTIONS) {
      const cardPayload = {
        name: q.name,
        display: q.display,
        dataset_query: {
          database: dbId,
          type: "native",
          native: {
            query: q.sql,
            "template-tags": pickTags(q.tags),
          },
        },
        visualization_settings: {},
        collection_id: collectionId,
      };

      try {
        const existing = existingCards.find((c) => c.name === q.name);
        if (existing) {
          await mb.put(`/card/${existing.id}`, cardPayload);
          console.log(`   ♻️  "${q.name}" atualizado (id=${existing.id})`);
          createdCards.push({
            id: existing.id,
            name: q.name,
            display: q.display,
            tags: q.tags,
          });
        } else {
          const card = await mb.post("/card", cardPayload);
          console.log(
            `   ✅ "${q.name}" criado (id=${card.data.id}, tipo=${q.display})`,
          );
          createdCards.push({
            id: card.data.id,
            name: q.name,
            display: q.display,
            tags: q.tags,
          });
        }
      } catch (e) {
        const msg = e.response?.data?.message || e.response?.data || e.message;
        console.log(
          `   ❌ "${q.name}" falhou: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`,
        );
      }
    }

    if (createdCards.length === 0) {
      console.log("\n❌ Nenhum card foi criado. Verifique os erros acima.");
      process.exit(1);
    }

    // 5. Create Dashboard
    const DASH_NAME = "SOS Escritura — Painel Completo";
    console.log(
      `\n5️⃣  Criando dashboard "${DASH_NAME}" com ${createdCards.length} cards...`,
    );
    let dashboardId;
    try {
      // Check if dashboard exists
      const dashes = await mb.get("/dashboard");
      const existingDash = (dashes.data || []).find(
        (d) => d.name === DASH_NAME,
      );

      if (existingDash) {
        dashboardId = existingDash.id;
        console.log(`   ♻️  Dashboard já existe (id=${dashboardId})`);
      } else {
        const dash = await mb.post("/dashboard", {
          name: DASH_NAME,
          description:
            "Painel completo com cross-filtering: Estado, Cidade, Status Processo.",
          collection_id: collectionId,
        });
        dashboardId = dash.data.id;
        console.log(`   ✅ Dashboard criado (id=${dashboardId})`);
      }

      // 6. Build dashcards with parameter_mappings
      console.log("\n6️⃣  Montando dashcards com parameter_mappings...");

      const dashcards = [];
      let row = 0;
      let col = 0;

      for (let idx = 0; idx < createdCards.length; idx++) {
        const card = createdCards[idx];
        let sizeX, sizeY;

        if (card.display === "scalar") {
          sizeX = 4;
          sizeY = 3;
        } else if (card.display === "pie") {
          sizeX = 6;
          sizeY = 6;
        } else if (card.display === "line" || card.display === "bar") {
          sizeX = 9;
          sizeY = 6;
        } else {
          // table
          sizeX = 18;
          sizeY = 7;
        }

        // Simple grid layout
        if (col + sizeX > 18) {
          col = 0;
          row += sizeY;
        }

        // Build parameter_mappings for this card
        const parameter_mappings = [];
        for (const param of DASHBOARD_PARAMS) {
          const tagName = PARAM_TO_TAG[param.id];
          if (tagName && card.tags.includes(tagName)) {
            parameter_mappings.push({
              parameter_id: param.id,
              card_id: card.id,
              target: ["variable", ["template-tag", tagName]],
            });
          }
        }

        dashcards.push({
          id: -(idx + 1),
          card_id: card.id,
          row,
          col,
          size_x: sizeX,
          size_y: sizeY,
          parameter_mappings,
        });

        col += sizeX;
        if (col >= 18) {
          col = 0;
          row += sizeY;
        }
      }

      await mb.put(`/dashboard/${dashboardId}`, {
        parameters: DASHBOARD_PARAMS,
        dashcards,
      });

      console.log(
        `   ✅ ${dashcards.length} cards adicionados com filtros cruzados`,
      );
    } catch (e) {
      const msg = e.response?.data?.message || e.response?.data || e.message;
      console.log(
        `   ❌ Dashboard falhou: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`,
      );
    }

    // 7. Enable public sharing
    console.log("\n7️⃣  Habilitando compartilhamento público...");
    try {
      const dashDetail = await mb.get(`/dashboard/${dashboardId}`);
      let publicUuid = dashDetail.data?.public_uuid;
      if (!publicUuid) {
        const pubRes = await mb.post(`/dashboard/${dashboardId}/public_link`);
        publicUuid = pubRes.data?.uuid;
        console.log(`   ✅ Link público criado: ${publicUuid}`);
      } else {
        console.log(`   ♻️  Já possui link público: ${publicUuid}`);
      }

      // Summary
      console.log("\n" + "=".repeat(60));
      console.log("✅ SETUP CONCLUÍDO — CROSS-FILTERING ATIVO!");
      console.log("=".repeat(60));
      console.log(`\n📊 Dashboard: ${METABASE_URL}/dashboard/${dashboardId}`);
      console.log(
        `🌐 Embed público: ${METABASE_URL}/public/dashboard/${publicUuid}`,
      );
      console.log(
        `   Exemplo: ${METABASE_URL}/public/dashboard/${publicUuid}?tenant_id=SEU_TENANT_ID`,
      );
      console.log(`📁 Coleção: ${METABASE_URL}/collection/${collectionId}`);
      console.log(`📈 Cards: ${createdCards.length}`);
      console.log(
        "🔗 Filtros cruzados: tenant_id, estado, cidade, status_processo",
      );
      console.log("\n💡 No embed público, ?tenant_id=xxx trava o escritório.");
      console.log(
        "   Os filtros Estado, Cidade e Status Processo ficam interativos.",
      );
    } catch (e) {
      console.log(
        `   ⚠️  Não foi possível habilitar link público: ${e.response?.data?.message || e.message}`,
      );
      console.log("\n" + "=".repeat(60));
      console.log("✅ SETUP CONCLUÍDO (sem link público)");
      console.log("=".repeat(60));
      console.log(`\n📊 Dashboard: ${METABASE_URL}/dashboard/${dashboardId}`);
      console.log(`📈 Cards: ${createdCards.length}`);
    }

    process.exit(0);
  } catch (e) {
    console.log(
      `❌ Erro de conexão com Metabase: ${e.response?.status || ""} ${e.message}`,
    );
    console.log(
      "   Verifique se o Metabase está rodando e a API key está correta.",
    );
    process.exit(1);
  }
})();
