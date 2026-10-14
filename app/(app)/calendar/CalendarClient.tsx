'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { PriorityBadge, StatusBadge } from '@/components/Badges'
import { formatDate, isOverdue, PRIORITY_COLORS, PRIORITY_ORDER, REMINDER_OPTIONS, toDateKey } from '@/lib/utils'
import type { LifeAdminItem } from '@/lib/types'
import { AlertTriangle, Bell, Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react'

interface Props {
  initialItems: LifeAdminItem[]
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const VISIBLE_CHIPS = 2

/** Six-week grid of days for the given month (starts on Sunday). */
function monthMatrix(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1).getDay()
  return Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 - firstDay + i))
}

/** Active tasks first (by priority), then Renewed, then Completed. */
function dayOrder(a: LifeAdminItem, b: LifeAdminItem): number {
  const rank = (t: LifeAdminItem) => (t.status === 'Pending' ? 0 : t.status === 'Renewed' ? 1 : 2)
  if (rank(a) !== rank(b)) return rank(a) - rank(b)
  return PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]
}

function reminderLabels(reminderDays: number[]): string[] {
  return REMINDER_OPTIONS.filter(({ value }) => reminderDays.includes(value)).map(({ label }) => label)
}

export default function CalendarClient({ initialItems }: Props) {
  const now = new Date()
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() })
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  // Tasks without a due date never appear on the calendar (they stay in the Items list).
  const tasksByDate = useMemo(() => {
    const map = new Map<string, LifeAdminItem[]>()
    for (const item of initialItems) {
      if (!item.due_date) continue
      const key = item.due_date.slice(0, 10)
      const list = map.get(key) ?? []
      list.push(item)
      map.set(key, list)
    }
    for (const list of map.values()) list.sort(dayOrder)
    return map
  }, [initialItems])

  const days = useMemo(() => monthMatrix(view.year, view.month), [view])
  const monthLabel = new Date(view.year, view.month, 1).toLocaleString('en-GB', {
    month: 'long',
    year: 'numeric',
  })
  const todayKey = toDateKey(new Date())
  const selectedTasks = selectedKey ? tasksByDate.get(selectedKey) ?? [] : []

  function shiftMonth(delta: number) {
    setView((v) => {
      const total = v.month + delta
      return { year: v.year + Math.floor(total / 12), month: ((total % 12) + 12) % 12 }
    })
  }

  function goToday() {
    const t = new Date()
    setView({ year: t.getFullYear(), month: t.getMonth() })
    setSelectedKey(toDateKey(t))
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Calendar</h1>
          <p className="text-slate-500 text-sm mt-1">Your tasks by due date</p>
        </div>
      </div>

      {/* Month card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={goToday}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:border-teal-400 hover:text-teal-600 transition-colors"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <h2 className="text-base sm:text-lg font-semibold text-slate-900">{monthLabel}</h2>
          <div className="hidden md:flex items-center gap-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" />Urgent</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400" />High</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400" />Medium</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400" />Low</span>
            <span className="line-through text-slate-400">Completed</span>
          </div>
        </div>

        {/* Weekday names */}
        <div className="grid grid-cols-7 gap-px bg-slate-100 border border-b-0 border-slate-200 rounded-t-lg overflow-hidden">
          {WEEKDAYS.map((day) => (
            <div key={day} className="bg-slate-50 px-1 py-1.5 text-center text-[10px] sm:text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              {day}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-px bg-slate-100 border border-slate-200 rounded-b-lg overflow-hidden">
          {days.map((day) => {
            const key = toDateKey(day)
            const inMonth = day.getMonth() === view.month
            const isToday = key === todayKey
            const isSelected = key === selectedKey
            const tasks = tasksByDate.get(key) ?? []
            return (
              <button
                type="button"
                key={key}
                onClick={() => setSelectedKey(key)}
                className={`text-left p-1.5 sm:p-2 min-h-[56px] sm:min-h-[92px] transition-colors ${
                  isSelected ? 'bg-teal-50' : inMonth ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/70 hover:bg-slate-100/70'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={`inline-flex items-center justify-center w-6 h-6 text-xs rounded-full shrink-0 ${
                      isSelected
                        ? 'bg-teal-600 text-white font-semibold'
                        : isToday
                          ? 'border border-teal-500 text-teal-700 font-semibold'
                          : inMonth
                            ? 'text-slate-700'
                            : 'text-slate-400'
                    }`}
                  >
                    {day.getDate()}
                  </span>
                  {tasks.length > 0 && (
                    <span className="sm:hidden text-[10px] font-semibold text-slate-500 bg-slate-100 rounded-full px-1.5 py-0.5">
                      {tasks.length}
                    </span>
                  )}
                </div>
                <div className="mt-1 space-y-1 hidden sm:block">
                  {tasks.slice(0, VISIBLE_CHIPS).map((task) => (
                    <div
                      key={task.id}
                      className={`truncate rounded border px-1.5 py-0.5 text-[11px] leading-tight ${PRIORITY_COLORS[task.priority]} ${
                        task.status === 'Completed' ? 'line-through opacity-70' : ''
                      }`}
                      title={task.title}
                    >
                      {isOverdue(task.due_date, task.status) && <AlertTriangle className="inline w-3 h-3 mr-0.5 text-red-500 align-[-1px]" />}
                      {task.title}
                    </div>
                  ))}
                  {tasks.length > VISIBLE_CHIPS && (
                    <div className="text-[10px] text-slate-400">+{tasks.length - VISIBLE_CHIPS} more</div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
        <p className="sm:hidden text-[11px] text-slate-400 mt-2">
          Numbers show how many tasks are due that day. Tap a date to see its tasks.
        </p>
      </div>

      {/* Day tasks popup */}
      {selectedKey && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center sm:p-4"
          onClick={() => setSelectedKey(null)}
        >
          <div
            className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl shadow-xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={`Tasks on ${formatDate(selectedKey)}`}
          >
            <div className="sticky top-0 bg-white flex items-start justify-between gap-2 px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-slate-900">
                  Tasks on {formatDate(selectedKey)}
                  {selectedKey === todayKey && <span className="ml-2 text-xs text-teal-600 font-medium align-middle">Today</span>}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedTasks.length === 0
                    ? 'Nothing scheduled'
                    : `${selectedTasks.length} task${selectedTasks.length !== 1 ? 's' : ''}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedKey(null)}
                aria-label="Close"
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-4 sm:px-6 py-2">
              {selectedTasks.length === 0 ? (
                <div className="py-10 text-center">
                  <CalendarIcon className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm">No tasks scheduled for this day.</p>
                </div>
              ) : (
                selectedTasks.map((task) => {
                  const overdue = isOverdue(task.due_date, task.status)
                  const done = task.status === 'Completed'
                  const reminders = reminderLabels(task.reminder_days ?? [])
                  return (
                    <div key={task.id} className="py-3.5 border-b border-slate-100 last:border-b-0">
                      <Link
                        href={`/items/${task.id}/edit`}
                        className={`text-sm font-medium hover:text-teal-600 transition-colors ${
                          done ? 'text-slate-400 line-through' : 'text-slate-900'
                        }`}
                        title="View or edit this task"
                      >
                        {task.title}
                      </Link>
                      {task.description && <p className="text-xs text-slate-500 mt-1 whitespace-pre-line">{task.description}</p>}
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <PriorityBadge priority={task.priority} />
                        <StatusBadge status={task.status} />
                        {task.category?.name && (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full border border-slate-200 text-xs">
                            {task.category.name}
                          </span>
                        )}
                        <span className={`text-xs inline-flex items-center gap-1 ${overdue ? 'text-red-500 font-medium' : 'text-slate-500'}`}>
                          {overdue && <AlertTriangle className="w-3 h-3" />}
                          Due {formatDate(task.due_date)}
                        </span>
                      </div>
                      {reminders.length > 0 && (
                        <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                          <Bell className="w-3 h-3" />
                          Reminds {reminders.join(', ')}
                        </p>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
