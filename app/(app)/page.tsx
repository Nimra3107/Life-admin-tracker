import { getCurrentUser, createServerApi } from '@/lib/api/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PriorityBadge, StatusBadge } from '@/components/Badges'
import RemindersCard from '@/components/RemindersCard'
import { isPushConfigured } from '@/lib/reminders/send'
import { isOverdue, isDueSoon, formatDate, formatDateTime, daysUntil, hasActiveReminder } from '@/lib/utils'
import type { LifeAdminItem } from '@/lib/types'
import {
  CheckSquare,
  Clock,
  AlertTriangle,
  TrendingUp,
  Plus,
  Calendar,
  Bell,
} from 'lucide-react'

export default async function DashboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const api = await createServerApi()
  const { data: items, error: itemsError } = await api.items.list()

  if (itemsError) {
    console.error('Error fetching Life Admin items:', itemsError)
  }

  const [{ data: reminders, error: remindersError }, { data: settings }] = await Promise.all([
    api.reminders.overview(),
    api.settings.get(),
  ])
  const upcomingReminders = reminders?.upcoming ?? []
  const recentReminders = reminders?.recent ?? []
  const timezone = settings?.timezone ?? 'UTC'

  const allItems: LifeAdminItem[] = items ?? []

  const total = allItems.length
  const pending = allItems.filter((i) => i.status === 'Pending').length
  const completed = allItems.filter((i) => i.status === 'Completed').length
  const overdueItems = allItems.filter((i) => isOverdue(i.due_date, i.status))
  const dueSoonItems = allItems.filter((i) => isDueSoon(i.due_date, i.status))
  const recentItems = allItems.slice(0, 5)

  // Upcoming: due soon sorted by date
  const upcomingItems = [...dueSoonItems].sort((a, b) =>
    (a.due_date ?? '').localeCompare(b.due_date ?? '')
  ).slice(0, 5)

  // Reminders: items within reminder windows
  const reminderItems = allItems.filter((item) =>
    hasActiveReminder(
      item.due_date,
      item.reminder_days ?? [],
      item.status
    )
  ).slice(0, 5)

  const stats = [
    { label: 'Total Items', value: total, icon: CheckSquare, color: 'text-teal-600', bg: 'bg-teal-50' },
    { label: 'Pending', value: pending, icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Completed', value: completed, icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Overdue', value: overdueItems.length, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Due Soon', value: dueSoonItems.length, icon: Calendar, color: 'text-orange-600', bg: 'bg-orange-50' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">Your life admin at a glance</p>
        </div>
        <Link
          href="/items/new"
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Item
        </Link>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className={`w-10 h-10 ${bg} rounded-lg flex items-center justify-center mb-3`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Overdue items */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <h2 className="font-semibold text-slate-900 text-sm">Overdue ({overdueItems.length})</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {overdueItems.length === 0 ? (
              <p className="text-slate-400 text-sm px-4 py-6 text-center">No overdue items 🎉</p>
            ) : (
              overdueItems.slice(0, 5).map((item) => (
                <Link key={item.id} href={`/items/${item.id}/edit`} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{item.title}</p>
                    <p className="text-xs text-red-500 mt-0.5">Due {formatDate(item.due_date)}</p>
                  </div>
                  <PriorityBadge priority={item.priority} />
                </Link>
              ))
            )}
          </div>
          {overdueItems.length > 5 && (
            <div className="px-4 py-2 border-t border-slate-100">
              <Link href="/items?status=Pending" className="text-xs text-teal-600 hover:underline">View all overdue →</Link>
            </div>
          )}
        </div>

        {/* Upcoming deadlines */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
            <Calendar className="w-4 h-4 text-orange-500" />
            <h2 className="font-semibold text-slate-900 text-sm">Due Soon ({dueSoonItems.length})</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {upcomingItems.length === 0 ? (
              <p className="text-slate-400 text-sm px-4 py-6 text-center">Nothing due in 7 days</p>
            ) : (
              upcomingItems.map((item) => {
                const days = daysUntil(item.due_date)
                return (
                  <Link key={item.id} href={`/items/${item.id}/edit`} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{item.title}</p>
                      <p className="text-xs text-orange-500 mt-0.5">
                        {days === 0 ? 'Due today' : `In ${days} day${days !== 1 ? 's' : ''}`}
                      </p>
                    </div>
                    <PriorityBadge priority={item.priority} />
                  </Link>
                )
              })
            )}
          </div>
        </div>

        {/* Reminders */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
            <Bell className="w-4 h-4 text-teal-500" />
            <h2 className="font-semibold text-slate-900 text-sm">Active Reminders</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {reminderItems.length === 0 ? (
              <p className="text-slate-400 text-sm px-4 py-6 text-center">No active reminders</p>
            ) : (
              reminderItems.map((item) => {
                const days = daysUntil(item.due_date)
                return (
                  <Link key={item.id} href={`/items/${item.id}/edit`} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{item.title}</p>
                      <p className="text-xs text-teal-600 mt-0.5">
                        {days === 0 ? 'Due today' : days !== null && days > 0 ? `${days} days left` : 'Overdue'}
                      </p>
                    </div>
                    <StatusBadge status={item.status} />
                  </Link>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Push reminder schedule */}
      <RemindersCard
        upcoming={upcomingReminders}
        recent={recentReminders}
        timezone={timezone}
        pushConfigured={isPushConfigured()}
        errorMessage={remindersError?.message}
      />

      {/* Recently added */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900 text-sm">Recently Added</h2>
          <Link href="/items" className="text-xs text-teal-600 hover:underline">View all →</Link>
        </div>
        {recentItems.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <CheckSquare className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No items yet.</p>
            <Link href="/items/new" className="text-teal-600 text-sm hover:underline mt-1 inline-block">Add your first item</Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase tracking-wider border-b border-slate-100">
                  <th className="px-4 py-2 font-medium">Title</th>
                  <th className="px-4 py-2 font-medium hidden sm:table-cell">Category</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Priority</th>
                  <th className="px-4 py-2 font-medium hidden sm:table-cell">Due Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {recentItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/items/${item.id}/edit`} className="font-medium text-slate-900 hover:text-teal-600 transition-colors">
                        {item.title}
                      </Link>
                      {item.description && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[200px]">{item.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-slate-500 text-xs">{item.category?.name ?? '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                    <td className="px-4 py-3"><PriorityBadge priority={item.priority} /></td>
                    <td className="px-4 py-3 hidden sm:table-cell text-slate-500 text-xs">
                      {isOverdue(item.due_date, item.status) ? (
                        <span className="text-red-500 font-medium">{formatDateTime(item.due_date, item.due_time)}</span>
                      ) : (
                        formatDateTime(item.due_date, item.due_time)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
