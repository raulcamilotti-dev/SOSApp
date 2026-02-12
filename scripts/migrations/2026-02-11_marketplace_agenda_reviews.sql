-- Migration: marketplace/agenda/reviews modules
-- Date: 2026-02-11
-- Notes:
-- - Creates new table partners linked to users (multi-tenant)
-- - Creates scheduling (appointments), availability, time-off
-- - Creates execution tracking
-- - Creates reviews + rating summary
-- - Creates traceability logs

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Enums (optional)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appointment_status') THEN
    CREATE TYPE appointment_status AS ENUM (
      'scheduled',
      'confirmed',
      'in_progress',
      'completed',
      'cancelled',
      'no_show'
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'execution_status') THEN
    CREATE TYPE execution_status AS ENUM (
      'scheduled',
      'in_progress',
      'completed',
      'cancelled'
    );
  END IF;
END$$;

-- updated_at helper
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =========================
-- PARTNERS (new)
-- =========================
-- Partner is a user inside a tenant. A user can be partner in multiple tenants.
CREATE TABLE IF NOT EXISTS partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid NOT NULL REFERENCES users(id),

  display_name text,
  is_active boolean NOT NULL DEFAULT true,

  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- NOTE: intentionally NOT UNIQUE to allow multiple partner profiles per user/tenant.
CREATE INDEX IF NOT EXISTS idx_partners_tenant_user
  ON partners (tenant_id, user_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_partners_updated_at
BEFORE UPDATE ON partners
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_partners_tenant_active
  ON partners (tenant_id, is_active)
  WHERE deleted_at IS NULL;

-- =========================
-- AGENDA / APPOINTMENTS
-- =========================
CREATE TABLE IF NOT EXISTS service_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),

  service_id uuid NOT NULL REFERENCES services(id),
  partner_id uuid NOT NULL REFERENCES partners(id),
  customer_id uuid NOT NULL REFERENCES customers(id),

  scheduled_start timestamptz NOT NULL,
  scheduled_end   timestamptz NOT NULL,

  status appointment_status NOT NULL DEFAULT 'scheduled',
  notes text,

  created_by uuid NOT NULL REFERENCES users(id),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,

  CONSTRAINT service_appointments_time_valid
    CHECK (scheduled_end > scheduled_start)
);

CREATE TRIGGER trg_service_appointments_updated_at
BEFORE UPDATE ON service_appointments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- No overlap constraint for active appointments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'service_appointments_no_overlap'
  ) THEN
    ALTER TABLE service_appointments
      ADD CONSTRAINT service_appointments_no_overlap
      EXCLUDE USING gist (
        tenant_id WITH =,
        partner_id WITH =,
        tstzrange(scheduled_start, scheduled_end, '[)') WITH &&
      )
      WHERE (
        deleted_at IS NULL
        AND status IN ('scheduled','confirmed','in_progress')
      );
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_service_appointments_tenant_partner_start
  ON service_appointments (tenant_id, partner_id, scheduled_start)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_service_appointments_tenant_customer_start
  ON service_appointments (tenant_id, customer_id, scheduled_start)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_service_appointments_tenant_status_start
  ON service_appointments (tenant_id, status, scheduled_start)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS partner_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  partner_id uuid NOT NULL REFERENCES partners(id),

  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time   time NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,

  CONSTRAINT partner_availability_time_valid
    CHECK (end_time > start_time)
);

CREATE TRIGGER trg_partner_availability_updated_at
BEFORE UPDATE ON partner_availability
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_partner_availability_tenant_partner_weekday
  ON partner_availability (tenant_id, partner_id, weekday)
  WHERE deleted_at IS NULL AND is_active = true;

CREATE TABLE IF NOT EXISTS partner_time_off (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  partner_id uuid NOT NULL REFERENCES partners(id),

  start_date date NOT NULL,
  end_date   date NOT NULL,
  reason text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,

  CONSTRAINT partner_time_off_date_valid
    CHECK (end_date >= start_date)
);

CREATE TRIGGER trg_partner_time_off_updated_at
BEFORE UPDATE ON partner_time_off
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_partner_time_off_tenant_partner_dates
  ON partner_time_off (tenant_id, partner_id, start_date, end_date)
  WHERE deleted_at IS NULL;

-- =========================
-- EXECUTION
-- =========================
CREATE TABLE IF NOT EXISTS service_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  appointment_id uuid NOT NULL REFERENCES service_appointments(id),

  started_at timestamptz,
  finished_at timestamptz,
  status execution_status NOT NULL DEFAULT 'scheduled',

  execution_notes text,

  executed_by_partner_id uuid REFERENCES partners(id),
  executed_by_user_id uuid REFERENCES users(id),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,

  CONSTRAINT service_executions_executor_one
    CHECK (
      ((executed_by_partner_id IS NOT NULL)::int + (executed_by_user_id IS NOT NULL)::int) <= 1
    ),
  CONSTRAINT service_executions_finish_after_start
    CHECK (finished_at IS NULL OR started_at IS NULL OR finished_at >= started_at)
);

