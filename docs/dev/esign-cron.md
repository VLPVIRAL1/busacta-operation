# E-Signature cron jobs

The e-signature module ships two public cron endpoints under
`/api/public/cron/*`. Both are guarded by `x-cron-secret` matching
`process.env.CRON_SECRET` (project rule for all public cron/webhook
endpoints — same shape as `cron.access-review-check`, `cron.chat-auto-archive`,
`organizer-due-soon-cron`).

## Endpoints

| Path                                    | Recommended cadence | Purpose                                                                                                   |
| --------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------- |
| `POST /api/public/cron/esign-reminders` | every 1 hour        | Re-send signing links for active envelopes whose `last_reminder_at + reminder_cadence_hours` has elapsed. |
| `POST /api/public/cron/esign-expire`    | every 30 minutes    | Move `sent` / `in_progress` envelopes past `expires_at` to `expired`.                                     |

Both endpoints are idempotent:

- Reminders are debounced by `esign_envelopes.last_reminder_at` so two
  ticks inside the cadence window won't double-fire.
- Expiry is a one-way state transition; replays are no-ops.

## Stable URLs

Use the project's stable URLs so renames don't break the schedule:

- Production: `https://one.busacta.com`
- Preview: `https://one.busacta.com`

## Example pg_cron schedule

```sql
-- Reminders, hourly
select cron.schedule(
  'esign-reminders-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://one.busacta.com/api/public/cron/esign-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Expiry sweep, every 30 minutes
select cron.schedule(
  'esign-expire-30min',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://one.busacta.com/api/public/cron/esign-expire',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Set `app.cron_secret` via Supabase `ALTER DATABASE ... SET app.cron_secret =
'...'` (same value as the `CRON_SECRET` runtime secret). Or hard-code the
shared secret in the cron job body if your operator prefers.

## Manual resend

The envelope detail page (`/esign/envelopes/$id`) has a per-recipient
"Resend now" button on the Overview tab. It calls the
`resendRecipientReminder` server fn, which writes the same `reminder_sent`
audit event the cron sweep uses — so manual + scheduled reminders share one
trail.

## Email delivery

Both the cron sweep and the manual resend button enqueue an actual signer
email via `sendSignerLinkEmail` (`src/lib/esign/email.server.ts`), which
posts to the project-wide `enqueue_email` RPC on the `transactional_emails`
queue (template `esign_signer_link`). If the email queue isn't provisioned
yet, the failure is logged but the API call still succeeds and the signing
link is returned to the operator so they can copy it manually.
