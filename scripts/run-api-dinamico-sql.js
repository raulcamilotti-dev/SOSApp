const fs = require("fs");
const path = require("path");
const https = require("https");
const { Buffer } = require("buffer");

const endpoint =
  process.env.API_DINAMICO_URL ||
  "https://n8n.sosescritura.com.br/webhook/api_dinamico";

const sqlFileArg = process.argv[2];
const sqlInlineArg = process.argv[3];

if (!sqlFileArg && !sqlInlineArg) {
  console.error("Uso:");
  console.error(
    "  node scripts/run-api-dinamico-sql.js <arquivo.sql>            # lê SQL do arquivo",
  );
  console.error(
    '  node scripts/run-api-dinamico-sql.js --sql "SELECT 1;"      # SQL inline',
  );
  process.exit(1);
}

let sql = "";
if (sqlFileArg === "--sql") {
  sql = String(sqlInlineArg || "").trim();
} else {
  const full = path.resolve(process.cwd(), sqlFileArg);
  if (!fs.existsSync(full)) {
    console.error(`Arquivo não encontrado: ${full}`);
    process.exit(1);
  }
  sql = fs.readFileSync(full, "utf8").trim();
}

if (!sql) {
  console.error("SQL vazio.");
  process.exit(1);
}

const payloadCandidates = [
  { sql },
  { query: sql },
  { statement: sql },
  { body: { sql } },
  { body: { query: sql } },
];

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          let parsed;
          try {
            parsed = JSON.parse(body);
          } catch (_parseError) {
            parsed = body;
          }
          resolve({ status: res.statusCode || 0, data: parsed, raw: body });
        });
      },
    );

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

(async () => {
  console.log("Endpoint:", endpoint);
  console.log("Tentando executar SQL via api_dinamico...");

  for (let i = 0; i < payloadCandidates.length; i += 1) {
    const payload = payloadCandidates[i];
    try {
      const res = await postJson(endpoint, payload);
      console.log(`\nTentativa ${i + 1} payload:`, Object.keys(payload));
      console.log("Status:", res.status);
      if (res.status >= 200 && res.status < 300) {
        console.log("Sucesso:");
        console.log(
          typeof res.data === "string"
            ? res.data.slice(0, 4000)
            : JSON.stringify(res.data, null, 2).slice(0, 4000),
        );
        process.exit(0);
      }

      console.log("Resposta:");
      console.log(
        typeof res.data === "string"
          ? res.data.slice(0, 1500)
          : JSON.stringify(res.data, null, 2).slice(0, 1500),
      );
    } catch (error) {
      console.log(`Tentativa ${i + 1} falhou:`, error.message);
    }
  }

  console.error(
    "\nNão foi possível executar. Verifique se o webhook está ativo e qual chave ele espera (sql/query/statement).",
  );
  process.exit(2);
})();
