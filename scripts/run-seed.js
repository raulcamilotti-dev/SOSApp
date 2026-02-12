/**
 * Script Node.js para executar seed de dados fictícios
 * Alternativa ao psql para quem não tem PostgreSQL CLI instalado
 *
 * USO:
 *   npm install pg
 *   DB_PASSWORD=sua-senha node scripts/run-seed.js
 */

const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

// Configuração do banco
const config = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "sosapp",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD,
};

console.log("========================================");
console.log("SEED DE DADOS FICTÍCIOS - MOTOR DE PROCESSOS");
console.log("========================================");
console.log("");
console.log("Configuração:");
console.log(`  Host: ${config.host}`);
console.log(`  Port: ${config.port}`);
console.log(`  Database: ${config.database}`);
console.log(`  User: ${config.user}`);
console.log("");

async function runSeed() {
  // Verificar senha
  if (!config.password) {
    console.error("❌ Erro: Senha não fornecida!");
    console.log("");
    console.log("Execute com:");
    console.log("  DB_PASSWORD=sua-senha node scripts/run-seed.js");
    console.log("");
    console.log("Ou no Windows PowerShell:");
    console.log('  $env:DB_PASSWORD="sua-senha"; node scripts/run-seed.js');
    process.exit(1);
  }

  const client = new Client(config);

  try {
    console.log("Conectando ao banco...");
    await client.connect();
    console.log("✅ Conectado com sucesso!");
    console.log("");

    // Ler arquivo SQL
    const sqlPath = path.join(__dirname, "seed_data.sql");

    if (!fs.existsSync(sqlPath)) {
      throw new Error(`Arquivo não encontrado: ${sqlPath}`);
    }

    console.log(`Lendo arquivo: ${sqlPath}`);
    const sql = fs.readFileSync(sqlPath, "utf8");
    console.log(`✅ Arquivo carregado (${sql.length} bytes)`);
    console.log("");

    console.log("Executando seed...");
    console.log("");

    // Executar SQL
    const result = await client.query(sql);

    console.log("");
    console.log("========================================");
    console.log("✅ SEED EXECUTADO COM SUCESSO!");
    console.log("========================================");
    console.log("");
    console.log("Dados criados:");
    console.log("  • 1 Workflow Template");
    console.log("  • 14 Workflow Steps (etapas)");
    console.log("  • 15 Transições entre etapas");
    console.log("  • 8 Properties (imóveis) de teste");
    console.log("  • 7 Regras de prazo");
    console.log("  • 5 Prazos ativos");
    console.log("  • 3 Logs de processo");
    console.log("");
    console.log("Próximos passos:");
    console.log("  1. Inicie o app: npm start");
    console.log("  2. Acesse: /Administrador/kanban-processos");
    console.log("  3. Ou acesse: /Administrador/gestor-prazos-processos");
    console.log("");
  } catch (err) {
    console.error("");
    console.error("========================================");
    console.error("❌ ERRO AO EXECUTAR SEED");
    console.error("========================================");
    console.error("");
    console.error("Detalhes:", err.message);
    console.error("");

    if (err.code === "ECONNREFUSED") {
      console.error("Causa provável: PostgreSQL não está rodando");
      console.error("Solução: Inicie o PostgreSQL");
    } else if (err.code === "28P01") {
      console.error("Causa provável: Senha incorreta");
      console.error("Solução: Verifique a senha do PostgreSQL");
    } else if (err.code === "3D000") {
      console.error('Causa provável: Banco "sosapp" não existe');
      console.error("Solução: Crie o banco primeiro");
      console.error('  psql -U postgres -c "CREATE DATABASE sosapp;"');
    } else if (err.message.includes("tenant")) {
      console.error("Causa provável: Nenhum tenant encontrado no banco");
      console.error(
        "Solução: Crie um tenant primeiro ou execute as migrations",
      );
    }

    console.error("");
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Executar
runSeed();
