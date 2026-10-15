import { createBrowserApi } from '@/lib/api/client'
import { firebaseConfig, isFirebaseConfigured, VAPID_KEY } from '@/lib/firebase/client'

export type PushRegistrationResult = { ok: true } | { ok: false; message: string }

/**
 * Called only when the user opts into push notifications: asks for browser
 * permission, registers the FCM service worker, and stores the resulting token
 * against the signed-in user.
 */
export async function enablePushNotifications(): Promise<PushRegistrationResult> {
  if (!isFirebaseConfigured()) {
    return {
      ok: false,
      message: 'Push notifications are not configured yet. Add the Firebase keys to the environment first.',
    }
  }
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('Notification' in window)) {
    return { ok: false, message: 'This browser does not support push notifications.' }
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, message: 'Notification permission was not granted.' }
  }

  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
    const { initializeApp, getApps } = await import('firebase/app')
    const { getMessaging, getToken } = await import('firebase/messaging')
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
    const token = await getToken(getMessaging(app), {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    })
    if (!token) return { ok: false, message: 'Could not obtain a push token for this browser.' }

    const { error } = await createBrowserApi().push.register(token)
    if (error) return { ok: false, message: error.message }
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Push registration failed.',
    }
  }
}