CREATE TRIGGER trg_service_executions_updated_at
BEFORE UPDATE ON service_executions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS uq_service_executions_one_per_appointment
  ON service_executions (tenant_id, appointment_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_service_executions_tenant_status
  ON service_executions (tenant_id, status)
  WHERE deleted_at IS NULL;

-- =========================
-- REVIEWS / RATINGS
-- =========================
CREATE TABLE IF NOT EXISTS service_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),

  service_id uuid NOT NULL REFERENCES services(id),
  partner_id uuid NOT NULL REFERENCES partners(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  appointment_id uuid NOT NULL REFERENCES service_appointments(id),

  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  is_public boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_service_reviews_one_per_appointment
  ON service_reviews (tenant_id, appointment_id, customer_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_service_reviews_tenant_partner_created
  ON service_reviews (tenant_id, partner_id, created_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_service_reviews_tenant_service_created
  ON service_reviews (tenant_id, service_id, created_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS partner_rating_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  partner_id uuid NOT NULL REFERENCES partners(id),

  avg_rating numeric(3,2) NOT NULL DEFAULT 0,
  total_reviews int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_partner_rating_summary UNIQUE (tenant_id, partner_id)
);

-- Only allow review after appointment completed and with matching FK data
CREATE OR REPLACE FUNCTION enforce_review_rules()
RETURNS trigger AS $$
DECLARE
  a record;
BEGIN
  SELECT *
    INTO a
  FROM service_appointments
  WHERE id = NEW.appointment_id
    AND tenant_id = NEW.tenant_id
    AND deleted_at IS NULL;

  IF a.id IS NULL THEN
    RAISE EXCEPTION 'Appointment not found for tenant';
  END IF;

  IF a.status <> 'completed' THEN
    RAISE EXCEPTION 'Review allowed only after appointment completed';
  END IF;

  IF a.customer_id <> NEW.customer_id THEN
    RAISE EXCEPTION 'Review customer mismatch';
  END IF;

  IF a.partner_id <> NEW.partner_id THEN
    RAISE EXCEPTION 'Review partner mismatch';
  END IF;

  IF a.service_id <> NEW.service_id THEN
    RAISE EXCEPTION 'Review service mismatch';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_service_reviews_rules ON service_reviews;
CREATE TRIGGER trg_service_reviews_rules
BEFORE INSERT OR UPDATE ON service_reviews
FOR EACH ROW EXECUTE FUNCTION enforce_review_rules();

CREATE OR REPLACE FUNCTION recompute_partner_rating_summary(p_tenant uuid, p_partner uuid)
RETURNS void AS $$
DECLARE
  v_avg numeric(3,2);
  v_total int;
BEGIN
  SELECT
    COALESCE(ROUND(AVG(rating)::numeric, 2), 0),
    COUNT(*)::int
  INTO v_avg, v_total
  FROM service_reviews
  WHERE tenant_id = p_tenant
    AND partner_id = p_partner
    AND deleted_at IS NULL;

  INSERT INTO partner_rating_summary (tenant_id, partner_id, avg_rating, total_reviews, updated_at)
  VALUES (p_tenant, p_partner, v_avg, v_total, now())
  ON CONFLICT (tenant_id, partner_id)
  DO UPDATE SET
    avg_rating = EXCLUDED.avg_rating,
    total_reviews = EXCLUDED.total_reviews,
    updated_at = now();
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_reviews_recompute_summary()
RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    PERFORM recompute_partner_rating_summary(NEW.tenant_id, NEW.partner_id);
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    PERFORM recompute_partner_rating_summary(NEW.tenant_id, NEW.partner_id);
    IF (OLD.partner_id IS DISTINCT FROM NEW.partner_id) THEN
      PERFORM recompute_partner_rating_summary(OLD.tenant_id, OLD.partner_id);
    END IF;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    PERFORM recompute_partner_rating_summary(OLD.tenant_id, OLD.partner_id);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_service_reviews_recompute_summary_ins ON service_reviews;
DROP TRIGGER IF EXISTS trg_service_reviews_recompute_summary_upd ON service_reviews;
DROP TRIGGER IF EXISTS trg_service_reviews_recompute_summary_del ON service_reviews;

CREATE TRIGGER trg_service_reviews_recompute_summary_ins
AFTER INSERT ON service_reviews
FOR EACH ROW EXECUTE FUNCTION trg_reviews_recompute_summary();

CREATE TRIGGER trg_service_reviews_recompute_summary_upd
AFTER UPDATE ON service_reviews
FOR EACH ROW EXECUTE FUNCTION trg_reviews_recompute_summary();

CREATE TRIGGER trg_service_reviews_recompute_summary_del
AFTER DELETE ON service_reviews
FOR EACH ROW EXECUTE FUNCTION trg_reviews_recompute_summary();

-- =========================
-- TRACEABILITY LOGS
-- =========================
CREATE TABLE IF NOT EXISTS appointment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  appointment_id uuid NOT NULL REFERENCES service_appointments(id),

  action text NOT NULL,
  performed_by uuid NOT NULL REFERENCES users(id),
  payload_json jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_appointment_logs_tenant_appointment_created
  ON appointment_logs (tenant_id, appointment_id, created_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS review_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  review_id uuid NOT NULL REFERENCES service_reviews(id),

  action text NOT NULL,
  performed_by uuid NOT NULL REFERENCES users(id),
  payload_json jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_review_logs_tenant_review_created
  ON review_logs (tenant_id, review_id, created_at)
  WHERE deleted_at IS NULL;

COMMIT;
