#!/usr/bin/env node
/**
 * Script de debug: Verifica se tasks têm property_id preenchido
 * Uso: node scripts/debug-tasks.js
 */

const axios = require("axios");
require("dotenv").config();

const ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";
const TENANT_ID =
  process.env.TENANT_ID || "0999d528-0114-4399-a582-41d4ea96801f";

async function main() {
  console.log("🔍 DEBUG: Verificando tasks e properties...\n");

  try {
    // 1. Buscar todas as properties
    const propertiesRes = await axios.post(ENDPOINT, {
      operation: "list",
      table: "properties",
      tenant_id: TENANT_ID,
      filters: { process_status: "active" },
    });

    const properties = Array.isArray(propertiesRes.data)
      ? propertiesRes.data
      : propertiesRes.data?.data || [];

    console.log(`📍 Properties encontradas: ${properties.length}`);
    properties.slice(0, 3).forEach((p) => {
      console.log(
        `   - ID: ${p.id} | Title: ${p.title || "N/A"} | Address: ${p.address || "N/A"}`,
      );
    });

    // 2. Buscar todas as tasks
    const tasksRes = await axios.post(ENDPOINT, {
      operation: "list",
      table: "tasks",
      tenant_id: TENANT_ID,
    });

    const tasks = Array.isArray(tasksRes.data)
      ? tasksRes.data
      : tasksRes.data?.data || [];

    console.log(`\n✓ Tasks encontradas: ${tasks.length}`);

    // 3. Análise das tasks
    if (tasks.length > 0) {
      const tasksWithPropertyId = tasks.filter((t) => t.property_id);
      const tasksWithoutPropertyId = tasks.filter((t) => !t.property_id);

      console.log(
        `\n   ✓ Tasks COM property_id: ${tasksWithPropertyId.length}`,
      );
      console.log(
        `   ✗ Tasks SEM property_id: ${tasksWithoutPropertyId.length}`,
      );

      if (tasksWithoutPropertyId.length > 0) {
        console.log(
          `\n⚠️  PROBLEMA ENCONTRADO: ${tasksWithoutPropertyId.length} tasks não têm property_id!`,
        );
        console.log("   Primeiras tasks sem property_id:");
        tasksWithoutPropertyId.slice(0, 3).forEach((t) => {
          console.log(
            `   - ID: ${t.id} | Title: ${t.title || "N/A"} | Property: ${t.property_id || "VAZIO"}`,
          );
        });
      }

      // 4. Verificar se property_ids nas tasks existem nas properties
      if (tasksWithPropertyId.length > 0) {
        const propertyIds = new Set(properties.map((p) => p.id));
        const tasksWithValidProperty = tasksWithPropertyId.filter((t) =>
          propertyIds.has(t.property_id),
        );
        const tasksWithInvalidProperty = tasksWithPropertyId.filter(
          (t) => !propertyIds.has(t.property_id),
        );

        console.log(
          `\n   ✓ Tasks COM property_id VÁLIDO: ${tasksWithValidProperty.length}`,
        );
        console.log(
          `   ✗ Tasks COM property_id INVÁLIDO: ${tasksWithInvalidProperty.length}`,
        );

        if (tasksWithInvalidProperty.length > 0) {
          console.log("   ⚠️  Property IDs não encontrados:");
          tasksWithInvalidProperty.slice(0, 3).forEach((t) => {
            console.log(
              `   - Task: ${t.title || t.id} | Property: ${t.property_id}`,
            );
          });
        }
      }
    } else {
      console.log("\n⚠️  Nenhuma task encontrada!");
    }

    // 5. Buscar variables para ver se estão vinculadas
    const variablesRes = await axios.post(ENDPOINT, {
      operation: "list",
      table: "task_variables",
      tenant_id: TENANT_ID,
    });

    const variables = Array.isArray(variablesRes.data)
      ? variablesRes.data
      : variablesRes.data?.data || [];

    console.log(`\n📋 Task Variables encontradas: ${variables.length}`);

    // 6. Resumo final
    console.log("\n" + "=".repeat(60));
    console.log("📊 RESUMO:");
    console.log("=".repeat(60));
    console.log(`Properties: ${properties.length}`);
    console.log(`Tasks: ${tasks.length}`);
    console.log(`Task Variables: ${variables.length}`);
    console.log(`Tenant ID: ${TENANT_ID}`);

    if (tasks.length === 0) {
      console.log(
        "\n💡 SUGESTÃO: Nenhuma task existe. Você precisa criar tasks primeiro!",
      );
      console.log("   Use a interface do app para criar tasks nas properties.");
    } else if (
      tasks.filter((t) => !t.property_id).length / tasks.length >
      0.5
    ) {
      console.log(
        "\n⚠️  PROBLEMA: Mais de 50% das tasks não têm property_id preenchido!",
      );
      console.log(
        "   Você pode precisar migrar os dados ou recriar as tasks com property_id.",
      );
    } else {
      console.log("\n✅ Dados parecem estar OK!");
    }
  } catch (error) {
    console.error("❌ Erro:", error.message);
    if (error.response?.data) {
      console.error("Response:", error.response.data);
    }
    process.exit(1);
  }
}

main();
