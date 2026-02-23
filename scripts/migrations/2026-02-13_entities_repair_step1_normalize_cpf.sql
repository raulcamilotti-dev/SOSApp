WITH
u AS (
  UPDATE users
  SET cpf = NULLIF(regexp_replace(COALESCE(CAST(cpf AS text), ''), '\\D', '', 'g'), '')
  WHERE cpf IS NOT NULL
    AND cpf <> NULLIF(regexp_replace(COALESCE(CAST(cpf AS text), ''), '\\D', '', 'g'), '')
  RETURNING id
),
c AS (
  UPDATE customers
  SET cpf = NULLIF(regexp_replace(COALESCE(CAST(cpf AS text), ''), '\\D', '', 'g'), '')
  WHERE cpf IS NOT NULL
    AND cpf <> NULLIF(regexp_replace(COALESCE(CAST(cpf AS text), ''), '\\D', '', 'g'), '')
  RETURNING id
),
p AS (
  UPDATE properties
  SET cpf = NULLIF(regexp_replace(COALESCE(CAST(cpf AS text), ''), '\\D', '', 'g'), '')
  WHERE cpf IS NOT NULL
    AND cpf <> NULLIF(regexp_replace(COALESCE(CAST(cpf AS text), ''), '\\D', '', 'g'), '')
  RETURNING id
)
SELECT
  CAST((SELECT COUNT(*) FROM u) AS integer) AS users_cpf_normalized,
  CAST((SELECT COUNT(*) FROM c) AS integer) AS customers_cpf_normalized,
  CAST((SELECT COUNT(*) FROM p) AS integer) AS properties_cpf_normalized;