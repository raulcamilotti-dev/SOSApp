WITH canon_users AS (
  SELECT DISTINCT ON (regexp_replace(COALESCE(CAST(u.cpf AS text), ''), '\\D', '', 'g'))
    regexp_replace(COALESCE(CAST(u.cpf AS text), ''), '\\D', '', 'g') AS cpf_norm,
    u.id AS user_id
  FROM users u
  WHERE COALESCE(u.deleted_at, NULL) IS NULL
    AND NULLIF(regexp_replace(COALESCE(CAST(u.cpf AS text), ''), '\\D', '', 'g'), '') IS NOT NULL
  ORDER BY
    regexp_replace(COALESCE(CAST(u.cpf AS text), ''), '\\D', '', 'g'),
    u.created_at NULLS LAST,
    u.id
),
upd AS (
  UPDATE customers c
  SET user_id = cu.user_id,
      updated_at = NOW()
  FROM canon_users cu
  WHERE COALESCE(c.deleted_at, NULL) IS NULL
    AND NULLIF(regexp_replace(COALESCE(CAST(c.cpf AS text), ''), '\\D', '', 'g'), '') = cu.cpf_norm
    AND (c.user_id IS NULL OR c.user_id <> cu.user_id)
  RETURNING c.id
)
SELECT CAST((SELECT COUNT(*) FROM upd) AS integer) AS customers_user_linked;