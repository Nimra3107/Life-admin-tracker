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
  return missingPushServerEnvVars().length === 0
}

/** Names (never values) of the push variables that are missing or unusable. */
export function missingPushServerEnvVars(): string[] {
  const raw = FIREBASE_SERVICE_ACCOUNT.trim()
  if (!raw) return ['FIREBASE_SERVICE_ACCOUNT_JSON']
  try {
    JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'))
    return []
  } catch {
    return ['FIREBASE_SERVICE_ACCOUNT_JSON (set but not valid JSON or base64)']
  }
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
      // The JSON file uses snake_case keys; the SDK type uses camelCase.
      const serviceAccount = JSON.parse(json) as { project_id?: string } & import('firebase-admin/app').ServiceAccount
      const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(serviceAccount) })
      console.log(`[push] Firebase Admin initialized OK (project=${serviceAccount.project_id ?? 'unknown'})`)
      return getMessaging(app)
    })()
    // Allow a later attempt if initialization failed (e.g. env fixed and redeployed).
    messagingPromise.catch((err: unknown) => {
      // Never log the raw error message of a JSON.parse failure — it can echo
      // fragments of the service-account content.
      const detail =
        err instanceof SyntaxError
          ? 'invalid service-account JSON (details suppressed to avoid leaking credentials)'
          : err instanceof Error
            ? err.message
            : String(err)
      const code = (err as { code?: string } | null)?.code
      console.error(`[push] Firebase Admin initialization FAILED: ${detail}${code ? ` (code=${code})` : ''}`)
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

  console.log(`[push] FCM send starting: ${tokens.length} device(s), item=${message.itemId}, title="${message.title}"`)
  const messaging = await getMessagingClient()
  // No webpush.fcmOptions.link here: FCM validates that field strictly and a
  // relative path makes the whole send fail with messaging/invalid-argument.
  // Notification clicks are handled by the app's service worker, which navigates
  // to data.url below.
  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: { title: message.title, body: message.body },
    data: { itemId: message.itemId, url: `/items/${message.itemId}/edit` },
  })

  response.responses.forEach((res, index) => {
    if (res.success) {
      result.delivered += 1
      console.log(`[push] FCM delivered to device ${index + 1}/${tokens.length}: messageId=${res.messageId}`)
      return
    }
    const code = res.error?.code ?? ''
    console.error(
      `[push] FCM send failed for device ${index + 1}/${tokens.length}: code=${code || 'unknown'} message=${res.error?.message ?? 'unknown'}`
    )
    if (INVALID_TOKEN_CODES.has(code)) result.disabledTokens.push(tokens[index])
    result.errors.push(code || res.error?.message || 'Unknown FCM error')
  })

  console.log(`[push] FCM send finished: delivered=${result.delivered}/${tokens.length}`)
  return result
}
