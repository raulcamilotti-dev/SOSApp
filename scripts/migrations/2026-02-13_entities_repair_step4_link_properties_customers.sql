WITH canon_customers AS (
  SELECT DISTINCT ON (regexp_replace(COALESCE(CAST(c.cpf AS text), ''), '\\D', '', 'g'))
    regexp_replace(COALESCE(CAST(c.cpf AS text), ''), '\\D', '', 'g') AS cpf_norm,
    c.id AS customer_id
  FROM customers c
  WHERE COALESCE(c.deleted_at, NULL) IS NULL
    AND NULLIF(regexp_replace(COALESCE(CAST(c.cpf AS text), ''), '\\D', '', 'g'), '') IS NOT NULL
  ORDER BY
    regexp_replace(COALESCE(CAST(c.cpf AS text), ''), '\\D', '', 'g'),
    CASE WHEN c.user_id IS NOT NULL THEN 0 ELSE 1 END,
    CASE WHEN c.tenant_id IS NOT NULL THEN 0 ELSE 1 END,
    c.created_at NULLS LAST,
    c.id
),
upd AS (
  UPDATE properties p
  SET customer_id = cc.customer_id,
      updated_at = NOW()
  FROM canon_customers cc
  WHERE COALESCE(p.deleted_at, NULL) IS NULL
    AND NULLIF(regexp_replace(COALESCE(CAST(p.cpf AS text), ''), '\\D', '', 'g'), '') = cc.cpf_norm
    AND (p.customer_id IS NULL OR p.customer_id <> cc.customer_id)
  RETURNING p.id
)
SELECT CAST((SELECT COUNT(*) FROM upd) AS integer) AS properties_customer_linked;