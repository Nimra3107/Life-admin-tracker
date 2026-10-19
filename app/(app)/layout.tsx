import { getCurrentUser } from '@/lib/api/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import NotificationListener from '@/components/NotificationListener'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <NotificationListener />
      <Sidebar userEmail={user.email ?? ''} />
      {/* Desktop: offset for sidebar */}
      <main className="md:ml-60 pt-16 md:pt-0 min-h-screen">
        <div className="max-w-6xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  )
}
