-- ============================================================================
-- DRY-RUN: Backfill de vínculos por CPF (customers/users/properties)
-- Data: 2026-02-13
-- Objetivo:
--   Simular e medir o impacto da migração sem alterar dados.
--
-- Como usar:
--   1) Execute este script primeiro (somente leitura)
--   2) Valide contagens e amostras
--   3) Rode a versão de UPDATE se os números estiverem corretos:
--      scripts/migrations/2026-02-13_cpf_id_backfill_links.sql
-- ============================================================================

-- --------------------------------------------------------------------------
-- 0) Cobertura de CPF normalizável por tabela
-- --------------------------------------------------------------------------
SELECT
  'users' AS tabela,
  COUNT(*) FILTER (WHERE COALESCE(deleted_at, NULL) IS NULL) AS ativos,
  COUNT(*) FILTER (
    WHERE COALESCE(deleted_at, NULL) IS NULL
      AND NULLIF(regexp_replace(COALESCE(cpf::text, ''), '\\D', '', 'g'), '') IS NOT NULL
  ) AS com_cpf_norm,
  COUNT(*) FILTER (
    WHERE COALESCE(deleted_at, NULL) IS NULL
      AND cpf IS NOT NULL
      AND cpf <> NULLIF(regexp_replace(COALESCE(cpf::text, ''), '\\D', '', 'g'), '')
  ) AS cpf_com_mascara_ou_ruido
FROM users
UNION ALL
SELECT
  'customers' AS tabela,
  COUNT(*) FILTER (WHERE COALESCE(deleted_at, NULL) IS NULL) AS ativos,
  COUNT(*) FILTER (
    WHERE COALESCE(deleted_at, NULL) IS NULL
      AND NULLIF(regexp_replace(COALESCE(cpf::text, ''), '\\D', '', 'g'), '') IS NOT NULL
  ) AS com_cpf_norm,
  COUNT(*) FILTER (
    WHERE COALESCE(deleted_at, NULL) IS NULL
      AND cpf IS NOT NULL
      AND cpf <> NULLIF(regexp_replace(COALESCE(cpf::text, ''), '\\D', '', 'g'), '')
  ) AS cpf_com_mascara_ou_ruido
FROM customers
UNION ALL
SELECT
  'properties' AS tabela,
  COUNT(*) FILTER (WHERE COALESCE(deleted_at, NULL) IS NULL) AS ativos,
  COUNT(*) FILTER (
    WHERE COALESCE(deleted_at, NULL) IS NULL
      AND NULLIF(regexp_replace(COALESCE(cpf::text, ''), '\\D', '', 'g'), '') IS NOT NULL
  ) AS com_cpf_norm,
  COUNT(*) FILTER (
    WHERE COALESCE(deleted_at, NULL) IS NULL
      AND cpf IS NOT NULL
      AND cpf <> NULLIF(regexp_replace(COALESCE(cpf::text, ''), '\\D', '', 'g'), '')
  ) AS cpf_com_mascara_ou_ruido
FROM properties;

-- --------------------------------------------------------------------------
-- 1) Mapa canônico por CPF (mesma regra da migração)
-- --------------------------------------------------------------------------
WITH customer_ranked AS (
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
),
user_ranked AS (
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
),
canon_customers AS (
  SELECT cpf_norm, customer_id
  FROM customer_ranked
  WHERE rn = 1
),
canon_users AS (
  SELECT cpf_norm, user_id
  FROM user_ranked
  WHERE rn = 1
)
SELECT
  (SELECT COUNT(*) FROM canon_customers) AS cpfs_canon_customers,
  (SELECT COUNT(*) FROM canon_users) AS cpfs_canon_users,
  (SELECT COUNT(*) FROM canon_customers c JOIN canon_users u USING (cpf_norm)) AS cpfs_em_ambos;

