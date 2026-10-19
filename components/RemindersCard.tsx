import Link from 'next/link'
import { Bell, CalendarClock } from 'lucide-react'
import { APP_TIMEZONE } from '@/lib/time'
import {
  CHANNEL_LABELS,
  REMINDER_STATUS_COLORS,
  REMINDER_STATUS_LABELS,
  formatDate,
  formatDateTimeInTimeZone,
  formatTime,
  reminderKindLabel,
} from '@/lib/utils'
import type { Reminder } from '@/lib/types'

interface Props {
  upcoming: Reminder[]
  recent: Reminder[]
  pushConfigured: boolean
  /** Names (never values) of the push variables that are missing or unusable. */
  pushSetupMissing?: string[]
  /** Set when the reminders API failed, so the failure is visible instead of hidden. */
  errorMessage?: string
}

function ReminderRow({ reminder }: { reminder: Reminder }) {
  const title = reminder.item?.title ?? reminder.title
  const due = reminder.item?.due_date
    ? `Due ${formatDate(reminder.item.due_date)}${
        reminder.item.due_time ? ` at ${formatTime(reminder.item.due_time)}` : ''
      }`
    : 'No due date'

  return (
    <Link
      href={`/items/${reminder.item_id}/edit`}
      className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate">{title}</p>
        <p className="text-xs text-slate-500 mt-0.5">
          {due} · {reminderKindLabel(reminder.kind)}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">
          {formatDateTimeInTimeZone(reminder.scheduled_for, APP_TIMEZONE)} (PKT)
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border bg-slate-50 text-slate-600 border-slate-200">
          {CHANNEL_LABELS[reminder.channel]}
        </span>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${REMINDER_STATUS_COLORS[reminder.status]}`}
          title={reminder.last_error ?? undefined}
        >
          {REMINDER_STATUS_LABELS[reminder.status]}
        </span>
      </div>
    </Link>
  )
}

/** Compact dashboard card: upcoming scheduled reminders + delivery status. */
<<<<<<< Updated upstream
export default function RemindersCard({ upcoming, recent, pushConfigured, pushSetupMissing, errorMessage }: Props) {
  const pushNeedsSetup = !pushConfigured && upcoming.some((r) => r.channel !== 'dashboard')
=======
export default function RemindersCard({ upcoming, recent, timezone, pushConfigured, errorMessage }: Props) {
  // Upcoming and recent are disjoint statuses in the API; filter by reminder id
  // anyway so a race/stale response can never render the same reminder twice.
  const seen = new Set<string>()
  const uniqueUpcoming = upcoming.filter((reminder) => {
    if (seen.has(reminder.id)) return false
    seen.add(reminder.id)
    return true
  })
  const uniqueRecent = recent.filter((reminder) => {
    if (seen.has(reminder.id)) return false
    seen.add(reminder.id)
    return true
  })
  const pushNeedsSetup = !pushConfigured && uniqueUpcoming.some((r) => r.channel !== 'dashboard')
>>>>>>> Stashed changes

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-teal-500" />
          <h2 className="font-semibold text-slate-900 text-sm">Push Reminders</h2>
        </div>
        {uniqueUpcoming.length > 0 && (
          <span className="text-xs text-slate-500 font-medium">{uniqueUpcoming.length} scheduled</span>
        )}
      </div>

      {errorMessage && (
        <div className="px-4 py-3 border-b border-slate-100 bg-red-50">
          <p className="text-xs text-red-700">Reminders could not be loaded: {errorMessage}</p>
        </div>
      )}

      {uniqueUpcoming.length === 0 && uniqueRecent.length === 0 ? (
        errorMessage ? null : (
          <div className="px-4 py-10 text-center">
            <CalendarClock className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No reminders scheduled.</p>
            <p className="text-xs text-slate-400 mt-1">
              Add reminder options to an item&apos;s due date to see them here.
            </p>
          </div>
        )
      ) : (
        <>
          <div className="divide-y divide-slate-50">
            {uniqueUpcoming.length === 0 ? (
              <p className="text-slate-400 text-sm px-4 py-6 text-center">Nothing scheduled yet.</p>
            ) : (
<<<<<<< Updated upstream
              upcoming.map((reminder) => (
                <ReminderRow key={reminder.id} reminder={reminder} />
=======
              uniqueUpcoming.map((reminder) => (
                <ReminderRow key={reminder.id} reminder={reminder} timezone={timezone} />
>>>>>>> Stashed changes
              ))
            )}
          </div>
          {uniqueRecent.length > 0 && (
            <div className="border-t border-slate-100">
              <p className="px-4 pt-3 text-xs font-medium text-slate-400 uppercase tracking-wider">
                Recently delivered
              </p>
              <div className="divide-y divide-slate-50">
<<<<<<< Updated upstream
                {recent.map((reminder) => (
                  <ReminderRow key={reminder.id} reminder={reminder} />
=======
                {uniqueRecent.map((reminder) => (
                  <ReminderRow key={reminder.id} reminder={reminder} timezone={timezone} />
>>>>>>> Stashed changes
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {pushNeedsSetup && (
        <div className="px-4 py-2 border-t border-slate-100">
          <p className="text-xs text-amber-600">
            Push reminders need the Firebase environment variables before they can be delivered.
            {pushSetupMissing && pushSetupMissing.length > 0 ? ` Missing: ${pushSetupMissing.join(', ')}.` : ''}
          </p>
        </div>
      )}
    </div>
  )
}
