'use client'

import { useEffect } from 'react'
import { registerForegroundMessageHandler } from '@/lib/push'

/** Shows reminders the service worker hands to a visible app tab instead of displaying itself. */
export default function NotificationListener() {
  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let cancelled = false

    registerForegroundMessageHandler()
      .then((fn) => {
        if (cancelled) fn()
        else unsubscribe = fn
      })
      .catch((err) => {
        console.error('[push] foreground notification setup failed:', err)
      })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  return null
}
