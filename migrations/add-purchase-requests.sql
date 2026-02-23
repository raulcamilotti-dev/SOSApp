-- ============================================================
-- Migration: Purchase Requests (Solicitação de Compras)
-- 
-- Analogous to pre_sales → sales flow:
--   purchase_requests → purchase_orders
--
-- An operator creates a purchase request listing items
-- they need to buy. A manager approves/rejects. Once
-- approved, the request can be imported into a purchase
-- order in the Compras screen.
-- ============================================================

-- Header table
CREATE TABLE IF NOT EXISTS purchase_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),

    -- Identification
    title           TEXT NOT NULL,                       -- e.g. "Reposição estoque semana 12"
    code            TEXT,                                -- auto-generated sequential code (SC-001)
    department      TEXT,                                -- optional department / sector

    -- Requester
    requested_by    UUID REFERENCES users(id),           -- who created the request
    partner_id      UUID REFERENCES partners(id),        -- optional partner scope

    -- Priority & dates
    priority        TEXT NOT NULL DEFAULT 'medium',      -- low | medium | high | urgent
    needed_by_date  DATE,                                -- when the items are needed

    -- Status workflow: draft → pending_approval → approved → rejected → cancelled → converted
    status          TEXT NOT NULL DEFAULT 'draft',
    submitted_at    TIMESTAMPTZ,                         -- when sent for approval
    approved_by     UUID REFERENCES users(id),
    approved_at     TIMESTAMPTZ,
    rejected_by     UUID REFERENCES users(id),
    rejected_at     TIMESTAMPTZ,
    rejection_reason TEXT,

    -- Totals (estimated)
    subtotal        NUMERIC(14,2) NOT NULL DEFAULT 0,
    total           NUMERIC(14,2) NOT NULL DEFAULT 0,

    -- Conversion link
    purchase_order_id UUID REFERENCES purchase_orders(id), -- set when converted to PO

    -- Metadata
    notes           TEXT,
    config          JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

-- Line items table
CREATE TABLE IF NOT EXISTS purchase_request_items (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_request_id   UUID NOT NULL REFERENCES purchase_requests(id),

    -- Product / service reference
    service_id            UUID REFERENCES services(id),    -- link to unified services/products table
    item_kind             TEXT DEFAULT 'product',           -- product | service
    description           TEXT,                             -- manual description or snapshot of name

    -- Quantities & costs (estimated)
    quantity_requested    NUMERIC(14,4) NOT NULL DEFAULT 1,
    estimated_unit_cost   NUMERIC(14,4) DEFAULT 0,         -- estimated cost per unit
    subtotal              NUMERIC(14,2) DEFAULT 0,          -- qty × estimated_unit_cost

    -- Supplier suggestion
    supplier_suggestion   TEXT,                              -- preferred supplier name/note
    supplier_id           UUID REFERENCES suppliers(id),     -- preferred supplier FK

    -- Metadata
    notes                 TEXT,
    sort_order            INTEGER DEFAULT 0,
    added_by              UUID REFERENCES users(id),
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    deleted_at            TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_purchase_requests_tenant
    ON purchase_requests(tenant_id);

CREATE INDEX IF NOT EXISTS idx_purchase_requests_status
    ON purchase_requests(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_purchase_requests_requested_by
    ON purchase_requests(requested_by);

CREATE INDEX IF NOT EXISTS idx_purchase_request_items_request
    ON purchase_request_items(purchase_request_id);
