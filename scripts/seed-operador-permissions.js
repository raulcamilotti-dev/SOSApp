/**
 * Script para:
 * 1. Criar as novas permissões no banco (se não existirem)
 * 2. Atribuir permissões ao role "Operador" (cliente + operador)
 * 3. Atribuir permissões ao role "client" (cliente)
 *
 * Uso: node scripts/seed-operador-permissions.js
 */
const axios = require("axios");

const E = "https://n8n.sosescritura.com.br/webhook/api_crud";
const ED = "https://n8n.sosescritura.com.br/webhook/api_dinamico";
const DEMO_TENANT = "ab32913b-33d2-411d-af3d-e8b945a744fa";

const norm = (d) => {
  const b = d?.data || d?.value || d?.items || d;
  return Array.isArray(b) ? b : [];
};

// ─── Permissões que precisam existir ────────────────────────
const ALL_PERMISSIONS = [
  // Existentes
  {
    code: "admin.full",
    display_name: "Acesso Total - Admin",
    description: "Acesso total ao sistema",
  },
  {
    code: "customer.read",
    display_name: "Ler Clientes",
    description: "Visualizar clientes",
  },
  {
    code: "customer.write",
    display_name: "Escrever Clientes",
    description: "Criar/editar clientes",
  },
  {
    code: "customer.delete",
    display_name: "Deletar Clientes",
    description: "Excluir clientes",
  },
  {
    code: "document.read",
    display_name: "Ler Documentos",
    description: "Visualizar documentos",
  },
  {
    code: "document.write",
    display_name: "Escrever Documentos",
    description: "Criar/editar documentos",
  },
  {
    code: "document.delete",
    display_name: "Deletar Documentos",
    description: "Excluir documentos",
  },
  {
    code: "project.read",
    display_name: "Ler Projetos",
    description: "Visualizar projetos",
  },
  {
    code: "project.write",
    display_name: "Escrever Projetos",
    description: "Criar/editar projetos",
  },
  {
    code: "project.delete",
    display_name: "Deletar Projetos",
    description: "Excluir projetos",
  },
  {
    code: "task.read",
    display_name: "Ler Tarefas",
    description: "Visualizar tarefas",
  },
  {
    code: "task.write",
    display_name: "Escrever Tarefas",
    description: "Criar/editar tarefas",
  },
  {
    code: "task.delete",
    display_name: "Deletar Tarefas",
    description: "Excluir tarefas",
  },
  {
    code: "automation.run",
    display_name: "Executar Automações",
    description: "Executar automações",
  },
  {
    code: "automation.manage",
    display_name: "Gerenciar Automações",
    description: "Gerenciar automações",
  },
  {
    code: "agent.manage",
    display_name: "Gerenciar Agentes",
    description: "Gerenciar agents",
  },
  {
    code: "workflow.read",
    display_name: "Ler Workflows",
    description: "Visualizar workflows",
  },
  {
    code: "workflow.write",
    display_name: "Escrever Workflows",
    description: "Criar/editar workflows",
  },
  {
    code: "user.read",
    display_name: "Ler Usuários",
    description: "Visualizar usuários",
  },
  {
    code: "user.write",
    display_name: "Escrever Usuários",
    description: "Criar/editar usuários",
  },
  {
    code: "user.delete",
    display_name: "Deletar Usuários",
    description: "Excluir usuários",
  },
  {
    code: "user.manage",
    display_name: "Gerenciar Usuários",
    description: "Gerenciar usuários",
  },
  {
    code: "role.manage",
    display_name: "Gerenciar Roles",
    description: "Gerenciar roles",
  },
  {
    code: "permission.manage",
    display_name: "Gerenciar Permissões",
    description: "Gerenciar permissões",
  },
  {
    code: "tenant.manage",
    display_name: "Gerenciar Tenants",
    description: "Gerenciar tenants",
  },
  {
    code: "signature.request",
    display_name: "Solicitar Assinatura",
    description: "Solicitar assinatura de documentos",
  },
  {
    code: "ocr.analyze",
    display_name: "Analisar Documento (OCR)",
    description: "Solicitar análise OCR de documentos",
  },
  {
    code: "protocol.compile",
    display_name: "Compilar Protocolo",
    description: "Compilar protocolo a partir de documentos",
  },
  // Novas permissões de cliente
  {
    code: "service.read",
    display_name: "Ver Serviços",
    description: "Visualizar serviços disponíveis",
  },
  {
    code: "service.request",
    display_name: "Solicitar Serviço",
    description: "Solicitar serviços",
  },
  {
    code: "appointment.read",
    display_name: "Ver Agendamentos",
    description: "Visualizar agendamentos",
  },
  {
    code: "appointment.write",
    display_name: "Gerenciar Agendamentos",
    description: "Criar/cancelar/reagendar agendamentos",
  },
  {
    code: "property.read",
    display_name: "Ver Imóveis",
    description: "Visualizar imóveis",
  },
  {
    code: "property.write",
    display_name: "Gerenciar Imóveis",
    description: "Cadastrar/editar imóveis",
  },
  {
    code: "company.read",
    display_name: "Ver Empresas",
    description: "Visualizar empresas",
  },
  {
    code: "company.write",
    display_name: "Gerenciar Empresas",
    description: "Criar/editar empresas",
  },
  {
    code: "review.write",
    display_name: "Avaliar Serviços",
    description: "Avaliar serviços",
  },
  {
    code: "calendar.sync",
    display_name: "Sincronizar Calendário",
    description: "Sincronizar agenda com calendários externos",
  },
  {
    code: "process_update.read",
    display_name: "Ver Atualizações de Processos",
    description: "Visualizar atualizações de processos",
  },
  {
    code: "process_update.write",
    display_name: "Enviar Atualizações de Processos",
    description: "Enviar documentos/atualizações em processos",
  },
];

