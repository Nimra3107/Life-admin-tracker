import { getCurrentUser, createServerApi } from '@/lib/api/server'
import { redirect } from 'next/navigation'
import ItemForm from '@/components/ItemForm'

export default async function NewItemPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const api = await createServerApi()
  const [{ data: categories }, { data: settings }] = await Promise.all([
    api.categories.list(),
    api.settings.get(),
  ])

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Add New Item</h1>
        <p className="text-slate-500 text-sm mt-1">Fill in the details for your life admin task.</p>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <ItemForm categories={categories ?? []} timezone={settings?.timezone ?? undefined} />
      </div>
    </div>
  )
}
