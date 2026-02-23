-- ============================================================================
-- Migração: Backfill de vínculos por CPF (customers/users/properties)
-- Data: 2026-02-13
-- Objetivo:
--   1) Normalizar CPF legado (apenas dígitos) nas tabelas users/customers/properties
--   2) Recriar vínculos de ID por CPF para dados sincronizados externamente
--      - customers.user_id  <- users.id por CPF
--      - properties.customer_id <- customers.id por CPF
--      - users.customer_id (se existir)
--      - properties.user_id (se existir)
--
-- Segurança:
--   - Idempotente: pode rodar múltiplas vezes.
--   - Ignora registros soft-deleted (deleted_at IS NOT NULL) quando aplicável.
--   - Não cria/altera schema além de dados (somente UPDATE).
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 0) Normalização de CPF legado (apenas dígitos)
-- --------------------------------------------------------------------------
UPDATE users
SET cpf = NULLIF(regexp_replace(cpf::text, '\\D', '', 'g'), '')
WHERE cpf IS NOT NULL
  AND cpf <> NULLIF(regexp_replace(cpf::text, '\\D', '', 'g'), '');

UPDATE customers
SET cpf = NULLIF(regexp_replace(cpf::text, '\\D', '', 'g'), '')
WHERE cpf IS NOT NULL
  AND cpf <> NULLIF(regexp_replace(cpf::text, '\\D', '', 'g'), '');

UPDATE properties
SET cpf = NULLIF(regexp_replace(cpf::text, '\\D', '', 'g'), '')
WHERE cpf IS NOT NULL
  AND cpf <> NULLIF(regexp_replace(cpf::text, '\\D', '', 'g'), '');

-- --------------------------------------------------------------------------
-- 1) Tabelas temporárias canônicas por CPF
--    Regra de preferência para desempate:
--      a) registro já vinculado (user_id/customer_id preenchido)
--      b) tenant_id preenchido
--      c) created_at mais antigo
--      d) id para desempate determinístico
-- --------------------------------------------------------------------------
DROP TABLE IF EXISTS tmp_customer_by_cpf;
CREATE TEMP TABLE tmp_customer_by_cpf AS
WITH ranked AS (
  SELECT
    c.id AS customer_id,
    regexp_replace(COALESCE(c.cpf::text, ''), '\\D', '', 'g') AS cpf_norm,
    ROW_NUMBER() OVER (
      PARTITION BY regexp_replace(COALESCE(c.cpf::text, ''), '\\D', '', 'g')
      ORDER BY
        CASE WHEN c.user_id IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN c.tenant_id IS NOT NULL THEN 0 ELSE 1 END,
        c.created_at NULLS LAST,
        c.id
    ) AS rn
  FROM customers c
  WHERE COALESCE(c.deleted_at, NULL) IS NULL
    AND NULLIF(regexp_replace(COALESCE(c.cpf::text, ''), '\\D', '', 'g'), '') IS NOT NULL
)
SELECT cpf_norm, customer_id
FROM ranked
WHERE rn = 1;

CREATE INDEX ON tmp_customer_by_cpf(cpf_norm);

DROP TABLE IF EXISTS tmp_user_by_cpf;
CREATE TEMP TABLE tmp_user_by_cpf AS
WITH ranked AS (
  SELECT
    u.id AS user_id,
    regexp_replace(COALESCE(u.cpf::text, ''), '\\D', '', 'g') AS cpf_norm,
    ROW_NUMBER() OVER (
      PARTITION BY regexp_replace(COALESCE(u.cpf::text, ''), '\\D', '', 'g')
      ORDER BY
        CASE WHEN u.tenant_id IS NOT NULL THEN 0 ELSE 1 END,
        u.created_at NULLS LAST,
        u.id
    ) AS rn
  FROM users u
  WHERE COALESCE(u.deleted_at, NULL) IS NULL
    AND NULLIF(regexp_replace(COALESCE(u.cpf::text, ''), '\\D', '', 'g'), '') IS NOT NULL
)
SELECT cpf_norm, user_id
FROM ranked
WHERE rn = 1;

