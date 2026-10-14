'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserApi } from '@/lib/api/client'
import { REMINDER_OPTIONS } from '@/lib/utils'
import type { LifeAdminItem, Category } from '@/lib/types'
import { Save, X } from 'lucide-react'

interface Props {
  item?: LifeAdminItem
  categories: Category[]
}

export default function ItemForm({ item, categories }: Props) {
  const router = useRouter()
  const isEdit = !!item

  const [title, setTitle] = useState(item?.title ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [categoryId, setCategoryId] = useState(item?.category_id ?? '')
  const [dueDate, setDueDate] = useState(item?.due_date ?? '')
  const [priority, setPriority] = useState(item?.priority ?? 'Medium')
  const [status, setStatus] = useState(item?.status ?? 'Pending')
  const [reminderDays, setReminderDays] = useState<number[]>(item?.reminder_days ?? [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  function toggleReminder(val: number) {
    setReminderDays((prev) =>
      prev.includes(val) ? prev.filter((d) => d !== val) : [...prev, val]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!title.trim()) { setError('Title is required.'); return }

    setLoading(true)
    const api = createBrowserApi()

    // user_id and updated_at are set by the backend from the verified login.
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      category_id: categoryId || null,
      due_date: dueDate || null,
      priority,
      status,
      reminder_days: reminderDays,
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
            <label
              key={value}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                reminderDays.includes(value)
                  ? 'bg-teal-50 border-teal-400 text-teal-700 font-medium'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-teal-300'
              }`}
            >
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
        <p className="text-xs text-slate-400 mt-1.5">Reminders appear on the dashboard when the due date approaches.</p>
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
