# BusAcTa Backup Worker

Tiny Node service that the **Admin → Database Backups** button calls. It:

1. Verifies the caller's Supabase JWT.
2. Checks the user has `admin` or `super_admin` via `public.has_role()`.
3. Runs `pg_dump` against your Supabase database.
4. Uploads the resulting `.sql` file to the private `database-backups` Storage bucket.

The frontend never sees the service-role key or DB URL.

---

## Env vars

| Name                        | Where to get it                                                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`              | `https://sgewqhxcknlllpkcurkf.supabase.co`                                                                                                      |
| `SUPABASE_SERVICE_ROLE_KEY` | Lovable Cloud → Connectors → Lovable Cloud → API keys → **service_role**                                                                        |
| `DATABASE_URL`              | Lovable Cloud → Connectors → Lovable Cloud → Database → **Connection string (URI)**. Use the **Session pooler** URI on port `5432` for pg_dump. |
| `PORT`                      | optional, default `8080`                                                                                                                        |

---

## Deploy

### Render (easiest)

1. New → Web Service → connect this repo, set root directory to `worker/backup-worker`.
2. Runtime: **Docker**.
3. Add the three env vars above.
4. Deploy. Copy the public URL (e.g. `https://busacta-backup.onrender.com`).

### Fly.io

```bash
cd worker/backup-worker
fly launch --no-deploy        # generates fly.toml
fly secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... DATABASE_URL=...
fly deploy
```

### Railway

New project → Deploy from repo → root `worker/backup-worker` → add env vars → deploy.

### Local test

```bash
cd worker/backup-worker
npm install
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... DATABASE_URL=... npm start
```

You need `pg_dump` v15+ locally for the local test (Docker handles this in prod).

---

## Wire it into the app

Once deployed, edit **`src/lib/admin/backups.ts`** and replace:

```ts
export const BACKUP_WEBHOOK_URL = "https://my-external-worker.com/trigger-backup";
```

with your deployed URL, e.g.:

```ts
export const BACKUP_WEBHOOK_URL = "https://busacta-backup.onrender.com/trigger-backup";
```

Click **Generate Full SQL Backup** in the Admin panel — within a minute or two the new file appears in the table and Download issues a 60-second signed URL.

---

## Security notes

- Service-role key lives **only** on the worker host. Never in the frontend bundle.
- The `database-backups` bucket has **no** insert policy for `authenticated`; only service-role can upload.
- Read policy restricts list/download to `admin` / `super_admin`.
- The worker re-verifies admin role on every request — token alone is not enough.
