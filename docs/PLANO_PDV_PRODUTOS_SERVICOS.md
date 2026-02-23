# Plano: PDV Unificado — Produtos & Serviços

> **Versão:** 2.0 — 20/02/2026
> **Status:** Planejamento (pré-desenvolvimento)
> **Regra:** Programação só começa após aprovação deste plano.

---

## 1. Contexto & Problema

Hoje os parceiros já vendem **serviços** (agendamento via SolicitarServico.tsx). Mas precisamos que eles também possam vender **produtos** (vacinas, peças, suplementos, etc.). Em muitos negócios, **produtos e serviços são vendidos juntos** na mesma transação:

| Vertical             | Exemplo de Venda Mista                    |
| -------------------- | ----------------------------------------- |
| Clínica Veterinária  | Vacina (produto) + Consulta (serviço)     |
| Mecânica             | Peça (produto) + Mão-de-obra (serviço)    |
| Salão de Beleza      | Shampoo (produto) + Corte (serviço)       |
| Pet Shop             | Ração (produto) + Banho e Tosa (serviço)  |
| Clínica Estética     | Cosmético (produto) + Sessão (serviço)    |
| Farmácia Veterinária | Medicamento (produto) + Aplicação (serv.) |

### Restrições Estratégicas

1. **O marketplace de serviços existente NÃO pode ser impactado** — SolicitarServico, agendamento, workflow engine devem continuar funcionando exatamente como estão.
2. **Segmentação deve existir** — admin precisa distinguir o que é produto vs serviço em catálogos, relatórios, estoque.
3. **PDV unificado** — na hora de vender, um único ponto de venda aceita ambos.
4. **Caminhos pós-venda independentes** — serviço segue workflow/agendamento; produto segue separação/entrega.
5. **Nada hardcoded** — variáveis (unidades, métodos de pagamento, categorias) vêm de tabelas de suporte configuráveis.
6. **Seguir os princípios do SOS** — configuração no banco, não no código; módulo opcional; CrudScreen quando for CRUD.

---

## 2. Diagnóstico: O Que Já Temos

### 2.1 Ativos Reutilizáveis ✅

| Ativo Existente                                         | Aproveitamento                                                                | Impacto                |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------- |
| **`services` table**                                    | Vira catálogo unificado de itens vendáveis (produto, serviço, composição)     | Migração DDL           |
| **`service_types` + `service_categories`**              | Taxonomia pronta — categoriza tanto produtos quanto serviços                  | Zero mudança           |
| **`invoices` + `invoice_items`**                        | Fatura com line items — exatamente o que o PDV gera                           | Adicionar `sale_id` FK |
| **`payments`**                                          | PIX, cartão, boleto, dinheiro, transferência                                  | Zero mudança           |
| **`accounts_receivable`**                               | Cobrança pós-venda — **agora criado automaticamente em toda venda**           | Adicionar `sale_id` FK |
| **`partner_earnings`**                                  | Comissão por venda — já tem `appointment_id` e `service_order_id`             | Adicionar `sale_id` FK |
| **`customers`**                                         | Cadastro de clientes — CPF já é opcional                                      | Zero mudança           |
| **`workflow_templates` + `workflow_steps`**             | Motor de processos — serviço vendido no PDV pode disparar workflow            | Zero mudança           |
| **`service_orders`**                                    | Processos — serviço no PDV cria service_order com workflow                    | Zero mudança           |
| **`service_appointments`**                              | Agendamento — serviço no PDV com scheduling cria appointment                  | Zero mudança           |
| **PIX service** (`services/pix.ts`)                     | QR Code PIX automático no fechamento                                          | Zero mudança           |
| **Receipt generator** (`services/receipt-generator.ts`) | Recibo automático                                                             | Zero mudança           |
| **CrudScreen**                                          | Tela admin qualquer = CrudScreen com field config                             | Zero mudança           |
| **KanbanScreen**                                        | Pipeline de pedidos/separação                                                 | Zero mudança           |
| **Template Packs**                                      | Packs já seedam `services` — expandimos com preço, tipo, etc.                 | Expansão de types      |
| **`usePartnerScope()`**                                 | Parceiro vê só suas vendas                                                    | Zero mudança           |
| **RBAC (roles + permissions)**                          | 41 permissions, 5 presets — expandimos com permissions de PDV/estoque/compras | Novos permissions      |
| **`accounts_payable`**                                  | Contas a pagar — reutilizamos para ordens de compra de produtos               | Zero mudança           |
| **`financial.ts` service**                              | `createAccountReceivable()`, `createInvoice()` já existem                     | Reutilização           |

### 2.2 Gaps Identificados ❌

| Gap                                        | Solução Proposta                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| Sem preço no catálogo                      | Migrate: `sell_price`, `cost_price` na `services`                                    |
| Sem distinção produto/serviço              | Migrate: `item_kind` ('product', 'service')                                          |
| Sem composição (combo)                     | Nova tabela `service_compositions` (pai → N filhos)                                  |
| Sem estoque                                | Migrate: `stock_quantity`, `min_stock`, `track_stock`; nova tabela `stock_movements` |
| Sem entrada de compras                     | Novas tabelas `purchase_orders` + `purchase_order_items`                             |
| Sem carrinho/venda                         | Novas tabelas `sales` + `sale_items`                                                 |
| Sem tela PDV                               | Nova tela `PDV.tsx`                                                                  |
| Sem fulfillment por item                   | `sale_items.fulfillment_status` + workflow de separação/entrega                      |
| Sem tabelas de suporte                     | Novas tabelas `measurement_units`, `discount_rules`                                  |
| Sem delivery/entrega                       | Entrega = `service_type` com workflow template (reutiliza engine existente)          |
| Desconto por tenant (deveria ser por role) | Nova tabela `discount_rules` com FK para `roles`                                     |
| Sem AR automático em vendas                | `createSale()` sempre cria `accounts_receivable`                                     |
| Sem permissions de PDV                     | Novos: `sale.read/write`, `stock.read/write`, `purchase.read/write`, `pdv.access`    |

### 2.3 O Que NÃO Mudamos 🚫

| Ativo                            | Razão                                                          |
| -------------------------------- | -------------------------------------------------------------- |
| **SolicitarServico.tsx**         | Marketplace de agendamento de serviços continua separado       |
| **MeusTrabalhos.tsx**            | Parceiro aceita/executa serviços agendados como hoje           |
| **Kanban de Processos**          | Workflow engine = processos complexos                          |
| **Processo.tsx**                 | Detalhe de `service_orders` continua igual                     |
| **`service_orders` table**       | Motor de processos, NÃO de vendas de balcão                    |
| **`service_appointments` table** | Agendamento continua igual                                     |
| **`workflow_templates/steps`**   | Motor de workflow. PDV **dispara** workflows, não os substitui |

---

## 3. Modelo de Dados Proposto

### 3.1 Tabelas de Suporte (lookup tables — nada hardcoded)

```sql
-- ═══════════════════════════════════════════════════
-- TABELAS DE SUPORTE (configuráveis por tenant)
-- ═══════════════════════════════════════════════════

-- Unidades de medida (configurável)
CREATE TABLE IF NOT EXISTS measurement_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),     -- NULL = unidade global (sistema)
  code TEXT NOT NULL,                         -- 'un', 'hr', 'kg', 'lt', 'm', 'm2', 'pct', 'cx', 'ml', 'g'
  label TEXT NOT NULL,                        -- 'Unidade', 'Hora', 'Quilograma'
  abbreviation TEXT NOT NULL,                 -- 'un', 'hr', 'kg'
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Seed de unidades globais (tenant_id IS NULL)
INSERT INTO measurement_units (tenant_id, code, label, abbreviation, sort_order) VALUES
  (NULL, 'un',  'Unidade',      'un',  1),
  (NULL, 'hr',  'Hora',         'hr',  2),
  (NULL, 'min', 'Minuto',       'min', 3),
  (NULL, 'kg',  'Quilograma',   'kg',  4),
  (NULL, 'g',   'Grama',        'g',   5),
  (NULL, 'lt',  'Litro',        'lt',  6),
  (NULL, 'ml',  'Mililitro',    'ml',  7),
  (NULL, 'm',   'Metro',        'm',   8),
  (NULL, 'm2',  'Metro²',       'm²',  9),
  (NULL, 'pct', 'Pacote',       'pct', 10),
  (NULL, 'cx',  'Caixa',        'cx',  11),
  (NULL, 'par', 'Par',          'par', 12),
  (NULL, 'dose','Dose',         'dose',13),
  (NULL, 'amp', 'Ampola',       'amp', 14),
  (NULL, 'fl',  'Frasco',       'fl',  15)
ON CONFLICT DO NOTHING;

-- Regras de desconto por papel (role) — não por tenant
CREATE TABLE IF NOT EXISTS discount_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  role_id UUID NOT NULL REFERENCES roles(id),
  max_discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,   -- ex: 10.00 = 10%
  max_discount_amount NUMERIC(12,2),                       -- teto absoluto (nullable = sem teto)
  requires_approval_above NUMERIC(5,2),                    -- acima desse %, precisa aprovação de admin
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_discount_rules_unique
  ON discount_rules(tenant_id, role_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE discount_rules IS
  'Regras de desconto por papel. Cada role pode ter um teto de desconto diferente.';
```

