import { NextResponse, type NextRequest } from 'next/server'

/**
 * Server-side access to Supabase's Auth (GoTrue) and REST (PostgREST) HTTP APIs,
 * used by the route handlers under app/api/. Every database call is made with the
 * signed-in user's access token, so Row Level Security still scopes each query
 * to that user.
 */
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

export class ApiError extends Error {
  status: number
  code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

/** Turn a thrown error into the JSON error shape the frontend client reads (`detail`). */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ detail: err.message }, { status: err.status })
  }
  console.error('API route error:', err)
  return NextResponse.json({ detail: 'Unexpected server error.' }, { status: 500 })
}

function requireConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new ApiError(500, 'Supabase is not configured on the server.')
  }
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** Supabase Auth reports errors under different keys depending on the endpoint. */
function authErrorMessage(body: unknown, status: number): { message: string; code?: string } {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>
    for (const key of ['msg', 'message', 'error_description', 'error']) {
      if (record[key]) return { message: String(record[key]), code: (record.error_code ?? record.code) as string | undefined }
    }
  }
  return { message: `Authentication request failed (${status}).` }
}

/** Call a Supabase Auth endpoint. The publishable key goes in `apikey` only. */
export async function authCall(
  method: string,
  path: string,
  opts: { json?: unknown; params?: Record<string, string>; token?: string } = {}
): Promise<unknown> {
  requireConfig()
  const headers: Record<string, string> = { apikey: SUPABASE_ANON_KEY }
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`
  // fetch would otherwise send a string body as text/plain, which the APIs reject.
  if (opts.json !== undefined) headers['Content-Type'] = 'application/json'

  const url = new URL(`${SUPABASE_URL}/auth/v1/${path}`)
  if (opts.params) {
    for (const [key, value] of Object.entries(opts.params)) url.searchParams.set(key, value)
  }

  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers,
      body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined,
      cache: 'no-store',
    })
  } catch {
    throw new ApiError(503, 'Could not reach Supabase Auth.')
  }

  const body = await readBody(res)
  if (res.status >= 400) {
    const { message, code } = authErrorMessage(body, res.status)
    throw new ApiError(res.status, message, code)
  }
  return body
}

/** Shape Supabase's token response into what the frontend stores as its session. */
export function sessionFromTokenResponse(body: unknown) {
  const data = (body ?? {}) as Record<string, unknown>
  const expiresAt =
    typeof data.expires_at === 'number'
      ? data.expires_at
      : Math.floor(Date.now() / 1000) + Number(data.expires_in ?? 3600)
  const user = (data.user ?? {}) as Record<string, unknown>
  return {
    access_token: String(data.access_token ?? ''),
    refresh_token: String(data.refresh_token ?? ''),
    expires_at: Math.floor(Number(expiresAt)),
    user: { id: String(user.id ?? ''), email: (user.email as string | null) ?? null },
  }
}

/** Call a table on Supabase's REST API (PostgREST). */
async function restCall(
  method: string,
  table: string,
  token: string,
  opts: {
    params?: Record<string, string>
    json?: unknown
    single?: boolean
    prefer?: string
    /** Overrides the `apikey` header; needed when `token` is the service key (see below). */
    apiKey?: string
  } = {}
): Promise<unknown> {
  requireConfig()
  const headers: Record<string, string> = {
    apikey: opts.apiKey ?? SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
  }
  if (opts.single) headers.Accept = 'application/vnd.pgrst.object+json'
  if (opts.prefer) headers.Prefer = opts.prefer
  // PostgREST rejects a JSON body sent with fetch's default text/plain type.
  if (opts.json !== undefined) headers['Content-Type'] = 'application/json'

  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`)
  if (opts.params) {
    for (const [key, value] of Object.entries(opts.params)) url.searchParams.set(key, value)
  }

  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers,
      body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined,
      cache: 'no-store',
    })
  } catch {
    throw new ApiError(503, 'Could not reach Supabase.')
  }

  const body = await readBody(res)
  if (res.status >= 400) {
    const data = body as { message?: string; code?: string } | null
    // PostgREST reports an unknown table as 404/42P01; surface it as an
    // actionable setup error instead of a bare "404".
    if (data?.code === 'PGRST205' || data?.code === '42P01') {
      throw new ApiError(
        503,
        `Database table '${table}' is missing. Run the SQL files in supabase/migrations/ in the Supabase SQL editor, then try again.`,
        data.code
      )
    }
    const message = data?.message || `Supabase request failed (${res.status})`
    if (opts.single && res.status === 406) {
      // vnd.pgrst.object+json reports no row (or several) as 406 PGRST116.
      throw new ApiError(404, 'Not found.', 'PGRST116')
    }
    throw new ApiError(res.status, message, data?.code)
  }
  return body
}

