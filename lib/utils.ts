import { type NotificationPreference, type Priority, type ReminderStatus, type Status } from './types'

export const PRIORITY_ORDER: Record<Priority, number> = {
  Urgent: 4,
  High: 3,
  Medium: 2,
  Low: 1,
}

export const PRIORITY_COLORS: Record<Priority, string> = {
  Urgent: 'bg-red-100 text-red-800 border-red-200',
  High: 'bg-orange-100 text-orange-800 border-orange-200',
  Medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  Low: 'bg-green-100 text-green-800 border-green-200',
}

export const STATUS_COLORS: Record<Status, string> = {
  Pending: 'bg-blue-100 text-blue-800 border-blue-200',
  Completed: 'bg-teal-100 text-teal-800 border-teal-200',
  Renewed: 'bg-purple-100 text-purple-800 border-purple-200',
}

export const REMINDER_OPTIONS = [
  { value: 7, label: '7 days before' },
  { value: 3, label: '3 days before' },
  { value: 1, label: '1 day before' },
]

/** Reminders measured from the due time; only usable when a due time is set. */
export const TIME_REMINDER_OPTIONS = [
  { value: 60, label: '1 hour before' },
  { value: 30, label: '30 minutes before' },
  { value: 15, label: '15 minutes before' },
]

export const NOTIFICATION_PREFERENCE_OPTIONS: { value: NotificationPreference; label: string }[] = [
  { value: 'dashboard', label: 'Dashboard Only' },
  { value: 'push', label: 'Firebase Push' },
  { value: 'both', label: 'Both Dashboard and Push' },
]

export const REMINDER_STATUS_COLORS: Record<ReminderStatus, string> = {
  pending: 'bg-blue-100 text-blue-800 border-blue-200',
  processing: 'bg-slate-100 text-slate-600 border-slate-200',
  sent: 'bg-teal-100 text-teal-800 border-teal-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
  canceled: 'bg-slate-100 text-slate-500 border-slate-200',
}

export const REMINDER_STATUS_LABELS: Record<ReminderStatus, string> = {
  pending: 'Scheduled',
  processing: 'Sending',
  sent: 'Sent',
  failed: 'Failed',
  canceled: 'Canceled',
}

export const CHANNEL_LABELS: Record<NotificationPreference, string> = {
  dashboard: 'Dashboard',
  push: 'Push',
  both: 'Push + Dashboard',
}

/** Turn a reminder kind like "7d" / "60m" into "7 days before" / "1 hour before". */
export function reminderKindLabel(kind: string): string {
  const match = /^(\d+)([dm])$/.exec(kind)
  if (!match) return kind
  const value = Number(match[1])
  if (match[2] === 'd') return `${value} day${value === 1 ? '' : 's'} before`
  if (value >= 60 && value % 60 === 0) {
    const hours = value / 60
    return `${hours} hour${hours === 1 ? '' : 's'} before`
  }
  return `${value} minute${value === 1 ? '' : 's'} before`
}

/** Format a Postgres time value ("14:30:00") as "14:30". */
export function formatTime(timeStr: string | null): string {
  if (!timeStr) return '—'
  return timeStr.slice(0, 5)
}

/** Format a UTC timestamp as wall-clock date + time in the given IANA zone. */
export function formatDateTimeInTimeZone(iso: string, timeZone: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      timeZone,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return getLocalDate(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Due date plus optional wall-clock due time ("15 Oct 2026" or "15 Oct 2026, 14:30").
 * due_date/due_time are stored as the user's local wall-clock values, so they are
 * shown as-is; missing dates render as "—" and missing times are omitted.
 */
export function formatDateTime(dateStr: string | null, timeStr: string | null): string {
  const date = formatDate(dateStr)
  if (!dateStr || !timeStr) return date
  return `${date}, ${formatTime(timeStr)}`
}

// Convert a date string into a local date without timezone issues
export function getLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

// Convert a Date into a local YYYY-MM-DD key (never via UTC, so no off-by-one days)
export function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Get today's date at midnight
function getToday(): Date {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

// Calculate days remaining until a due date
export function daysUntil(
  dateStr: string | null
): number | null {
  if (!dateStr) return null

  const due = getLocalDate(dateStr)
  const today = getToday()

  const difference = due.getTime() - today.getTime()

  return Math.round(difference / (1000 * 60 * 60 * 24))
}

// Check whether an item is overdue
export function isOverdue(
  dueDate: string | null,
  status: Status
): boolean {
  if (!dueDate || status === 'Completed' || status === 'Renewed') {
    return false
  }

  const days = daysUntil(dueDate)

  return days !== null && days < 0
}

// Check whether an item is due within the next 7 days
export function isDueSoon(
  dueDate: string | null,
  status: Status
): boolean {
  if (!dueDate || status === 'Completed' || status === 'Renewed') {
    return false
  }

  const days = daysUntil(dueDate)

  return days !== null && days >= 0 && days <= 7
}

// Check whether an item falls within its reminder window
export function hasActiveReminder(
  dueDate: string | null,
  reminderDays: number[],
  status: Status
): boolean {
  if (!dueDate || status === 'Completed' || status === 'Renewed') {
    return false
  }

  const days = daysUntil(dueDate)

  if (days === null || days < 0) return false

  return reminderDays.some((reminderDay) => days <= reminderDay)
}