### 3.2 Expansão da tabela `services` (catálogo unificado)

```sql
-- ═══════════════════════════════════════════════════
-- EXPANSÃO DO CATÁLOGO (tabela services)
-- ═══════════════════════════════════════════════════

-- Tipo do item: produto ou serviço (combo é composição, não um tipo isolado)
ALTER TABLE services ADD COLUMN IF NOT EXISTS item_kind TEXT DEFAULT 'service'
  CHECK (item_kind IN ('product', 'service'));

ALTER TABLE services ADD COLUMN IF NOT EXISTS description TEXT;

-- Preços
ALTER TABLE services ADD COLUMN IF NOT EXISTS sell_price NUMERIC(12,2) DEFAULT 0;
ALTER TABLE services ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2) DEFAULT 0;

-- Unidade de medida (FK para tabela de suporte)
ALTER TABLE services ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES measurement_units(id);

-- Identificação rápida (PDV)
ALTER TABLE services ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS barcode TEXT;

-- Controle de estoque (só relevante para products)
ALTER TABLE services ADD COLUMN IF NOT EXISTS track_stock BOOLEAN DEFAULT false;
ALTER TABLE services ADD COLUMN IF NOT EXISTS stock_quantity NUMERIC(12,3) DEFAULT 0;
ALTER TABLE services ADD COLUMN IF NOT EXISTS min_stock NUMERIC(12,3) DEFAULT 0;

-- Agendamento (só relevante para services)
ALTER TABLE services ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 60;
ALTER TABLE services ADD COLUMN IF NOT EXISTS requires_scheduling BOOLEAN DEFAULT false;

-- Fulfillment de produto
ALTER TABLE services ADD COLUMN IF NOT EXISTS requires_separation BOOLEAN DEFAULT false;
ALTER TABLE services ADD COLUMN IF NOT EXISTS requires_delivery BOOLEAN DEFAULT false;
ALTER TABLE services ADD COLUMN IF NOT EXISTS delivery_service_type_id UUID REFERENCES service_types(id);

-- Comissão e imposto
ALTER TABLE services ADD COLUMN IF NOT EXISTS commission_percent NUMERIC(5,2) DEFAULT 0;
ALTER TABLE services ADD COLUMN IF NOT EXISTS tax_percent NUMERIC(5,2) DEFAULT 0;

-- Visual / ordenação
ALTER TABLE services ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE services ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Composição (este item é composto de N outros?)
ALTER TABLE services ADD COLUMN IF NOT EXISTS is_composition BOOLEAN DEFAULT false;

-- Índices
CREATE INDEX IF NOT EXISTS idx_services_sku ON services(tenant_id, sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_services_barcode ON services(tenant_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_services_item_kind ON services(tenant_id, item_kind);
CREATE INDEX IF NOT EXISTS idx_services_composition ON services(tenant_id, is_composition) WHERE is_composition = true;

COMMENT ON COLUMN services.item_kind IS 'product = produto físico, service = serviço prestado';
COMMENT ON COLUMN services.is_composition IS 'true = este item é composto de N sub-itens (ver service_compositions)';
COMMENT ON COLUMN services.requires_scheduling IS 'true = exige agendamento (service_appointment) ao vender';
COMMENT ON COLUMN services.requires_separation IS 'true = produto precisa de separação antes da entrega/retirada';
COMMENT ON COLUMN services.requires_delivery IS 'true = produto precisa de entrega (dispara serviço de entrega)';
COMMENT ON COLUMN services.cost_price IS 'Custo de aquisição/produção — usado para DRE de competência e margem';
```

### 3.3 Nova tabela `service_compositions` (composição / combo)

A composição NÃO é um `item_kind`. É um **atributo** — qualquer item pode ser composto de N sub-itens. Ex: "Kit Vacina + Consulta" é um item com `is_composition = true` que contém 1 vacina (product) + 1 consulta (service). Ao vender a composição, o sistema explode nos sub-itens para estoque, workflow e fulfillment.

```sql
CREATE TABLE IF NOT EXISTS service_compositions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  child_service_id UUID NOT NULL REFERENCES services(id),
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_service_compositions_parent ON service_compositions(parent_service_id);
CREATE INDEX idx_service_compositions_child ON service_compositions(child_service_id);

-- Impedir composição circular (A contém A)
ALTER TABLE service_compositions
  ADD CONSTRAINT chk_no_self_composition
  CHECK (parent_service_id != child_service_id);

COMMENT ON TABLE service_compositions IS
  'Composição de itens: um item pai (is_composition=true) contém N sub-itens.
   Ao vender, o sistema explode nos sub-itens para estoque e fulfillment.
   O preço da composição pode ser diferente da soma dos sub-itens (desconto de kit).';
```

**Exemplo prático:**

| Parent (is_composition=true) | Child                | Qty | Efeito na venda                         |
| ---------------------------- | -------------------- | --- | --------------------------------------- |
| Kit Vacina + Consulta        | Vacina Antirrábica   | 1   | Desconta estoque, segue path de produto |
| Kit Vacina + Consulta        | Consulta Veterinária | 1   | Agenda, segue path de serviço           |
| Revisão Completa (carro)     | Filtro de Óleo       | 1   | Desconta estoque                        |
| Revisão Completa (carro)     | Óleo 5W30            | 4   | Desconta 4 litros do estoque            |
| Revisão Completa (carro)     | Mão-de-obra Revisão  | 1   | Agenda parceiro, workflow               |

### 3.4 Nova tabela `sales` (venda/transação PDV)

```sql
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),

  -- Quem comprou (SEMPRE criado — mesmo "anônima" cria customer)
  customer_id UUID NOT NULL REFERENCES customers(id),

  -- Quem vendeu
  partner_id UUID REFERENCES partners(id),
  sold_by_user_id UUID REFERENCES users(id),

  -- Totais
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  discount_percent NUMERIC(5,2) DEFAULT 0,
  tax_amount NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Status da venda
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'completed', 'cancelled', 'refunded', 'partial_refund')),

  -- Links financeiros (gerados automaticamente)
  invoice_id UUID REFERENCES invoices(id),

  -- Pagamento
  payment_method TEXT,   -- método principal (ou 'mixed' se split)
  paid_at TIMESTAMPTZ,

  -- Fulfillment global (derivado dos sale_items)
  has_pending_services BOOLEAN DEFAULT false,    -- algum item de serviço ainda não agendado/executado?
  has_pending_products BOOLEAN DEFAULT false,    -- algum item de produto ainda não separado/entregue?

  -- Desconto (rastreabilidade)
  discount_approved_by UUID REFERENCES users(id), -- quem autorizou se acima do limite do role

  -- Metadata
  notes TEXT,
  config JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_sales_tenant ON sales(tenant_id);
CREATE INDEX idx_sales_customer ON sales(tenant_id, customer_id);
CREATE INDEX idx_sales_partner ON sales(tenant_id, partner_id);
CREATE INDEX idx_sales_status ON sales(tenant_id, status);
CREATE INDEX idx_sales_date ON sales(tenant_id, created_at DESC);
CREATE INDEX idx_sales_pending_services ON sales(tenant_id) WHERE has_pending_services = true;
CREATE INDEX idx_sales_pending_products ON sales(tenant_id) WHERE has_pending_products = true;
```

### 3.5 Nova tabela `sale_items` (itens da venda)

Cada item segue seu **caminho independente** pós-venda: serviço → workflow/scheduling, produto → separação/entrega.

