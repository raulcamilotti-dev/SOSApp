/**
 * CLEANUP: Remove partial seed data from SOS Escritura (real tenant)
 * Then: Create a new demo tenant with full seed data
 *
 * DEMO TENANT: "Escritório Modelo Ltda."
 *
 * Creates:
 * - 1 demo tenant + roles (admin, client)
 * - Raul linked as admin to the new tenant
 * - 3 users (reuse Ana, Carlos, Maria from previous run) + user_tenants
 * - 2 partners (Ana=Advogada, Carlos=Engenheiro) with availability
 * - 6 services (one per service_type)
 * - 2 customers (Maria linked to user, João standalone)
 * - 6 service_orders (different types, all at step 1)
 * - 6 appointments (partners assigned to orders)
 * - 2 partner rating summaries
 */

const axios = require("axios");
const API = "https://n8n.sosescritura.com.br/webhook/api_dinamico";

// ─── Existing IDs ────────────────────────────────────────────
const REAL_TENANT = "0999d528-0114-4399-a582-41d4ea96801f";
const RAUL_USER = "073f2e72-d046-4ec3-9488-bfbd554c61b4";

// Users created in previous partial run
const ANA_USER_ID = "ea0c4011-28dc-4fc5-b07b-8d43a4dca5a6";
const CARLOS_USER_ID = "ad53827e-f012-4c28-8786-c9f39fbaf962";
const MARIA_USER_ID = "85c7d69b-2aef-46bb-ab89-3ffccca6f909";

// Service Types (global, no tenant)
const ST = {
  REGULARIZACAO: "a4c6d12e-df8c-424d-aae3-e7f63313f641",
  ESCRITURA: "1342590e-44ab-453f-8fb7-0e6f7cb2e103",
  INVENTARIO: "9e1c4542-0000-4299-aaa7-485085edbf76",
  DIVORCIO: "5f033e95-97c8-421e-848e-a3642617faf2",
  HOLDING: "0d9e48ff-854b-4e51-abfa-747eb1546c5d",
  GEORREFERENCIAMENTO: "877659ca-34fe-49a7-bf16-61eaa6750a70",
};

// Workflow Templates (global)
const WT = {
  REGULARIZACAO: "87c6ee9c-444c-4c8b-ab60-7ce70ba7ff61",
  ESCRITURA: "5c28cd25-2216-4ab0-b43c-3a8354c0926d",
  INVENTARIO: "9fdf65d3-bc34-48c4-8f97-eb770bf5344b",
  DIVORCIO: "600f10e3-f3fd-4819-bd61-1b6a3c6ede19",
  HOLDING: "0e3f0c09-8c23-4642-8f8b-a01036a5800d",
  GEORREFERENCIAMENTO: "5c660793-323e-4cfe-a914-c65deee71b1e",
};

// First steps (step_order=1) per workflow template
const FIRST_STEPS = {
  REGULARIZACAO: "1a392da0-c719-4a17-b499-117d62562079",
  ESCRITURA: "f83e08b8-4eeb-46ae-b49c-1e96c11eeba5",
  INVENTARIO: "2d3d0efa-fda5-432f-a553-a247f8d89f3c",
  DIVORCIO: "ecc0f6b8-385f-46ff-8035-78505946ce89",
  HOLDING: "99af95d9-80fb-441c-b2f5-184c4ab19458",
  GEORREFERENCIAMENTO: "40ae7a42-c723-461d-ace0-97279ffbe9b3",
};

// Second steps (step_order=2) per workflow template — for variety
const SECOND_STEPS = {
  REGULARIZACAO: "ddea7f7c-1cfc-43be-a828-a6cd68d6f1e1", // Contato (WhatsApp / Email)
  ESCRITURA: "3ed81759-a108-4189-9982-c7aa8935dd16", // Análise e Atuação
  INVENTARIO: "1ddd4bc0-0ffe-4b6f-a9d9-8d23464c7343", // Análise e Atuação
  DIVORCIO: "f24e1e23-6ee2-4334-9fab-09d62df7109e", // Análise e Atuação
  HOLDING: "94bc7159-ecf3-4984-a1a0-f6c775ed500c", // Analise e Atuação
  GEORREFERENCIAMENTO: "46a0f730-4867-4723-839f-5b3b961b4ef7", // Análise e Atuação
};

