/**
 * Run migration to add CNPJ lookup fields to companies table.
 * Usage: node scripts/run-companies-cnpj-migration.js
 */
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const API_DINAMICO = "https://n8n.sosescritura.com.br/webhook/api_dinamico";

async function run() {
  const sqlFile = path.join(
    __dirname,
    "..",
    "migrations",
    "add-companies-cnpj-fields.sql",
  );
  const sql = fs.readFileSync(sqlFile, "utf-8");

  const blocks = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  for (const block of blocks) {
    try {
      console.log(`Executing: ${block.substring(0, 80)}...`);
      const res = await axios.post(API_DINAMICO, { sql: block });
      console.log(
        "  -> OK:",
        typeof res.data === "string" ? res.data.substring(0, 100) : "success",
      );
    } catch (err) {
      const msg = err.response?.data ?? err.message;
      console.error(
        "  -> ERROR:",
        typeof msg === "string" ? msg.substring(0, 200) : msg,
      );
    }
  }

  console.log("\nDone! Companies table should now have all CNPJ fields.");
}

run().catch(console.error);
