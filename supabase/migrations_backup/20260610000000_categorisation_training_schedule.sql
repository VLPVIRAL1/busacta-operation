-- DB-driven training schedule for the document-categorisation ML model.
-- A pg_cron "tick" fires every 15 minutes and hits the schedule-aware endpoint,
-- which decides whether to actually retrain based on app_settings config. This
-- lets admins edit the run time / frequency (and run multiple times a day) from
-- /admin/categorisation?tab=ml without touching pg_cron.

-- 1. Seed the default schedule config (nightly via 24h interval).
insert into app_settings (id, value)
values (
  'categorisation_training',
  jsonb_build_object(
    'enabled', true,
    'mode', 'interval',            -- 'interval' | 'times'
    'interval_hours', 24,
    'times', jsonb_build_array('02:00'),  -- UTC HH:MM, used in 'times' mode
    'min_gap_minutes', 60,
    'last_run_at', null,
    'last_run_status', null,
    'last_run_summary', null
  )
)
on conflict (id) do nothing;

-- 2. Replace the fixed nightly cron with a 15-minute tick. The endpoint itself
--    gates whether a run actually happens, per the config above.
do $$ begin
  perform cron.unschedule('categorisation-train-nightly');
exception when others then null;
end $$;

do $$ begin
  perform cron.unschedule('categorisation-train-tick');
exception when others then null;
end $$;

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