export interface RouteUser {
  id: string
  email: string | null
  /** The caller's own Supabase access token, forwarded on database calls so RLS applies. */
  token: string
}

/** Identify the caller by validating their Supabase access token. */
export async function getRouteUser(req: NextRequest): Promise<RouteUser> {
  const header = req.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) throw new ApiError(401, 'Not authenticated.')

  try {
    const body = (await authCall('GET', 'user', { token })) as { id?: unknown; email?: unknown } | null
    if (!body?.id) throw new ApiError(401, 'Your session is invalid or has expired. Please sign in again.')
    return { id: String(body.id), email: (body.email as string | null) ?? null, token }
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      throw new ApiError(401, 'Your session is invalid or has expired. Please sign in again.')
    }
    throw err
  }
}

// ---- data access used by the item and category routes ---------------------------

export const ITEMS_TABLE = 'life_admin_items'
export const CATEGORIES_TABLE = 'life_admin_categories'

/** Same join the list pages use: each item carries its category's id + name. */
export const ITEM_LIST_SELECT =
  '*,category:life_admin_categories!life_admin_items_category_id_fkey(id,name)'

export async function listItems(token: string, userId: string): Promise<unknown[]> {
  return (await restCall('GET', ITEMS_TABLE, token, {
    params: { select: ITEM_LIST_SELECT, user_id: `eq.${userId}`, order: 'created_at.desc' },
  })) as unknown[]
}

export async function getItem(token: string, userId: string, itemId: string): Promise<unknown> {
  return restCall('GET', ITEMS_TABLE, token, {
    params: { select: '*', id: `eq.${itemId}`, user_id: `eq.${userId}` },
    single: true,
  })
}

export async function createItem(token: string, row: Record<string, unknown>): Promise<unknown> {
  const rows = (await restCall('POST', ITEMS_TABLE, token, {
    json: row,
    prefer: 'return=representation',
  })) as unknown[]
  return rows[0]
}

export async function updateItem(
  token: string,
  userId: string,
  itemId: string,
  row: Record<string, unknown>
): Promise<unknown> {
  const rows = (await restCall('PATCH', ITEMS_TABLE, token, {
    params: { id: `eq.${itemId}`, user_id: `eq.${userId}` },
    json: row,
    prefer: 'return=representation',
  })) as unknown[]
  if (!rows.length) throw new ApiError(404, 'Item not found.')
  return rows[0]
}

export async function deleteItem(token: string, userId: string, itemId: string): Promise<void> {
  // Idempotent: deleting a missing item is not an error.
  await restCall('DELETE', ITEMS_TABLE, token, {
    params: { id: `eq.${itemId}`, user_id: `eq.${userId}` },
  })
}

export async function listCategories(token: string, userId: string): Promise<unknown[]> {
  return (await restCall('GET', CATEGORIES_TABLE, token, {
    params: { select: '*', user_id: `eq.${userId}`, order: 'name.asc' },
  })) as unknown[]
}

export async function createCategory(token: string, userId: string, name: string): Promise<unknown> {
  const rows = (await restCall('POST', CATEGORIES_TABLE, token, {
    json: { name, user_id: userId, is_default: false },
    prefer: 'return=representation',
  })) as unknown[]
  return rows[0]
}

export async function renameCategory(
  token: string,
  userId: string,
  categoryId: string,
  name: string
): Promise<unknown> {
  const rows = (await restCall('PATCH', CATEGORIES_TABLE, token, {
    params: { id: `eq.${categoryId}`, user_id: `eq.${userId}` },
    json: { name },
    prefer: 'return=representation',
  })) as unknown[]
  if (!rows.length) throw new ApiError(404, 'Category not found.')
  return rows[0]
}

