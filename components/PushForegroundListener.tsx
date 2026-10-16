'use client'

import { useEffect } from 'react'
import { firebaseConfig, isFirebaseConfigured } from '@/lib/firebase/client'

/**
 * Shows FCM push messages while the tab is open: browsers do not display
 * foreground messages on their own, so each one is shown through the same
 * service worker that handles background messages (its notificationclick
 * handler opens the linked item). Silent and invisible otherwise.
 */
export default function PushForegroundListener() {
  useEffect(() => {
    if (!isFirebaseConfigured()) return
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return

    let unsubscribe: (() => void) | undefined
    let cancelled = false

    ;(async () => {
      try {
        const { initializeApp, getApps } = await import('firebase/app')
        const { getMessaging, onMessage } = await import('firebase/messaging')
        const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
        const messaging = getMessaging(app)
        if (cancelled) return

        unsubscribe = onMessage(messaging, async (payload) => {
          console.log(`[push] foreground message received (messageId=${payload.messageId ?? 'unknown'})`)
          try {
            const registration = await navigator.serviceWorker.ready
            await registration.showNotification(
              payload.notification?.title ?? 'Life Admin Tracker',
              { body: payload.notification?.body ?? '', data: payload.data ?? {} }
            )
          } catch (err) {
            console.error('[push] showing the foreground notification failed:', err)
          }
        })
      } catch (err) {
        console.error('[push] foreground listener failed to start:', err)
      }
    })()

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  return null
}
