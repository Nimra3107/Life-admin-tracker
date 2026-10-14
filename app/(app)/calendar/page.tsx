import { getCurrentUser, createServerApi } from '@/lib/api/server'
import { redirect } from 'next/navigation'
import CalendarClient from './CalendarClient'

export default async function CalendarPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const api = await createServerApi()
  const { data: items } = await api.items.list()

  return <CalendarClient initialItems={items ?? []} />
}
