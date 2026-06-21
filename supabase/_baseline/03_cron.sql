-- ============================================================
-- 03 · Scheduled jobs (pg_cron)
-- ⚠ ENVIRONMENT-SPECIFIC: update the URLs to your deployment and configure the
--    'app.cron_secret' DB setting (ALTER DATABASE ... SET app.cron_secret = '...')
--    or your secret mechanism before enabling. Safe to comment this whole block
--    out on a test server. Requires pg_cron + pg_net (see 00_extensions.sql).
-- ============================================================
select cron.schedule('chat-auto-archive-daily', '0 3 * * *', ' SELECT public.run_chat_auto_archive(); ');

select cron.schedule('organizer-due-soon-daily', '0 14 * * *', '
  SELECT net.http_post(
    url := ''https://project--32ad53cf-7e33-44a8-9c04-082c1ea10491.lovable.app/api/public/organizer-due-soon-cron'',
    headers := jsonb_build_object(
      ''Content-Type'', ''application/json'',
      ''x-cron-secret'', current_setting(''app.cron_secret'', true)
    ),
    body := ''{}''::jsonb
  );
  ');

select cron.schedule('categorisation-train-tick', '*/15 * * * *', '
  select net.http_post(
    url := ''https://one.busacta.com/api/public/cron/categorisation-train'',
    headers := jsonb_build_object(
      ''Content-Type'', ''application/json'',
      ''x-cron-secret'', current_setting(''app.cron_secret'', true)
    ),
    body := ''{}''::jsonb
  );
  ');
