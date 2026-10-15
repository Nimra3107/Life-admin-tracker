import { getCurrentUser, createServerApi } from '@/lib/api/server'
import { redirect, notFound } from 'next/navigation'
import ItemForm from '@/components/ItemForm'
import { formatDateTime } from '@/lib/utils'
import { CalendarClock } from 'lucide-react'

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const api = await createServerApi()
  const [{ data: item }, { data: categories }, { data: settings }] = await Promise.all([
    api.items.get(id),
    api.categories.list(),
    api.settings.get(),
  ])

  if (!item) notFound()

  const timezone = settings?.timezone ?? null

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Edit Item</h1>
        <p className="text-slate-500 text-sm mt-1">Update the details for <span className="font-medium text-slate-700">{item.title}</span>.</p>
        <p className="inline-flex items-center gap-1.5 text-sm text-slate-600 mt-2 rounded-lg bg-slate-100 border border-slate-200 px-3 py-1.5">
          <CalendarClock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          {item.due_date ? (
            <span>
              Due {formatDateTime(item.due_date, item.due_time)}
              {timezone && <span className="text-slate-400"> ({timezone})</span>}
            </span>
          ) : (
            <span className="text-slate-400">No due date set</span>
          )}
        </p>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <ItemForm item={item} categories={categories ?? []} timezone={timezone ?? undefined} />
      </div>
    </div>
  )
}