```sql
CREATE TABLE IF NOT EXISTS sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id),

  -- Dados do item no momento da venda (snapshot)
  item_kind TEXT NOT NULL CHECK (item_kind IN ('product', 'service')),
  description TEXT,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  unit_id UUID REFERENCES measurement_units(id),
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_price NUMERIC(12,2) DEFAULT 0,        -- snapshot do custo no momento da venda (para DRE)
  discount_amount NUMERIC(12,2) DEFAULT 0,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Comissão do parceiro
  commission_percent NUMERIC(5,2) DEFAULT 0,
  commission_amount NUMERIC(12,2) DEFAULT 0,

  -- ═══ FULFILLMENT (caminho pós-venda por item) ═══

  -- Para SERVIÇOS: link ao workflow + agendamento
  service_order_id UUID REFERENCES service_orders(id),       -- se disparou workflow
  appointment_id UUID REFERENCES service_appointments(id),   -- se agendou

  -- Para PRODUTOS: separação e entrega
  separation_status TEXT DEFAULT 'not_required'
    CHECK (separation_status IN ('not_required', 'pending', 'in_progress', 'ready', 'delivered', 'cancelled')),
  separated_by_user_id UUID REFERENCES users(id),
  separated_at TIMESTAMPTZ,

  delivery_status TEXT DEFAULT 'not_required'
    CHECK (delivery_status IN ('not_required', 'pending', 'in_transit', 'delivered', 'failed', 'cancelled')),
  delivery_service_order_id UUID REFERENCES service_orders(id),  -- se disparou workflow de entrega
  delivered_at TIMESTAMPTZ,

  -- Status unificado do item
  fulfillment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (fulfillment_status IN ('pending', 'in_progress', 'completed', 'cancelled')),

  -- Composição: se veio da explosão de uma composição
  parent_sale_item_id UUID REFERENCES sale_items(id),   -- se este item veio de uma composição
  is_composition_parent BOOLEAN DEFAULT false,           -- se é o "item pai" da composição (para display)

  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_sale_items_service ON sale_items(service_id);
CREATE INDEX idx_sale_items_so ON sale_items(service_order_id) WHERE service_order_id IS NOT NULL;
CREATE INDEX idx_sale_items_appointment ON sale_items(appointment_id) WHERE appointment_id IS NOT NULL;
CREATE INDEX idx_sale_items_separation ON sale_items(separation_status)
  WHERE separation_status NOT IN ('not_required', 'delivered', 'cancelled');
CREATE INDEX idx_sale_items_delivery ON sale_items(delivery_status)
  WHERE delivery_status NOT IN ('not_required', 'delivered', 'cancelled');
CREATE INDEX idx_sale_items_fulfillment ON sale_items(fulfillment_status)
  WHERE fulfillment_status NOT IN ('completed', 'cancelled');

COMMENT ON COLUMN sale_items.cost_price IS
  'Snapshot do custo de aquisição no momento da venda. Essencial para DRE de competência.';
COMMENT ON COLUMN sale_items.parent_sale_item_id IS
  'Quando um item composição é vendido, explode em N sale_items filhos. Este campo liga ao pai.';
```

### 3.6 Nova tabela `stock_movements` (rastreabilidade de estoque)

Toda movimentação de estoque é registrada — vendas, compras, ajustes, estornos.

```sql
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  service_id UUID NOT NULL REFERENCES services(id),   -- qual produto

  movement_type TEXT NOT NULL
    CHECK (movement_type IN ('sale', 'purchase', 'adjustment', 'return', 'transfer', 'separation', 'correction')),

  quantity NUMERIC(12,3) NOT NULL,           -- positivo = entrada, negativo = saída
  previous_quantity NUMERIC(12,3) NOT NULL,  -- estoque antes do movimento
  new_quantity NUMERIC(12,3) NOT NULL,       -- estoque após o movimento

  unit_cost NUMERIC(12,2),                   -- custo unitário (para compras)

  -- Links (qual transação gerou este movimento)
  sale_id UUID REFERENCES sales(id),
  sale_item_id UUID REFERENCES sale_items(id),
  purchase_order_id UUID,    -- FK adicionada após criar purchase_orders
  purchase_order_item_id UUID,

  reason TEXT,                               -- motivo (para ajustes manuais)
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_stock_movements_service ON stock_movements(service_id, created_at DESC);
CREATE INDEX idx_stock_movements_tenant ON stock_movements(tenant_id, created_at DESC);
CREATE INDEX idx_stock_movements_type ON stock_movements(tenant_id, movement_type);
CREATE INDEX idx_stock_movements_sale ON stock_movements(sale_id) WHERE sale_id IS NOT NULL;
CREATE INDEX idx_stock_movements_po ON stock_movements(purchase_order_id) WHERE purchase_order_id IS NOT NULL;

COMMENT ON TABLE stock_movements IS
  'Toda movimentação de estoque é rastreada aqui. Usado para histórico, auditoria e DRE.';
```

### 3.7 Novas tabelas `purchase_orders` + `purchase_order_items` (entrada de compras)

O módulo de compras permite ao tenant registrar a entrada de mercadoria, com custo unitário no momento da compra. Ao confirmar o recebimento, o estoque é incrementado automaticamente via `stock_movements`.

```sql
-- ═══════════════════════════════════════════════════
-- ORDENS DE COMPRA (entrada de mercadoria)
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),

  -- Fornecedor (pode ser parceiro existente ou dados avulsos)
  supplier_partner_id UUID REFERENCES partners(id),
  supplier_name TEXT,                            -- fallback se não for parceiro cadastrado
  supplier_document TEXT,                        -- CNPJ/CPF do fornecedor

  -- Documento fiscal
  invoice_number TEXT,                           -- NF do fornecedor
  invoice_date DATE,

  -- Totais
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  shipping_cost NUMERIC(12,2) DEFAULT 0,
  tax_amount NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Status do pedido de compra
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ordered', 'partial_received', 'received', 'cancelled')),

  ordered_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  received_by UUID REFERENCES users(id),
  created_by UUID REFERENCES users(id),

  notes TEXT,
  config JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_purchase_orders_tenant ON purchase_orders(tenant_id);
CREATE INDEX idx_purchase_orders_status ON purchase_orders(tenant_id, status);
CREATE INDEX idx_purchase_orders_supplier ON purchase_orders(supplier_partner_id)
  WHERE supplier_partner_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id),     -- produto do catálogo

  description TEXT,
  quantity_ordered NUMERIC(12,3) NOT NULL DEFAULT 0,
  quantity_received NUMERIC(12,3) NOT NULL DEFAULT 0,    -- pode receber parcial
  unit_id UUID REFERENCES measurement_units(id),
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,            -- custo unitário de compra
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Se este custo deve atualizar o cost_price do produto
  update_cost_price BOOLEAN DEFAULT true,

  received_at TIMESTAMPTZ,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_po_items_po ON purchase_order_items(purchase_order_id);
CREATE INDEX idx_po_items_service ON purchase_order_items(service_id);

-- FK's de stock_movements para purchase_orders (agora que a tabela existe)
ALTER TABLE stock_movements
  ADD CONSTRAINT fk_stock_movements_po
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id);
ALTER TABLE stock_movements
  ADD CONSTRAINT fk_stock_movements_poi
  FOREIGN KEY (purchase_order_item_id) REFERENCES purchase_order_items(id);

COMMENT ON TABLE purchase_orders IS
  'Ordens de compra de mercadoria. Ao confirmar recebimento, estoque é incrementado
   automaticamente e cost_price pode ser atualizado.';
COMMENT ON COLUMN purchase_order_items.update_cost_price IS
  'Se true, ao confirmar recebimento o cost_price do produto é atualizado com este unit_cost
   (último custo de compra).';
```

### 3.8 Expansões em tabelas existentes

