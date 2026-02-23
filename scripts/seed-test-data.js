/**
 * SEED: Services, Partners & Test Customer
 *
 * Creates:
 * 1. 6 services (one per service_type)
 * 2. 2 partner users + partner records + availability
 *    - Dra. Ana Clara Oliveira (Advogada) → Jurídicos: Regularização, Escritura, Inventário, Divórcio, Holding
 *    - Eng. Carlos Eduardo Santos (Engenheiro) → Técnicos: Georreferenciamento + overlap: Regularização, Escritura
 * 3. 1 test customer (user + customer record) for client flow testing
 * 4. user_tenants entries for all new users
 *
 * Overlap: Both Ana and Carlos do Regularização de Imóveis and Escritura Pública
 */

const axios = require("axios");
const API = "https://n8n.sosescritura.com.br/webhook/api_dinamico";

// ─── Constants ────────────────────────────────────────────────────
const TENANT_ID = "0999d528-0114-4399-a582-41d4ea96801f"; // SOS Escritura
const ADMIN_USER = "073f2e72-d046-4ec3-9488-bfbd554c61b4"; // Raul Camilotti
const CLIENT_ROLE_ID = "0a7e29ed-5959-4f04-ba97-ab96fdee2b98"; // client role for SOS
const ADMIN_ROLE_ID = "989d8d55-7134-4b05-8fa7-6510892abd7c"; // admin role for SOS

// Service Types
const ST = {
  REGULARIZACAO: "a4c6d12e-df8c-424d-aae3-e7f63313f641",
  ESCRITURA: "1342590e-44ab-453f-8fb7-0e6f7cb2e103",
  INVENTARIO: "9e1c4542-0000-4299-aaa7-485085edbf76",
  DIVORCIO: "5f033e95-97c8-421e-848e-a3642617faf2",
  HOLDING: "0d9e48ff-854b-4e51-abfa-747eb1546c5d",
  GEORREFERENCIAMENTO: "877659ca-34fe-49a7-bf16-61eaa6750a70",
};

// Workflow Templates (for service_orders)
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
  REGULARIZACAO: "1a392da0-c719-4a17-b499-117d62562079", // Qualificação do cliente
  ESCRITURA: "f83e08b8-4eeb-46ae-b49c-1e96c11eeba5", // Início / Triagem
  INVENTARIO: "2d3d0efa-fda5-432f-a553-a247f8d89f3c", // Início / Triagem
  DIVORCIO: "ecc0f6b8-385f-46ff-8035-78505946ce89", // Início / Triagem
  HOLDING: "99af95d9-80fb-441c-b2f5-184c4ab19458", // Inicio / Triagem
  GEORREFERENCIAMENTO: "40ae7a42-c723-461d-ace0-97279ffbe9b3", // Início / Triagem
};

