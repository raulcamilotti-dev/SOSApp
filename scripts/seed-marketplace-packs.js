#!/usr/bin/env node
/**
 * seed-marketplace-packs.js
 *
 * Seeds the 3 built-in example packs (petshop, clinica, imobiliaria)
 * into the marketplace_packs table as official, published packs.
 *
 * Idempotent: skips packs whose slug already exists.
 *
 * Usage:
 *   node scripts/seed-marketplace-packs.js
 *
 * Requires EXPO_PUBLIC_API_BASE_URL and EXPO_PUBLIC_N8N_API_KEY env vars
 * (or uses defaults from .env / hardcoded fallbacks).
 */

const https = require("https");
const http = require("http");
const path = require("path");

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "https://sos-api-crud.raulcamilotti-c44.workers.dev";
const API_KEY =
  process.env.EXPO_PUBLIC_N8N_API_KEY ||
  "pnZdAqNqmtSPfHHUMsjAs1pFaygbyjd8Jd66QZXYwvg";
const CRUD_ENDPOINT = `${API_BASE}/api_crud`;

/* ------------------------------------------------------------------ */
/*  Pack data — inline copies of the 3 example packs                   */
/*  (We can't import TS modules from Node, so we load the compiled    */
/*   pack data by reading the TS source and extracting JSON.)          */
/*  Instead, we define the essential metadata here.                    */
/* ------------------------------------------------------------------ */

// We'll read the actual TS pack files and extract the JSON data
// For simplicity, we'll use the API to check existing + create

/**
 * Helper: POST JSON to an endpoint
 */
function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const mod = isHttps ? https : http;

    const req = mod.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
          "X-Api-Key": API_KEY,
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode, data: body });
          }
        });
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

/**
 * Check if a pack with given slug already exists
 */
async function packExistsBySlug(slug) {
  const res = await postJson(CRUD_ENDPOINT, {
    action: "list",
    table: "marketplace_packs",
    search_field1: "slug",
    search_value1: slug,
    search_operator1: "equal",
    auto_exclude_deleted: true,
  });
  const list = Array.isArray(res.data) ? res.data : [];
  return list.length > 0;
}

/**
 * Find the platform super-admin user (first admin in the system)
 */
async function findSuperAdminId() {
  // Try to find a user who is likely the platform admin
  // Look for users with role 'admin' or 'super_admin'
  const res = await postJson(CRUD_ENDPOINT, {
    action: "list",
    table: "users",
    sort_column: "created_at ASC",
  });
  const users = Array.isArray(res.data) ? res.data : [];

  // Return the first user (platform creator) as the builder
  if (users.length > 0) {
    return users[0].id;
  }
  throw new Error(
    "No users found in the database. Cannot determine builder ID.",
  );
}

/* ------------------------------------------------------------------ */
/*  Pack definitions (metadata only — pack_data loaded from TS files)  */
/* ------------------------------------------------------------------ */

// We need the full pack data. Let's use tsx/ts-node to eval the pack files,
// or alternatively, we embed the essential pack metadata and use a
// simplified pack_data structure.

// For a more robust approach, we'll use the TS files directly via esbuild/tsx
// Let's try a simpler approach: require the compiled data

// Actually, let's just define the packs inline since they're small

const PACKS_META = {
  petshop: {
    name: "Pet Shop & Veterinária",
    slug: "petshop",
    description:
      "Banho & tosa, consultas veterinárias, hospedagem pet — pronto para operar.",
    icon: "🐾",
    category: "saude",
    version: "1.0.0",
  },
  clinica: {
    name: "Clínica & Consultório",
    slug: "clinica",
    description:
      "Agendamentos, prontuários, procedimentos e retornos — fluxo clínico completo.",
    icon: "🩺",
    category: "saude",
    version: "1.0.0",
  },
  imobiliaria: {
    name: "Imobiliária & Corretagem",
    slug: "imobiliaria",
    description:
      "Captação de imóveis, atendimento, vistorias, contratos, pós-venda — gestão imobiliária completa.",
    icon: "🏠",
    category: "imobiliario",
    version: "1.0.0",
  },
};

/**
 * Load the full pack data from TypeScript source files using esbuild
 */