```sql
-- ═══════════════════════════════════════════════════
-- FK's NOVAS EM TABELAS EXISTENTES
-- ═══════════════════════════════════════════════════

-- partner_earnings: vincular a vendas
ALTER TABLE partner_earnings ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES sales(id);
CREATE INDEX IF NOT EXISTS idx_partner_earnings_sale ON partner_earnings(sale_id);

-- invoices: vincular a vendas
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES sales(id);
CREATE INDEX IF NOT EXISTS idx_invoices_sale ON invoices(sale_id) WHERE sale_id IS NOT NULL;

-- accounts_receivable: vincular a vendas
ALTER TABLE accounts_receivable ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES sales(id);
CREATE INDEX IF NOT EXISTS idx_ar_sale ON accounts_receivable(sale_id) WHERE sale_id IS NOT NULL;

-- customers: nível de identificação
ALTER TABLE customers ADD COLUMN IF NOT EXISTS identification_level TEXT DEFAULT 'full'
  CHECK (identification_level IN ('full', 'partial', 'anonymous'));

COMMENT ON COLUMN customers.identification_level IS
  'full = CPF+nome, partial = só nome, anonymous = gerado automaticamente no PDV';
```

### 3.9 Novas Permissions (RBAC)

```sql
-- Permissions para PDV, Estoque e Compras
INSERT INTO permissions (code, display_name, description, category) VALUES
  ('pdv.access',       'Acessar PDV',            'Pode abrir e operar o Ponto de Venda',        'PDV'),
  ('sale.read',        'Ver Vendas',             'Pode visualizar vendas realizadas',            'PDV'),
  ('sale.write',       'Criar/Editar Vendas',    'Pode realizar vendas e editar vendas abertas', 'PDV'),
  ('sale.cancel',      'Cancelar Vendas',        'Pode cancelar ou estornar vendas',             'PDV'),
  ('sale.refund',      'Estornar Vendas',        'Pode fazer estorno total ou parcial',          'PDV'),
  ('stock.read',       'Ver Estoque',            'Pode visualizar posição de estoque',           'Estoque'),
  ('stock.write',      'Ajustar Estoque',        'Pode fazer ajustes manuais de estoque',        'Estoque'),
  ('purchase.read',    'Ver Compras',            'Pode visualizar ordens de compra',             'Compras'),
  ('purchase.write',   'Criar/Editar Compras',   'Pode criar e gerenciar ordens de compra',      'Compras'),
  ('purchase.receive', 'Receber Mercadoria',     'Pode confirmar recebimento de compras',        'Compras'),
  ('discount.approve', 'Aprovar Descontos',      'Pode aprovar descontos acima do limite do role','PDV')
ON CONFLICT (code) DO NOTHING;
```

---

## 4. Segmentação: Produto vs Serviço vs Composição

### 4.1 Modelo de segmentação

| Conceito       | Implementação                                  | Exemplo                               |
| -------------- | ---------------------------------------------- | ------------------------------------- |
| **Produto**    | `item_kind = 'product'`                        | Vacina, Peça, Shampoo                 |
| **Serviço**    | `item_kind = 'service'`                        | Consulta, Corte, Mão-de-obra          |
| **Composição** | qualquer `item_kind` + `is_composition = true` | Kit Vacina+Consulta, Revisão Completa |

**Composição NÃO é um `item_kind` separado.** É um atributo transversal. Um produto pode ser composição (kit de peças). Um serviço pode ser composição (pacote de sessões). A composição mais interessante é mista: 1 produto + 1 serviço = vende junto com preço de kit.

### 4.2 Comportamento por tipo

| Aspecto         | Produto                               | Serviço                                  | Composição                         |
| --------------- | ------------------------------------- | ---------------------------------------- | ---------------------------------- |
| Estoque         | ✅ `track_stock`                      | ❌                                       | Explode nos filhos para estoque    |
| Preço           | `sell_price`                          | `sell_price`                             | Preço próprio (pode ≠ soma filhos) |
| Custo           | `cost_price` (atualizado por compras) | `cost_price` (manual ou por hora)        | Soma dos custos dos filhos         |
| Agendamento     | ❌                                    | ✅ se `requires_scheduling`              | Filhos de serviço agendam          |
| Workflow        | ❌ (mas pode ter separação/entrega)   | ✅ se `service_type.default_template_id` | Filhos de serviço seguem workflow  |
| Separação       | ✅ se `requires_separation`           | ❌                                       | Filhos de produto separam          |
| Entrega         | ✅ se `requires_delivery`             | ❌                                       | Filhos de produto entregam         |
| DRE Competência | sell_price − cost_price por venda     | sell_price − cost_price por venda        | Explode nos filhos para DRE        |

### 4.3 Onde a segmentação aparece

| Local                              | Comportamento                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| **Admin > Catálogo**               | CrudScreen com abas: [Todos] [Produtos] [Serviços] [Composições]                      |
| **PDV**                            | Busca unificada, badge 📦 vs 🔧, composição mostra "(Kit)" no nome                    |
| **Relatórios / DRE**               | Receita e custo por `item_kind`, margem por produto, receita por serviço              |
| **Estoque**                        | Só itens com `track_stock = true` e `item_kind = 'product'`                           |
| **Compras**                        | Só itens com `item_kind = 'product'`                                                  |
| **SolicitarServico (marketplace)** | Filtra `item_kind = 'service' AND requires_scheduling = true` — produtos NÃO aparecem |
| **Template Packs**                 | Cada item declara `item_kind` + opcionalmente `compositions`                          |

---

## 5. Fluxos de Uso

### 5.1 Venda no PDV — Caminhos Pós-Venda Independentes

O ponto central: cada item vendido segue seu **próprio caminho** de fulfillment.

```
PARCEIRO/OPERADOR ABRE O PDV
│
├─ 🔍 Busca/escaneia itens (nome, SKU, barcode)
│   ├─ Vacina Antirrábica (product) → add carrinho
│   ├─ Consulta Veterinária (service, requires_scheduling) → add carrinho
│   └─ Kit Revisão (composição) → add carrinho (explode em sub-itens na conclusão)
│
├─ 👤 Identifica cliente:
│   ├─ CPF → busca customer existente (ou cria novo com CPF, identification_level='full')
│   ├─ Só nome → cria customer com nome (identification_level='partial')
│   └─ Nenhum → cria customer "Consumidor #12345" (identification_level='anonymous')
│   (SEMPRE cria customer — não existe venda sem customer_id)
│
├─ 💰 Resumo do carrinho + desconto:
│   ├─ Desconto limitado pelo ROLE do operador (via discount_rules)
│   ├─ Se desconto > max do role → solicita aprovação de admin (discount.approve)
│   └─ Desconto aprovado registrado em discount_approved_by
│
├─ 💳 Pagamento:
│   ├─ PIX (QR automático via pix.ts)
│   ├─ Cartão Crédito/Débito
│   ├─ Dinheiro (com troco calculado)
│   ├─ Misto (N métodos, N payments)
│   └─ A prazo (gera accounts_receivable como "pendente")
│
└─ ✅ VENDA CONCLUÍDA — dispara caminhos paralelos:
    │
    ├─ 📊 FINANCEIRO (sempre, automático):
    │   ├─ Cria `sales` + `sale_items`
    │   ├─ Cria `invoices` + `invoice_items` (espelho da venda)
    │   ├─ Cria `accounts_receivable` (status=paid se pagou, status=pending se a prazo)
    │   ├─ Cria `payments` (1 por método de pagamento)
    │   ├─ Cria `partner_earnings` (comissão calculada por item)
    │   └─ Gera recibo (receipt-generator.ts)
    │
    ├─ 🔧 CAMINHO SERVIÇO (para cada sale_item com item_kind='service'):
    │   ├─ Se requires_scheduling → abre seleção de horário do parceiro
    │   │   └─ Cria service_appointment (mesmo fluxo do SolicitarServico)
    │   ├─ Se service_type tem default_template_id → cria service_order
    │   │   └─ Serviço entra no Kanban de Processos com workflow completo
    │   ├─ sale_item.fulfillment_status = 'in_progress'
    │   └─ Ao completar execução → fulfillment_status = 'completed'
    │
    ├─ 📦 CAMINHO PRODUTO (para cada sale_item com item_kind='product'):
    │   ├─ Desconta estoque (cria stock_movement type='sale')
    │   ├─ Se requires_separation:
    │   │   ├─ sale_item.separation_status = 'pending'
    │   │   ├─ Aparece na tela de Separação (Kanban ou CrudScreen)
    │   │   └─ Operador marca como "pronto" → separation_status = 'ready'
    │   ├─ Se requires_delivery:
    │   │   ├─ sale_item.delivery_status = 'pending'
    │   │   ├─ Dispara service_order de entrega (workflow_template de entrega)
    │   │   └─ Entregador marca como entregue → delivery_status = 'delivered'
    │   ├─ Se NÃO requires_separation NEM requires_delivery:
    │   │   └─ sale_item.fulfillment_status = 'completed' (entrega imediata no balcão)
    │   └─ Quando separation=ready + delivery=delivered (ou não required):
    │       └─ fulfillment_status = 'completed'
    │
    └─ 🎁 CAMINHO COMPOSIÇÃO (para sale_item com is_composition_parent=true):
        └─ O sistema já explodiu em sub-items no momento da venda.
           Cada sub-item segue seu próprio caminho (serviço ou produto acima).
           O item pai (composition_parent) fica com fulfillment='pending'
           até TODOS os filhos estarem 'completed'.
```

