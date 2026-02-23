-- ============================================================
-- CONTENT PAGES — Public Blog + Landing Pages per Tenant
-- ============================================================
-- Enables every tenant to have:
--   1. A public blog at /{tenantSlug}/blog
--   2. Landing pages at /lp/{tenantSlug}/{slug}
-- CTAs use lead_forms for lead capture.
-- ============================================================

CREATE TABLE IF NOT EXISTS content_pages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),

  -- Type & identification
  page_type           TEXT NOT NULL DEFAULT 'blog_post',  -- 'blog_post' | 'landing_page'
  title               TEXT NOT NULL,
  slug                TEXT NOT NULL,                       -- URL-safe, unique per tenant

  -- Content
  excerpt             TEXT,                                -- Short description for listing/SEO
  content             TEXT,                                -- Full content (Markdown)
  featured_image_url  TEXT,                                -- Hero/cover image URL

  -- SEO
  meta_title          TEXT,                                -- Falls back to title
  meta_description    TEXT,                                -- Falls back to excerpt

  -- Author & status
  author_id           UUID REFERENCES users(id),
  author_name         TEXT,                                -- Denormalized for public display
  status              TEXT NOT NULL DEFAULT 'draft',       -- 'draft' | 'scheduled' | 'published' | 'archived'
  published_at        TIMESTAMPTZ,
  scheduled_at        TIMESTAMPTZ,

  -- Categorization
  category            TEXT,
  tags                JSONB DEFAULT '[]'::jsonb,           -- Array of tag strings

  -- CTA (Call-to-Action)
  lead_form_id        UUID REFERENCES lead_forms(id),      -- Embedded lead capture form
  cta_text            TEXT,                                 -- Custom CTA button text
  cta_url             TEXT,                                 -- External CTA URL (alternative to form)

  -- Template & presentation
  template_key        TEXT DEFAULT 'standard',             -- 'standard' | 'hero' | 'minimal'
  is_featured         BOOLEAN DEFAULT false,               -- Highlighted on listing
  sort_order          INTEGER DEFAULT 0,                   -- Manual ordering (landing pages)

  -- Analytics
  view_count          INTEGER DEFAULT 0,
  reading_time_min    INTEGER,                             -- Estimated reading time in minutes

  -- Campaign link (optional — campaign or specific item)
  campaign_id         UUID REFERENCES campaigns(id),
  campaign_item_id    UUID REFERENCES campaign_items(id),

  -- Timestamps
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  deleted_at          TIMESTAMPTZ,

  -- Constraints
  UNIQUE(tenant_id, slug)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_content_pages_tenant ON content_pages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_content_pages_status ON content_pages(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_content_pages_type ON content_pages(tenant_id, page_type);
CREATE INDEX IF NOT EXISTS idx_content_pages_published ON content_pages(tenant_id, status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_pages_slug ON content_pages(tenant_id, slug);
CREATE INDEX IF NOT EXISTS idx_content_pages_campaign_item ON content_pages(campaign_item_id) WHERE campaign_item_id IS NOT NULL;
