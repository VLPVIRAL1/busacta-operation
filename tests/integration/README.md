# Integration tests

These talk to the real (dev) Supabase via the service-role key. They are
**skipped automatically** when `SUPABASE_SERVICE_ROLE_KEY` and
`VITE_SUPABASE_URL` are not set, so CI without secrets stays green.

Run locally:

```bash
export VITE_SUPABASE_URL="https://<ref>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="..."
bunx vitest run tests/integration
```

Each test seeds its own data with a unique marker and cleans up in `afterAll`.
Never point these at production.