// ─── Mapeamento de permissões por role ──────────────────────
const CLIENT_PERMISSIONS = [
  "customer.read",
  "document.read",
  "project.read",
  "task.read",
  "service.read",
  "service.request",
  "appointment.read",
  "appointment.write",
  "property.read",
  "property.write",
  "company.read",
  "company.write",
  "review.write",
  "calendar.sync",
  "process_update.read",
  "process_update.write",
];

const OPERADOR_PERMISSIONS = [
  // Todas as de cliente
  ...CLIENT_PERMISSIONS,
  // Adicionais de operador
  "customer.write",
  "document.write",
  "project.write",
  "task.write",
  "workflow.read",
  "automation.run",
  "signature.request",
  "ocr.analyze",
  "protocol.compile",
  "user.read",
];

async function main() {
  console.log("🔧 Configurando permissões para demo tenant...\n");

  // 1. Buscar permissões existentes no banco
  const permRes = await axios.post(E, { action: "list", table: "permissions" });
  const existingPerms = norm(permRes.data);
  const existingCodes = new Set(existingPerms.map((p) => p.code));

  console.log(`📋 Permissões existentes no banco: ${existingPerms.length}`);

  // 2. Criar permissões que não existem
  const toCreate = ALL_PERMISSIONS.filter((p) => !existingCodes.has(p.code));
  if (toCreate.length > 0) {
    console.log(`➕ Criando ${toCreate.length} novas permissões...`);
    for (const perm of toCreate) {
      try {
        await axios.post(E, {
          action: "create",
          table: "permissions",
          payload: perm,
        });
        console.log(`   ✅ ${perm.code} — ${perm.display_name}`);
      } catch (err) {
        console.error(`   ❌ ${perm.code}: ${err.message}`);
      }
    }
  } else {
    console.log("✅ Todas as permissões já existem.");
  }

  // 3. Recarregar permissões (com IDs das novas)
  const permRes2 = await axios.post(E, {
    action: "list",
    table: "permissions",
  });
  const allPerms = norm(permRes2.data);
  const permIdByCode = {};
  allPerms.forEach((p) => {
    permIdByCode[p.code] = p.id;
  });

  console.log(`\n📋 Total de permissões agora: ${allPerms.length}`);

  // 4. Buscar roles do tenant demo
  const rolesRes = await axios.post(E, {
    action: "list",
    table: "roles",
    search_field1: "tenant_id",
    search_value1: DEMO_TENANT,
    search_operator1: "equal",
  });
  const roles = norm(rolesRes.data);
  const roleMap = {};
  roles.forEach((r) => {
    roleMap[r.name.toLowerCase()] = r.id;
  });

  console.log(
    "\n📋 Roles encontrados:",
    roles.map((r) => `${r.name} (${r.id})`).join(", "),
  );

  const operadorRoleId = roleMap["operador"];
  const clientRoleId = roleMap["client"];
  const adminRoleId = roleMap["admin"];

  if (!operadorRoleId) {
    console.error("❌ Role 'Operador' não encontrado no demo tenant!");
    process.exit(1);
  }
  if (!clientRoleId) {
    console.error("❌ Role 'client' não encontrado no demo tenant!");
    process.exit(1);
  }

  // 5. Buscar role_permissions existentes
  const rpRes = await axios.post(E, {
    action: "list",
    table: "role_permissions",
  });
  const existingRps = norm(rpRes.data);
  const rpSet = new Set(
    existingRps.map((rp) => `${rp.role_id}|${rp.permission_id}`),
  );

  // 6. Função para atribuir permissões a um role
  async function assignPermissions(roleName, roleId, permCodes) {
    console.log(
      `\n🔐 Atribuindo ${permCodes.length} permissões ao role "${roleName}" (${roleId})...`,
    );
    let created = 0;
    let skipped = 0;

    for (const code of permCodes) {
      const permId = permIdByCode[code];
      if (!permId) {
        console.error(`   ⚠️  Permissão "${code}" não encontrada no banco!`);
        continue;
      }

      const key = `${roleId}|${permId}`;
      if (rpSet.has(key)) {
        skipped++;
        continue;
      }

      try {
        await axios.post(E, {
          action: "create",
          table: "role_permissions",
          payload: {
            role_id: roleId,
            permission_id: permId,
          },
        });
        rpSet.add(key);
        created++;
        console.log(`   ✅ ${code}`);
      } catch (err) {
        console.error(`   ❌ ${code}: ${err.message}`);
      }
    }

    console.log(`   → ${created} criados, ${skipped} já existiam`);
  }

  // 7. Atribuir permissões de ADMIN (todas)
  if (adminRoleId) {
    const adminCodes = ALL_PERMISSIONS.map((p) => p.code);
    await assignPermissions("admin", adminRoleId, adminCodes);
  }

  // 8. Atribuir permissões de CLIENT
  await assignPermissions("client", clientRoleId, CLIENT_PERMISSIONS);

  // 9. Atribuir permissões de OPERADOR
  await assignPermissions("Operador", operadorRoleId, OPERADOR_PERMISSIONS);

  console.log("\n✅ Configuração concluída!");
  console.log("\nResumo:");
  console.log(
    `  Admin: ${adminRoleId ? "todas as permissões" : "não encontrado"}`,
  );
  console.log(`  Client: ${CLIENT_PERMISSIONS.length} permissões`);
  console.log(
    `  Operador: ${OPERADOR_PERMISSIONS.length} permissões (${CLIENT_PERMISSIONS.length} de cliente + ${OPERADOR_PERMISSIONS.length - CLIENT_PERMISSIONS.length} de operador)`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Erro fatal:", e.message);
    process.exit(1);
  });
