const axios = require("axios");

const ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";

async function listRows(table) {
  const response = await axios.post(ENDPOINT, {
    action: "list",
    table,
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return Array.isArray(list) ? list : [];
}

async function updateRow(table, payload) {
  return axios.post(ENDPOINT, {
    action: "update",
    table,
    payload,
  });
}

async function createRow(table, payload) {
  return axios.post(ENDPOINT, {
    action: "create",
    table,
    payload,
  });
}

function pickFirstStep(steps) {
  if (!steps.length) return null;
  const sorted = [...steps].sort((a, b) => {
    const aOrder = Number(a.step_order ?? 0);
    const bOrder = Number(b.step_order ?? 0);
    if (aOrder !== bOrder) return aOrder - bOrder;
    const aCreated = new Date(a.created_at ?? 0).getTime();
    const bCreated = new Date(b.created_at ?? 0).getTime();
    return aCreated - bCreated;
  });
  return sorted[0];
}

async function main() {
  const [tenants, steps, properties, automations] = await Promise.all([
    listRows("tenants"),
    listRows("workflow_steps"),
    listRows("properties"),
    listRows("automations"),
  ]);

  const tenantId =
    process.env.TENANT_ID || (tenants[0] && tenants[0].id) || null;
  if (!tenantId) {
    throw new Error("Tenant nao encontrado. Informe TENANT_ID no ambiente.");
  }

  const firstStep = pickFirstStep(steps.filter((step) => !step.deleted_at));
  if (!firstStep) {
    throw new Error("Nenhuma etapa encontrada em workflow_steps.");
  }

  const templateId = firstStep.template_id || null;
  const nowIso = new Date().toISOString();

  const propertiesToUpdate = properties.filter(
    (property) => property.tenant_id === tenantId,
  );

  for (const property of propertiesToUpdate) {
    await updateRow("properties", {
      id: property.id,
      tenant_id: tenantId,
      template_id: templateId,
      current_step_id: firstStep.id,
      process_status: "active",
      process_started_at: nowIso,
    });
  }

  const hasAutomation = automations.some(
    (automation) =>
      automation.tenant_id === tenantId &&
      automation.trigger === "property.insert" &&
      automation.action === "set_initial_step",
  );

  if (!hasAutomation) {
    await createRow("automations", {
      tenant_id: tenantId,
      trigger: "property.insert",
      action: "set_initial_step",
      config: {
        template_id: templateId,
        step_id: firstStep.id,
        process_status: "active",
      },
    });
  }

  console.log("OK");
  console.log("tenant_id:", tenantId);
  console.log("step_id:", firstStep.id);
  console.log("template_id:", templateId);
  console.log("properties_atualizadas:", propertiesToUpdate.length);
  console.log("automation_criada:", hasAutomation ? "nao" : "sim");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