export async function deleteCategory(token: string, userId: string, categoryId: string): Promise<void> {
  // First detach items from this category, then delete the category itself.
  try {
    await restCall('PATCH', ITEMS_TABLE, token, {
      params: { category_id: `eq.${categoryId}`, user_id: `eq.${userId}` },
      json: { category_id: null },
    })
  } catch {
    // The detach step is best-effort; the delete below reports any real problem.
  }
  await restCall('DELETE', CATEGORIES_TABLE, token, {
    params: { id: `eq.${categoryId}`, user_id: `eq.${userId}` },
  })
}

// ---- reminders and device tokens ------------------------------------------------

export const REMINDERS_TABLE = 'life_admin_reminders'
export const DEVICE_TOKENS_TABLE = 'life_admin_device_tokens'

/** Same join used when reminders are listed for the dashboard card. */
export const REMINDER_ITEM_SELECT =
  '*,item:life_admin_items!life_admin_reminders_item_id_fkey(id,title,due_date,due_time,status,priority)'

/**
 * The cron route runs without a signed-in user, so it uses the service-role key
 * (server env only) which bypasses RLS. Never use this for caller-driven routes.
 */
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

export function hasServiceRoleKey(): boolean {
  return Boolean(SUPABASE_SERVICE_KEY)
}

