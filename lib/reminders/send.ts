/**
 * FCM delivery through the Firebase Admin SDK (HTTP v1 under the hood).
 * The service-account credentials are read from server env only and are never
 * bundled into client code; initialization is lazy so builds work without them.
 */

const FIREBASE_SERVICE_ACCOUNT = process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? ''

/** FCM error codes that mean the token is dead and must not be retried. */
const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
  'messaging/mismatched-credential',
])

export function isPushConfigured(): boolean {
  return Boolean(FIREBASE_SERVICE_ACCOUNT)
}

type AdminMessaging = import('firebase-admin/messaging').Messaging

let messagingPromise: Promise<AdminMessaging> | null = null

async function getMessagingClient(): Promise<AdminMessaging> {
  if (!isPushConfigured()) {
    throw new Error('Firebase is not configured (FIREBASE_SERVICE_ACCOUNT_JSON is missing).')
  }
  if (!messagingPromise) {
    messagingPromise = (async () => {
      const { initializeApp, getApps, cert } = await import('firebase-admin/app')
      const { getMessaging } = await import('firebase-admin/messaging')
      const raw = FIREBASE_SERVICE_ACCOUNT.trim()
      const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')
      const serviceAccount = JSON.parse(json) as Parameters<typeof cert>[0]
      const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(serviceAccount) })
      return getMessaging(app)
    })()
    // Allow a later attempt if initialization failed (e.g. env fixed and redeployed).
    messagingPromise.catch(() => {
      messagingPromise = null
    })
  }
  return messagingPromise
}

export interface PushMessage {
  title: string
  body: string
  itemId: string
}

export interface PushResult {
  delivered: number
  /** Tokens FCM reported as dead; the caller should disable them. */
  disabledTokens: string[]
  errors: string[]
}

export async function sendPush(tokens: string[], message: PushMessage): Promise<PushResult> {
  const result: PushResult = { delivered: 0, disabledTokens: [], errors: [] }
  if (!tokens.length) return result

  const messaging = await getMessagingClient()
  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: { title: message.title, body: message.body },
    data: { itemId: message.itemId, url: `/items/${message.itemId}/edit` },
    webpush: { fcmOptions: { link: `/items/${message.itemId}/edit` } },
  })

  response.responses.forEach((res, index) => {
    if (res.success) {
      result.delivered += 1
      return
    }
    const code = res.error?.code ?? ''
    if (INVALID_TOKEN_CODES.has(code)) result.disabledTokens.push(tokens[index])
    result.errors.push(code || res.error?.message || 'Unknown FCM error')
  })

  return result
}
