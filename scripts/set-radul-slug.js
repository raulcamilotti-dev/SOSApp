/**
 * Script: Set slug = 'radul' on the Radul super-admin tenant
 *
 * Finds the Radul tenant by company_name ILIKE '%radul%' and sets slug = 'radul'.
 * Also ensures plan = 'enterprise'.
 *
 * Usage:
 *   node scripts/set-radul-slug.js
 *
 * If your tenant has a different name, pass it as argument:
 *   node scripts/set-radul-slug.js "My Company Name"
 */

const axios = require("axios");

const API_CRUD = "https://n8n.sosescritura.com.br/webhook/api_crud";

async function main() {
  const searchName = process.argv[2] || "radul";
  console.log(`\n🔍 Searching for tenant matching "${searchName}"...\n`);

  // Try by slug first
  try {
    const res = await axios.post(API_CRUD, {
      action: "list",
      table: "tenants",
      search_field1: "slug",
      search_value1: "radul",
      search_operator1: "equal",
    });
    const tenants = Array.isArray(res.data) ? res.data : [];
    if (tenants.length > 0) {
      console.log(
        `✅ Tenant already has slug 'radul': ${tenants[0].company_name} (${tenants[0].id})`,
      );
      console.log("   No changes needed.\n");
      return;
    }
  } catch {}

  // Search by name
  let tenant = null;
  try {
    const res = await axios.post(API_CRUD, {
      action: "list",
      table: "tenants",
      search_field1: "company_name",
      search_value1: `%${searchName}%`,
      search_operator1: "ilike",
    });
    const tenants = Array.isArray(res.data) ? res.data : [];
    if (tenants.length === 0) {
      console.error(`❌ No tenant found matching "${searchName}"\n`);
      console.log("Available tenants:");
      const allRes = await axios.post(API_CRUD, {
        action: "list",
        table: "tenants",
      });
      const all = Array.isArray(allRes.data) ? allRes.data : [];
      all.forEach((t) => {
        console.log(
          `  • ${t.company_name} (${t.id}) [slug: ${t.slug || "—"}, plan: ${t.plan || "—"}]`,
        );
      });
      console.log(
        `\nUsage: node scripts/set-radul-slug.js "Exact Company Name"`,
      );
      return;
    }
    if (tenants.length > 1) {
      console.log(`Found ${tenants.length} tenants matching "${searchName}":`);
      tenants.forEach((t, i) => {
        console.log(`  ${i + 1}. ${t.company_name} (${t.id})`);
      });
      console.log("\nUsing the first one.\n");
    }
    tenant = tenants[0];
  } catch (err) {
    console.error("❌ Error searching:", err.response?.data || err.message);
    return;
  }

  console.log(`📌 Found: ${tenant.company_name} (${tenant.id})`);
  console.log(`   Current slug: ${tenant.slug || "(none)"}`);
  console.log(`   Current plan: ${tenant.plan || "(none)"}\n`);

  // Update slug and plan
  try {
    await axios.post(API_CRUD, {
      action: "update",
      table: "tenants",
      payload: {
        id: tenant.id,
        slug: "radul",
        plan: "enterprise",
      },
    });
    console.log(`✅ Updated tenant:`);
    console.log(`   slug: "radul"`);
    console.log(`   plan: "enterprise"\n`);
    console.log(`The billing system can now find the Radul tenant.`);
  } catch (err) {
    console.error("❌ Failed to update:", err.response?.data || err.message);
  }
}

main().catch(console.error);
