import { NextResponse, type NextRequest } from 'next/server'
import { pgErrorCode, query } from './pool'
import { findUserByAccessToken } from '@/lib/auth/sessions'
import type { ReminderRow } from '@/lib/reminders/schedule'

/**
 * Server-side data access for the local PostgreSQL database, replacing the old
 * Supabase REST (PostgREST) layer. Every function scopes its query to the
 * verified caller's user_id — the same guarantee RLS gave: a user can only ever
 * read and write their own rows. Used only from route handlers (server side).
 */

export class ApiError extends Error {
  status: number
  code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

/** Turn a thrown error into the JSON error shape the frontend client reads (`detail`). */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ detail: err.message }, { status: err.status })
  }
  const code = pgErrorCode(err)
  if (code === '23505') return NextResponse.json({ detail: 'A record with the same unique value already exists.' }, { status: 409 })
  if (code === '23503') return NextResponse.json({ detail: 'A referenced record does not exist.' }, { status: 409 })
  if (code === '23514') return NextResponse.json({ detail: 'A value failed a database check constraint.' }, { status: 422 })
  console.error('API route error:', err)
  return NextResponse.json({ detail: 'Unexpected server error.' }, { status: 500 })
}

/** A connection problem reads as 503; a missing table reads as a setup error. */
export function wrapDbError(err: unknown, table?: string): never {
  if (err instanceof ApiError) throw err
  const code = pgErrorCode(err)
  if (code === '42P01' && table) {
    throw new ApiError(503, `Database table '${table}' is missing. Run db/migrations/001_init.sql against life_admin_tracker_new, then try again.`, code)
  }
  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || err instanceof AggregateError) {
    throw new ApiError(503, 'Could not reach the PostgreSQL database.')
  }
  throw err
}

export interface RouteUser {
  id: string
  email: string | null
  /** The caller's session row id (used to spare their own session on password change). */
  sessionId: string
}

/** Identify the caller by validating their bearer access token against auth_sessions. */
export async function getRouteUser(req: NextRequest): Promise<RouteUser> {
  const header = req.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) throw new ApiError(401, 'Not authenticated.')
  try {
    const user = await findUserByAccessToken(token)
    if (!user) throw new ApiError(401, 'Your session is invalid or has expired. Please sign in again.')
    return { id: user.id, email: user.email, sessionId: user.sessionId }
  } catch (err) {
    if (err instanceof ApiError) throw err
    wrapDbError(err, 'auth_sessions')
  }
}

/** The row shape stored for one saved item (user_id/updated_at are set server-side). */
interface ItemValues {
  user_id: string
  title: string
  description: string | null
  category_id: string | null
  due_date: string | null
  due_time: string | null
  priority: string
  status: string
  reminder_days: number[]
  reminder_minutes: number[]
  notification_preference: string
}

const ITEM_INSERT_COLUMNS =
  'user_id, title, description, category_id, due_date, due_time, priority, status, reminder_days, reminder_minutes, notification_preference, updated_at'

/** Each item carries its category's id + name, like the old PostgREST embed. */
const ITEM_WITH_CATEGORY = `
  select i.*,
    (select json_build_object('id', c.id, 'name', c.name)
       from life_admin_categories c
      where c.id = i.category_id) as category
  from life_admin_items i`

const REMINDER_WITH_ITEM = `
  select r.*,
    (select json_build_object('id', i.id, 'title', i.title, 'due_date', i.due_date,
                              'due_time', i.due_time, 'status', i.status, 'priority', i.priority)
       from life_admin_items i
      where i.id = r.item_id) as item
  from life_admin_reminders r`

// ---- items ----------------------------------------------------------------------

export async function listItems(userId: string): Promise<unknown[]> {
  const result = await query(
    `${ITEM_WITH_CATEGORY} where i.user_id = $1 order by i.created_at desc`,
    [userId]
  )
  return result.rows
}

export async function getItem(userId: string, itemId: string): Promise<unknown> {
  const result = await query('select * from life_admin_items where id = $1 and user_id = $2', [itemId, userId])
  const row = result.rows[0]
  if (!row) throw new ApiError(404, 'Not found.')
  return row
}

