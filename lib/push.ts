import { createBrowserApi } from '@/lib/api/client'
import { firebaseConfig, isFirebaseConfigured, missingFirebaseEnvVars, VAPID_KEY } from '@/lib/firebase/client'

export type PushRegistrationResult = { ok: true } | { ok: false; message: string }

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
