WITH
norm_users AS (
  UPDATE users u
  SET cpf = NULLIF(regexp_replace(COALESCE(u.cpf::text, ''), '\\D', '', 'g'), '')
  WHERE u.cpf IS NOT NULL
    AND u.cpf <> NULLIF(regexp_replace(COALESCE(u.cpf::text, ''), '\\D', '', 'g'), '')
  RETURNING u.id
),
norm_customers AS (
  UPDATE customers c
  SET cpf = NULLIF(regexp_replace(COALESCE(c.cpf::text, ''), '\\D', '', 'g'), '')
  WHERE c.cpf IS NOT NULL
    AND c.cpf <> NULLIF(regexp_replace(COALESCE(c.cpf::text, ''), '\\D', '', 'g'), '')
  RETURNING c.id
),
norm_properties AS (
  UPDATE properties p
  SET cpf = NULLIF(regexp_replace(COALESCE(p.cpf::text, ''), '\\D', '', 'g'), '')
  WHERE p.cpf IS NOT NULL
    AND p.cpf <> NULLIF(regexp_replace(COALESCE(p.cpf::text, ''), '\\D', '', 'g'), '')
  RETURNING p.id
),
canon_users AS (
  SELECT DISTINCT ON (regexp_replace(COALESCE(u.cpf::text, ''), '\\D', '', 'g'))
    regexp_replace(COALESCE(u.cpf::text, ''), '\\D', '', 'g') AS cpf_norm,
    u.id AS user_id,
    u.fullname,
    u.email,
    u.phone,
    u.tenant_id,
    u.created_at
  FROM users u
  WHERE COALESCE(u.deleted_at, NULL) IS NULL
    AND NULLIF(regexp_replace(COALESCE(u.cpf::text, ''), '\\D', '', 'g'), '') IS NOT NULL
  ORDER BY
    regexp_replace(COALESCE(u.cpf::text, ''), '\\D', '', 'g'),
    CASE WHEN u.tenant_id IS NOT NULL THEN 0 ELSE 1 END,
    u.created_at NULLS LAST,
    u.id
),
canon_customers_before AS (
  SELECT DISTINCT ON (regexp_replace(COALESCE(c.cpf::text, ''), '\\D', '', 'g'))
    regexp_replace(COALESCE(c.cpf::text, ''), '\\D', '', 'g') AS cpf_norm,
    c.id AS customer_id
  FROM customers c
  WHERE COALESCE(c.deleted_at, NULL) IS NULL
    AND NULLIF(regexp_replace(COALESCE(c.cpf::text, ''), '\\D', '', 'g'), '') IS NOT NULL
  ORDER BY
    regexp_replace(COALESCE(c.cpf::text, ''), '\\D', '', 'g'),
    CASE WHEN c.user_id IS NOT NULL THEN 0 ELSE 1 END,
    CASE WHEN c.tenant_id IS NOT NULL THEN 0 ELSE 1 END,
    c.created_at NULLS LAST,
    c.id
),
missing_cpfs AS (
  SELECT DISTINCT cpf_norm
  FROM (
    SELECT NULLIF(regexp_replace(COALESCE(p.cpf::text, ''), '\\D', '', 'g'), '') AS cpf_norm
    FROM properties p
    WHERE COALESCE(p.deleted_at, NULL) IS NULL
    UNION
    SELECT NULLIF(regexp_replace(COALESCE(u.cpf::text, ''), '\\D', '', 'g'), '') AS cpf_norm
    FROM users u
    WHERE COALESCE(u.deleted_at, NULL) IS NULL
  ) src
  WHERE cpf_norm IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM canon_customers_before ccb
      WHERE ccb.cpf_norm = src.cpf_norm
    )
),
insert_missing_customers AS (
  INSERT INTO customers (
    name,
    email,
    phone,
    cpf,
    user_id,
    tenant_id,
    created_at,
    updated_at
  )
  SELECT
    COALESCE(NULLIF(TRIM(cu.fullname), ''), 'Cliente ' || m.cpf_norm) AS name,
    NULLIF(TRIM(cu.email), '') AS email,
    NULLIF(TRIM(cu.phone), '') AS phone,
    m.cpf_norm AS cpf,
    cu.user_id,
    cu.tenant_id,
    NOW(),
    NOW()
  FROM missing_cpfs m
  LEFT JOIN canon_users cu ON cu.cpf_norm = m.cpf_norm
  RETURNING id, cpf
),
canon_customers_after AS (
  SELECT DISTINCT ON (regexp_replace(COALESCE(c.cpf::text, ''), '\\D', '', 'g'))
    regexp_replace(COALESCE(c.cpf::text, ''), '\\D', '', 'g') AS cpf_norm,
    c.id AS customer_id
  FROM customers c
  WHERE COALESCE(c.deleted_at, NULL) IS NULL
    AND NULLIF(regexp_replace(COALESCE(c.cpf::text, ''), '\\D', '', 'g'), '') IS NOT NULL
  ORDER BY
    regexp_replace(COALESCE(c.cpf::text, ''), '\\D', '', 'g'),
    CASE WHEN c.user_id IS NOT NULL THEN 0 ELSE 1 END,
    CASE WHEN c.tenant_id IS NOT NULL THEN 0 ELSE 1 END,
    c.created_at NULLS LAST,
    c.id
),
backfill_customer_user AS (
  UPDATE customers c
  SET user_id = cu.user_id,
      updated_at = NOW()
  FROM canon_users cu
  WHERE COALESCE(c.deleted_at, NULL) IS NULL
    AND NULLIF(regexp_replace(COALESCE(c.cpf::text, ''), '\\D', '', 'g'), '') = cu.cpf_norm
    AND (c.user_id IS NULL OR c.user_id <> cu.user_id)
  RETURNING c.id
),
backfill_property_customer AS (
  UPDATE properties p
  SET customer_id = cca.customer_id,
      updated_at = NOW()
  FROM canon_customers_after cca
  WHERE COALESCE(p.deleted_at, NULL) IS NULL
    AND NULLIF(regexp_replace(COALESCE(p.cpf::text, ''), '\\D', '', 'g'), '') = cca.cpf_norm
    AND (p.customer_id IS NULL OR p.customer_id <> cca.customer_id)
  RETURNING p.id
)
SELECT
  (SELECT COUNT(*)::int FROM norm_users) AS users_cpf_normalized,
  (SELECT COUNT(*)::int FROM norm_customers) AS customers_cpf_normalized,
  (SELECT COUNT(*)::int FROM norm_properties) AS properties_cpf_normalized,
  (SELECT COUNT(*)::int FROM insert_missing_customers) AS customers_inserted,
  (SELECT COUNT(*)::int FROM backfill_customer_user) AS customers_user_linked,
  (SELECT COUNT(*)::int FROM backfill_property_customer) AS properties_customer_linked,
  (SELECT COUNT(*)::int FROM customers c WHERE COALESCE(c.deleted_at, NULL) IS NULL AND c.user_id IS NOT NULL) AS customers_with_user_id,
  (SELECT COUNT(*)::int FROM properties p WHERE COALESCE(p.deleted_at, NULL) IS NULL AND p.customer_id IS NOT NULL) AS properties_with_customer_id,
  (SELECT COUNT(*)::int FROM properties p WHERE COALESCE(p.deleted_at, NULL) IS NULL AND NULLIF(regexp_replace(COALESCE(p.cpf::text, ''), '\\D', '', 'g'), '') IS NOT NULL AND p.customer_id IS NULL) AS properties_with_cpf_without_customer;