export async function createItem(row: ItemValues): Promise<unknown> {
  const result = await query(
    `insert into life_admin_items (${ITEM_INSERT_COLUMNS})
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
     returning *`,
    [
      row.user_id,
      row.title,
      row.description,
      row.category_id,
      row.due_date,
      row.due_time,
      row.priority,
      row.status,
      row.reminder_days,
      row.reminder_minutes,
      row.notification_preference,
    ]
  )
  return result.rows[0]
}

export async function updateItem(userId: string, itemId: string, row: ItemValues): Promise<unknown> {
  const result = await query(
    `update life_admin_items
        set title = $3, description = $4, category_id = $5, due_date = $6, due_time = $7,
            priority = $8, status = $9, reminder_days = $10, reminder_minutes = $11,
            notification_preference = $12, updated_at = now()
      where id = $1 and user_id = $2
      returning *`,
    [
      itemId,
      userId,
      row.title,
      row.description,
      row.category_id,
      row.due_date,
      row.due_time,
      row.priority,
      row.status,
      row.reminder_days,
      row.reminder_minutes,
      row.notification_preference,
    ]
  )
  if (!result.rowCount) throw new ApiError(404, 'Item not found.')
  return result.rows[0]
}

export async function deleteItem(userId: string, itemId: string): Promise<void> {
  // Idempotent: deleting a missing item is not an error. Reminder rows cascade via the FK.
  await query('delete from life_admin_items where id = $1 and user_id = $2', [itemId, userId])
}

export async function listItemsPendingWithDueDate(userId: string): Promise<unknown[]> {
  const result = await query(
    "select * from life_admin_items where user_id = $1 and status = 'Pending' and due_date is not null",
    [userId]
  )
  return result.rows
}

// ---- categories -------------------------------------------------------------------

export async function listCategories(userId: string): Promise<unknown[]> {
  const result = await query(
    'select * from life_admin_categories where user_id = $1 order by name asc',
    [userId]
  )
  return result.rows
}

export async function createCategory(userId: string, name: string): Promise<unknown> {
  const result = await query(
    "insert into life_admin_categories (name, user_id, is_default) values ($1, $2, false) returning *",
    [name, userId]
  )
  return result.rows[0]
}

export async function renameCategory(userId: string, categoryId: string, name: string): Promise<unknown> {
  const result = await query(
    'update life_admin_categories set name = $3 where id = $1 and user_id = $2 returning *',
    [categoryId, userId, name]
  )
  if (!result.rowCount) throw new ApiError(404, 'Category not found.')
  return result.rows[0]
}

export async function deleteCategory(userId: string, categoryId: string): Promise<void> {
  // First detach items from this category, then delete the category itself.
  await query('update life_admin_items set category_id = null where category_id = $1 and user_id = $2', [
    categoryId,
    userId,
  ])
  await query('delete from life_admin_categories where id = $1 and user_id = $2', [categoryId, userId])
}

// ---- reminders ------------------------------------------------------------------------

export async function listUpcomingReminders(userId: string, limit = 5): Promise<unknown[]> {
  const result = await query(
    `${REMINDER_WITH_ITEM}
      where r.user_id = $1 and r.status = 'pending' and r.scheduled_for >= now()
      order by r.scheduled_for asc
      limit $2`,
    [userId, limit]
  )
  return result.rows
}

export async function listRecentReminders(userId: string, limit = 3): Promise<unknown[]> {
  const result = await query(
    `${REMINDER_WITH_ITEM}
      where r.user_id = $1 and r.status in ('sent', 'failed')
      order by r.scheduled_for desc
      limit $2`,
    [userId, limit]
  )
  return result.rows
}

/** Drop unsent reminders for an item; called before re-creating them. */
export async function deletePendingReminders(userId: string, itemId: string): Promise<void> {
  await query(
    "delete from life_admin_reminders where user_id = $1 and item_id = $2 and status = 'pending'",
    [userId, itemId]
  )
}

/** Mark pending reminders as canceled (task completed or renewed). */
export async function cancelPendingReminders(userId: string, itemId: string): Promise<void> {
  await query(
    "update life_admin_reminders set status = 'canceled' where user_id = $1 and item_id = $2 and status = 'pending'",
    [userId, itemId]
  )
}