### 5.2 Entrada de Compras (reposição de estoque)

```
ADMIN/COMPRADOR ABRE "COMPRAS"
│
├─ Cria purchase_order (fornecedor, NF, data)
│
├─ Adiciona itens (só item_kind='product'):
│   ├─ Filtro de Óleo  — 50 un × R$ 12,00 = R$ 600,00
│   ├─ Óleo 5W30       — 100 lt × R$ 8,50 = R$ 850,00
│   └─ Pastilha Freio  — 30 un × R$ 45,00 = R$ 1.350,00
│
├─ Status: draft → ordered (pedido enviado ao fornecedor)
│
├─ RECEBIMENTO (parcial ou total):
│   ├─ Operador confere quantidades recebidas
│   ├─ Marca quantity_received por item
│   ├─ Se update_cost_price = true → atualiza services.cost_price com unit_cost
│   └─ Auto: cria stock_movement type='purchase' para cada item
│       └─ Incrementa services.stock_quantity
│
├─ Status: ordered → partial_received → received
│
└─ FINANCEIRO:
    └─ Pode gerar accounts_payable para o fornecedor (se compra a prazo)
```

### 5.3 Venda via Marketplace de Serviços (fluxo existente — NÃO MUDA)

```
CLIENTE ABRE SOLICITAR SERVIÇO (como hoje, intocado)
│
├─ Seleciona serviço → seleciona parceiro → seleciona horário → confirma
│  └─ Cria service_appointment
│
├─ PARCEIRO: aceita → executa (start/finish)
│
└─ NOVO (automação pós-execução, opcional):
   └─ Ao finalizar execução, PODE criar `sale` automaticamente
      └─ Gera invoice + payment + accounts_receivable + partner_earnings
```

### 5.4 Entrega como Serviço (reutiliza workflow engine)

A entrega NÃO é um sistema separado — ela reutiliza a **workflow engine** existente:

1. Admin cria um `service_type` chamado "Entrega" com `default_template_id` → um `workflow_template` de entrega
2. O workflow de entrega tem passos como: "Coleta" → "Em Trânsito" → "Entregue"
3. Quando um `sale_item` de produto com `requires_delivery = true` é vendido:
   - O sistema cria um `service_order` do tipo "Entrega" com o workflow
   - Liga `sale_item.delivery_service_order_id` → esse service_order
   - O processo de entrega aparece no **Kanban de Processos** como qualquer outro
4. Quando o último passo do workflow é completado → `delivery_status = 'delivered'`

**Resultado: zero código novo para delivery — só configuração de workflow template.**

---

## 6. Identificação do Cliente na Venda

| Cenário                | Dados fornecidos | O que acontece                                                                  |
| ---------------------- | ---------------- | ------------------------------------------------------------------------------- |
| **Venda Identificada** | CPF + Nome       | Busca customer por CPF. Se não existe, cria com CPF + nome. Level = `full`      |
| **Venda Semi-ID**      | Só Nome          | Cria customer com nome, sem CPF. Pode ser enriquecido depois. Level = `partial` |
| **Venda Não-ID**       | Nada             | Cria customer "Consumidor #SEQ" (sequencial do dia). Level = `anonymous`        |

**Regra:** `sales.customer_id` é NOT NULL — toda venda TEM um customer. O que muda é o nível de identificação.

Customers `anonymous` e `partial` podem ser **enriquecidos** depois (admin adiciona CPF/email e muda de level). Isso permite que o tenant mantenha histórico de compras mesmo de clientes não identificados.

---

## 7. Desconto Máximo por Role (não por tenant)

### 7.1 Como funciona

```
Operador tenta dar 15% de desconto
│
├─ Consulta discount_rules WHERE role_id = <role do operador>
│   └─ max_discount_percent = 10%, requires_approval_above = 10%
│
├─ 15% > 10% → BLOQUEADO no operador
│   ├─ Opção 1: reduzir para 10% (máximo do role)
│   └─ Opção 2: solicitar aprovação
│
├─ SOLICITAR APROVAÇÃO:
│   ├─ Admin/gerente com permission 'discount.approve' insere senha/PIN no PDV
│   ├─ Sistema valida que o aprovador tem role com max_discount_percent >= 15%
│   ├─ discount_approved_by = aprovador.user_id → desconto liberado
│   └─ Rastreabilidade total: quem vendeu + quem aprovou + quanto
│
└─ Se não houver discount_rules para o role → desconto = 0 (sem desconto)
```

### 7.2 Configuração (CrudScreen)

```
Admin > Regras de Desconto
│
├─ Role: Operador     → Max: 10%  | Aprovação acima de: 10%
├─ Role: Gerente      → Max: 25%  | Aprovação acima de: 25%
├─ Role: Admin        → Max: 50%  | Sem teto
└─ Role: Parceiro Op. → Max: 5%   | Aprovação acima de: 5%
```

---

## 8. Módulo Opcional: Granularidade

O PDV não é um módulo monolítico — o tenant ativa **combinações**:

| Módulo Key  | Label               | O que habilita                                                |
| ----------- | ------------------- | ------------------------------------------------------------- |
| `pdv`       | Ponto de Venda      | Tela PDV, Vendas, Relatórios de venda                         |
| `products`  | Gestão de Produtos  | Catálogo com `item_kind='product'`, campos de estoque e custo |
| `stock`     | Controle de Estoque | Tela de estoque, stock_movements, alertas estoque baixo       |
| `purchases` | Entrada de Compras  | Tela de compras, purchase_orders, recebimento com estoque     |
| `delivery`  | Entrega             | Workflow de entrega, rastreamento por sale_item               |

**Combinações comuns:**

| Perfil do Tenant                | Módulos Ativos                                          |
| ------------------------------- | ------------------------------------------------------- |
| Só vende serviços (marketplace) | Nenhum novo (SolicitarServico funciona sem PDV)         |
| Vende serviços no balcão        | `pdv`                                                   |
| Vende produtos no balcão        | `pdv` + `products` + `stock`                            |
| Vende ambos no balcão           | `pdv` + `products` + `stock`                            |
| Loja com estoque + fornecedores | `pdv` + `products` + `stock` + `purchases`              |
| Loja com entrega                | `pdv` + `products` + `stock` + `delivery`               |
| Operação completa               | `pdv` + `products` + `stock` + `purchases` + `delivery` |

---

## 9. Telas Novas vs Reaproveitadas

### 9.1 Telas Novas (a criar)

| Tela                   | Path                                     | Tipo         | Módulo      | Descrição                                                            |
| ---------------------- | ---------------------------------------- | ------------ | ----------- | -------------------------------------------------------------------- |
| **PDV**                | `Servicos/PDV.tsx`                       | Custom       | `pdv`       | Busca, carrinho, id cliente, desconto, pagamento, caminhos paralelos |
| **Minhas Vendas**      | `Servicos/MinhasVendas.tsx`              | CrudScreen   | `pdv`       | Parceiro vê suas vendas (partner-scoped)                             |
| **Vendas Admin**       | `Administrador/Vendas.tsx`               | CrudScreen   | `pdv`       | Admin vê todas vendas, filtros por período/parceiro/status           |
| **Estoque**            | `Administrador/Estoque.tsx`              | CrudScreen   | `stock`     | Posição de estoque atual + alertas de mínimo                         |
| **Movimentações**      | `Administrador/MovimentacoesEstoque.tsx` | CrudScreen   | `stock`     | Histórico de stock_movements (read-only)                             |
| **Compras**            | `Administrador/Compras.tsx`              | CrudScreen   | `purchases` | Ordens de compra — CRUD + recebimento com incremento de estoque      |
| **Separação**          | `Administrador/Separacao.tsx`            | KanbanScreen | `pdv`       | Kanban de itens pendentes de separação (pending→in_progress→ready)   |
| **Regras de Desconto** | `Administrador/RegrasDesconto.tsx`       | CrudScreen   | `pdv`       | Regras de desconto por role                                          |
| **Composições**        | `Administrador/Composicoes.tsx`          | CrudScreen   | `pdv`       | Gerenciar composições (item pai + filhos)                            |

