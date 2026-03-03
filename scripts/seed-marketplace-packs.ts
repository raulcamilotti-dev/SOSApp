#!/usr/bin/env npx tsx
/**
 * seed-marketplace-packs.ts
 *
 * Seeds the 3 built-in example packs (petshop, clinica, imobiliaria)
 * into the marketplace_packs table as official, published packs.
 *
 * Idempotent: skips packs whose slug already exists.
 *
 * Usage:
 *   npx tsx scripts/seed-marketplace-packs.ts
 */

/* ------------------------------------------------------------------ */
/*  Direct imports of pack data (tsx handles TS natively)              */
/* ------------------------------------------------------------------ */

import clinicaPack from "../data/template-packs/clinica";
import imobiliariaPack from "../data/template-packs/imobiliaria";
import petshopPack from "../data/template-packs/petshop";
import type { TemplatePack } from "../data/template-packs/types";

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
/*  HTTP helper                                                        */
/* ------------------------------------------------------------------ */

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": API_KEY,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, data };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function packExistsBySlug(slug: string): Promise<boolean> {
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

async function findFirstUserId(): Promise<string> {
  const res = await postJson(CRUD_ENDPOINT, {
    action: "list",
    table: "users",
    sort_column: "created_at ASC",
  });
  const users = Array.isArray(res.data) ? res.data : [];
  if (users.length > 0) return users[0].id;
  throw new Error("No users found — cannot determine builder ID.");
}

function inferCategory(pack: TemplatePack): string {
  const spec = pack.tenant_config?.specialty?.toString().toLowerCase() ?? "";
  const key = pack.metadata.key.toLowerCase();
  if (spec === "juridico" || key.includes("advoc")) return "juridico";
  if (spec === "saude" || key.includes("clinic") || key.includes("pet"))
    return "saude";
  if (spec === "imobiliario" || key.includes("imobil")) return "imobiliario";
  if (spec === "comercio") return "comercio";
  return "generico";
}

/* ------------------------------------------------------------------ */
/*  Packs to seed                                                      */
/* ------------------------------------------------------------------ */

const SEED_PACKS: Record<string, TemplatePack> = {
  petshop: petshopPack,
  clinica: clinicaPack,
  imobiliaria: imobiliariaPack,
};

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

async function main() {
  console.log("🏪 Seeding official marketplace packs...");
  console.log(`   API: ${API_BASE}\n`);

  const builderId = await findFirstUserId();
  console.log(`✅ Builder ID (first user): ${builderId}\n`);

  const created: string[] = [];
  const skipped: string[] = [];

  for (const [key, pack] of Object.entries(SEED_PACKS)) {
    process.stdout.write(`  📦 ${pack.metadata.name} (${key})... `);

    const exists = await packExistsBySlug(key);
    if (exists) {
      console.log("SKIPPED (already exists)");
      skipped.push(key);
      continue;
    }

    const now = new Date().toISOString();
    const res = await postJson(CRUD_ENDPOINT, {
      action: "create",
      table: "marketplace_packs",
      payload: {
        builder_id: builderId,
        name: pack.metadata.name,
        slug: key,
        description: pack.metadata.description,
        icon: pack.metadata.icon,
        category: inferCategory(pack),
        tags: JSON.stringify([key]),
        pack_data: JSON.stringify(pack),
        version: pack.metadata.version,
        status: "published",
        pricing_type: "free",
        price_cents: 0,
        download_count: 0,
        is_official: true,
        preview_images: JSON.stringify([]),
        requirements: JSON.stringify({ modules: pack.modules }),
        created_at: now,
        updated_at: now,
      },
    });

    if (res.status === 200 && res.data && !(res.data as any).error) {
      const id =
        Array.isArray(res.data) && (res.data[0] as any)?.id
          ? (res.data[0] as any).id
          : "?";
      console.log(`CREATED (id: ${id})`);
      created.push(key);
    } else {
      const errMsg =
        typeof res.data === "object"
          ? JSON.stringify(res.data)
          : String(res.data);
      console.log(`FAILED — ${errMsg}`);
      skipped.push(key);
    }
  }

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
