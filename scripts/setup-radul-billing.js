/**
 * Script: Configure Radul Super-Admin Tenant Billing
 *
 * Run this once to:
 * 1. Run the migration adding billing columns to tenants
 * 2. Set the Radul tenant's billing PIX key in config.billing
 *
 * Usage:
 *   node scripts/setup-radul-billing.js
 *
 * Before running, set the environment variables:
 *   RADUL_PIX_KEY       - Your PIX key (CPF, CNPJ, email, phone, or random)
 *   RADUL_PIX_KEY_TYPE  - Type: cpf, cnpj, email, phone, random (default: cnpj)
 *   RADUL_MERCHANT_NAME - Merchant name for PIX (default: Radul Tecnologia)
 *   RADUL_MERCHANT_CITY - Merchant city (default: Curitiba)
 */

const axios = require("axios");

const API_DINAMICO = "https://n8n.sosescritura.com.br/webhook/api_dinamico";
const API_CRUD = "https://n8n.sosescritura.com.br/webhook/api_crud";

const PIX_KEY = process.env.RADUL_PIX_KEY || "";
const PIX_KEY_TYPE = process.env.RADUL_PIX_KEY_TYPE || "cnpj";
const MERCHANT_NAME = process.env.RADUL_MERCHANT_NAME || "Radul Tecnologia";
const MERCHANT_CITY = process.env.RADUL_MERCHANT_CITY || "Curitiba";

async function main() {
  console.log("=== Setup Radul Billing ===\n");

  // Step 1: Run migration (idempotent — uses IF NOT EXISTS)
  console.log("1. Running migration: add billing columns to tenants...");
  try {
    await axios.post(API_DINAMICO, {
      sql: `
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_users integer DEFAULT NULL;
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS extra_users_purchased integer DEFAULT 0;
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS price_per_extra_user numeric(10,2) DEFAULT 29.90;
      `,
    });
    console.log("   ✅ Migration applied successfully\n");
  } catch (err) {
    console.error("   ❌ Migration failed:", err.response?.data || err.message);
    console.log("   Continuing anyway (columns may already exist)...\n");
  }

  // Step 2: Find Radul tenant
  console.log("2. Finding Radul tenant...");
  let radulTenant = null;

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
      radulTenant = tenants[0];
      console.log(
        `   ✅ Found by slug: ${radulTenant.company_name} (${radulTenant.id})\n`,
      );
    }
  } catch {}

  if (!radulTenant) {
    try {
      const res = await axios.post(API_CRUD, {
        action: "list",
        table: "tenants",
        search_field1: "company_name",
        search_value1: "%radul%",
        search_operator1: "ilike",
      });
      const tenants = Array.isArray(res.data) ? res.data : [];
      if (tenants.length > 0) {
        radulTenant = tenants[0];
        console.log(
          `   ✅ Found by name: ${radulTenant.company_name} (${radulTenant.id})\n`,
        );
      }
    } catch {}
  }

  if (!radulTenant) {
    console.error("   ❌ Radul tenant not found! Please create it first.\n");
    console.log(
      "   You can create it via onboarding or directly in the database:",
    );
    console.log(
      "   INSERT INTO tenants (company_name, slug, plan, status) VALUES ('Radul Tecnologia', 'radul', 'enterprise', 'active');",
    );
    process.exit(1);
  }

  // Step 3: Update config.billing
  console.log("3. Configuring billing PIX...");

  if (!PIX_KEY) {
    console.log("   ⚠️  No PIX key provided (set RADUL_PIX_KEY env var).");
    console.log("   Skipping PIX configuration.\n");
    console.log("   To set it later, run:");
    console.log(
      `   RADUL_PIX_KEY=your_key node scripts/setup-radul-billing.js\n`,
    );
  } else {
    try {
      // Parse existing config
      let existingConfig = {};
      try {
        existingConfig =
          typeof radulTenant.config === "string"
            ? JSON.parse(radulTenant.config)
            : radulTenant.config || {};
      } catch {}

      const updatedConfig = {
        ...existingConfig,
        billing: {
          pix_key: PIX_KEY,
          pix_key_type: PIX_KEY_TYPE,
          pix_merchant_name: MERCHANT_NAME,
          pix_merchant_city: MERCHANT_CITY,
        },
      };

      await axios.post(API_CRUD, {
        action: "update",
        table: "tenants",
        payload: {
          id: radulTenant.id,
          config: JSON.stringify(updatedConfig),
        },
      });

      console.log(`   ✅ Billing configured:`);
      console.log(`      PIX Key: ${PIX_KEY}`);
      console.log(`      PIX Type: ${PIX_KEY_TYPE}`);
      console.log(`      Merchant: ${MERCHANT_NAME}`);
      console.log(`      City: ${MERCHANT_CITY}\n`);
    } catch (err) {
      console.error(
        "   ❌ Failed to update config:",
        err.response?.data || err.message,
      );
    }
  }

  // Step 4: Set all free/trial tenants to have default max_users = 2
  console.log("4. Setting default max_users for free/trial tenants...");
  try {
    const res = await axios.post(API_DINAMICO, {
      sql: `
        UPDATE tenants
        SET max_users = 2
        WHERE (plan IS NULL OR plan IN ('free', 'trial'))
          AND max_users IS NULL;
      `,
    });
    const updated = Array.isArray(res.data) ? res.data.length : 0;
    console.log(`   ✅ Updated ${updated} tenant(s) with max_users = 2\n`);
  } catch (err) {
    console.error(
      "   ❌ Failed to set defaults:",
      err.response?.data || err.message,
    );
  }

  // Step 5: Set paid plans with starter limits
  console.log("5. Setting default max_users for paid plans...");
  try {
    await axios.post(API_DINAMICO, {
      sql: `
        UPDATE tenants SET max_users = 10  WHERE plan = 'starter'    AND max_users IS NULL;
        UPDATE tenants SET max_users = 25  WHERE plan = 'growth'     AND max_users IS NULL;
        UPDATE tenants SET max_users = 50  WHERE plan = 'scale'      AND max_users IS NULL;
      `,
    });
    console.log("   ✅ Paid plan defaults applied\n");
  } catch (err) {
    console.error("   ❌ Failed:", err.response?.data || err.message);
  }

  // Summary
  console.log("=== Setup Complete ===");
  console.log("The billing system is now ready:");
  console.log("• Tenants have max_users limits enforced");
  console.log("• Purchase flow: Gestão > Comprar Usuários > PIX QR");
  console.log("• Invoices + Contas a Receber created on Radul tenant");
  console.log("• Confirm payment in Contas a Receber to unlock seats");
}

main().catch(console.error);
