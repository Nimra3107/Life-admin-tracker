'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserApi } from '@/lib/api/client'
import { NOTIFICATION_PREFERENCE_OPTIONS, REMINDER_OPTIONS, TIME_REMINDER_OPTIONS } from '@/lib/utils'
import { enablePushNotifications } from '@/lib/push'
import type { LifeAdminItem, Category, NotificationPreference } from '@/lib/types'
import { Save, X } from 'lucide-react'

interface Props {
  item?: LifeAdminItem
  categories: Category[]
}

/**
 * Reminder offsets must always be plain integers in the payload (Supabase's
 * integer[] column). Values loaded from the API may be numeric strings if they
 * were stored by an older client, so coerce them and drop anything invalid.
 */
function toIntList(value: unknown, max: number): number[] {
  if (!Array.isArray(value)) return []
  const out: number[] = []
  for (const raw of value) {
    const parsed = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw
    if (typeof parsed === 'number' && Number.isInteger(parsed) && parsed >= 0 && parsed <= max) {
      out.push(parsed)
    }
  }
  return out
}

export default function ItemForm({ item, categories }: Props) {
  const router = useRouter()
  const isEdit = !!item

  const [title, setTitle] = useState(item?.title ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [categoryId, setCategoryId] = useState(item?.category_id ?? '')
  const [dueDate, setDueDate] = useState(item?.due_date ?? '')
  const [dueTime, setDueTime] = useState(item?.due_time?.slice(0, 5) ?? '')
  const [priority, setPriority] = useState(item?.priority ?? 'Medium')
  const [status, setStatus] = useState(item?.status ?? 'Pending')
  const [reminderDays, setReminderDays] = useState<number[]>(() => toIntList(item?.reminder_days, 365))
  const [reminderMinutes, setReminderMinutes] = useState<number[]>(() => toIntList(item?.reminder_minutes, 1440))
  const [notificationPreference, setNotificationPreference] = useState<NotificationPreference>(
    item?.notification_preference ?? 'dashboard'
  )
  const [pushNote, setPushNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [pushBusy, setPushBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  function toggleReminder(val: number) {
    setReminderDays((prev) =>
      prev.includes(val) ? prev.filter((d) => d !== val) : [...prev, val]
    )
  }

  function toggleMinuteReminder(val: number) {
    setReminderMinutes((prev) =>
      prev.includes(val) ? prev.filter((d) => d !== val) : [...prev, val]
    )
  }

  function handleDueTimeChange(value: string) {
    setDueTime(value)
    // Time-based reminders count back from the due time, so they cannot stay
    // selected once it is cleared.
    if (!value) setReminderMinutes([])
  }

  function handlePreferenceChange(value: NotificationPreference) {
    setNotificationPreference(value)
    setPushNote(null)
    // Permission is only requested when the user opts into push notifications.
    if (value !== 'dashboard') {
      setPushBusy(true)
      enablePushNotifications().then((result) => {
        setPushBusy(false)
        setPushNote(
          result.ok
            ? { ok: true, text: 'Push notifications are enabled for this browser.' }
            : { ok: false, text: result.message }
        )
      })
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!title.trim()) { setError('Title is required.'); return }

    setLoading(true)
    const api = createBrowserApi()

    // Refresh the FCM token silently when permission was already granted (no prompt).
    if (
      notificationPreference !== 'dashboard' &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted'
    ) {
      void enablePushNotifications()
    }

    // user_id and updated_at are set by the backend from the verified login.
    // Due date/time are wall-clock values interpreted as Pakistan time (PKT).
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      category_id: categoryId || null,
      due_date: dueDate || null,
      due_time: dueTime || null,
      priority,
      status,
      reminder_days: toIntList(reminderDays, 365),
      reminder_minutes: dueTime ? toIntList(reminderMinutes, 1440) : [],
      notification_preference: notificationPreference,
    }

    let err
    if (isEdit) {
      ;({ error: err } = await api.items.update(item.id, payload))
    } else {
      ;({ error: err } = await api.items.create(payload))
    }

    setLoading(false)
    if (err) { setError(err.message); return }

    setSuccess(isEdit ? 'Item updated successfully!' : 'Item created successfully!')
    setTimeout(() => {
      router.push('/items')
      router.refresh()
    }, 800)
  }

  const inputClass = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-800 placeholder-slate-400'
  const labelClass = 'block text-sm font-medium text-slate-700 mb-1'
  const chipClass = (selected: boolean, disabled = false) =>
    `flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
      disabled
        ? 'bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed'
        : selected
          ? 'bg-teal-50 border-teal-400 text-teal-700 font-medium'
          : 'bg-white border-slate-200 text-slate-600 hover:border-teal-300'
    }`

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          <X className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="bg-teal-50 border border-teal-200 text-teal-700 px-4 py-3 rounded-lg text-sm">{success}</div>
      )}

      {/* Title */}
      <div>
        <label htmlFor="title" className={labelClass}>
          Title <span className="text-red-500">*</span>
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Renew car insurance"
          className={inputClass}
          required
        />
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className={labelClass}>Description</label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional notes or details…"
          rows={3}
          className={inputClass}
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {/* Category */}
        <div>
          <label htmlFor="category" className={labelClass}>Category</label>
          <select
            id="category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={inputClass}
          >
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Due date */}
        <div>
          <label htmlFor="due_date" className={labelClass}>Due Date</label>
          <input
            id="due_date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={inputClass}
          />
        </div>

        {/* Due time */}
        <div>
          <label htmlFor="due_time" className={labelClass}>Due Time</label>
          <input
            id="due_time"
            type="time"
            value={dueTime}
            onChange={(e) => handleDueTimeChange(e.target.value)}
            className={inputClass}
          />
          <p className="text-xs text-slate-400 mt-1.5">
            Times are in Pakistan Standard Time (PKT, UTC+05:00).
          </p>
        </div>

        {/* Priority */}
        <div>
          <label htmlFor="priority" className={labelClass}>Priority</label>
          <select
            id="priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as typeof priority)}
            className={inputClass}
          >
            <option>Urgent</option>
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
        </div>

        {/* Status */}
        <div>
          <label htmlFor="status" className={labelClass}>Status</label>
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className={inputClass}
          >
            <option>Pending</option>
            <option>Completed</option>
            <option>Renewed</option>
          </select>
        </div>
      </div>

      {/* Reminders */}
      <div>
        <label className={labelClass}>Reminders</label>
        <div className="flex flex-wrap gap-3">
          {REMINDER_OPTIONS.map(({ value, label }) => (
            <label key={value} className={chipClass(reminderDays.includes(value))}>
              <input
                type="checkbox"
                className="sr-only"
                checked={reminderDays.includes(value)}
                onChange={() => toggleReminder(value)}
              />
              {label}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 mt-2">
          {TIME_REMINDER_OPTIONS.map(({ value, label }) => (
            <label key={value} className={chipClass(reminderMinutes.includes(value), !dueTime)}>
              <input
                type="checkbox"
                className="sr-only"
                disabled={!dueTime}
                checked={reminderMinutes.includes(value)}
                onChange={() => toggleMinuteReminder(value)}
              />
              {label}
            </label>
          ))}
        </div>
        {!dueTime && (
          <p className="text-xs text-slate-400 mt-1.5">Set a due time to use the 1 hour / 30 minute / 15 minute reminders.</p>
        )}
      </div>

      {/* Notification preference */}
      <div>
        <label htmlFor="notification_preference" className={labelClass}>Notifications</label>
        <select
          id="notification_preference"
          value={notificationPreference}
          onChange={(e) => handlePreferenceChange(e.target.value as NotificationPreference)}
          className={inputClass}
        >
          {NOTIFICATION_PREFERENCE_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <p className="text-xs text-slate-400 mt-1.5">
          {pushBusy
            ? 'Requesting permission…'
            : 'Push reminders are delivered to this browser even when the app is closed.'}
        </p>
        {pushNote && (
          <p className={`text-xs mt-1 ${pushNote.ok ? 'text-teal-600' : 'text-amber-600'}`}>
            {pushNote.text}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          <Save className="w-4 h-4" />
          {loading ? 'Saving…' : isEdit ? 'Update Item' : 'Create Item'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
