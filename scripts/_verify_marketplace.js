const API_BASE = "https://sos-api-crud.raulcamilotti-c44.workers.dev";
const API_KEY = "pnZdAqNqmtSPfHHUMsjAs1pFaygbyjd8Jd66QZXYwvg";

async function q(body) {
  const r = await fetch(API_BASE + "/api_crud", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": API_KEY },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

async function main() {
  const packs = await q({
    action: "list",
    table: "marketplace_packs",
    auto_exclude_deleted: true,
  });
  console.log("=== marketplace_packs ===");
  const list = Array.isArray(packs) ? packs : [];
  console.log("Count:", list.length);
  for (const p of list) {
    console.log(
      "  -",
      p.name,
      "| slug=" + p.slug,
      "| status=" + p.status,
      "| official=" + p.is_official,
      "| pricing=" + p.pricing_type,
      "| downloads=" + p.download_count,
      "| category=" + p.category,
    );
  }

  const installs = await q({
    action: "list",
    table: "marketplace_installs",
    auto_exclude_deleted: true,
  });
  console.log("\n=== marketplace_installs ===");
  console.log("Count:", Array.isArray(installs) ? installs.length : 0);
}

main().catch(console.error);
