# Automated Database Backup — Admin UI

Frontend-only feature. No schema changes, no server functions, no pg_dump in browser. The browser just fires a webhook to an external worker and lists `.sql` files that the worker uploads into a private Supabase Storage bucket.

## 1. Storage bucket (one-time migration)

Create a **private** bucket `database-backups` with RLS limiting access to admins.

```sql
insert into storage.buckets (id, name, public) values ('database-backups','database-backups', false)
on conflict (id) do nothing;

-- Only super_admin / admin may list/read; only service_role writes
create policy "admins read backups"
on storage.objects for select to authenticated
using (bucket_id = 'database-backups'
       and (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'super_admin')));
```

No insert/update/delete policy for `authenticated` → external worker must upload using the service role key (which is the correct architecture).

## 2. New files

- `src/components/admin/database-backups-card.tsx` — the card UI (header, primary button, table).
- `src/lib/admin/backups.ts` — small client helpers:
  - `listBackups()` → `supabase.storage.from('database-backups').list('', { sortBy: { column: 'created_at', order: 'desc' }, limit: 100 })`
  - `getSignedDownloadUrl(path)` → `createSignedUrl(path, 60)`
  - `triggerBackup(token, userId)` → `fetch(WEBHOOK_URL, { method:'POST', headers:{ Authorization: 'Bearer '+token, 'x-user-id': userId, 'content-type':'application/json' }, body: JSON.stringify({ requestedAt: new Date().toISOString() })})`
- Webhook URL constant: `const BACKUP_WEBHOOK_URL = 'https://my-external-worker.com/trigger-backup'` (placeholder, top of file with a TODO comment).

## 3. Wire into Admin Panel

Mount `<DatabaseBackupsCard />` inside the existing `/admin` landing — add a section below current content in `src/routes/admin/index.tsx` (or its main component) gated to `super_admin`/`admin` (route already is). No new route.

## 4. UI behavior

Card layout (uses existing `Card`, `Button`, `Table`, `toast` from sonner, `Loader2` icon, `<FmtBytes>`/`fmtDMY` helpers from `src/lib/format/*`):

- Header: "Database Backups" + muted description.
- Primary `Button` "Generate Full SQL Backup":
  - Idle → label + Download/Database icon.
  - On click → set `isTriggering=true`, button shows `<Loader2 className="animate-spin"/> Triggering remote backup...`, disabled.
  - Get session: `const { data:{ session } } = await supabase.auth.getSession()`; if no token → error toast and abort.
  - `await triggerBackup(session.access_token, session.user.id)`.
  - Network error → `toast.error('Failed to trigger backup')`, reset state.
  - Success → `toast.success('Backup triggered. The external server is generating the SQL file. It will appear in the list below in a few minutes.')`, immediately `refetch()`, then reset button after 1.5s.
- Table columns: **File**, **Size**, **Created**, **Action**.
  - Rows: only files with `.sql` (or `.sql.gz`) extension.
  - Sort by `created_at` desc.
  - Download button → calls `getSignedDownloadUrl(name)`, opens in new tab.
  - Empty state: "No backups yet — click Generate to create the first one."
  - Loading skeleton on first fetch; subsequent polls are silent.

## 5. Data fetching + polling (TanStack Query)

```ts
const { data, refetch, isLoading } = useQuery({
  queryKey: ["admin", "db-backups"],
  queryFn: listBackups,
  refetchInterval: 15_000, // 15s poll
  refetchIntervalInBackground: false,
  staleTime: 10_000,
});
```

No realtime subscription needed — polling is the spec.

## 6. Security notes (UI only)

- Card is rendered only inside the existing `AuthGuard allow={['super_admin','admin']}` block — no further role check needed in the component.
- Webhook URL is a placeholder. The external worker is expected to (a) verify the bearer token via Supabase JWKS, (b) confirm the caller has admin role, (c) run `pg_dump`, (d) upload to `database-backups` using service-role key. We do NOT implement the worker here.
- We never expose service-role key; we never attempt pg_dump in browser.

## 7. Out of scope

- Backup retention/cleanup UI.
- Restore flow.
- Worker implementation, edge function, or cron scheduling.
- Encrypting/signing the webhook payload (worker validates the JWT).

## 8. Verification

- `bunx tsc --noEmit` clean.
- Manual: open `/admin`, see card, click button → spinner + success toast, list refreshes every 15s, Download opens signed URL.

## Technical details

- Files: 2 new (`database-backups-card.tsx`, `backups.ts`), 1 edit (admin index to mount card), 1 migration (bucket + read policy).
- No new deps.
- Uses existing `supabase` browser client only.
- Webhook constant kept at top of `backups.ts` for easy swap.
