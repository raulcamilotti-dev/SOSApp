/**
 * Run migration to create contracts and quote_templates tables
 * Usage: node scripts/run-contracts-migration.js
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
    "add-contracts-quote-templates.sql",
  );
  const sql = fs.readFileSync(sqlFile, "utf-8");

  // Remove SQL comments and send as individual blocks split by double newlines
  const cleanSql = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  // Split into logical blocks: each CREATE TABLE/INDEX is separated by blank lines
  const blocks = cleanSql
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  for (const block of blocks) {
    try {
      console.log(`\nExecuting: ${block.substring(0, 80)}...`);
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

  console.log("\nDone! Tables contracts and quote_templates should now exist.");
}

run().catch(console.error);