CREATE INDEX ON tmp_user_by_cpf(cpf_norm);

-- --------------------------------------------------------------------------
-- 2) customers.user_id <- users.id por CPF
-- --------------------------------------------------------------------------
UPDATE customers c
SET
  user_id = ub.user_id,
  updated_at = NOW()
FROM tmp_user_by_cpf ub
WHERE COALESCE(c.deleted_at, NULL) IS NULL
  AND NULLIF(regexp_replace(COALESCE(c.cpf::text, ''), '\\D', '', 'g'), '') = ub.cpf_norm
  AND (c.user_id IS NULL OR c.user_id <> ub.user_id);

-- --------------------------------------------------------------------------
-- 3) properties.customer_id <- customers.id por CPF
-- --------------------------------------------------------------------------
UPDATE properties p
SET
  customer_id = cb.customer_id,
  updated_at = NOW()
FROM tmp_customer_by_cpf cb
WHERE COALESCE(p.deleted_at, NULL) IS NULL
  AND NULLIF(regexp_replace(COALESCE(p.cpf::text, ''), '\\D', '', 'g'), '') = cb.cpf_norm
  AND (p.customer_id IS NULL OR p.customer_id <> cb.customer_id);

-- --------------------------------------------------------------------------
-- 4) users.customer_id (opcional, somente se coluna existir)
-- --------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'customer_id'
  ) THEN
    EXECUTE $sql$
      UPDATE users u
      SET
        customer_id = cb.customer_id,
        updated_at = NOW()
      FROM tmp_customer_by_cpf cb
      WHERE COALESCE(u.deleted_at, NULL) IS NULL
        AND NULLIF(regexp_replace(COALESCE(u.cpf::text, ''), '\\D', '', 'g'), '') = cb.cpf_norm
        AND (u.customer_id IS NULL OR u.customer_id <> cb.customer_id)
    $sql$;
  END IF;
END
$$;

-- --------------------------------------------------------------------------
-- 5) properties.user_id (opcional, somente se coluna existir)
-- --------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'properties'
      AND column_name = 'user_id'
  ) THEN
    EXECUTE $sql$
      UPDATE properties p
      SET
        user_id = ub.user_id,
        updated_at = NOW()
      FROM tmp_user_by_cpf ub
      WHERE COALESCE(p.deleted_at, NULL) IS NULL
        AND NULLIF(regexp_replace(COALESCE(p.cpf::text, ''), '\\D', '', 'g'), '') = ub.cpf_norm
        AND (p.user_id IS NULL OR p.user_id <> ub.user_id)
    $sql$;
  END IF;
END
$$;

COMMIT;

-- --------------------------------------------------------------------------
-- 6) Relatórios pós-migração
-- --------------------------------------------------------------------------
SELECT
  COUNT(*) FILTER (WHERE cpf IS NOT NULL) AS customers_com_cpf,
  COUNT(*) FILTER (WHERE cpf IS NOT NULL AND user_id IS NOT NULL) AS customers_com_user_id
FROM customers
WHERE COALESCE(deleted_at, NULL) IS NULL;

SELECT
  COUNT(*) FILTER (WHERE cpf IS NOT NULL) AS properties_com_cpf,
  COUNT(*) FILTER (WHERE cpf IS NOT NULL AND customer_id IS NOT NULL) AS properties_com_customer_id
FROM properties
WHERE COALESCE(deleted_at, NULL) IS NULL;

-- Diagnóstico de CPFs ainda sem vínculo em properties
SELECT
  p.cpf,
  COUNT(*) AS qtd_properties_sem_customer
FROM properties p
WHERE COALESCE(p.deleted_at, NULL) IS NULL
  AND NULLIF(regexp_replace(COALESCE(p.cpf::text, ''), '\\D', '', 'g'), '') IS NOT NULL
  AND p.customer_id IS NULL
GROUP BY p.cpf
ORDER BY qtd_properties_sem_customer DESC
LIMIT 50;
