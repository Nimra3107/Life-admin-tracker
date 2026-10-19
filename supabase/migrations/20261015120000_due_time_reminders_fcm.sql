-- Due-time reminders + Firebase Cloud Messaging support.
-- Safe and idempotent: only adds columns, tables, indexes and policies.
-- No table is dropped and no existing row is modified.

-- 1. Items: due time, time-based reminder offsets, notification preference -----
alter table public.life_admin_items
  add column if not exists due_time time,
  add column if not exists reminder_minutes integer[] not null default '{}',
  add column if not exists notification_preference text not null default 'dashboard';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'life_admin_items_notification_preference_check'
  ) then
    alter table public.life_admin_items
      add constraint life_admin_items_notification_preference_check
      check (notification_preference in ('dashboard', 'push', 'both'));
  end if;
end $$;

-- 2. Per-user settings (IANA time zone) ----------------------------------------
create table if not exists public.life_admin_user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. FCM device tokens ----------------------------------------------------------
create table if not exists public.life_admin_device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text not null default 'web',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz
);

create index if not exists idx_life_admin_device_tokens_user
  on public.life_admin_device_tokens (user_id);

-- 4. Scheduled reminder queue ---------------------------------------------------
create table if not exists public.life_admin_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null
    constraint life_admin_reminders_item_id_fkey
    references public.life_admin_items(id) on delete cascade,
  kind text not null,
  offset_minutes integer not null,
  scheduled_for timestamptz not null,
  channel text not null default 'dashboard',
  title text not null default '',
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_life_admin_reminders_due
  on public.life_admin_reminders (status, scheduled_for);

create index if not exists idx_life_admin_reminders_item
  on public.life_admin_reminders (item_id);

-- Duplicate prevention: at most one pending reminder per item + offset.
create unique index if not exists idx_life_admin_reminders_pending_unique
  on public.life_admin_reminders (item_id, kind)
  where status = 'pending';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'life_admin_reminders_status_check'
  ) then
    alter table public.life_admin_reminders
      add constraint life_admin_reminders_status_check
      check (status in ('pending', 'processing', 'sent', 'failed', 'canceled'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'life_admin_reminders_channel_check'
  ) then
    alter table public.life_admin_reminders
      add constraint life_admin_reminders_channel_check
      check (channel in ('dashboard', 'push', 'both'));
  end if;
end $$;

-- 5. Row Level Security: users only ever see and touch their own rows.
--    The cron endpoint uses the service role key, which bypasses RLS.
alter table public.life_admin_user_settings enable row level security;
alter table public.life_admin_device_tokens enable row level security;
alter table public.life_admin_reminders enable row level security;

drop policy if exists "own settings" on public.life_admin_user_settings;
create policy "own settings" on public.life_admin_user_settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "own device tokens" on public.life_admin_device_tokens;
create policy "own device tokens" on public.life_admin_device_tokens
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "own reminders" on public.life_admin_reminders;
create policy "own reminders" on public.life_admin_reminders
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 6. Grants ---------------------------------------------------------------------
grant select, insert, update, delete on public.life_admin_user_settings to authenticated;
grant select, insert, update, delete on public.life_admin_device_tokens to authenticated;
grant select, insert, update, delete on public.life_admin_reminders to authenticated;
grant select, insert, update, delete on public.life_admin_user_settings to service_role;
grant select, insert, update, delete on public.life_admin_device_tokens to service_role;
grant select, insert, update, delete on public.life_admin_reminders to service_role;

-- 7. Make PostgREST pick up the new tables immediately (otherwise the API can
--    keep answering 404/PGRST205 from its schema cache).
notify pgrst, 'reload schema';

-- 8. Production trigger: run the processor every 10 seconds so reminders fire
--    at their scheduled instant. pg_cron 1.5+ supports second intervals
--    ('10 seconds'); Vercel Cron cannot run more often than once a minute, so
--    it is only a fallback. Uncomment, replace the URL and secret, and run this
--    AFTER deploying the app. Local runs use `npm run scheduler:local`, which
--    ticks at the same 10-second cadence.
--
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
-- select cron.schedule(
--   'life-admin-reminders',
--   '10 seconds',
--   $$
--   select net.http_get(
--     url := 'https://YOUR-APP-URL/api/cron/reminders',
--     headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET')
--   );
--   $$
-- );
