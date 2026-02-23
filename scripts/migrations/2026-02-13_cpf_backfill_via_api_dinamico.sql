WITH canon_users AS (
  SELECT DISTINCT ON (regexp_replace(COALESCE(u.cpf::text, ''), '\\D', '', 'g'))
    regexp_replace(COALESCE(u.cpf::text, ''), '\\D', '', 'g') AS cpf_norm,
    u.id AS user_id
  FROM users u
  WHERE COALESCE(u.deleted_at, NULL) IS NULL
    AND NULLIF(regexp_replace(COALESCE(u.cpf::text, ''), '\\D', '', 'g'), '') IS NOT NULL
  ORDER BY
    regexp_replace(COALESCE(u.cpf::text, ''), '\\D', '', 'g'),
    CASE WHEN u.tenant_id IS NOT NULL THEN 0 ELSE 1 END,
    u.created_at NULLS LAST,
    u.id
),
canon_customers AS (
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
upd_customers AS (
  UPDATE customers c
  SET user_id = cu.user_id,
      updated_at = NOW()
  FROM canon_users cu
  WHERE COALESCE(c.deleted_at, NULL) IS NULL
    AND NULLIF(regexp_replace(COALESCE(c.cpf::text, ''), '\\D', '', 'g'), '') = cu.cpf_norm
    AND (c.user_id IS NULL OR c.user_id <> cu.user_id)
  RETURNING c.id
),
upd_properties AS (
  UPDATE properties p
  SET customer_id = cc.customer_id,
      updated_at = NOW()
  FROM canon_customers cc
  WHERE COALESCE(p.deleted_at, NULL) IS NULL
    AND NULLIF(regexp_replace(COALESCE(p.cpf::text, ''), '\\D', '', 'g'), '') = cc.cpf_norm
    AND (p.customer_id IS NULL OR p.customer_id <> cc.customer_id)
  RETURNING p.id
)
SELECT
  (SELECT COUNT(*)::int FROM upd_customers) AS customers_updated,
  (SELECT COUNT(*)::int FROM upd_properties) AS properties_updated,
  (SELECT COUNT(*)::int FROM customers WHERE COALESCE(deleted_at, NULL) IS NULL AND user_id IS NOT NULL) AS customers_with_user_id,
  (SELECT COUNT(*)::int FROM properties WHERE COALESCE(deleted_at, NULL) IS NULL AND customer_id IS NOT NULL) AS properties_with_customer_id;