import { APP_TIMEZONE, zonedTimeToUtc } from '@/lib/time'
import type { LifeAdminItem } from '@/lib/types'
import {
  cancelPendingReminders,
  deletePendingReminders,
  hasAnyReminders,
  insertReminders,
  listItemsPendingWithDueDate,
  type RouteUser,
} from '@/lib/db/api'

/**
 * Every reminder is scheduled in Pakistan Standard Time (APP_TIMEZONE): the
 * item's due date/time are PKT wall-clock values, converted once here to a UTC
 * instant and stored as scheduled_for (timestamptz) in PostgreSQL. The cron
 * route never does time-zone math, and the browser's own time zone is never
 * consulted.
 */

/** When only a due date is set, day-based reminders fire at 09:00 PKT. */
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

interface InsertedReminderRow {
  id?: string
  item_id?: string
  kind?: string
  scheduled_for?: string
  channel?: string
  status?: string
}

/**
 * Debug log for stages 1–2 of the push flow: a reminder row now exists in
 * PostgreSQL. Logs identifiers only — never tokens or credentials.
 */
function logCreatedReminders(created: InsertedReminderRow[], fallbackCount: number): void {
  if (!created.length) {
    console.log(`[reminders] created ${fallbackCount} reminder(s) (insert returned no representation)`)
    return
  }
  for (const row of created) {
    console.log(
      `[reminders] created: id=${row.id} item=${row.item_id} kind=${row.kind} scheduled_for=${row.scheduled_for} channel=${row.channel} status=${row.status}`
    )
  }
}

/** Build the pending reminder rows for one item, skipping offsets already in the past. */
export function buildReminderRows(item: LifeAdminItem, now: Date = new Date()): ReminderRow[] {
  if (!item.due_date || item.status !== 'Pending') return []

  const hasDueTime = Boolean(item.due_time)
  const anchor = zonedTimeToUtc(
    item.due_date,
    hasDueTime ? item.due_time!.slice(0, 5) : DEFAULT_DUE_TIME,
    APP_TIMEZONE
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

async function syncItemReminders(userId: string, item: LifeAdminItem): Promise<void> {
  await deletePendingReminders(userId, item.id)
  const rows = buildReminderRows(item)
  if (!rows.length) {
    console.log(`[reminders] item ${item.id}: no future reminders to schedule`)
    return
  }
  const created = (await insertReminders(rows)) as InsertedReminderRow[]
  logCreatedReminders(created, rows.length)
}

/**
 * Backfill: when a user has no reminder rows at all (items created before
 * scheduling was deployed, or the first load after the migration), create them
 * from the current items. Read-only when rows already exist.
 */
export async function backfillRemindersIfEmpty(userId: string): Promise<void> {
  if (await hasAnyReminders(userId)) return
  const items = (await listItemsPendingWithDueDate(userId)) as LifeAdminItem[]
  const rows = items.flatMap((item) => buildReminderRows(item))
  if (rows.length) {
    console.log(`[reminders] backfill: creating ${rows.length} reminder(s) for ${items.length} item(s)`)
    const created = (await insertReminders(rows)) as InsertedReminderRow[]
    logCreatedReminders(created, rows.length)
  }
}

/**
 * Entry point for item create/update: rebuild this item's pending reminders in
 * Pakistan time. Items that are completed/renewed get their pending reminders
 * canceled. Never throws: reminder scheduling must not break item CRUD (errors
 * are logged).
 */
export async function refreshRemindersForSavedItem(user: RouteUser, item: LifeAdminItem): Promise<void> {
  try {
    if (item.status !== 'Pending') {
      console.log(`[reminders] item ${item.id} is ${item.status} — canceling its pending reminders`)
      await cancelPendingReminders(user.id, item.id)
      return
    }

    console.log(`[reminders] item ${item.id} saved (status=${item.status}) — syncing reminders (PKT)`)
    await syncItemReminders(user.id, item)
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
    console.log(`[reminders] item ${itemId} deleted — clearing its pending reminders`)
    await deletePendingReminders(user.id, itemId)
  } catch (err) {
    console.error('Failed to clear reminders for item', itemId, err)
  }
}
