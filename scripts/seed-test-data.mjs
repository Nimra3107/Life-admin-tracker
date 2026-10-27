#!/usr/bin/env node
/**
 * Seeds 10 local test users with realistic Life Admin data.
 *
 * Safety:
 *  - Dry run by default; pass --apply to write.
 *  - Refuses non-local databases unless --allow-remote is passed.
 *  - Only touches seedNN@example.test accounts and rows owned by them.
 *  - All writes happen in one transaction.
 *  - Pending reminders are future-dated and dashboard-only, so the local
 *    scheduler never attempts a real FCM push. Device tokens are disabled.
 *
 * Usage:
 *   npm run seed:test
 *   npm run seed:test:apply
 *   SEED_PASSWORD='your-test-password' npm run seed:test:apply
 */
import { existsSync, readFileSync } from 'node:fs'
import { Client } from 'pg'
import { hashPassword } from '../lib/auth/passwords.ts'
import { APP_TIMEZONE, zonedTimeToUtc } from '../lib/time.ts'

const SEED_USER_COUNT = 10
const DEFAULT_SEED_PASSWORD = 'SeedTest!2026'
const DAY_MS = 24 * 60 * 60 * 1000

const args = new Set(process.argv.slice(2))
const APPLY = args.has('--apply')
const ALLOW_REMOTE = args.has('--allow-remote')

