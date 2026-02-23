SELECT
  (SELECT COUNT(*)::int FROM customers WHERE COALESCE(deleted_at, NULL) IS NULL AND user_id IS NOT NULL) AS customers_with_user_id,
  (SELECT COUNT(*)::int FROM properties WHERE COALESCE(deleted_at, NULL) IS NULL AND customer_id IS NOT NULL) AS properties_with_customer_id,
  (SELECT COUNT(*)::int FROM properties WHERE COALESCE(deleted_at, NULL) IS NULL AND NULLIF(regexp_replace(COALESCE(cpf::text, ''), '\\D', '', 'g'), '') IS NOT NULL AND customer_id IS NULL) AS properties_with_cpf_without_customer;