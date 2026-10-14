import { getCurrentUser, createServerApi } from '@/lib/api/server'
import { redirect, notFound } from 'next/navigation'
import ItemForm from '@/components/ItemForm'

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const api = await createServerApi()
  const [{ data: item }, { data: categories }] = await Promise.all([
    api.items.get(id),
    api.categories.list(),
  ])

  if (!item) notFound()

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Edit Item</h1>
        <p className="text-slate-500 text-sm mt-1">Update the details for <span className="font-medium text-slate-700">{item.title}</span>.</p>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <ItemForm item={item} categories={categories ?? []} />
      </div>
    </div>
  )
}
