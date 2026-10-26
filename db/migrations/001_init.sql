-- Life Admin Tracker — local PostgreSQL schema (fresh database: life_admin_tracker_new)
-- Idempotent: safe to re-run. No Supabase data is migrated; this builds the full
-- schema from scratch, including local auth tables that replace Supabase Auth.

-- 1. Local users (replaces Supabase's auth.users) -------------------------------
create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_app_users_email_lower
  on public.app_users (lower(email));

-- 2. Sessions (replaces Supabase's refresh-token flow) ---------------------------
-- Tokens are stored as sha256 hashes only; the raw values live in http-only-equivalent
-- app cookies. A row is rotated on refresh and revoked on logout/password change.
create table if not exists public.auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  access_token_hash text not null unique,
  refresh_token_hash text not null unique,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists idx_auth_sessions_user on public.auth_sessions (user_id);

-- 3. Categories -------------------------------------------------------------------
create table if not exists public.life_admin_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_life_admin_categories_user
  on public.life_admin_categories (user_id);

-- 4. Items ------------------------------------------------------------------------
create table if not exists public.life_admin_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  title text not null,
  description text,
  category_id uuid
    constraint life_admin_items_category_id_fkey
    references public.life_admin_categories(id) on delete set null,
  due_date date,
  due_time time,
  priority text not null default 'Medium'
    constraint life_admin_items_priority_check
    check (priority in ('Low', 'Medium', 'High', 'Urgent')),
  status text not null default 'Pending'
    constraint life_admin_items_status_check
    check (status in ('Pending', 'Completed', 'Renewed')),
  reminder_days integer[] not null default '{}',
  reminder_minutes integer[] not null default '{}',
  notification_preference text not null default 'dashboard'
    constraint life_admin_items_notification_preference_check
    check (notification_preference in ('dashboard', 'push', 'both')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_life_admin_items_user on public.life_admin_items (user_id);
create index if not exists idx_life_admin_items_user_status on public.life_admin_items (user_id, status);
create index if not exists idx_life_admin_items_due_date on public.life_admin_items (due_date);
create index if not exists idx_life_admin_items_category on public.life_admin_items (category_id);

-- 5. Per-user settings (timezone; app is fixed to Asia/Karachi) --------------------
create table if not exists public.life_admin_user_settings (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  timezone text not null default 'Asia/Karachi',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 6. FCM device tokens --------------------------------------------------------------
create table if not exists public.life_admin_device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  token text not null unique,
  platform text not null default 'web',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz
);

create index if not exists idx_life_admin_device_tokens_user
  on public.life_admin_device_tokens (user_id);

-- 7. Scheduled reminder queue ---------------------------------------------------------
create table if not exists public.life_admin_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  item_id uuid not null
    constraint life_admin_reminders_item_id_fkey
    references public.life_admin_items(id) on delete cascade,
  kind text not null,
  offset_minutes integer not null,
  scheduled_for timestamptz not null,
  channel text not null default 'dashboard'
    constraint life_admin_reminders_channel_check
    check (channel in ('dashboard', 'push', 'both')),
  title text not null default '',
  status text not null default 'pending'
    constraint life_admin_reminders_status_check
    check (status in ('pending', 'processing', 'sent', 'failed', 'canceled')),
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