const SEED_USERS = Array.from({ length: SEED_USER_COUNT }, (_, index) => ({
  index,
  id: `5eed0000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  email: `seed${String(index + 1).padStart(2, '0')}@example.test`,
}))
const SEED_IDS = SEED_USERS.map((user) => user.id)

const CATEGORIES = ['Bills', 'Documents', 'Insurance', 'Subscriptions', 'Health', 'Home', 'Vehicle', 'Travel']
const ITEMS_PER_USER = 14

const ITEM_TEMPLATES = [
  { category: 'Bills', title: 'Pay electricity bill', description: 'Monthly electricity bill', priority: 'High', status: 'Pending', dueOffsetDays: 10, dueTime: '18:00', reminderDays: [3, 1], reminderMinutes: [120], notificationPreference: 'both' },
  { category: 'Bills', title: 'Pay water bill', description: 'Quarterly water utility bill', priority: 'Medium', status: 'Pending', dueOffsetDays: 18, dueTime: '10:00', reminderDays: [3], reminderMinutes: [], notificationPreference: 'dashboard' },
  { category: 'Bills', title: 'Pay internet bill', description: 'Monthly fiber internet bill', priority: 'High', status: 'Completed', dueOffsetDays: -12, dueTime: '09:00', reminderDays: [3, 1], reminderMinutes: [], notificationPreference: 'dashboard' },
  { category: 'Bills', title: 'Pay parking fine', description: 'Municipal parking fine', priority: 'Urgent', status: 'Pending', dueOffsetDays: -3, dueTime: '17:00', reminderDays: [], reminderMinutes: [], notificationPreference: 'dashboard' },
  { category: 'Documents', title: 'Renew passport', description: 'Passport renewal application', priority: 'Urgent', status: 'Pending', dueOffsetDays: 45, dueTime: '11:00', reminderDays: [30, 7, 1], reminderMinutes: [], notificationPreference: 'both' },
  { category: 'Documents', title: 'Renew national ID card', description: 'National identity card renewal', priority: 'High', status: 'Pending', dueOffsetDays: 60, dueTime: '10:30', reminderDays: [30, 7], reminderMinutes: [], notificationPreference: 'dashboard' },
  { category: 'Documents', title: 'File annual tax return', description: 'Submit the annual income tax return', priority: 'Urgent', status: 'Pending', dueOffsetDays: 25, dueTime: '17:00', reminderDays: [14, 3, 1], reminderMinutes: [60], notificationPreference: 'both' },
  { category: 'Documents', title: 'Shred old tax documents', description: 'Dispose of tax records older than seven years', priority: 'Low', status: 'Completed', dueOffsetDays: -60, dueTime: null, reminderDays: [], reminderMinutes: [], notificationPreference: 'dashboard' },
  { category: 'Insurance', title: 'Renew car insurance', description: 'Annual comprehensive car insurance', priority: 'High', status: 'Pending', dueOffsetDays: 30, dueTime: '12:00', reminderDays: [30, 7, 1], reminderMinutes: [], notificationPreference: 'both' },
  { category: 'Insurance', title: 'Renew health insurance', description: 'Family health insurance policy', priority: 'High', status: 'Renewed', dueOffsetDays: -40, dueTime: '12:00', reminderDays: [30, 7], reminderMinutes: [], notificationPreference: 'dashboard' },
  { category: 'Subscriptions', title: 'Renew streaming subscription', description: 'Monthly streaming plan', priority: 'Low', status: 'Pending', dueOffsetDays: 7, dueTime: '08:00', reminderDays: [1], reminderMinutes: [], notificationPreference: 'dashboard' },
  { category: 'Subscriptions', title: 'Renew domain name', description: 'Personal website domain renewal', priority: 'Medium', status: 'Pending', dueOffsetDays: 75, dueTime: '09:00', reminderDays: [30, 7, 1], reminderMinutes: [], notificationPreference: 'dashboard' },
  { category: 'Health', title: 'Book dentist appointment', description: 'Routine dental checkup and cleaning', priority: 'Medium', status: 'Pending', dueOffsetDays: 20, dueTime: '15:30', reminderDays: [7, 1], reminderMinutes: [120], notificationPreference: 'dashboard' },
  { category: 'Health', title: 'Annual health checkup', description: 'Complete annual medical checkup', priority: 'High', status: 'Completed', dueOffsetDays: -25, dueTime: '09:30', reminderDays: [7, 1], reminderMinutes: [], notificationPreference: 'dashboard' },
  { category: 'Home', title: 'Replace HVAC filter', description: 'Replace the home air filter', priority: 'Low', status: 'Pending', dueOffsetDays: 14, dueTime: '10:00', reminderDays: [3], reminderMinutes: [], notificationPreference: 'dashboard' },
  { category: 'Home', title: 'Home maintenance inspection', description: 'Annual property maintenance inspection', priority: 'Medium', status: 'Pending', dueOffsetDays: 90, dueTime: '11:00', reminderDays: [14, 3], reminderMinutes: [], notificationPreference: 'dashboard' },
  { category: 'Vehicle', title: 'Vehicle registration renewal', description: 'Annual vehicle registration renewal', priority: 'High', status: 'Pending', dueOffsetDays: 50, dueTime: '09:00', reminderDays: [30, 7, 1], reminderMinutes: [], notificationPreference: 'both' },
  { category: 'Vehicle', title: 'Car service appointment', description: 'Scheduled car maintenance service', priority: 'Medium', status: 'Completed', dueOffsetDays: -8, dueTime: '14:00', reminderDays: [3, 1], reminderMinutes: [60], notificationPreference: 'dashboard' },
  { category: 'Travel', title: 'Renew travel visa', description: 'Long-stay travel visa renewal', priority: 'High', status: 'Pending', dueOffsetDays: 120, dueTime: '10:00', reminderDays: [30, 7, 1], reminderMinutes: [], notificationPreference: 'dashboard' },
]

function fail(message) {
  throw new Error(message)
}

function sanitizeError(error) {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, 'postgresql://***')
}

function readDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/)
      if (match) return match[1].trim().replace(/^["']|["']$/g, '')
    }
  }
  return ''
}

function todayInAppTimezone() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const pick = (type) => parts.find((part) => part.type === type)?.value
  return `${pick('year')}-${pick('month')}-${pick('day')}`
}

function addDays(dateString, days) {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

function templatesForUser(userIndex) {
  return Array.from(
    { length: ITEMS_PER_USER },
    (_, itemIndex) => ITEM_TEMPLATES[(userIndex * 3 + itemIndex) % ITEM_TEMPLATES.length]
  )
}

function buildPendingReminders(item, now) {
  const rows = []
  if (!item.due_date) return rows

  const anchor = zonedTimeToUtc(item.due_date, item.due_time ?? '09:00', APP_TIMEZONE)
  const offsets = []
  for (const days of item.reminder_days ?? []) {
    if (Number.isInteger(days) && days >= 0 && days <= 365) offsets.push([`${days}d`, days * 1440])
  }
  if (item.due_time) {
    for (const minutes of item.reminder_minutes ?? []) {
      if (Number.isInteger(minutes) && minutes >= 0 && minutes <= 1440) offsets.push([`${minutes}m`, minutes])
    }
  }

  const seen = new Set()
  for (const [kind, offsetMinutes] of offsets) {
    if (seen.has(kind)) continue
    seen.add(kind)
    const scheduledFor = new Date(anchor.getTime() - offsetMinutes * 60_000)
    if (scheduledFor.getTime() <= now.getTime()) continue
    rows.push({
      user_id: item.user_id,
      item_id: item.id,
      kind,
      offset_minutes: offsetMinutes,
      scheduled_for: scheduledFor.toISOString(),
      channel: 'dashboard',
      title: item.title,
      status: 'pending',
      attempts: 0,
      last_error: null,
      sent_at: null,
    })
  }
  return rows
}

function buildHistoricalReminder(item) {
  const anchor = zonedTimeToUtc(item.due_date, item.due_time ?? '09:00', APP_TIMEZONE)
  const scheduledFor = new Date(anchor.getTime() - DAY_MS)
  const status = item.status === 'Renewed' ? 'canceled' : 'sent'
  return {
    user_id: item.user_id,
    item_id: item.id,
    kind: '1d',
    offset_minutes: 1440,
    scheduled_for: scheduledFor.toISOString(),
    channel: item.notification_preference,
    title: item.title,
    status,
    attempts: status === 'sent' ? 1 : 0,
    last_error: null,
    sent_at: status === 'sent' ? new Date(scheduledFor.getTime() + 60_000).toISOString() : null,
  }
}

async function insertMany(client, table, columns, rows) {
  if (!rows.length) return
  const values = []
  const tuples = rows.map((row) => {
    const placeholders = columns.map((column) => {
      values.push(row[column])
      return `$${values.length}`
    })
    return `(${placeholders.join(', ')})`
  })
  await client.query(
    `insert into ${table} (${columns.join(', ')}) values ${tuples.join(', ')}`,
    values
  )
}

async function nonSeedCounts(client) {
  const result = await client.query(
    `select
       (select count(*) from app_users where id <> all($1::uuid[]))::int as users,
       (select count(*) from life_admin_categories where user_id <> all($1::uuid[]))::int as categories,
       (select count(*) from life_admin_items where user_id <> all($1::uuid[]))::int as items,
       (select count(*) from life_admin_reminders where user_id <> all($1::uuid[]))::int as reminders,
       (select count(*) from life_admin_device_tokens where user_id <> all($1::uuid[]))::int as device_tokens,
       (select count(*) from life_admin_user_settings where user_id <> all($1::uuid[]))::int as settings`,
    [SEED_IDS]
  )
  return result.rows[0]
}

async function verifySeed(client) {
  const perUser = await client.query(
    `select u.email,
       (select count(*) from life_admin_categories c where c.user_id = u.id)::int as categories,
       (select count(*) from life_admin_items i where i.user_id = u.id)::int as items,
       (select count(*) from life_admin_reminders r where r.user_id = u.id)::int as reminders,
       (select count(*) from life_admin_reminders r where r.user_id = u.id and r.status = 'pending')::int as pending,
       (select count(*) from life_admin_device_tokens d where d.user_id = u.id)::int as device_tokens,
       (select count(*) from life_admin_user_settings s where s.user_id = u.id)::int as settings
     from app_users u
     where u.id = any($1::uuid[])
     order by u.email`,
    [SEED_IDS]
  )

  const issues = (
    await client.query(
      `select
         (select count(*) from life_admin_items i
            join life_admin_categories c on c.id = i.category_id
           where i.user_id = any($1::uuid[]) and c.user_id <> i.user_id)::int as item_category_mismatch,
         (select count(*) from life_admin_reminders r
            join life_admin_items i on i.id = r.item_id
           where r.user_id = any($1::uuid[]) and i.user_id <> r.user_id)::int as reminder_item_mismatch,
         (select count(*) from life_admin_reminders
           where user_id = any($1::uuid[]) and status = 'pending' and scheduled_for <= now())::int as pending_due,
         (select count(*) from life_admin_reminders
           where user_id = any($1::uuid[]) and status = 'pending' and channel <> 'dashboard')::int as pending_push`,
      [SEED_IDS]
    )
  ).rows[0]

  const after = await nonSeedCounts(client)
  return { perUser: perUser.rows, issues, after }
}

async function main() {
  const nodeMajor = Number(process.versions.node.split('.')[0])
  if (nodeMajor < 22) fail('Node.js 22 or newer is required to import the TypeScript password helper.')

  const databaseUrl = readDatabaseUrl()
  if (!databaseUrl) fail('DATABASE_URL is not configured. Set it in .env.local or the environment.')

  const parsedUrl = new URL(databaseUrl)
  const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
  if (!localHosts.has(parsedUrl.hostname) && !ALLOW_REMOTE) {
    fail('Refusing to seed a non-local database. Pass --allow-remote to override.')
  }

  const password = process.env.SEED_PASSWORD || DEFAULT_SEED_PASSWORD
  if (password.length < 8) fail('SEED_PASSWORD must be at least 8 characters.')

  const today = todayInAppTimezone()
  console.log(`Target: ${parsedUrl.hostname}:${parsedUrl.port || '5432'}${parsedUrl.pathname}`)
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN (pass --apply to write)'}`)
  console.log(`Seed users: ${SEED_USERS.length} (${SEED_USERS[0].email} ... ${SEED_USERS.at(-1).email})`)
  console.log(`Per user: ${CATEGORIES.length} categories, ${ITEMS_PER_USER} items, 1 settings row, 1 disabled device token`)
  console.log(`Date anchor: ${today} (${APP_TIMEZONE})`)

  const client = new Client({
    connectionString: databaseUrl,
    options: '-c timezone=UTC',
    statement_timeout: 30_000,
  })

  try {
    await client.connect()

    const existing = await client.query(
      `select id, lower(email) as email
         from app_users
        where lower(email) = any($1::text[]) or id = any($2::uuid[])`,
      [SEED_USERS.map((user) => user.email), SEED_IDS]
    )
    for (const row of existing.rows) {
      const byEmail = SEED_USERS.find((user) => user.email === row.email)
      const byId = SEED_USERS.find((user) => user.id === row.id)
      if (byEmail && byEmail.id !== row.id) {
        fail(`Seed email ${row.email} already belongs to a different user (${row.id}). Aborting.`)
      }
      if (byId && byId.email !== row.email) {
        fail(`Seed user id ${row.id} already belongs to a different email. Aborting.`)
      }
    }

    const before = await nonSeedCounts(client)
    console.log('Existing non-seed rows:', JSON.stringify(before))

    if (!APPLY) {
      console.log('No changes written. Re-run with --apply to create the seed data.')
      return
    }

    const passwordHashes = []
    for (let index = 0; index < SEED_USERS.length; index += 1) {
      passwordHashes.push(await hashPassword(password))
    }

    await client.query('begin')
    try {
      for (const [index, user] of SEED_USERS.entries()) {
        await client.query(
          `insert into app_users (id, email, password_hash, created_at, updated_at)
           values ($1, $2, $3, now(), now())
           on conflict (id) do update
             set email = excluded.email,
                 password_hash = excluded.password_hash,
                 updated_at = now()`,
          [user.id, user.email, passwordHashes[index]]
        )
        await client.query(
          `update auth_sessions set revoked_at = now()
            where user_id = $1 and revoked_at is null`,
          [user.id]
        )
      }

      await client.query('delete from life_admin_reminders where user_id = any($1::uuid[])', [SEED_IDS])
      await client.query('delete from life_admin_items where user_id = any($1::uuid[])', [SEED_IDS])
      await client.query('delete from life_admin_categories where user_id = any($1::uuid[])', [SEED_IDS])
      await client.query('delete from life_admin_device_tokens where user_id = any($1::uuid[])', [SEED_IDS])
      await client.query('delete from life_admin_user_settings where user_id = any($1::uuid[])', [SEED_IDS])

      const reminderRows = []

      for (const user of SEED_USERS) {
        const categoryIds = new Map()
        for (const name of CATEGORIES) {
          const result = await client.query(
            `insert into life_admin_categories (user_id, name, is_default)
             values ($1, $2, false)
             returning id`,
            [user.id, name]
          )
          categoryIds.set(name, result.rows[0].id)
        }

        await client.query(
          `insert into life_admin_user_settings (user_id, timezone)
           values ($1, 'Asia/Karachi')`,
          [user.id]
        )
        await client.query(
          `insert into life_admin_device_tokens (user_id, token, platform, last_seen_at, disabled_at)
           values ($1, $2, 'web', now() - interval '30 days', now())`,
          [user.id, `seed-disabled-${user.id}`]
        )

        const shiftDays = (user.index % 9) - 4
        const templates = templatesForUser(user.index)

        for (const [itemIndex, template] of templates.entries()) {
          const dueDate = addDays(today, template.dueOffsetDays + shiftDays)
          const createdAt = new Date(
            Date.now() - (45 + ((user.index * 7 + itemIndex * 3) % 90)) * DAY_MS
          ).toISOString()
          const result = await client.query(
            `insert into life_admin_items
               (user_id, title, description, category_id, due_date, due_time, priority, status,
                reminder_days, reminder_minutes, notification_preference, created_at, updated_at)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
             returning id`,
            [
              user.id,
              template.title,
              template.description,
              categoryIds.get(template.category),
              dueDate,
              template.dueTime,
              template.priority,
              template.status,
              template.reminderDays,
              template.dueTime ? template.reminderMinutes : [],
              template.notificationPreference,
              createdAt,
            ]
          )

          const item = {
            id: result.rows[0].id,
            user_id: user.id,
            title: template.title,
            due_date: dueDate,
            due_time: template.dueTime,
            status: template.status,
            priority: template.priority,
            reminder_days: template.reminderDays,
            reminder_minutes: template.dueTime ? template.reminderMinutes : [],
            notification_preference: template.notificationPreference,
          }

          if (item.status === 'Pending') {
            reminderRows.push(...buildPendingReminders(item, new Date()))
          } else {
            reminderRows.push(buildHistoricalReminder(item))
          }
        }
      }

      await insertMany(
        client,
        'life_admin_reminders',
        [
          'user_id',
          'item_id',
          'kind',
          'offset_minutes',
          'scheduled_for',
          'channel',
          'title',
          'status',
          'attempts',
          'last_error',
          'sent_at',
        ],
        reminderRows
      )

      const verification = await verifySeed(client)
      if (verification.perUser.length !== SEED_USERS.length) {
        fail(`Expected ${SEED_USERS.length} seed users, found ${verification.perUser.length}.`)
      }
      for (const row of verification.perUser) {
        if (
          row.categories !== CATEGORIES.length ||
          row.items !== ITEMS_PER_USER ||
          row.settings !== 1 ||
          row.device_tokens !== 1 ||
          row.pending < 1
        ) {
          fail(`Unexpected seed counts for ${row.email}: ${JSON.stringify(row)}`)
        }
      }
      for (const [key, value] of Object.entries(verification.issues)) {
        if (value !== 0) fail(`Verification failed: ${key} = ${value}`)
      }
      if (JSON.stringify(verification.after) !== JSON.stringify(before)) {
        fail(
          `Non-seed rows changed. Before: ${JSON.stringify(before)} After: ${JSON.stringify(verification.after)}`
        )
      }

      await client.query('commit')

      console.log('Seed applied successfully.')
      console.table(verification.perUser)
      console.log('Ownership/reminder checks:', JSON.stringify(verification.issues))
      console.log('Non-seed rows unchanged:', JSON.stringify(verification.after))
      console.log('Seed logins:')
      for (const user of SEED_USERS) console.log(`  ${user.email}`)
      console.log(
        process.env.SEED_PASSWORD
          ? 'Password: value of SEED_PASSWORD.'
          : 'Password: default local test password (see the script header or set SEED_PASSWORD).'
      )
    } catch (error) {
      await client.query('rollback').catch(() => {})
      throw error
    }
  } finally {
    await client.end().catch(() => {})
  }
}

main().catch((error) => {
  console.error('Seed failed:', sanitizeError(error))
  process.exitCode = 1
})