### 9.2 Telas Existentes Adaptadas (mínimo impacto)

| Tela                                    | Adaptação                                                             |
| --------------------------------------- | --------------------------------------------------------------------- |
| `Administrador/services.tsx`            | Novos campos (preço, custo, estoque, tipo, composição). Abas por tipo |
| `Servicos/servicos.tsx`                 | Links "PDV", "Minhas Vendas" no menu (se módulo ativo)                |
| `Servicos/MeusTrabalhos.tsx`            | Botão "Gerar Venda" ao finalizar execução (opcional)                  |
| `Administrador/DashboardFinanceiro.tsx` | Métricas de vendas PDV + DRE competência                              |
| `Administrador/GanhosParceiros.tsx`     | Comissões de sales                                                    |
| `core/auth/permissions.ts`              | Novos 11 permissions + atualizar presets                              |

### 9.3 Telas NÃO Tocadas 🚫

| Tela                               | Razão                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------- |
| `SolicitarServico.tsx`             | Marketplace de serviços agendáveis — fluxo completamente separado         |
| `MeusServicos.tsx`                 | Service orders/appointments do cliente                                    |
| `Processo.tsx`                     | Detalhe de service_orders                                                 |
| `kanban-processos.tsx`             | Workflow engine (mas agora TAMBÉM mostra processos disparados por vendas) |
| `crm-kanban.tsx` / `crm-leads.tsx` | Pipeline CRM                                                              |
| `Faturas.tsx`                      | Admin de faturas (PDV cria automaticamente)                               |
| `ContasAReceber.tsx`               | Admin de AR (PDV cria automaticamente)                                    |
| `ContasAPagar.tsx`                 | Admin de AP (Compras pode criar automaticamente)                          |

---

## 10. Serviços (service layer)

### 10.1 Novo: `services/sales.ts`

```typescript
// ═══ CRIAÇÃO DE VENDA ═══
createSale(params: {
  tenantId: string;
  partnerId?: string;
  soldByUserId: string;
  customer: { id?: string; cpf?: string; name?: string };  // resolve ou cria
  items: SaleItemInput[];
  discount?: { percent?: number; amount?: number; approvedBy?: string };
  paymentMethod: string | PaymentSplit[];
  notes?: string;
}) → Promise<{ sale, invoice, ar, payments, earnings, pendingScheduling }>
  // 1. Resolve/cria customer (busca por CPF, ou cria com nome, ou gera anônimo)
  // 2. Valida desconto vs discount_rules do role do operador
  // 3. Cria sales row
  // 4. Para cada item:
  //    - Se composição: explode em sub-items (service_compositions)
  //    - Cria sale_item com snapshot de cost_price, unit_price
  //    - Se product + track_stock: valida estoque, cria stock_movement
  //    - Se service + requires_scheduling: marca fulfillment='pending'
  //    - Se service + service_type.default_template_id: cria service_order com workflow
  //    - Se product + requires_separation: separation_status = 'pending'
  //    - Se product + requires_delivery: delivery_status = 'pending', cria SO de entrega
  //    - Calcula comissão: commission_amount = subtotal * commission_percent / 100
  // 5. Cria invoice + invoice_items (espelho da venda)
  // 6. Cria accounts_receivable (status=paid se pagou, status=pending se a prazo)
  // 7. Cria payments (1 por método; se mixed, N payments)
  // 8. Cria partner_earnings (total da comissão)
  // 9. Gera recibo
  // 10. Retorna lista de sale_items que precisam de agendamento

// ═══ PÓS-VENDA ═══
scheduleServiceItem(saleItemId, appointmentData)
  → Cria service_appointment, atualiza sale_item.appointment_id

markSeparationReady(saleItemId, userId)
  → separation_status = 'ready', verifica fulfillment completo

markDelivered(saleItemId, userId)
  → delivery_status = 'delivered', verifica fulfillment completo

updateSaleFulfillment(saleId)
  → Recalcula has_pending_services, has_pending_products, fulfillment de composições

// ═══ CANCELAMENTO ═══
cancelSale(saleId, reason?, userId?)
  → status='cancelled', estorna estoque, cancela invoice, cancela AR

refundSale(saleId, reason?, userId?)
  → status='refunded', estorna estoque, cria payment de estorno

// ═══ CONSULTAS ═══
getSalesByPartner(tenantId, partnerId, dateRange?)
getSalesByCustomer(tenantId, customerId, dateRange?)
getSaleSummary(tenantId, dateRange?)  // aggregates
getPendingSeparation(tenantId)        // items aguardando separação
getPendingDelivery(tenantId)          // items aguardando entrega
```

### 10.2 Novo: `services/stock.ts`

```typescript
// ═══ MOVIMENTAÇÃO ═══
recordStockMovement(params: {
  tenantId, serviceId, movementType, quantity,
  saleId?, purchaseOrderId?, reason?, userId?
}) → stock_movements row + atualiza services.stock_quantity

// ═══ CONSULTAS ═══
getStockPosition(tenantId)                // posição atual de todos os produtos
getLowStockAlerts(tenantId)               // stock_quantity <= min_stock
getStockMovements(serviceId, dateRange?)  // histórico de movimentações
getStockValuation(tenantId)               // valor total do estoque (qty × cost_price)

// ═══ AJUSTE MANUAL ═══
adjustStock(serviceId, quantity, reason, userId)  // type='adjustment'
  → Cria stock_movement, atualiza services.stock_quantity
```

### 10.3 Novo: `services/purchases.ts`

```typescript
// ═══ ORDENS DE COMPRA ═══
createPurchaseOrder(tenantId, supplierData, items[])
updatePurchaseOrder(poId, changes)

// ═══ RECEBIMENTO ═══
receivePurchaseOrder(poId, receivedItems: { itemId, quantityReceived }[], userId)
  → Para cada item:
  //  1. Atualiza purchase_order_items.quantity_received
  //  2. Se update_cost_price → atualiza services.cost_price
  //  3. Cria stock_movement type='purchase' (positivo)
  //  4. Incrementa services.stock_quantity
  → Atualiza purchase_order.status (partial_received ou received)
  → Pode gerar accounts_payable para o fornecedor

// ═══ CONSULTAS ═══
getPendingOrders(tenantId)
getOrdersBySupplier(tenantId, supplierId)
```

### 10.4 Novo: `services/compositions.ts`

```typescript
// ═══ GERENCIAR COMPOSIÇÕES ═══
setComposition(parentServiceId, children: { serviceId, quantity }[])
  → Deleta compositions antigos, cria novos
  → Marca services.is_composition = true no pai

getComposition(parentServiceId)
  → Lista filhos com nome, preço, tipo

explodeComposition(parentServiceId, saleQuantity)
  → Retorna lista de { serviceId, quantity, item_kind, sell_price, cost_price }
  → Usado pelo createSale() para criar sale_items filhos
```

### 10.5 Expandir: Template Packs

```typescript
// data/template-packs/types.ts — expandir PackService:
export interface PackService {
  name: string;
  type_ref: string;
  config?: Record<string, unknown>;
  is_active: boolean;
  // NOVAS:
  item_kind?: "product" | "service"; // default: 'service'
  sell_price?: number;
  cost_price?: number;
  unit_code?: string; // ref para measurement_units.code
  duration_minutes?: number;
  requires_scheduling?: boolean;
  requires_separation?: boolean;
  requires_delivery?: boolean;
  commission_percent?: number;
  description?: string;
  sku?: string;
  track_stock?: boolean;
  stock_quantity?: number;
  min_stock?: number;
  is_composition?: boolean;
  compositions?: { child_ref: string; quantity: number }[];
}
```

---

## 11. Regras de Negócio

