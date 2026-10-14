import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Life Admin Tracker',
  description: 'Track your life admin tasks, deadlines, and reminders',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}