async function loadPackData(packKey) {
  try {
    // Try using tsx to evaluate the TS file
    const fs = require("fs");
    const packPath = path.join(
      __dirname,
      "..",
      "data",
      "template-packs",
      `${packKey}.ts`,
    );

    if (!fs.existsSync(packPath)) {
      console.warn(`  ⚠️  Pack file not found: ${packPath}`);
      return null;
    }

    // Read the TS file and extract the JSON-compatible object
    const content = fs.readFileSync(packPath, "utf-8");

    // Simple TS→JS transform: remove type annotations and 'as const'/'satisfies'
    let js = content
      .replace(/import\s+type\s+.*?;/g, "")
      .replace(/import\s*{[^}]*}\s*from\s*['"][^'"]*['"];?/g, "")
      .replace(/export\s+default\s+/, "module.exports = ")
      .replace(/\s+satisfies\s+\w+/g, "")
      .replace(/\s+as\s+const/g, "")
      .replace(/:\s*\w+(\[\])?\s*(?=[,\n\r}])/g, "") // remove simple type annotations
      .replace(/:\s*Record<[^>]+>/g, "")
      .replace(/:\s*ModuleKey\[\]/g, "")
      .replace(/:\s*TemplatePack\s*=/g, " =");

    // Write to a temp file and require it
    const tmpPath = path.join(__dirname, `_tmp_pack_${packKey}.js`);
    fs.writeFileSync(tmpPath, js, "utf-8");

    try {
      const packData = require(tmpPath);
      return packData;
    } finally {
      // Clean up temp file
      try {
        fs.unlinkSync(tmpPath);
      } catch {}
    }
  } catch (err) {
    console.warn(
      `  ⚠️  Could not load pack data for ${packKey}: ${err.message}`,
    );
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

async function main() {
  console.log("🏪 Seeding official marketplace packs...");
  console.log(`   API: ${API_BASE}\n`);

  // 1. Find builder ID
  let builderId;
  try {
    builderId = await findSuperAdminId();
    console.log(`✅ Builder ID (first user): ${builderId}\n`);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }

  const created = [];
  const skipped = [];

  // 2. Seed each pack
  for (const [key, meta] of Object.entries(PACKS_META)) {
    process.stdout.write(`  📦 ${meta.name} (${key})... `);

    // Check if already exists
    const exists = await packExistsBySlug(meta.slug);
    if (exists) {
      console.log("SKIPPED (already exists)");
      skipped.push(key);
      continue;
    }

    // Load full pack data
    const packData = await loadPackData(key);
    if (!packData) {
      console.log("SKIPPED (could not load pack data)");
      skipped.push(key);
      continue;
    }

    // Create marketplace_packs record
    const now = new Date().toISOString();
    const res = await postJson(CRUD_ENDPOINT, {
      action: "create",
      table: "marketplace_packs",
      payload: {
        builder_id: builderId,
        name: meta.name,
        slug: meta.slug,
        description: meta.description,
        icon: meta.icon,
        category: meta.category,
        tags: JSON.stringify([key]),
        pack_data: JSON.stringify(packData),
        version: meta.version,
        status: "published",
        pricing_type: "free",
        price_cents: 0,
        download_count: 0,
        is_official: true,
        preview_images: JSON.stringify([]),
        requirements: JSON.stringify({ modules: packData.modules || [] }),
        created_at: now,
        updated_at: now,
      },
    });

    if (res.status === 200 && res.data && !res.data.error) {
      const id =
        Array.isArray(res.data) && res.data[0]?.id ? res.data[0].id : "?";
      console.log(`CREATED (id: ${id})`);
      created.push(key);
    } else {
      const errMsg =
        typeof res.data === "object" ? JSON.stringify(res.data) : res.data;
      console.log(`FAILED — ${errMsg}`);
      skipped.push(key);
    }
  }

  // 3. Summary
  console.log(`\n${"─".repeat(50)}`);
  console.log(
    `✅ Created: ${created.length} (${created.join(", ") || "none"})`,
  );
  console.log(
    `⏭️  Skipped: ${skipped.length} (${skipped.join(", ") || "none"})`,
  );
  console.log(`📊 Total: ${created.length + skipped.length} packs processed`);
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