async function execSQL(label, sql) {
  try {
    const r = await axios.post(API, { sql });
    const data = r.data;
    // Handle different response shapes
    if (Array.isArray(data) && data.length > 0) {
      console.log(`✓ ${label}:`, JSON.stringify(data[0]));
      return data;
    }
    if (data && typeof data === "object" && data.message) {
      console.log(`✓ ${label}: ${data.message}`);
      return data;
    }
    console.log(`✓ ${label}:`, JSON.stringify(data));
    return data;
  } catch (e) {
    const msg = e.response?.data || e.message;
    console.error(`✗ ${label}:`, JSON.stringify(msg));
    throw new Error(`Failed: ${label}`);
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  SEED: Services, Partners & Test Customer");
  console.log("═══════════════════════════════════════════════\n");

  // ══════════════════════════════════════════════════════════════
  // 1. CREATE USERS
  // ══════════════════════════════════════════════════════════════
  console.log("── Step 1: Create Users ──\n");

  // Partner 1: Dra. Ana Clara Oliveira
  const anaUser = await execSQL(
    "Create user: Ana",
    `
    INSERT INTO users (id, fullname, email, phone, role, password_hash, is_active, created_at, updated_at)
    VALUES (gen_random_uuid(), 'Dra. Ana Clara Oliveira', 'ana.oliveira@teste.com', '41999001001', 'client', '12345', true, NOW(), NOW())
    RETURNING id, fullname, email
  `,
  );
  const ANA_USER_ID = anaUser[0].id;

  // Partner 2: Eng. Carlos Eduardo Santos
  const carlosUser = await execSQL(
    "Create user: Carlos",
    `
    INSERT INTO users (id, fullname, email, phone, role, password_hash, is_active, created_at, updated_at)
    VALUES (gen_random_uuid(), 'Eng. Carlos Eduardo Santos', 'carlos.santos@teste.com', '41999002002', 'client', '12345', true, NOW(), NOW())
    RETURNING id, fullname, email
  `,
  );
  const CARLOS_USER_ID = carlosUser[0].id;

  // Test customer: Maria da Silva
  const mariaUser = await execSQL(
    "Create user: Maria (test client)",
    `
    INSERT INTO users (id, fullname, email, phone, role, password_hash, is_active, created_at, updated_at)
    VALUES (gen_random_uuid(), 'Maria da Silva Teste', 'maria.teste@teste.com', '41999003003', 'client', '12345', true, NOW(), NOW())
    RETURNING id, fullname, email
  `,
  );
  const MARIA_USER_ID = mariaUser[0].id;

  console.log(`\n  Ana user_id:    ${ANA_USER_ID}`);
  console.log(`  Carlos user_id: ${CARLOS_USER_ID}`);
  console.log(`  Maria user_id:  ${MARIA_USER_ID}\n`);

  // ══════════════════════════════════════════════════════════════
  // 2. CREATE USER_TENANTS (link users to SOS Escritura tenant)
  // ══════════════════════════════════════════════════════════════
  console.log("── Step 2: Link Users to Tenant ──\n");

  await execSQL(
    "user_tenant: Ana → SOS",
    `
    INSERT INTO user_tenants (id, user_id, tenant_id, role_id, is_active, created_at)
    VALUES (gen_random_uuid(), '${ANA_USER_ID}', '${TENANT_ID}', '${CLIENT_ROLE_ID}', true, NOW())
    RETURNING id
  `,
  );
  await execSQL(
    "user_tenant: Carlos → SOS",
    `
    INSERT INTO user_tenants (id, user_id, tenant_id, role_id, is_active, created_at)
    VALUES (gen_random_uuid(), '${CARLOS_USER_ID}', '${TENANT_ID}', '${CLIENT_ROLE_ID}', true, NOW())
    RETURNING id
  `,
  );
  await execSQL(
    "user_tenant: Maria → SOS",
    `
    INSERT INTO user_tenants (id, user_id, tenant_id, role_id, is_active, created_at)
    VALUES (gen_random_uuid(), '${MARIA_USER_ID}', '${TENANT_ID}', '${CLIENT_ROLE_ID}', true, NOW())
    RETURNING id
  `,
  );

  // ══════════════════════════════════════════════════════════════
  // 3. CREATE PARTNER RECORDS
  // ══════════════════════════════════════════════════════════════
  console.log("\n── Step 3: Create Partners ──\n");

  const anaPartner = await execSQL(
    "Partner: Ana",
    `
    INSERT INTO partners (id, tenant_id, user_id, display_name, is_active, created_by, created_at, updated_at)
    VALUES (gen_random_uuid(), '${TENANT_ID}', '${ANA_USER_ID}', 'Dra. Ana Clara Oliveira — Advogada Imobiliária', true, '${ADMIN_USER}', NOW(), NOW())
    RETURNING id, display_name
  `,
  );
  const ANA_PARTNER_ID = anaPartner[0].id;

  const carlosPartner = await execSQL(
    "Partner: Carlos",
    `
    INSERT INTO partners (id, tenant_id, user_id, display_name, is_active, created_by, created_at, updated_at)
    VALUES (gen_random_uuid(), '${TENANT_ID}', '${CARLOS_USER_ID}', 'Eng. Carlos Eduardo Santos — Engenheiro Agrimensor', true, '${ADMIN_USER}', NOW(), NOW())
    RETURNING id, display_name
  `,
  );
  const CARLOS_PARTNER_ID = carlosPartner[0].id;

  console.log(`\n  Ana partner_id:    ${ANA_PARTNER_ID}`);
  console.log(`  Carlos partner_id: ${CARLOS_PARTNER_ID}\n`);

  // ══════════════════════════════════════════════════════════════
  // 4. CREATE PARTNER AVAILABILITY (Mon-Fri 08:00-18:00)
  // ══════════════════════════════════════════════════════════════
  console.log("── Step 4: Create Partner Availability ──\n");

  for (const pid of [
    { id: ANA_PARTNER_ID, name: "Ana" },
    { id: CARLOS_PARTNER_ID, name: "Carlos" },
  ]) {
    for (let weekday = 1; weekday <= 5; weekday++) {
      await execSQL(
        `Availability: ${pid.name} day ${weekday}`,
        `
        INSERT INTO partner_availability (id, tenant_id, partner_id, weekday, start_time, end_time, is_active, created_at, updated_at)
        VALUES (gen_random_uuid(), '${TENANT_ID}', '${pid.id}', ${weekday}, '08:00:00', '18:00:00', true, NOW(), NOW())
        RETURNING id
      `,
      );
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 5. CREATE SERVICES (one per service_type)
  // ══════════════════════════════════════════════════════════════
  console.log("\n── Step 5: Create Services ──\n");

  const servicesData = [
    {
      key: "REGULARIZACAO",
      name: "Regularização Completa de Imóvel",
      stId: ST.REGULARIZACAO,
    },
    {
      key: "ESCRITURA",
      name: "Escritura de Compra e Venda de Imóvel",
      stId: ST.ESCRITURA,
    },
    {
      key: "INVENTARIO",
      name: "Inventário Extrajudicial Completo",
      stId: ST.INVENTARIO,
    },
    {
      key: "DIVORCIO",
      name: "Divórcio Consensual com Partilha de Bens",
      stId: ST.DIVORCIO,
    },
    {
      key: "HOLDING",
      name: "Constituição de Holding Familiar",
      stId: ST.HOLDING,
    },
    {
      key: "GEORREFERENCIAMENTO",
      name: "Georreferenciamento de Imóvel Rural",
      stId: ST.GEORREFERENCIAMENTO,
    },
  ];

  const serviceIds = {};
  for (const svc of servicesData) {
    const res = await execSQL(
      `Service: ${svc.name}`,
      `
      INSERT INTO services (id, tenant_id, name, service_type_id, is_active, created_at, config)
      VALUES (gen_random_uuid(), '${TENANT_ID}', '${svc.name}', '${svc.stId}', true, NOW(), '{}')
      RETURNING id, name
    `,
    );
    serviceIds[svc.key] = res[0].id;
  }

  console.log("\n  Service IDs:", JSON.stringify(serviceIds, null, 2));

  // ══════════════════════════════════════════════════════════════
  // 6. CREATE TEST CUSTOMER (linked to Maria user)
  // ══════════════════════════════════════════════════════════════
  console.log("\n── Step 6: Create Test Customer ──\n");

  const mariaCust = await execSQL(
    "Customer: Maria",
    `
    INSERT INTO customers (id, name, email, phone, cpf, user_id, tenant_id, created_at, updated_at)
    VALUES (gen_random_uuid(), 'Maria da Silva Teste', 'maria.teste@teste.com', '41999003003', '12345678901', '${MARIA_USER_ID}', '${TENANT_ID}', NOW(), NOW())
    RETURNING id, name
  `,
  );
  const MARIA_CUSTOMER_ID = mariaCust[0].id;

  // Also create a second customer (without user) for more test data
  const joaoCust = await execSQL(
    "Customer: João (no user)",
    `
    INSERT INTO customers (id, name, email, phone, cpf, tenant_id, created_at, updated_at)
    VALUES (gen_random_uuid(), 'João Pereira dos Santos', 'joao.pereira@teste.com', '41999004004', '98765432100', '${TENANT_ID}', NOW(), NOW())
    RETURNING id, name
  `,
  );
  const JOAO_CUSTOMER_ID = joaoCust[0].id;

  // ══════════════════════════════════════════════════════════════
  // 7. CREATE SAMPLE SERVICE_ORDERS (different types, stages)
  //    This gives the Kanban something to show for different types
  // ══════════════════════════════════════════════════════════════
  console.log("\n── Step 7: Create Sample Service Orders ──\n");

  const orders = [
    // Maria → Regularização de Imóveis (step 1: Qualificação)
    {
      customer: MARIA_CUSTOMER_ID,
      serviceType: "REGULARIZACAO",
      title: "Regularização - Rua das Flores, 123 - Curitiba/PR",
      description:
        "Regularização de imóvel residencial sem escritura. Cliente possui contrato de gaveta.",
    },
    // Maria → Escritura Pública (step 1: Início/Triagem)
    {
      customer: MARIA_CUSTOMER_ID,
      serviceType: "ESCRITURA",
      title: "Escritura - Apartamento 502, Ed. Solar, Curitiba/PR",
      description:
        "Escritura de compra e venda. Imóvel financiado quitado recentemente.",
    },
    // João → Inventário (step 1: Início/Triagem)
    {
      customer: JOAO_CUSTOMER_ID,
      serviceType: "INVENTARIO",
      title: "Inventário - Espólio de José Pereira",
      description:
        "Inventário extrajudicial com 3 herdeiros. Bens: 1 imóvel urbano + conta bancária.",
    },
    // João → Georreferenciamento (step 1: Início/Triagem)
    {
      customer: JOAO_CUSTOMER_ID,
      serviceType: "GEORREFERENCIAMENTO",
      title: "Georreferenciamento - Fazenda Boa Vista, Campo Largo/PR",
      description:
        "Georreferenciamento de imóvel rural de 50 hectares para certificação INCRA.",
    },
    // Maria → Divórcio (step 1: Início/Triagem)
    {
      customer: MARIA_CUSTOMER_ID,
      serviceType: "DIVORCIO",
      title: "Divórcio Consensual - Maria da Silva e Pedro Oliveira",
      description: "Divórcio consensual com partilha de um imóvel e veículo.",
    },
    // João → Holding (step 1: Inicio/Triagem)
    {
      customer: JOAO_CUSTOMER_ID,
      serviceType: "HOLDING",
      title: "Holding Familiar - Família Pereira",
      description:
        "Constituição de holding familiar para planejamento sucessório. 4 imóveis.",
    },
  ];

  const orderIds = [];
  for (const o of orders) {
    const res = await execSQL(
      `Order: ${o.title.substring(0, 50)}...`,
      `
      INSERT INTO service_orders (
        id, tenant_id, customer_id, service_type_id, service_id,
        template_id, current_step_id, process_status,
        title, description, created_by, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        '${TENANT_ID}',
        '${o.customer}',
        '${ST[o.serviceType]}',
        '${serviceIds[o.serviceType]}',
        '${WT[o.serviceType]}',
        '${FIRST_STEPS[o.serviceType]}',
        'active',
        '${o.title.replace(/'/g, "''")}',
        '${o.description.replace(/'/g, "''")}',
        '${ADMIN_USER}',
        NOW(),
        NOW()
      )
      RETURNING id, title
    `,
    );
    orderIds.push({ id: res[0].id, title: o.title, type: o.serviceType });
  }

  // ══════════════════════════════════════════════════════════════
  // 8. CREATE SAMPLE APPOINTMENTS (linking services ↔ partners)
  //    Shows which partners serve which services
  // ══════════════════════════════════════════════════════════════
  console.log("\n── Step 8: Create Sample Appointments ──\n");

  // Ana handles: Regularização, Escritura, Inventário, Divórcio, Holding
  // Carlos handles: Georreferenciamento, Regularização, Escritura (competes with Ana on last 2)

  const appointments = [
    // Ana → Regularização (Maria's order)
    { ordIdx: 0, partnerId: ANA_PARTNER_ID, partnerName: "Ana" },
    // Ana → Escritura (Maria's order)
    { ordIdx: 1, partnerId: ANA_PARTNER_ID, partnerName: "Ana" },
    // Ana → Inventário (João's order)
    { ordIdx: 2, partnerId: ANA_PARTNER_ID, partnerName: "Ana" },
    // Carlos → Georreferenciamento (João's order)
    { ordIdx: 3, partnerId: CARLOS_PARTNER_ID, partnerName: "Carlos" },
    // Ana → Divórcio (Maria's order)
    { ordIdx: 4, partnerId: ANA_PARTNER_ID, partnerName: "Ana" },
    // Carlos → Holding (João's order) — Carlos also handles some jurídicos
    { ordIdx: 5, partnerId: CARLOS_PARTNER_ID, partnerName: "Carlos" },
  ];

  // Create scheduled appointments for the future
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + 3); // start 3 days from now

  for (let i = 0; i < appointments.length; i++) {
    const appt = appointments[i];
    const order = orderIds[appt.ordIdx];

    const startDate = new Date(baseDate);
    startDate.setDate(startDate.getDate() + i);
    startDate.setHours(9 + (i % 4), 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setHours(startDate.getHours() + 2);

    const customerId = orders[appt.ordIdx].customer;

    const apptRes = await execSQL(
      `Appointment: ${appt.partnerName} → ${order.type}`,
      `
      INSERT INTO service_appointments (
        id, tenant_id, service_id, partner_id, customer_id,
        scheduled_start, scheduled_end, status, notes,
        created_by, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        '${TENANT_ID}',
        '${serviceIds[order.type]}',
        '${appt.partnerId}',
        '${customerId}',
        '${startDate.toISOString()}',
        '${endDate.toISOString()}',
        'scheduled',
        'Agendamento automático (seed data)',
        '${ADMIN_USER}',
        NOW(),
        NOW()
      )
      RETURNING id
    `,
    );

    // Link appointment to the service order
    const apptId = apptRes[0].id;
    await execSQL(
      `Link order → appointment`,
      `
      UPDATE service_orders SET appointment_id = '${apptId}', updated_at = NOW()
      WHERE id = '${order.id}'
    `,
    );
  }

  // ══════════════════════════════════════════════════════════════
  // 9. CREATE PARTNER RATING SUMMARIES
  // ══════════════════════════════════════════════════════════════
  console.log("\n── Step 9: Create Partner Ratings ──\n");

  await execSQL(
    "Rating: Ana",
    `
    INSERT INTO partner_rating_summary (id, tenant_id, partner_id, avg_rating, total_reviews, updated_at)
    VALUES (gen_random_uuid(), '${TENANT_ID}', '${ANA_PARTNER_ID}', 4.8, 23, NOW())
    RETURNING id
  `,
  );
  await execSQL(
    "Rating: Carlos",
    `
    INSERT INTO partner_rating_summary (id, tenant_id, partner_id, avg_rating, total_reviews, updated_at)
    VALUES (gen_random_uuid(), '${TENANT_ID}', '${CARLOS_PARTNER_ID}', 4.6, 15, NOW())
    RETURNING id
  `,
  );

  // ══════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════
  console.log("\n═══════════════════════════════════════════════");
  console.log("  SEED COMPLETE! Summary:");
  console.log("═══════════════════════════════════════════════\n");
  console.log("  USERS CREATED:");
  console.log(
    `    Dra. Ana Clara Oliveira    → ${ANA_USER_ID} (password: 12345)`,
  );
  console.log(
    `    Eng. Carlos Eduardo Santos → ${CARLOS_USER_ID} (password: 12345)`,
  );
  console.log(
    `    Maria da Silva Teste       → ${MARIA_USER_ID} (password: 12345)`,
  );
  console.log("");
  console.log("  PARTNERS:");
  console.log(`    Ana (Advogada Imobiliária)    → ${ANA_PARTNER_ID}`);
  console.log(`    Carlos (Engenheiro Agrimensor) → ${CARLOS_PARTNER_ID}`);
  console.log("");
  console.log("  SERVICES (6):");
  for (const [key, id] of Object.entries(serviceIds)) {
    console.log(`    ${key}: ${id}`);
  }
  console.log("");
  console.log("  CUSTOMERS:");
  console.log(`    Maria da Silva Teste        → ${MARIA_CUSTOMER_ID}`);
  console.log(`    João Pereira dos Santos     → ${JOAO_CUSTOMER_ID}`);
  console.log("");
  console.log("  SERVICE ORDERS (6):");
  for (const o of orderIds) {
    console.log(`    [${o.type}] ${o.title.substring(0, 60)}`);
  }
  console.log("");
  console.log("  PARTNER SPECIALIZATIONS:");
  console.log(
    "    Ana:    Regularização, Escritura, Inventário, Divórcio, Holding",
  );
  console.log(
    "    Carlos: Georreferenciamento, Holding (+ compete: Regularização, Escritura)",
  );
  console.log("");
  console.log("  LOGIN FOR TESTING:");
  console.log("    Client: maria.teste@teste.com / 12345");
  console.log("    Partner1: ana.oliveira@teste.com / 12345");
  console.log("    Partner2: carlos.santos@teste.com / 12345");
  console.log("═══════════════════════════════════════════════\n");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\n✗ SEED FAILED:", e.message);
    process.exit(1);
  });