| #   | Regra                                                                  | Implementação                                                            |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | Toda venda cria customer (nunca NULL)                                  | Resolve por CPF, cria por nome, ou gera anônimo                          |
| 2   | Toda venda cria accounts_receivable                                    | status=paid se pagou; status=pending se a prazo                          |
| 3   | Toda venda cria invoice + invoice_items                                | Espelho exato dos sale_items                                             |
| 4   | Produto com estoque 0 e track_stock=true → bloqueado                   | Validação em createSale()                                                |
| 5   | Desconto máximo é por ROLE, não por tenant                             | Tabela discount_rules por role_id                                        |
| 6   | Desconto acima do max → requer aprovação (discount.approve)            | Aprovador insere credencial no PDV                                       |
| 7   | Composição é explodida em sub-items na venda                           | Cada sub-item segue seu caminho independente                             |
| 8   | Serviço vendido no PDV → segue workflow normal                         | Cria service_order se template_id, cria appointment se scheduling        |
| 9   | Produto vendido → desconta estoque + pode separar/entregar             | stock_movement + separation/delivery status por sale_item                |
| 10  | Entrega = workflow template (reutiliza engine existente)               | service_order de entrega, aparece no kanban                              |
| 11  | Compra recebida → incrementa estoque + atualiza cost_price             | stock_movement type='purchase'                                           |
| 12  | Cancelamento → estorna estoque + cancela invoice/AR                    | Todas as movimentações invertidas                                        |
| 13  | Comissão por item (commission_percent do catálogo)                     | partner_earnings com sale_id                                             |
| 14  | cost_price é snapshot no sale_item (para DRE competência)              | Mesmo que cost_price do produto mude depois, DRE usa snapshot da venda   |
| 15  | Recibo gerado automaticamente                                          | receipt-generator.ts existente                                           |
| 16  | Fulfillment de composição = completo quando todos filhos completos     | updateSaleFulfillment() recalcula                                        |
| 17  | Custo de compra vinculado ao produto (para DRE)                        | cost_price atualizado automaticamente por purchase_order_items.unit_cost |
| 18  | Marketplace de serviços filtra product=false, requires_scheduling=true | SolicitarServico.tsx intocado                                            |

---

## 12. Fases de Implementação

### Fase 1: DB + Tabelas de Suporte — ~2 dias

| #    | Task                                                                   | Tipo       |
| ---- | ---------------------------------------------------------------------- | ---------- |
| 1.1  | Migração: `measurement_units` (tabela + seed global)                   | DDL        |
| 1.2  | Migração: `discount_rules`                                             | DDL        |
| 1.3  | Migração: expandir `services` com novas colunas                        | DDL        |
| 1.4  | Migração: `service_compositions`                                       | DDL        |
| 1.5  | Migração: `sales` + `sale_items`                                       | DDL        |
| 1.6  | Migração: `stock_movements`                                            | DDL        |
| 1.7  | Migração: `purchase_orders` + `purchase_order_items`                   | DDL        |
| 1.8  | Migração: FKs em `partner_earnings`, `invoices`, `accounts_receivable` | DDL        |
| 1.9  | Migração: `customers.identification_level`                             | DDL        |
| 1.10 | Migração: novas permissions (11 permissions)                           | DDL + Seed |
| 1.11 | Registrar módulos `pdv`, `products`, `stock`, `purchases`, `delivery`  | Seed       |

### Fase 2: Service Layer — ~3 dias

| #   | Task                                                                | Tipo   |
| --- | ------------------------------------------------------------------- | ------ |
| 2.1 | `services/compositions.ts` (gerenciar + explodir composições)       | Novo   |
| 2.2 | `services/stock.ts` (movimentações + consultas + ajuste)            | Novo   |
| 2.3 | `services/purchases.ts` (CRUD + recebimento com estoque)            | Novo   |
| 2.4 | `services/sales.ts` (criação com caminhos paralelos + cancelamento) | Novo   |
| 2.5 | Expandir `services/financial.ts` (integrar AR + invoice automático) | Editar |
| 2.6 | Expandir `core/auth/permissions.ts` (novas permissions + presets)   | Editar |

### Fase 3: Catálogo Admin — ~2 dias

| #   | Task                                                                      | Tipo   |
| --- | ------------------------------------------------------------------------- | ------ |
| 3.1 | Atualizar `Administrador/services.tsx` (campos completos + abas por tipo) | Editar |
| 3.2 | Criar `Administrador/Composicoes.tsx` (CrudScreen)                        | Novo   |
| 3.3 | Criar `Administrador/RegrasDesconto.tsx` (CrudScreen)                     | Novo   |
| 3.4 | Expandir template packs types com novos campos                            | Editar |

### Fase 4: PDV + Vendas — ~4 dias

| #   | Task                                                                      | Tipo   |
| --- | ------------------------------------------------------------------------- | ------ |
| 4.1 | Criar tela `Servicos/PDV.tsx` (busca, carrinho, id cliente, desconto, pg) | Novo   |
| 4.2 | Modal de agendamento pós-venda (para serviços com scheduling)             | Novo   |
| 4.3 | Criar `Servicos/MinhasVendas.tsx` (CrudScreen, partner-scoped)            | Novo   |
| 4.4 | Criar `Administrador/Vendas.tsx` (CrudScreen, todas vendas)               | Novo   |
| 4.5 | Links no menu `servicos.tsx`                                              | Editar |

### Fase 5: Estoque + Compras — ~3 dias

| #   | Task                                                                   | Tipo    |
| --- | ---------------------------------------------------------------------- | ------- |
| 5.1 | Criar `Administrador/Estoque.tsx` (CrudScreen, posição de estoque)     | Novo    |
| 5.2 | Criar `Administrador/MovimentacoesEstoque.tsx` (CrudScreen, histórico) | Novo    |
| 5.3 | Criar `Administrador/Compras.tsx` (CrudScreen + recebimento)           | Novo    |
| 5.4 | Alerta de estoque baixo (notificação)                                  | Serviço |

### Fase 6: Fulfillment + Separação + Entrega — ~2 dias

| #   | Task                                                                               | Tipo    |
| --- | ---------------------------------------------------------------------------------- | ------- |
| 6.1 | Criar `Administrador/Separacao.tsx` (Kanban: pending → in_progress → ready)        | Novo    |
| 6.2 | Workflow template de entrega (seed no template pack)                               | Data    |
| 6.3 | Integração fulfillment: completar execução/separação/entrega → atualizar sale_item | Serviço |
| 6.4 | Botão "Gerar Venda" em `MeusTrabalhos.tsx` (pós-execução)                          | Editar  |

### Fase 7: Dashboard e DRE — ~2 dias

| #   | Task                                                            | Tipo        |
| --- | --------------------------------------------------------------- | ----------- |
| 7.1 | Métricas de vendas no `DashboardFinanceiro.tsx`                 | Editar      |
| 7.2 | Comissões de vendas no `GanhosParceiros.tsx`                    | Editar      |
| 7.3 | DRE de competência (receita − custo por período, por item_kind) | Novo/Editar |
| 7.4 | Atualizar agent packs para agente saber vender no WhatsApp      | Data        |

---

## 13. UX do PDV — Wireframe Conceitual

```
┌─────────────────────────────────────────────────────────────┐
│  🏪 PDV — Ponto de Venda                         [X Fechar] │
├───────────────────────────────────┬─────────────────────────┤
│                                   │                         │
│  🔍 Buscar produto ou serviço     │  🛒 CARRINHO (3 itens)  │
│  ┌───────────────────────────────┐│                         │
│  │ [input text / scan barcode]   ││  📦 Vacina Antirrábica  │
│  └───────────────────────────────┘│  1x R$ 45,00      [🗑]  │
│                                   │                         │
│  ┌─ Resultados ─────────────────┐ │  🔧 Consulta Vet.      │
│  │ 📦 Vacina Antirrábica         │ │  1x R$ 120,00    [🗑]  │
│  │    R$ 45,00 · Est: 23 un     │ │  ⚠️ Agendar depois     │
│  │ [+ Adicionar]                 │ │                         │
│  │───────────────────────────────│ │  📦 Vermífugo          │
│  │ 🔧 Consulta Veterinária      │ │  2x R$ 28,00     [🗑]  │
│  │    R$ 120,00 · Serviço       │ │                         │
│  │ [+ Adicionar]                 │ │  ───────────────────── │
│  │───────────────────────────────│ │  Subtotal: R$ 221,00   │
│  │ 🎁 Kit Vacinação Completo    │ │  Desconto: -R$ 11,00   │
│  │    R$ 160,00 · Composição    │ │  TOTAL:     R$ 210,00  │
│  │    (Vacina + Consulta)        │ │                         │
│  │ [+ Adicionar]                 │ │  👤 Maria Silva (CPF)  │
│  └───────────────────────────────┘ │  📊 Desc. máx: 10%     │
│                                   │                         │
│  ┌─ Filtros ────────────────────┐  │  ┌───────────────────┐  │
│  │ [Todos][📦 Prod.][🔧 Serv.]  │  │  │  💳 FINALIZAR     │  │
│  │ [Categoria ▼][Só estoque ☐] │  │  │     VENDA         │  │
│  └───────────────────────────────┘ │  └───────────────────┘  │
│                                   │                         │
├───────────────────────────────────┴─────────────────────────┤
│  Última: #V-042 · R$ 150,00 · PIX · 14:32 · João S.        │
└─────────────────────────────────────────────────────────────┘
```

