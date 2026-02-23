WITH canon_users AS (
  SELECT DISTINCT ON (regexp_replace(COALESCE(CAST(u.cpf AS text), ''), '\\D', '', 'g'))
    regexp_replace(COALESCE(CAST(u.cpf AS text), ''), '\\D', '', 'g') AS cpf_norm,
    u.id AS user_id,
    u.fullname,
    u.email,
    u.phone,
    u.created_at
  FROM users u
  WHERE COALESCE(u.deleted_at, NULL) IS NULL
    AND NULLIF(regexp_replace(COALESCE(CAST(u.cpf AS text), ''), '\\D', '', 'g'), '') IS NOT NULL
  ORDER BY
    regexp_replace(COALESCE(CAST(u.cpf AS text), ''), '\\D', '', 'g'),
    u.created_at NULLS LAST,
    u.id
),
cpfs AS (
  SELECT DISTINCT cpf_norm
  FROM (
    SELECT NULLIF(regexp_replace(COALESCE(CAST(p.cpf AS text), ''), '\\D', '', 'g'), '') AS cpf_norm
    FROM properties p
    WHERE COALESCE(p.deleted_at, NULL) IS NULL
    UNION
    SELECT NULLIF(regexp_replace(COALESCE(CAST(u.cpf AS text), ''), '\\D', '', 'g'), '') AS cpf_norm
    FROM users u
    WHERE COALESCE(u.deleted_at, NULL) IS NULL
  ) src
  WHERE cpf_norm IS NOT NULL
),
missing AS (
  SELECT cpfs.cpf_norm
  FROM cpfs
  WHERE NOT EXISTS (
    SELECT 1
    FROM customers c
    WHERE COALESCE(c.deleted_at, NULL) IS NULL
      AND NULLIF(regexp_replace(COALESCE(CAST(c.cpf AS text), ''), '\\D', '', 'g'), '') = cpfs.cpf_norm
  )
),
ins AS (
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
    NULL,
    NOW(),
    NOW()
  FROM missing m
  LEFT JOIN canon_users cu ON cu.cpf_norm = m.cpf_norm
  RETURNING id
)
SELECT CAST((SELECT COUNT(*) FROM ins) AS integer) AS customers_inserted;