async function execSQL(label, sql) {
  try {
    const r = await axios.post(API, { sql });
    const data = r.data;
    if (Array.isArray(data) && data.length > 0) {
      console.log(`  ✓ ${label}`);
      return data;
    }
    console.log(`  ✓ ${label}`);
    return data;
  } catch (e) {
    const msg = JSON.stringify(e.response?.data || e.message).substring(0, 200);
    console.error(`  ✗ ${label}: ${msg}`);
    return null; // Don't throw, continue
  }
}

async function execSQLStrict(label, sql) {
  try {
    const r = await axios.post(API, { sql });
    const data = r.data;
    if (Array.isArray(data) && data.length > 0) {
      console.log(`  ✓ ${label}`);
      return data;
    }
    console.log(`  ✓ ${label}`);
    return data;
  } catch (e) {
    const msg = JSON.stringify(e.response?.data || e.message).substring(0, 200);
    console.error(`  ✗ ${label}: ${msg}`);
    throw new Error(`Failed: ${label}`);
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  SEED: Demo Tenant + Full Test Data");
  console.log("═══════════════════════════════════════════════════════\n");

  // ══════════════════════════════════════════════════════════════
  // PHASE 0: Clean up previous partial seed from real tenant
  // ══════════════════════════════════════════════════════════════
  console.log("── Phase 0: Clean up partial data from SOS Escritura ──\n");

  // Remove partner_availability for partners created in previous run
  await execSQL(
    "Remove old availability (Ana)",
    `
    DELETE FROM partner_availability WHERE partner_id = '4b4b1650-61d3-4d73-8f0a-fd9723c5f6d7'
  `,
  );
  await execSQL(
    "Remove old availability (Carlos)",
    `
    DELETE FROM partner_availability WHERE partner_id = 'a9c5e72c-7cfb-452c-a1a2-2fbd17a26d19'
  `,
  );

  // Remove partner records from real tenant
  await execSQL(
    "Remove old partner (Ana)",
    `
    DELETE FROM partners WHERE id = '4b4b1650-61d3-4d73-8f0a-fd9723c5f6d7'
  `,
  );
  await execSQL(
    "Remove old partner (Carlos)",
    `
    DELETE FROM partners WHERE id = 'a9c5e72c-7cfb-452c-a1a2-2fbd17a26d19'
  `,
  );

  // Remove services created in previous run from real tenant
  const oldServiceIds = [
    "46d0d6ec-fc9c-46eb-aa90-2a12d207d512",
    "48495df9-0407-4731-af8f-ea2b91c98af2",
    "fadf2392-8815-4d2e-820b-63306e803122",
    "14324854-8ef0-4046-a40e-a2b34d1077af",
    "7a5833a0-f40f-4264-ad64-241f9b4f2d83",
    "51908cd7-d4c5-42af-8e92-82fee5043d57",
  ];
  for (const sid of oldServiceIds) {
    await execSQL(
      `Remove old service ${sid.substring(0, 8)}`,
      `DELETE FROM services WHERE id = '${sid}'`,
    );
  }

  // Remove user_tenants linking test users to real tenant
  await execSQL(
    "Remove user_tenant: Ana → SOS",
    `
    DELETE FROM user_tenants WHERE user_id = '${ANA_USER_ID}' AND tenant_id = '${REAL_TENANT}'
  `,
  );
  await execSQL(
    "Remove user_tenant: Carlos → SOS",
    `
    DELETE FROM user_tenants WHERE user_id = '${CARLOS_USER_ID}' AND tenant_id = '${REAL_TENANT}'
  `,
  );
  await execSQL(
    "Remove user_tenant: Maria → SOS",
    `
    DELETE FROM user_tenants WHERE user_id = '${MARIA_USER_ID}' AND tenant_id = '${REAL_TENANT}'
  `,
  );

  console.log("\n  ✅ Cleanup complete\n");

  // ══════════════════════════════════════════════════════════════
  // PHASE 1: Create Demo Tenant
  // ══════════════════════════════════════════════════════════════
  console.log("── Phase 1: Create Demo Tenant ──\n");

  const tenantRes = await execSQLStrict(
    "Create tenant: Escritório Modelo",
    `
    INSERT INTO tenants (id, company_name, whatsapp_number, plan, status, config, created_at)
    VALUES (
      gen_random_uuid(),
      'Escritório Modelo Ltda.',
      '+5541900000000',
      'Proprietário',
      'active',
      '{"brand":{"name":"Escritório Modelo","primary_color":"#2563EB"},"calendar":true,"specialty":"imobiliario","agent_name":"Sofia","agent_type":"juridico","show_price":true,"allow_payment":true,"knowledge_base_id":"escritorio_modelo"}'::jsonb,
      NOW()
    )
    RETURNING id, company_name
  `,
  );
  const DEMO_TENANT = tenantRes[0].id;
  console.log(`\n  🏢 Demo Tenant ID: ${DEMO_TENANT}\n`);

  // ══════════════════════════════════════════════════════════════
  // PHASE 2: Create Roles for Demo Tenant
  // ══════════════════════════════════════════════════════════════
  console.log("── Phase 2: Create Roles ──\n");

  const adminRoleRes = await execSQLStrict(
    "Role: admin",
    `
    INSERT INTO roles (id, tenant_id, name, created_at)
    VALUES (gen_random_uuid(), '${DEMO_TENANT}', 'admin', NOW())
    RETURNING id, name
  `,
  );
  const DEMO_ADMIN_ROLE = adminRoleRes[0].id;

  const clientRoleRes = await execSQLStrict(
    "Role: client",
    `
    INSERT INTO roles (id, tenant_id, name, created_at)
    VALUES (gen_random_uuid(), '${DEMO_TENANT}', 'client', NOW())
    RETURNING id, name
  `,
  );
  const DEMO_CLIENT_ROLE = clientRoleRes[0].id;

  console.log(`  Admin role: ${DEMO_ADMIN_ROLE}`);
  console.log(`  Client role: ${DEMO_CLIENT_ROLE}\n`);

  // ══════════════════════════════════════════════════════════════
  // PHASE 3: Link Users to Demo Tenant
  // ══════════════════════════════════════════════════════════════
  console.log("── Phase 3: Link Users to Demo Tenant ──\n");

  // Raul as admin
  await execSQLStrict(
    "user_tenant: Raul → Demo (admin)",
    `
    INSERT INTO user_tenants (id, user_id, tenant_id, role_id, is_active, created_at)
    VALUES (gen_random_uuid(), '${RAUL_USER}', '${DEMO_TENANT}', '${DEMO_ADMIN_ROLE}', true, NOW())
    RETURNING id
  `,
  );

  // Ana, Carlos, Maria as clients
  await execSQLStrict(
    "user_tenant: Ana → Demo",
    `
    INSERT INTO user_tenants (id, user_id, tenant_id, role_id, is_active, created_at)
    VALUES (gen_random_uuid(), '${ANA_USER_ID}', '${DEMO_TENANT}', '${DEMO_CLIENT_ROLE}', true, NOW())
    RETURNING id
  `,
  );
  await execSQLStrict(
    "user_tenant: Carlos → Demo",
    `
    INSERT INTO user_tenants (id, user_id, tenant_id, role_id, is_active, created_at)
    VALUES (gen_random_uuid(), '${CARLOS_USER_ID}', '${DEMO_TENANT}', '${DEMO_CLIENT_ROLE}', true, NOW())
    RETURNING id
  `,
  );
  await execSQLStrict(
    "user_tenant: Maria → Demo",
    `
    INSERT INTO user_tenants (id, user_id, tenant_id, role_id, is_active, created_at)
    VALUES (gen_random_uuid(), '${MARIA_USER_ID}', '${DEMO_TENANT}', '${DEMO_CLIENT_ROLE}', true, NOW())
    RETURNING id
  `,
  );

  // ══════════════════════════════════════════════════════════════
  // PHASE 4: Create Partners (under Demo tenant)
  // ══════════════════════════════════════════════════════════════
  console.log("\n── Phase 4: Create Partners ──\n");

  const anaP = await execSQLStrict(
    "Partner: Dra. Ana Clara",
    `
    INSERT INTO partners (id, tenant_id, user_id, display_name, is_active, created_by, created_at, updated_at)
    VALUES (gen_random_uuid(), '${DEMO_TENANT}', '${ANA_USER_ID}',
            'Dra. Ana Clara Oliveira — Advogada Imobiliária', true, '${RAUL_USER}', NOW(), NOW())
    RETURNING id, display_name
  `,
  );
  const ANA_PARTNER = anaP[0].id;

  const carlosP = await execSQLStrict(
    "Partner: Eng. Carlos Eduardo",
    `
    INSERT INTO partners (id, tenant_id, user_id, display_name, is_active, created_by, created_at, updated_at)
    VALUES (gen_random_uuid(), '${DEMO_TENANT}', '${CARLOS_USER_ID}',
            'Eng. Carlos Eduardo Santos — Engenheiro Agrimensor', true, '${RAUL_USER}', NOW(), NOW())
    RETURNING id, display_name
  `,
  );
  const CARLOS_PARTNER = carlosP[0].id;

  console.log(`  Ana partner:    ${ANA_PARTNER}`);
  console.log(`  Carlos partner: ${CARLOS_PARTNER}`);

  // ══════════════════════════════════════════════════════════════
  // PHASE 5: Partner Availability (Mon-Fri 08:00-18:00)
  // ══════════════════════════════════════════════════════════════
  console.log("\n── Phase 5: Partner Availability ──\n");

  for (const p of [
    { id: ANA_PARTNER, name: "Ana" },
    { id: CARLOS_PARTNER, name: "Carlos" },
  ]) {
    for (let day = 1; day <= 5; day++) {
      await execSQL(
        `${p.name} day ${day}`,
        `
        INSERT INTO partner_availability (id, tenant_id, partner_id, weekday, start_time, end_time, is_active, created_at, updated_at)
        VALUES (gen_random_uuid(), '${DEMO_TENANT}', '${p.id}', ${day}, '08:00:00', '18:00:00', true, NOW(), NOW())
      `,
      );
    }
  }

  // ══════════════════════════════════════════════════════════════
  // PHASE 6: Create Services (one per service_type)
  // ══════════════════════════════════════════════════════════════
  console.log("\n── Phase 6: Create Services ──\n");

  const servicesData = [
    { key: "REGULARIZACAO", name: "Regularização Completa de Imóvel" },
    { key: "ESCRITURA", name: "Escritura de Compra e Venda de Imóvel" },
    { key: "INVENTARIO", name: "Inventário Extrajudicial Completo" },
    { key: "DIVORCIO", name: "Divórcio Consensual com Partilha de Bens" },
    { key: "HOLDING", name: "Constituição de Holding Familiar" },
    { key: "GEORREFERENCIAMENTO", name: "Georreferenciamento de Imóvel Rural" },
  ];

  const svcIds = {};
  for (const s of servicesData) {
    const res = await execSQLStrict(
      `Service: ${s.name}`,
      `
      INSERT INTO services (id, tenant_id, name, service_type_id, is_active, created_at, config)
      VALUES (gen_random_uuid(), '${DEMO_TENANT}', '${s.name}', '${ST[s.key]}', true, NOW(), '{}')
      RETURNING id
    `,
    );
    svcIds[s.key] = res[0].id;
  }

  // ══════════════════════════════════════════════════════════════
  // PHASE 7: Create Customers
  // ══════════════════════════════════════════════════════════════
  console.log("\n── Phase 7: Create Customers ──\n");

  const mariaCust = await execSQLStrict(
    "Customer: Maria da Silva Teste",
    `
    INSERT INTO customers (id, name, email, phone, cpf, user_id, tenant_id, created_at, updated_at)
    VALUES (gen_random_uuid(), 'Maria da Silva Teste', 'maria.teste@teste.com', '41999003003',
            '529.143.780-65', '${MARIA_USER_ID}', '${DEMO_TENANT}', NOW(), NOW())
    RETURNING id
  `,
  );
  const MARIA_CUST = mariaCust[0].id;

  const joaoCust = await execSQLStrict(
    "Customer: João Pereira dos Santos",
    `
    INSERT INTO customers (id, name, email, phone, cpf, tenant_id, created_at, updated_at)
    VALUES (gen_random_uuid(), 'João Pereira dos Santos', 'joao.pereira@teste.com', '41999004004',
            '837.492.615-00', '${DEMO_TENANT}', NOW(), NOW())
    RETURNING id
  `,
  );
  const JOAO_CUST = joaoCust[0].id;

  // Additional customer for volume
  const lucianaCust = await execSQLStrict(
    "Customer: Luciana Ferreira",
    `
    INSERT INTO customers (id, name, email, phone, cpf, tenant_id, created_at, updated_at)
    VALUES (gen_random_uuid(), 'Luciana Ferreira de Souza', 'luciana.ferreira@teste.com', '41999005005',
            '416.589.230-71', '${DEMO_TENANT}', NOW(), NOW())
    RETURNING id
  `,
  );
  const LUCIANA_CUST = lucianaCust[0].id;

  console.log(`  Maria:   ${MARIA_CUST}`);
  console.log(`  João:    ${JOAO_CUST}`);
  console.log(`  Luciana: ${LUCIANA_CUST}`);

  // ══════════════════════════════════════════════════════════════
  // PHASE 8: Create Service Orders
  //   Mix of types, customers, and stages for realistic kanban
  // ══════════════════════════════════════════════════════════════
  console.log("\n── Phase 8: Create Service Orders ──\n");

  const orders = [
    // ── Maria's orders ──
    {
      cust: MARIA_CUST,
      type: "REGULARIZACAO",
      step: "FIRST",
      title: "Regularização - Rua das Flores, 123 - Curitiba/PR",
      desc: "Imóvel residencial sem escritura. Cliente possui contrato de gaveta há 15 anos.",
    },
    {
      cust: MARIA_CUST,
      type: "ESCRITURA",
      step: "SECOND",
      title: "Escritura - Apto 502, Ed. Solar - Curitiba/PR",
      desc: "Escritura de compra e venda. Imóvel financiado quitado recentemente.",
    },
    {
      cust: MARIA_CUST,
      type: "DIVORCIO",
      step: "FIRST",
      title: "Divórcio Consensual - Maria e Pedro Oliveira",
      desc: "Divórcio consensual com partilha de 1 imóvel e 1 veículo.",
    },

    // ── João's orders ──
    {
      cust: JOAO_CUST,
      type: "INVENTARIO",
      step: "FIRST",
      title: "Inventário - Espólio de José Pereira",
      desc: "Inventário extrajudicial com 3 herdeiros. 1 imóvel urbano + conta bancária.",
    },
    {
      cust: JOAO_CUST,
      type: "GEORREFERENCIAMENTO",
      step: "SECOND",
      title: "Georreferenciamento - Fazenda Boa Vista, Campo Largo/PR",
      desc: "Imóvel rural de 50ha para certificação INCRA.",
    },
    {
      cust: JOAO_CUST,
      type: "HOLDING",
      step: "FIRST",
      title: "Holding Familiar - Família Pereira",
      desc: "Constituição de holding familiar para planejamento sucessório. 4 imóveis.",
    },

    // ── Luciana's orders (more volume for overlap testing) ──
    {
      cust: LUCIANA_CUST,
      type: "REGULARIZACAO",
      step: "SECOND",
      title:
        "Regularização - Rua XV de Novembro, 890 - São José dos Pinhais/PR",
      desc: "Imóvel comercial. Proprietário falecido, herdeiros com posse.",
    },
    {
      cust: LUCIANA_CUST,
      type: "ESCRITURA",
      step: "FIRST",
      title: "Escritura - Casa, Rua Santos Dumont - Pinhais/PR",
      desc: "Escritura de doação. Pais transferindo para filha.",
    },
  ];

  const orderIds = [];
  for (const o of orders) {
    const stepId =
      o.step === "FIRST" ? FIRST_STEPS[o.type] : SECOND_STEPS[o.type];
    const res = await execSQLStrict(
      `Order: ${o.type} (${o.step})`,
      `
      INSERT INTO service_orders (
        id, tenant_id, customer_id, service_type_id, service_id,
        template_id, current_step_id, process_status,
        title, description, created_by, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), '${DEMO_TENANT}', '${o.cust}',
        '${ST[o.type]}', '${svcIds[o.type]}',
        '${WT[o.type]}', '${stepId}', 'active',
        '${o.title.replace(/'/g, "''")}',
        '${o.desc.replace(/'/g, "''")}',
        '${RAUL_USER}', NOW(), NOW()
      )
      RETURNING id, title
    `,
    );
    orderIds.push({ id: res[0].id, ...o });
  }

  // ══════════════════════════════════════════════════════════════
  // PHASE 9: Create Appointments (link partners to orders)
  //
  // Partner specialization:
  //   Ana (Advogada):  Regularização ✓, Escritura ✓, Inventário ✓, Divórcio ✓, Holding ✗
  //   Carlos (Eng.):   Georreferenciamento ✓, Holding ✓, Regularização ✓, Escritura ✓
  //   Overlap: Regularização, Escritura (both compete)
  // ══════════════════════════════════════════════════════════════
  console.log("\n── Phase 9: Create Appointments ──\n");

  const partnerForOrder = [
    ANA_PARTNER, // [0] Maria→Regularização       (Ana)
    ANA_PARTNER, // [1] Maria→Escritura            (Ana)
    ANA_PARTNER, // [2] Maria→Divórcio             (Ana)
    ANA_PARTNER, // [3] João→Inventário            (Ana)
    CARLOS_PARTNER, // [4] João→Georreferenciamento   (Carlos)
    CARLOS_PARTNER, // [5] João→Holding               (Carlos)
    CARLOS_PARTNER, // [6] Luciana→Regularização      (Carlos — COMPETES with Ana)
    ANA_PARTNER, // [7] Luciana→Escritura           (Ana — Carlos also does this)
  ];

  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + 3);

  for (let i = 0; i < orderIds.length; i++) {
    const order = orderIds[i];
    const partnerId = partnerForOrder[i];

    const startDate = new Date(baseDate);
    startDate.setDate(startDate.getDate() + Math.floor(i / 2));
    startDate.setHours(9 + (i % 4) * 2, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setHours(startDate.getHours() + 2);

    const apptRes = await execSQLStrict(
      `Appt #${i}: ${order.type}`,
      `
      INSERT INTO service_appointments (
        id, tenant_id, service_id, partner_id, customer_id,
        scheduled_start, scheduled_end, status, notes,
        created_by, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), '${DEMO_TENANT}',
        '${svcIds[order.type]}', '${partnerId}', '${order.cust}',
        '${startDate.toISOString()}', '${endDate.toISOString()}',
        'scheduled', 'Agendamento de teste (seed)',
        '${RAUL_USER}', NOW(), NOW()
      )
      RETURNING id
    `,
    );

    await execSQL(
      `Link order → appt`,
      `
      UPDATE service_orders SET appointment_id = '${apptRes[0].id}', updated_at = NOW()
      WHERE id = '${order.id}'
    `,
    );
  }

  // ══════════════════════════════════════════════════════════════
  // PHASE 10: Partner Ratings
  // ══════════════════════════════════════════════════════════════
  console.log("\n── Phase 10: Partner Ratings ──\n");

  await execSQL(
    "Rating: Ana (4.8★, 23 reviews)",
    `
    INSERT INTO partner_rating_summary (id, tenant_id, partner_id, avg_rating, total_reviews, updated_at)
    VALUES (gen_random_uuid(), '${DEMO_TENANT}', '${ANA_PARTNER}', 4.8, 23, NOW())
  `,
  );
  await execSQL(
    "Rating: Carlos (4.6★, 15 reviews)",
    `
    INSERT INTO partner_rating_summary (id, tenant_id, partner_id, avg_rating, total_reviews, updated_at)
    VALUES (gen_random_uuid(), '${DEMO_TENANT}', '${CARLOS_PARTNER}', 4.6, 15, NOW())
  `,
  );

  // ══════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  ✅  SEED COMPLETE!");
  console.log("═══════════════════════════════════════════════════════\n");
  console.log(`  🏢 DEMO TENANT: Escritório Modelo Ltda.`);
  console.log(`     ID: ${DEMO_TENANT}\n`);
  console.log("  👥 USERS:");
  console.log(
    "     Raul Camilotti (admin)       → raulcamilotti@gmail.com / 12345",
  );
  console.log(
    "     Dra. Ana Clara Oliveira      → ana.oliveira@teste.com / 12345",
  );
  console.log(
    "     Eng. Carlos Eduardo Santos   → carlos.santos@teste.com / 12345",
  );
  console.log(
    "     Maria da Silva Teste (client)→ maria.teste@teste.com / 12345\n",
  );
  console.log("  🤝 PARTNERS:");
  console.log(`     Ana (Advogada)    [${ANA_PARTNER}]`);
  console.log("       → Regularização, Escritura, Inventário, Divórcio");
  console.log(`     Carlos (Engenheiro) [${CARLOS_PARTNER}]`);
  console.log(
    "       → Georreferenciamento, Holding, Regularização, Escritura",
  );
  console.log("     🔀 OVERLAP: Regularização e Escritura\n");
  console.log("  📋 SERVICES: 6 (one per service_type)");
  for (const [k, v] of Object.entries(svcIds)) {
    console.log(`     ${k}: ${v}`);
  }
  console.log(`\n  👤 CUSTOMERS: Maria, João, Luciana`);
  console.log(`  📑 SERVICE ORDERS: ${orderIds.length} (mixed stages)\n`);
  console.log("  LOGIN CREDENTIALS:");
  console.log("    Admin:    raulcamilotti@gmail.com / 12345");
  console.log("    Client:   maria.teste@teste.com / 12345");
  console.log("    Partner1: ana.oliveira@teste.com / 12345");
  console.log("    Partner2: carlos.santos@teste.com / 12345");
  console.log("═══════════════════════════════════════════════════════\n");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\n✗ SEED FAILED:", e.message);
    process.exit(1);
  });
