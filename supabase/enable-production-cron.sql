-- Enable the production reminder scheduler for the deployed app.
--
-- WHY THIS IS NEEDED: /api/cron/reminders only runs when something calls it.
-- Locally the dev server ticks it every 10 seconds (instrumentation.ts). In
-- production nothing calls it until this schedule exists — Vercel's cron in
-- vercel.json runs once a day, which is far too rare for minute-level
-- reminders, so without this file production reminders never fire on time.
--
-- HOW TO APPLY (one time, in the Supabase Dashboard):
--   1. Deploy the app and note its public URL, e.g. https://your-app.vercel.app
--   2. Set the same CRON_SECRET in the deployment's environment variables
--      (Vercel → Project → Settings → Environment Variables).
--   3. Replace BOTH placeholders below (YOUR_APP_URL, YOUR_CRON_SECRET).
--   4. Run this whole file in Supabase Dashboard → SQL Editor → New query.
--   5. Verify: run  select jobname, schedule, active from cron.job;
--      you should see life-admin-reminders | 10 seconds | t
--
-- Re-running this file is safe: it replaces the previous schedule.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('life-admin-reminders')
where exists (select 1 from cron.job where jobname = 'life-admin-reminders');

select cron.schedule(
  'life-admin-reminders',
  '10 seconds',
  $$
  select net.http_get(
    url := 'https://YOUR_APP_URL/api/cron/reminders',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET')
  );
  $$
);