async function serviceRestCall(
  method: string,
  table: string,
  opts: { params?: Record<string, string>; json?: unknown; single?: boolean; prefer?: string } = {}
): Promise<unknown> {
  if (!hasServiceRoleKey()) {
    throw new ApiError(500, 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server.')
  }
  // The service key is sent as BOTH apikey and Authorization. New-format
  // "sb_secret_…" keys are not JWTs, and PostgREST rejects them with PGRST301
  // ("Expected 3 parts in JWT") when they arrive as Bearer next to a different
  // apikey. Sending the same key in both headers also works with legacy keys.
  return restCall(method, table, SUPABASE_SERVICE_KEY, { apiKey: SUPABASE_SERVICE_KEY, ...opts })
}

/**
 * Register (or re-activate) an FCM token for the signed-in user. The upsert is
 * idempotent: re-registering the same token just refreshes last_seen_at. It
 * deliberately does NOT disable the user's other tokens — concurrent
 * registrations (preference change + silent token refresh, two tabs) used to
 * disable each other and leave the user with zero active tokens. Duplicate
 * display is already prevented at send time by selecting a single recipient
 * and by the notification tag in the browser.
 */
export async function upsertDeviceToken(token: string, userId: string, fcmToken: string): Promise<void> {
  await restCall('POST', DEVICE_TOKENS_TABLE, token, {
    params: { on_conflict: 'token' },
    json: {
      user_id: userId,
      token: fcmToken,
      platform: 'web',
      last_seen_at: new Date().toISOString(),
      disabled_at: null,
    },
    prefer: 'resolution=merge-duplicates',
  })
}

/**
 * A browser can accumulate several still-valid FCM tokens (re-permissioning,
 * token rotation, cleared profiles); pushing to all of them would notify the
 * same browser once per token. Only the most recently seen active token is
 * used, so each reminder reaches the user once; a different device takes over
 * by registering (and being seen) later. Dead tokens are disabled by the cron
 * route when FCM rejects them.
 */
export async function listActiveDeviceTokens(userId: string): Promise<string[]> {
  const rows = (await serviceRestCall('GET', DEVICE_TOKENS_TABLE, {
    params: {
      select: 'token',
      user_id: `eq.${userId}`,
      disabled_at: 'is.null',
      order: 'last_seen_at.desc,created_at.desc',
      limit: '1',
    },
  })) as { token: string }[]
  return rows.map((row) => row.token)
}

export async function disableDeviceToken(fcmToken: string): Promise<void> {
  await serviceRestCall('PATCH', DEVICE_TOKENS_TABLE, {
    params: { token: `eq.${fcmToken}` },
    json: { disabled_at: new Date().toISOString() },
  })
}

export async function listItemsPendingWithDueDate(token: string, userId: string): Promise<unknown[]> {
  return (await restCall('GET', ITEMS_TABLE, token, {
    params: { select: '*', user_id: `eq.${userId}`, status: 'eq.Pending', due_date: 'not.is.null' },
  })) as unknown[]
}

export async function listUpcomingReminders(token: string, userId: string, limit = 5): Promise<unknown[]> {
  return (await restCall('GET', REMINDERS_TABLE, token, {
    params: {
      select: REMINDER_ITEM_SELECT,
      user_id: `eq.${userId}`,
      status: 'eq.pending',
      scheduled_for: `gte.${new Date().toISOString()}`,
      order: 'scheduled_for.asc',
      limit: String(limit),
    },
  })) as unknown[]
}

export async function listRecentReminders(token: string, userId: string, limit = 3): Promise<unknown[]> {
  return (await restCall('GET', REMINDERS_TABLE, token, {
    params: {
      select: REMINDER_ITEM_SELECT,
      user_id: `eq.${userId}`,
      status: 'in.(sent,failed)',
      order: 'scheduled_for.desc',
      limit: String(limit),
    },
  })) as unknown[]
}

/** Drop unsent reminders for an item; called before re-creating them. */
export async function deletePendingReminders(token: string, userId: string, itemId: string): Promise<void> {
  await restCall('DELETE', REMINDERS_TABLE, token, {
    params: { user_id: `eq.${userId}`, item_id: `eq.${itemId}`, status: 'eq.pending' },
  })
}

/** Mark pending reminders as canceled (task completed or renewed). */
export async function cancelPendingReminders(token: string, userId: string, itemId: string): Promise<void> {
  await restCall('PATCH', REMINDERS_TABLE, token, {
    params: { user_id: `eq.${userId}`, item_id: `eq.${itemId}`, status: 'eq.pending' },
    json: { status: 'canceled' },
  })
}

export async function insertReminders(token: string, rows: unknown[]): Promise<unknown[]> {
  if (!rows.length) return []
  return (await restCall('POST', REMINDERS_TABLE, token, {
    json: rows,
    prefer: 'return=representation',
  })) as unknown[]
}

/** Cheap existence probe used to backfill reminders for items created before scheduling existed. */
export async function hasAnyReminders(token: string, userId: string): Promise<boolean> {
  const rows = (await restCall('GET', REMINDERS_TABLE, token, {
    params: { select: 'id', user_id: `eq.${userId}`, limit: '1' },
  })) as unknown[]
  return rows.length > 0
}

export async function listDueReminders(limit = 50, now = new Date()): Promise<unknown[]> {
  return (await serviceRestCall('GET', REMINDERS_TABLE, {
    params: {
      select: REMINDER_ITEM_SELECT,
      status: 'eq.pending',
      scheduled_for: `lte.${now.toISOString()}`,
      order: 'scheduled_for.asc',
      limit: String(limit),
    },
  })) as unknown[]
}

/**
 * Atomically move a reminder from pending to processing. Returns null when
 * another run already claimed it, so a reminder is never delivered twice. The
 * embedded item is selected explicitly: without `select`, PATCH responses come
 * back as plain rows and the cron route would see no item at all.
 */
export async function claimReminder(id: string): Promise<unknown | null> {
  const rows = (await serviceRestCall('PATCH', REMINDERS_TABLE, {
    params: { id: `eq.${id}`, status: 'eq.pending', select: REMINDER_ITEM_SELECT },
    json: { status: 'processing', last_error: null },
    prefer: 'return=representation',
  })) as unknown[]
  return rows[0] ?? null
}

export async function finishReminder(id: string, patch: Record<string, unknown>): Promise<void> {
  await serviceRestCall('PATCH', REMINDERS_TABLE, {
    params: { id: `eq.${id}` },
    json: patch,
  })
}

/** A run that crashed mid-delivery leaves rows in processing; fail them so they never re-send. */
export async function failStuckReminders(cutoffIso: string): Promise<void> {
  await serviceRestCall('PATCH', REMINDERS_TABLE, {
    params: { status: 'eq.processing', scheduled_for: `lt.${cutoffIso}` },
    json: { status: 'failed', last_error: 'Delivery was interrupted.' },
  })
}
