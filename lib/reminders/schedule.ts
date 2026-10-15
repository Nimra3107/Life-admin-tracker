import { zonedTimeToUtc } from '@/lib/time'
import type { LifeAdminItem } from '@/lib/types'
import {
  cancelPendingReminders,
  deletePendingReminders,
  getUserTimezone,
  hasAnyReminders,
  insertReminders,
  listItemsPendingWithDueDate,
  upsertUserTimezone,
  type RouteUser,
} from '@/lib/supabase/api'

/**
 * Reminders are stored as absolute UTC instants (scheduled_for) computed from the
 * item's local due date/time in the user's IANA zone, so the cron route never has
 * to do time-zone math and every user sees reminders at their own local time.
 */

/** When only a due date is set, day-based reminders fire at 09:00 local time. */
const DEFAULT_DUE_TIME = '09:00'

export interface ReminderRow {
  user_id: string
  item_id: string
  kind: string
  offset_minutes: number
  scheduled_for: string
  channel: string
  title: string
}

/** Build the pending reminder rows for one item, skipping offsets already in the past. */
export function buildReminderRows(
  item: LifeAdminItem,
  timezone: string,
  now: Date = new Date()
): ReminderRow[] {
  if (!item.due_date || item.status !== 'Pending') return []

  const hasDueTime = Boolean(item.due_time)
  const anchor = zonedTimeToUtc(
    item.due_date,
    hasDueTime ? item.due_time!.slice(0, 5) : DEFAULT_DUE_TIME,
    timezone
  )

  const offsets: [string, number][] = []
  for (const days of item.reminder_days ?? []) {
    if (Number.isInteger(days) && days >= 0 && days <= 365) offsets.push([`${days}d`, days * 1440])
  }
  // Minute-based offsets only make sense with a due time to count back from.
  if (hasDueTime) {
    for (const minutes of item.reminder_minutes ?? []) {
      if (Number.isInteger(minutes) && minutes >= 0 && minutes <= 1440) offsets.push([`${minutes}m`, minutes])
    }
  }

  const rows: ReminderRow[] = []
  const seen = new Set<string>()
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
      channel: item.notification_preference ?? 'dashboard',
      title: item.title,
    })
  }
  return rows
}

async function syncItemReminders(
  token: string,
  userId: string,
  item: LifeAdminItem,
  timezone: string
): Promise<void> {
  await deletePendingReminders(token, userId, item.id)
  const rows = buildReminderRows(item, timezone)
  if (rows.length) await insertReminders(token, rows)
}

/** Rebuild every pending item's reminders; used when the user's time zone changes. */
export async function rescheduleAllReminders(
  token: string,
  userId: string,
  timezone: string
): Promise<void> {
  const items = (await listItemsPendingWithDueDate(token, userId)) as LifeAdminItem[]
  for (const item of items) {
    await deletePendingReminders(token, userId, item.id)
    const rows = buildReminderRows(item, timezone)
    if (rows.length) await insertReminders(token, rows)
  }
}

/**
 * Backfill: when a user has no reminder rows at all (items created before
 * scheduling was deployed, or the first load after the migration), create them
 * from the current items. Read-only when rows already exist.
 */
export async function backfillRemindersIfEmpty(
  token: string,
  userId: string,
  timezone: string
): Promise<void> {
  if (await hasAnyReminders(token, userId)) return
  const items = (await listItemsPendingWithDueDate(token, userId)) as LifeAdminItem[]
  const rows = items.flatMap((item) => buildReminderRows(item, timezone))
  if (rows.length) await insertReminders(token, rows)
}

/**
 * Entry point for item create/update. Stores the browser's time zone when sent,
 * reschedules everything if it changed, and otherwise reschedules just this item.
 * Items that are completed/renewed get their pending reminders canceled.
 * Never throws: reminder scheduling must not break item CRUD (errors are logged).
 */
export async function refreshRemindersForSavedItem(
  user: RouteUser,
  item: LifeAdminItem,
  clientTimezone?: string
): Promise<void> {
  try {
    const storedTimezone = await getUserTimezone(user.token, user.id)
    let timezone = storedTimezone ?? 'UTC'
    let timezoneChanged = false

    if (clientTimezone && clientTimezone !== storedTimezone) {
      await upsertUserTimezone(user.token, user.id, clientTimezone)
      timezone = clientTimezone
      timezoneChanged = true
    }

    if (item.status !== 'Pending') {
      await cancelPendingReminders(user.token, user.id, item.id)
      return
    }

    if (timezoneChanged) {
      await rescheduleAllReminders(user.token, user.id, timezone)
    } else {
      await syncItemReminders(user.token, user.id, item, timezone)
    }
  } catch (err) {
    console.error('Failed to sync reminders for item', item.id, err)
  }
}

/** Task deleted: its reminder rows are removed explicitly (the FK cascade covers stragglers). */
export async function clearRemindersForDeletedItem(
  user: RouteUser,
  itemId: string
): Promise<void> {
  try {
    await deletePendingReminders(user.token, user.id, itemId)
  } catch (err) {
    console.error('Failed to clear reminders for item', itemId, err)
  }
}
