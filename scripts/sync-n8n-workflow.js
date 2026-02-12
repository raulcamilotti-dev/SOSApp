#!/usr/bin/env node

const axios = require("axios");
const fs = require("fs");
const path = require("path");

// Carregar variáveis de ambiente do arquivo .env
require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });

const N8N_URL = process.env.N8N_URL || "http://localhost:5678";
const N8N_API_KEY = process.env.N8N_API_KEY;
const WORKFLOW_ID = process.env.N8N_WORKFLOW_ID || "Ar17RgJt19MHQwbJqD8ZK";

const PROJECT_ROOT = process.cwd();

const WORKFLOW_FILE = path.join(
  PROJECT_ROOT,
  `n8n/workflows/${WORKFLOW_ID}.json`,
);

const n8nApi = axios.create({
  baseURL: `${N8N_URL}/api/v1`,
  headers: {
    "X-N8N-API-KEY": N8N_API_KEY,
    "Content-Type": "application/json",
  },
});

/**
 * Baixa o workflow editado do n8n e salva localmente
 */
async function downloadWorkflow() {
  try {
    if (!N8N_API_KEY) {
      console.warn("⚠️  N8N_API_KEY não definida, pulando download");
      return;
    }

    console.log(`📥 Baixando workflow ${WORKFLOW_ID} do n8n...`);

    const response = await n8nApi.get(`/workflows/${WORKFLOW_ID}`);
    const workflow = response.data;

    // Criar diretório se não existir
    fs.mkdirSync(path.dirname(WORKFLOW_FILE), { recursive: true });

    // Salvar workflow em JSON
    fs.writeFileSync(WORKFLOW_FILE, JSON.stringify(workflow, null, 2));

    console.log(`✅ Workflow salvo: ${WORKFLOW_FILE}`);
    console.log(`   ID: ${workflow.id}`);
    console.log(`   Nome: ${workflow.name}`);
    console.log(`   Nodes: ${workflow.nodes?.length || 0}`);

    // Commitar e push (opcional)
    // execSync("git add n8n/", { stdio: "inherit" });
    // execSync('git commit -m "refactor: sync n8n workflow"', {
    //   stdio: "inherit",
    // });
  } catch (error) {
    if (error.response?.status === 404) {
      console.error(`❌ Workflow ${WORKFLOW_ID} não encontrado no n8n`);
    } else {
      console.error("❌ Erro ao baixar workflow:", error.message);
    }
    process.exit(1);
  }
}

/**
 * Envia o workflow local para o n8n
 */
async function uploadWorkflow() {
  try {
    if (!N8N_API_KEY) {
      console.error("❌ N8N_API_KEY não definida");
      process.exit(1);
    }

    if (!fs.existsSync(WORKFLOW_FILE)) {
      console.error(`❌ Arquivo não encontrado: ${WORKFLOW_FILE}`);
      process.exit(1);
    }

    console.log(`📤 Enviando workflow para n8n...`);

    const workflow = JSON.parse(fs.readFileSync(WORKFLOW_FILE, "utf-8"));

    // Se tem ID, fazer update; senão, criar novo
    if (workflow.id) {
      await n8nApi.put(`/workflows/${workflow.id}`, workflow);
      console.log(`✅ Workflow atualizado no n8n`);
      console.log(`   ID: ${workflow.id}`);
      console.log(`   Nome: ${workflow.name}`);
    } else {
      const response = await n8nApi.post("/workflows", workflow);
      console.log(`✅ Novo workflow criado no n8n`);
      console.log(`   ID: ${response.data.id}`);
      console.log(`   Nome: ${response.data.name}`);
    }
  } catch (error) {
    console.error("❌ Erro ao enviar workflow:", error.message);
    if (error.response?.data) {
      console.error("   Detalhes:", error.response.data);
    }
    process.exit(1);
  }
}

/**
 * Validar estrutura do workflow
 */
async function validateWorkflow() {
  try {
    if (!fs.existsSync(WORKFLOW_FILE)) {
      console.error(`❌ Arquivo não encontrado: ${WORKFLOW_FILE}`);
      process.exit(1);
    }

    const workflow = JSON.parse(fs.readFileSync(WORKFLOW_FILE, "utf-8"));

    console.log(`✅ Workflow válido`);
    console.log(`   Nome: ${workflow.name}`);
    console.log(`   Nodes: ${workflow.nodes?.length || 0}`);
    console.log(`   Connections: ${workflow.connections?.length || 0}`);

    // Listar nodes
    if (workflow.nodes) {
      console.log("\n   Nodes:");
      workflow.nodes.forEach((node) => {
        console.log(`     - ${node.name} (${node.type})`);
      });
    }
  } catch (error) {
    console.error("❌ Erro ao validar workflow:", error.message);
    process.exit(1);
  }
}

// CLI
const command = process.argv[2];

switch (command) {
  case "upload":
    uploadWorkflow();
    break;
  case "download":
    downloadWorkflow();
    break;
  case "validate":
    validateWorkflow();
    break;
  default:
    console.log(`
Usage:
  npm run sync:n8n:upload    - Envia workflow local para n8n
  npm run sync:n8n:download  - Baixa workflow do n8n para local
  npm run sync:n8n:validate  - Valida estrutura do workflow
    `);
}
