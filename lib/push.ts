import { createBrowserApi } from '@/lib/api/client'
import { firebaseConfig, isFirebaseConfigured, missingFirebaseEnvVars, VAPID_KEY } from '@/lib/firebase/client'

export type PushRegistrationResult = { ok: true } | { ok: false; message: string }

/**
 * Firebase suppresses its automatic notification whenever an app tab counts as
 * visible and hands the message to the page instead. Without an onMessage
 * listener those reminders are dropped, so this displays them through the same
 * service worker registration (and same reminder tag) used for background
 * pushes. The SDK runs only one of the two paths, so a reminder is shown once.
 */
export async function registerForegroundMessageHandler(): Promise<() => void> {
  if (!isFirebaseConfigured()) return () => {}
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('Notification' in window)) {
    return () => {}
  }
  if (Notification.permission !== 'granted') return () => {}

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
  const { initializeApp, getApps } = await import('firebase/app')
  const { getMessaging, onMessage } = await import('firebase/messaging')
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
  return onMessage(getMessaging(app), (payload) => {
    const notification = payload.notification ?? {}
    if (!notification.title && !notification.body) return
    const data = payload.data ?? {}
    void registration.showNotification(notification.title ?? 'Life Admin Tracker', {
      body: notification.body ?? '',
      ...(data.reminderId ? { tag: `reminder-${data.reminderId}` } : {}),
      data: { ...data, FCM_MSG: payload },
    })
  })
}

/**
 * Called only when the user opts into push notifications: asks for browser
 * permission, registers the FCM service worker, and stores the resulting token
 * against the signed-in user.
 */
export async function enablePushNotifications(): Promise<PushRegistrationResult> {
  if (!isFirebaseConfigured()) {
    console.error(`[push] not configured — missing env: ${missingFirebaseEnvVars().join(', ')}`)
    return {
      ok: false,
      message: `Push notifications are not configured yet. Missing: ${missingFirebaseEnvVars().join(', ')}.`,
    }
  }
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('Notification' in window)) {
    console.error('[push] this browser does not support push notifications')
    return { ok: false, message: 'This browser does not support push notifications.' }
  }

  const permission = await Notification.requestPermission()
  console.log(`[push] notification permission: ${permission}`)
  if (permission !== 'granted') {
    console.error('[push] notification permission was not granted — aborting registration')
    return { ok: false, message: 'Notification permission was not granted.' }
  }

  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
    console.log(`[push] service worker registered (scope: ${registration.scope})`)
    // The worker is generated per request with no-store; force an update check so
    // a corrected notification handler activates without waiting for the
    // browser's periodic check. Failure here must not block token registration.
    try {
      await registration.update()
    } catch {
      // Keep the existing worker; the current registration is still usable.
    }
    const { initializeApp, getApps } = await import('firebase/app')
    const { getMessaging, getToken } = await import('firebase/messaging')
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
    const token = await getToken(getMessaging(app), {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    })
    if (!token) {
      console.error('[push] getToken returned no token for this browser')
      return { ok: false, message: 'Could not obtain a push token for this browser.' }
    }
    console.log(`[push] FCM token obtained (length ${token.length}) — storing it for this user`)

    const { error } = await createBrowserApi().push.register(token)
    if (error) {
      console.error('[push] storing the token failed:', error.message)
      return { ok: false, message: error.message }
    }
    console.log('[push] device token registered — push reminders are active for this browser')
    return { ok: true }
  } catch (err) {
    console.error('[push] registration failed:', err)
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Push registration failed.',
    }
  }
}
