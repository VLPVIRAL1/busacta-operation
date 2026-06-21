# Auto-categorisation ML — schedule, cron & Gemini setup

## Training schedule (DB-driven, edit from the UI)

The local classifier retrains on a schedule that admins control from
**Admin → Auto-Categorisation → ML & Gemini → Training schedule**. Settings
(enabled, frequency, run times, min-gap) live in `app_settings`
(`id = 'categorisation_training'`).

A single pg_cron job ticks every 15 minutes and calls the endpoint below; the
endpoint decides whether a retrain is actually due based on the config — so the
time/frequency is fully editable from the UI, and you can run multiple times a
day (interval mode, or several specific times). Times are **UTC**.

| Path                                         | pg_cron cadence | Purpose                                                        |
| -------------------------------------------- | --------------- | -------------------------------------------------------------- |
| `POST /api/public/cron/categorisation-train` | `*/15 * * * *`  | Tick — retrains only if the configured schedule says it's due. |

Protected by `x-cron-secret` matching `process.env.CRON_SECRET` (same shape as
`cron.access-review-check`, `cron.esign-reminders`). The pg_cron job is created
by the migration `20260610000000_categorisation_training_schedule.sql`:

```sql
select cron.schedule(
  'categorisation-train-tick',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://one.busacta.com/api/public/cron/categorisation-train',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Admins can also retrain on demand via **Train model now**.

## Gemini credentials (managed from the UI)

Gemini API credentials are set in **Admin → Integration → Gemini** and stored in
the `integration_credentials` table (`integration_key = 'gemini_api'`,
masked-secret pattern like WhatsApp/Microsoft). The `categorise-document` Edge
Function reads them server-side. **No environment secrets required** — though the
function still falls back to `GEMINI_API_KEY` / `GEMINI_TIER` / `GEMINI_MODEL` /
`GEMINI_MAX_INPUT_CHARS` env vars if no DB row exists (backward compat).

Get an API key from Google AI Studio (https://aistudio.google.com → _Get API
key_), paste it on the Gemini tab, pick the model/tier, enable, and **Test
connection**.

If Gemini is unset or disabled, the fallback is silently skipped — rules + local
ML still run and unresolved docs stay in **Needs Review**.

## Deploy

After applying migrations, deploy the Edge Function:

```bash
supabase functions deploy categorise-document
```
