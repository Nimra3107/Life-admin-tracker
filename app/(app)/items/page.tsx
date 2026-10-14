import { getCurrentUser, createServerApi } from '@/lib/api/server'
import { redirect } from 'next/navigation'
import ItemsClient from './ItemsClient'

export default async function ItemsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const api = await createServerApi()
  const [{ data: items }, { data: categories }] = await Promise.all([
    api.items.list(),
    api.categories.list(),
  ])

  return <ItemsClient initialItems={items ?? []} categories={categories ?? []} />
}
