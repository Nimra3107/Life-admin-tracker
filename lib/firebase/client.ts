/**
 * Public Firebase web config (these values are shipped to browsers by design).
 * Security comes from VAPID keys + FCM token registration, and the Admin SDK
 * credentials stay server-side (FIREBASE_SERVICE_ACCOUNT_JSON).
 */
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
}

export const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? ''

/** Names (never values) of the required Firebase variables that are missing or empty. */
export function missingFirebaseEnvVars(): string[] {
  const missing: string[] = []
  if (!firebaseConfig.apiKey) missing.push('NEXT_PUBLIC_FIREBASE_API_KEY')
  if (!firebaseConfig.projectId) missing.push('NEXT_PUBLIC_FIREBASE_PROJECT_ID')
  if (!firebaseConfig.messagingSenderId) missing.push('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID')
  if (!firebaseConfig.appId) missing.push('NEXT_PUBLIC_FIREBASE_APP_ID')
  if (!VAPID_KEY) missing.push('NEXT_PUBLIC_FIREBASE_VAPID_KEY')
  return missing
}

export function isFirebaseConfigured(): boolean {
  return missingFirebaseEnvVars().length === 0
}
