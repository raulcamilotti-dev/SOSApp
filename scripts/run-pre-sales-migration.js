const axios = require("axios");

const API_KEY = process.env.SOS_API_KEY;
if (!API_KEY) {
  console.error("Missing SOS_API_KEY env var");
  process.exit(1);
}
const API = process.env.EXPO_PUBLIC_API_BASE_URL
  ? `${process.env.EXPO_PUBLIC_API_BASE_URL}/api_dinamico`
  : "https://n8n.sosescritura.com.br/webhook/api_dinamico";
const H = {
  headers: {
    "X-Api-Key": API_KEY,
  },
};

const statements = [
  `CREATE TABLE IF NOT EXISTS pre_sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    label TEXT NOT NULL DEFAULT '',
    customer_id UUID REFERENCES customers(id),
    partner_id UUID REFERENCES partners(id),
    opened_by UUID REFERENCES users(id),
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(12,2) DEFAULT 0,
    discount_percent NUMERIC(5,2) DEFAULT 0,
    total NUMERIC(12,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
    closed_at TIMESTAMPTZ,
    closed_by UUID REFERENCES users(id),
    sale_id UUID REFERENCES sales(id),
    notes TEXT,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ
  )`,
  "CREATE INDEX IF NOT EXISTS idx_pre_sales_tenant ON pre_sales(tenant_id)",
  "CREATE INDEX IF NOT EXISTS idx_pre_sales_status ON pre_sales(tenant_id, status)",
  "CREATE INDEX IF NOT EXISTS idx_pre_sales_partner ON pre_sales(tenant_id, partner_id)",
  "CREATE INDEX IF NOT EXISTS idx_pre_sales_open ON pre_sales(tenant_id, status) WHERE status = 'open'",
  `CREATE TABLE IF NOT EXISTS pre_sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pre_sale_id UUID NOT NULL REFERENCES pre_sales(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES services(id),
    item_kind TEXT NOT NULL CHECK (item_kind IN ('product', 'service')),
    description TEXT,
    quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
    unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    cost_price NUMERIC(12,2) DEFAULT 0,
    discount_amount NUMERIC(12,2) DEFAULT 0,
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    notes TEXT,
    added_by UUID REFERENCES users(id),
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,
  "CREATE INDEX IF NOT EXISTS idx_pre_sale_items_pre_sale ON pre_sale_items(pre_sale_id)",
  "CREATE INDEX IF NOT EXISTS idx_pre_sale_items_service ON pre_sale_items(service_id)",
  "INSERT INTO permissions (code, display_name, description, category) VALUES ('presale.read', 'Ver Pré-Vendas', 'Pode visualizar comandas/pré-vendas abertas', 'PDV'), ('presale.write', 'Criar Pré-Vendas', 'Pode abrir comandas e adicionar itens', 'PDV'), ('presale.close', 'Fechar Pré-Vendas', 'Pode fechar comanda e gerar venda no caixa', 'PDV') ON CONFLICT (code) DO NOTHING",
];

async function run() {
  for (let i = 0; i < statements.length; i++) {
    try {
      const r = await axios.post(API, { sql: statements[i] }, H);
      console.log("OK [" + i + "]:", JSON.stringify(r.data).substring(0, 120));
    } catch (e) {
      console.log(
        "ERR [" + i + "]:",
        JSON.stringify(e.response?.data || e.message).substring(0, 300),
      );
    }
  }
  console.log("DONE");
}

run();