-- --------------------------------------------------------------------------
-- 2) Impacto estimado: customers.user_id <- users.id por CPF
-- --------------------------------------------------------------------------
WITH user_ranked AS (
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
),
canon_users AS (
  SELECT cpf_norm, user_id
  FROM user_ranked
  WHERE rn = 1
),
targets AS (
  SELECT c.id AS customer_id, c.user_id AS user_id_atual, cu.user_id AS user_id_novo
  FROM customers c
  JOIN canon_users cu
    ON NULLIF(regexp_replace(COALESCE(c.cpf::text, ''), '\\D', '', 'g'), '') = cu.cpf_norm
  WHERE COALESCE(c.deleted_at, NULL) IS NULL
)
SELECT
  COUNT(*) AS customers_match_por_cpf,
  COUNT(*) FILTER (WHERE user_id_atual IS NULL) AS preencher_vazio,
  COUNT(*) FILTER (WHERE user_id_atual IS NOT NULL AND user_id_atual <> user_id_novo) AS substituir_diferente,
  COUNT(*) FILTER (WHERE user_id_atual = user_id_novo) AS ja_correto
FROM targets;

-- Amostra do que mudaria (customers.user_id)
WITH user_ranked AS (
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
),
canon_users AS (
  SELECT cpf_norm, user_id
  FROM user_ranked
  WHERE rn = 1
)
SELECT
  c.id AS customer_id,
  c.name,
  c.cpf,
  c.user_id AS user_id_atual,
  cu.user_id AS user_id_novo
FROM customers c
JOIN canon_users cu
  ON NULLIF(regexp_replace(COALESCE(c.cpf::text, ''), '\\D', '', 'g'), '') = cu.cpf_norm
WHERE COALESCE(c.deleted_at, NULL) IS NULL
  AND (c.user_id IS NULL OR c.user_id <> cu.user_id)
LIMIT 100;

-- --------------------------------------------------------------------------
-- 3) Impacto estimado: properties.customer_id <- customers.id por CPF
-- --------------------------------------------------------------------------
WITH customer_ranked AS (
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
),
canon_customers AS (
  SELECT cpf_norm, customer_id
  FROM customer_ranked
  WHERE rn = 1
),
targets AS (
  SELECT p.id AS property_id, p.customer_id AS customer_id_atual, cc.customer_id AS customer_id_novo
  FROM properties p
  JOIN canon_customers cc
    ON NULLIF(regexp_replace(COALESCE(p.cpf::text, ''), '\\D', '', 'g'), '') = cc.cpf_norm
  WHERE COALESCE(p.deleted_at, NULL) IS NULL
)
SELECT
  COUNT(*) AS properties_match_por_cpf,
  COUNT(*) FILTER (WHERE customer_id_atual IS NULL) AS preencher_vazio,
  COUNT(*) FILTER (WHERE customer_id_atual IS NOT NULL AND customer_id_atual <> customer_id_novo) AS substituir_diferente,
  COUNT(*) FILTER (WHERE customer_id_atual = customer_id_novo) AS ja_correto
FROM targets;

-- Amostra do que mudaria (properties.customer_id)
WITH customer_ranked AS (
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
),
canon_customers AS (
  SELECT cpf_norm, customer_id
  FROM customer_ranked
  WHERE rn = 1
)
SELECT
  p.id AS property_id,
  p.cpf,
  p.address,
  p.customer_id AS customer_id_atual,
  cc.customer_id AS customer_id_novo
FROM properties p
JOIN canon_customers cc
  ON NULLIF(regexp_replace(COALESCE(p.cpf::text, ''), '\\D', '', 'g'), '') = cc.cpf_norm
WHERE COALESCE(p.deleted_at, NULL) IS NULL
  AND (p.customer_id IS NULL OR p.customer_id <> cc.customer_id)
LIMIT 100;

-- --------------------------------------------------------------------------
-- 4) Diagnóstico: CPFs em properties sem customer canônico
-- --------------------------------------------------------------------------
WITH customer_ranked AS (
  SELECT
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
),
canon_customers AS (
  SELECT cpf_norm
  FROM customer_ranked
  WHERE rn = 1
)
SELECT
  regexp_replace(COALESCE(p.cpf::text, ''), '\\D', '', 'g') AS cpf_norm,
  COUNT(*) AS qtd_properties
FROM properties p
LEFT JOIN canon_customers cc
  ON NULLIF(regexp_replace(COALESCE(p.cpf::text, ''), '\\D', '', 'g'), '') = cc.cpf_norm
WHERE COALESCE(p.deleted_at, NULL) IS NULL
  AND NULLIF(regexp_replace(COALESCE(p.cpf::text, ''), '\\D', '', 'g'), '') IS NOT NULL
  AND cc.cpf_norm IS NULL
GROUP BY cpf_norm
ORDER BY qtd_properties DESC
LIMIT 100;
