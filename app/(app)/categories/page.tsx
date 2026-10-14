import { getCurrentUser, createServerApi } from '@/lib/api/server'
import { redirect } from 'next/navigation'
import CategoriesClient from './CategoriesClient'

export default async function CategoriesPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const api = await createServerApi()
  const { data: categories } = await api.categories.list()

  return <CategoriesClient initialCategories={categories ?? []} />
}
