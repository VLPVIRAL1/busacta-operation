-- Benchmark the inbox_summary RPC. Run after seed-inbox-stress.sql.
-- USAGE:
--   psql -v uid="'<user-uuid>'" -f scripts/bench-inbox-summary.sql

-- Impersonate the seed user so SECURITY DEFINER sees auth.uid() = :uid.
SET LOCAL role authenticated;
SET LOCAL request.jwt.claim.sub = :uid;

\timing on

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT count(*) FROM public.inbox_summary('mine');

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT count(*) FROM public.inbox_summary('all');

-- p95 sample: 20 runs, look at the spread.
DO $$
DECLARE
  i int; t0 timestamptz; ms numeric;
BEGIN
  FOR i IN 1..20 LOOP
    t0 := clock_timestamp();
    PERFORM count(*) FROM public.inbox_summary('mine');
    ms := EXTRACT(MILLISECONDS FROM clock_timestamp() - t0);
    RAISE NOTICE 'mine run % : % ms', i, round(ms,1);
  END LOOP;
END $$;