**Modal de identificação do cliente:**

```
┌──────────────────────────────────────────┐
│  👤 Identificar Cliente                  │
│                                          │
│  ┌────────┐ ┌────────┐ ┌──────────────┐ │
│  │ COM CPF│ │SÓ NOME │ │NÃO IDENTIFICAR│ │
│  └────────┘ └────────┘ └──────────────┘ │
│                                          │
│  [Selecionado: Com CPF]                  │
│  CPF: [___.___.___-__]                   │
│  → Encontrado: Maria Silva               │
│  → OU: Novo cliente com este CPF         │
│  Nome: [Maria Silva________________]     │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │           ✅ CONFIRMAR             │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

**Modal de agendamento pós-venda:**

```
┌──────────────────────────────────────────┐
│  📅 Agendar Serviço — Consulta Vet.     │
│                                          │
│  Parceiro: [Dr. Carlos ▼]                │
│  Data: [25/02/2026]                      │
│  Horário: [09:00] [09:30] [10:00] ...    │
│                                          │
│  Ou: [ ] Agendar depois                  │
│         (cliente entrará em contato)     │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │            ✅ CONFIRMAR            │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

---

## 14. Impacto em Relatórios / DRE

### 14.1 DRE de Competência (essencial para o negócio)

Com `cost_price` snapshotado em cada `sale_item`, o DRE fica:

```sql
-- DRE por competência (mês)
SELECT
  DATE_TRUNC('month', s.created_at) as competencia,
  -- Receita Bruta
  SUM(si.subtotal) as receita_bruta,
  -- (-) Descontos
  SUM(si.discount_amount) as descontos,
  -- (=) Receita Líquida
  SUM(si.subtotal - si.discount_amount) as receita_liquida,
  -- (-) CMV (Custo da Mercadoria Vendida) — só produtos
  SUM(CASE WHEN si.item_kind = 'product' THEN si.cost_price * si.quantity ELSE 0 END) as cmv,
  -- (-) Custo de Serviços Prestados
  SUM(CASE WHEN si.item_kind = 'service' THEN si.cost_price * si.quantity ELSE 0 END) as csp,
  -- (=) Lucro Bruto
  SUM(si.subtotal - si.discount_amount) - SUM(si.cost_price * si.quantity) as lucro_bruto,
  -- (-) Comissões
  SUM(si.commission_amount) as comissoes,
  -- Margem %
  ROUND(
    (SUM(si.subtotal - si.discount_amount) - SUM(si.cost_price * si.quantity)) * 100.0
    / NULLIF(SUM(si.subtotal - si.discount_amount), 0), 2
  ) as margem_percent
FROM sale_items si
JOIN sales s ON si.sale_id = s.id
WHERE s.tenant_id = ? AND s.status IN ('completed', 'partial_refund')
  AND s.deleted_at IS NULL
GROUP BY 1 ORDER BY 1;
```

### 14.2 Outros Relatórios

```sql
-- Vendas por item_kind
SELECT si.item_kind, COUNT(*) as qtd, SUM(si.subtotal) as receita
FROM sale_items si JOIN sales s ON si.sale_id = s.id
WHERE s.tenant_id = ? AND s.status = 'completed' GROUP BY 1;

-- Top produtos vendidos
SELECT sv.name, SUM(si.quantity) as qtd, SUM(si.subtotal) as receita
FROM sale_items si JOIN services sv ON si.service_id = sv.id JOIN sales s ON si.sale_id = s.id
WHERE si.item_kind = 'product' AND s.status = 'completed' GROUP BY 1 ORDER BY 3 DESC;

-- Custo de compras por período (para DRE completo)
SELECT DATE_TRUNC('month', po.received_at) as mes, SUM(po.total) as custo_compras
FROM purchase_orders po WHERE po.tenant_id = ? AND po.status = 'received' GROUP BY 1;

-- Valor do estoque atual
SELECT SUM(s.stock_quantity * s.cost_price) as valor_estoque
FROM services s WHERE s.tenant_id = ? AND s.track_stock = true AND s.deleted_at IS NULL;
```

---

## 15. Riscos e Mitigações

| Risco                                    | Prob. | Impacto | Mitigação                                            |
| ---------------------------------------- | ----- | ------- | ---------------------------------------------------- |
| PDV offline                              | Média | Alto    | MVP online only. Fase futura: queue local            |
| Race condition em estoque                | Baixa | Médio   | Validação server-side. Se falhar, alerta             |
| Composição circular (A→B→A)              | Baixa | Médio   | CHECK constraint + validação recursiva no service    |
| Desconto aprovado sem credencial         | Baixa | Médio   | Aprovação requer password/PIN do aprovador           |
| cost_price desatualizado → DRE impreciso | Média | Médio   | Auto-update cost_price nas compras                   |
| Muitos items no catálogo → PDV lento     | Baixa | Médio   | Paginação server-side + busca indexada (SKU/barcode) |
| Fulfillment de composição incompleto     | Média | Baixo   | updateSaleFulfillment() recalcula sempre             |
| Recebimento parcial de compra complexo   | Baixa | Baixo   | UI clara: qty ordered vs qty received por item       |

---

## 16. Linha do Tempo Estimada

```
Fase 1: DB + Suporte         ██████░░░░░░░░░░░░░░░░░░░  (~2 dias)
Fase 2: Service Layer         ░░░░░░████████░░░░░░░░░░░  (~3 dias)
Fase 3: Catálogo Admin        ░░░░░░░░░░░░░░████░░░░░░░  (~2 dias)
Fase 4: PDV + Vendas          ░░░░░░░░░░░░░░░░░░████████  (~4 dias)
Fase 5: Estoque + Compras     ░░░░░░░░░░░░░░░░░░░░░█████  (~3 dias)  ← paralelo c/ F4
Fase 6: Fulfillment           ░░░░░░░░░░░░░░░░░░░░░░░░██  (~2 dias)
Fase 7: Dashboard + DRE       ░░░░░░░░░░░░░░░░░░░░░░░░░█  (~2 dias)
                               ─────────────────────────
                               Total: ~18 dias úteis
```

---

## 17. Checklist de Aprovação

Antes de programar, confirme cada decisão:

- [ ] **Catálogo unificado** na tabela `services` (com `item_kind` product/service)?
- [ ] **Composição como atributo** (`is_composition` + `service_compositions`), não como `item_kind`?
- [ ] **`sales` como entidade central** da transação no PDV?
- [ ] **Toda venda cria customer** (mesmo anônimo = customer com `identification_level='anonymous'`)?
- [ ] **Toda venda cria AR** automaticamente (status varia conforme pagamento)?
- [ ] **Desconto máximo por role** via tabela `discount_rules`?
- [ ] **Tabelas de suporte** para unidades de medida (`measurement_units`)?
- [ ] **Caminhos pós-venda independentes** por sale_item (serviço→workflow, produto→separação/entrega)?
- [ ] **Entrega como workflow** (reutiliza engine existente com service_type de entrega)?
- [ ] **Módulos granulares** (`pdv`, `products`, `stock`, `purchases`, `delivery`)?
- [ ] **`purchase_orders`** para entrada de compras com atualização automática de estoque e cost_price?
- [ ] **`stock_movements`** para rastreabilidade completa de movimentação de estoque?
- [ ] **cost_price snapshotado** no sale_item para DRE de competência?
- [ ] **Fases de implementação** na ordem proposta?

---

> **Próximo passo:** Após aprovação do checklist, inicio pela **Fase 1** (migrações SQL + tabelas de suporte).
