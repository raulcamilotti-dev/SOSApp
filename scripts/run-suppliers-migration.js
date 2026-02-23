const axios = require("axios");
const endpoint = "https://n8n.sosescritura.com.br/webhook/api_dinamico";

async function runSQL(label, sql) {
  try {
    await axios.post(endpoint, { sql }, { timeout: 15000 });
    console.log("OK:", label);
    return true;
  } catch (e) {
    const msg = e.response?.data
      ? JSON.stringify(e.response.data).substring(0, 200)
      : e.message;
    console.log("FAIL:", label, msg);
    return false;
  }
}

(async () => {
  // 1. Create suppliers table
  await runSQL(
    "CREATE suppliers",
    `CREATE TABLE IF NOT EXISTS suppliers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      trade_name TEXT,
      document TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      zip_code TEXT,
      contact_person TEXT,
      payment_terms TEXT,
      notes TEXT,
      is_active BOOLEAN DEFAULT true,
      config JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      deleted_at TIMESTAMPTZ
    );`,
  );

  // 2. Indexes on suppliers
  await runSQL(
    "idx_suppliers_tenant",
    "CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON suppliers(tenant_id);",
  );
  await runSQL(
    "idx_suppliers_document",
    "CREATE INDEX IF NOT EXISTS idx_suppliers_document ON suppliers(tenant_id, document) WHERE document IS NOT NULL;",
  );
  await runSQL(
    "idx_suppliers_name",
    "CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(tenant_id, name);",
  );

  // 3. Add average_cost to services
  await runSQL(
    "ADD average_cost",
    "ALTER TABLE services ADD COLUMN IF NOT EXISTS average_cost NUMERIC(12,4) DEFAULT 0;",
  );

  // 4. Create product_cost_history
  await runSQL(
    "CREATE product_cost_history",
    `CREATE TABLE IF NOT EXISTS product_cost_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      service_id UUID NOT NULL REFERENCES services(id),
      movement_type TEXT NOT NULL CHECK (movement_type IN ('purchase', 'adjustment', 'initial', 'return')),
      quantity NUMERIC(12,4) NOT NULL,
      unit_cost NUMERIC(12,4) NOT NULL,
      previous_average_cost NUMERIC(12,4) NOT NULL DEFAULT 0,
      new_average_cost NUMERIC(12,4) NOT NULL DEFAULT 0,
      previous_stock_qty NUMERIC(12,4) NOT NULL DEFAULT 0,
      new_stock_qty NUMERIC(12,4) NOT NULL DEFAULT 0,
      stock_value_before NUMERIC(12,2) NOT NULL DEFAULT 0,
      stock_value_after NUMERIC(12,2) NOT NULL DEFAULT 0,
      purchase_order_id UUID REFERENCES purchase_orders(id),
      purchase_order_item_id UUID REFERENCES purchase_order_items(id),
      reference TEXT,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT now()
    );`,
  );

  // 5. Indexes on product_cost_history
  await runSQL(
    "idx_cost_history_service",
    "CREATE INDEX IF NOT EXISTS idx_cost_history_service ON product_cost_history(service_id, created_at DESC);",
  );
  await runSQL(
    "idx_cost_history_tenant",
    "CREATE INDEX IF NOT EXISTS idx_cost_history_tenant ON product_cost_history(tenant_id, created_at DESC);",
  );

  // 6. Add supplier_id to purchase_orders
  await runSQL(
    "ADD supplier_id to PO",
    "ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id);",
  );
  await runSQL(
    "idx_po_supplier",
    "CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_new ON purchase_orders(supplier_id) WHERE supplier_id IS NOT NULL;",
  );

  // 7. Add average_cost_snapshot to stock_movements
  await runSQL(
    "ADD avg_cost_snapshot",
    "ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS average_cost_snapshot NUMERIC(12,4);",
  );

  // 8. Supplier permissions
  await runSQL(
    "supplier permissions",
    `INSERT INTO permissions (code, display_name, description, category) VALUES
      ('supplier.read',  'Ver Fornecedores',       'Pode visualizar cadastro de fornecedores',      'Compras'),
      ('supplier.write', 'Gerenciar Fornecedores',  'Pode criar e editar cadastro de fornecedores', 'Compras')
    ON CONFLICT (code) DO NOTHING;`,
  );

  // 9. Initialize average_cost from cost_price
  await runSQL(
    "init average_cost",
    "UPDATE services SET average_cost = cost_price WHERE cost_price > 0 AND (average_cost IS NULL OR average_cost = 0);",
  );

  console.log("\nMigration complete!");
})();