export async function insertReminders(rows: ReminderRow[]): Promise<unknown[]> {
  if (!rows.length) return []
  const placeholders = rows.map((_, index) => {
    const base = index * 7
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`
  })
  const params = rows.flatMap((row) => [
    row.user_id,
    row.item_id,
    row.kind,
    row.offset_minutes,
    row.scheduled_for,
    row.channel,
    row.title,
  ])
  const result = await query(
    `insert into life_admin_reminders
       (user_id, item_id, kind, offset_minutes, scheduled_for, channel, title)
     values ${placeholders.join(', ')}
     on conflict (item_id, kind) where status = 'pending' do nothing
     returning id, item_id, kind, scheduled_for, channel, status`,
    params
  )
  return result.rows
}

/** Cheap existence probe used to backfill reminders for items created before scheduling existed. */
export async function hasAnyReminders(userId: string): Promise<boolean> {
  const result = await query('select 1 from life_admin_reminders where user_id = $1 limit 1', [userId])
  return (result.rowCount ?? 0) > 0
}

// ---- cron scheduler (service path: no signed-in user) -----------------------------------

export async function listDueReminders(limit = 50, now = new Date()): Promise<unknown[]> {
  const result = await query(
    `${REMINDER_WITH_ITEM}
      where r.status = 'pending' and r.scheduled_for <= $2
      order by r.scheduled_for asc
      limit $1`,
    [limit, now]
  )
  return result.rows
}

/**
 * Atomically move a reminder from pending to processing. Returns null when
 * another run already claimed it, so a reminder is never delivered twice.
 */
export async function claimReminder(id: string): Promise<unknown | null> {
  const result = await query(
    `with claimed as (
       update life_admin_reminders
          set status = 'processing', last_error = null
        where id = $1 and status = 'pending'
        returning *
     )
     select c.*,
       (select json_build_object('id', i.id, 'title', i.title, 'due_date', i.due_date,
                                 'due_time', i.due_time, 'status', i.status, 'priority', i.priority)
          from life_admin_items i
         where i.id = c.item_id) as item
     from claimed c`,
    [id]
  )
  return result.rows[0] ?? null
}

interface FinishPatch {
  status: string
  attempts?: number
  last_error?: string | null
  sent_at?: string
}

export async function finishReminder(id: string, patch: FinishPatch): Promise<void> {
  const sets = ['status = $2']
  const params: (string | number | null)[] = [id, patch.status]
  if (patch.attempts !== undefined) {
    params.push(patch.attempts)
    sets.push(`attempts = $${params.length}`)
  }
  if (patch.last_error !== undefined) {
    params.push(patch.last_error)
    sets.push(`last_error = $${params.length}`)
  }
  if (patch.sent_at !== undefined) {
    params.push(patch.sent_at)
    sets.push(`sent_at = $${params.length}`)
  }
  await query(`update life_admin_reminders set ${sets.join(', ')} where id = $1`, params)
}

/** A run that crashed mid-delivery leaves rows in processing; fail them so they never re-send. */
export async function failStuckReminders(cutoffIso: string): Promise<void> {
  await query(
    `update life_admin_reminders
        set status = 'failed', last_error = 'Delivery was interrupted.'
      where status = 'processing' and scheduled_for < $1`,
    [cutoffIso]
  )
}

// ---- device tokens ------------------------------------------------------------------------

/**
 * Register (or re-activate) an FCM token for the signed-in user. The upsert is
 * idempotent: re-registering the same token just refreshes last_seen_at and
 * re-points it at this user. Other tokens are deliberately left active — dead
 * ones are disabled at send time instead.
 */
export async function upsertDeviceToken(userId: string, fcmToken: string): Promise<void> {
  await query(
    `insert into life_admin_device_tokens (user_id, token, platform, last_seen_at, disabled_at)
     values ($1, $2, 'web', now(), null)
     on conflict (token) do update
        set user_id = excluded.user_id, last_seen_at = now(), disabled_at = null`,
    [userId, fcmToken]
  )
}

/**
 * A browser can accumulate several still-valid FCM tokens; only the most
 * recently seen active token is used, so each reminder reaches the user once.
 */
export async function listActiveDeviceTokens(userId: string): Promise<string[]> {
  const result = await query(
    `select token from life_admin_device_tokens
      where user_id = $1 and disabled_at is null
      order by last_seen_at desc, created_at desc
      limit 1`,
    [userId]
  )
  return (result.rows as { token: string }[]).map((row) => row.token)
}

export async function disableDeviceToken(fcmToken: string): Promise<void> {
  await query(
    'update life_admin_device_tokens set disabled_at = now() where token = $1 and disabled_at is null',
    [fcmToken]
  )
}
