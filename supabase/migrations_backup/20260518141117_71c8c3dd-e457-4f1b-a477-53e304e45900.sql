CREATE OR REPLACE FUNCTION public.table_row_estimate(p_table regclass)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
  SELECT GREATEST(reltuples, 0)::bigint
  FROM pg_class
  WHERE oid = p_table;
$$;

REVOKE EXECUTE ON FUNCTION public.table_row_estimate(regclass) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.table_row_estimate(regclass) TO authenticated;