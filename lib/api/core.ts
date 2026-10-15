import type {
  Category,
  LifeAdminItem,
  NotificationPreference,
  Priority,
  Reminder,
  Status,
} from '@/lib/types'
import type { AuthUser, Session } from '@/lib/session'

/**
 * Absolute base of this app's own /api routes. Empty by default, which means
 * "same origin": the browser uses relative paths, while middleware and server
 * components pass an absolute origin per request.
 */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '')

/** Same { data, error } shape the Supabase client used, so existing UI code keeps working. */
export interface ApiResult<T> {
  data: T | null
  error: { message: string; status: number } | null
}

/** What the item form sends. user_id and updated_at are set by the backend. */
export interface ItemInput {
  title: string
  description: string | null
  category_id: string | null
  due_date: string | null
  due_time: string | null
  priority: Priority
  status: Status
  reminder_days: number[]
  reminder_minutes: number[]
  notification_preference: NotificationPreference
  /** Optional: the browser's IANA zone, so reminders schedule in local time. */
  timezone?: string
}

export interface SessionPayload extends Session {
  user: AuthUser
}

/** One HTTP call to an API route. Never throws: failures come back as `error`. */
export async function apiFetch<T>(
  method: string,
  path: string,
  opts: { token?: string | null; body?: unknown; base?: string } = {}
): Promise<ApiResult<T>> {
  const { token, body } = opts
  const base = (opts.base ?? API_URL).replace(/\/$/, '')
  let res: Response
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    })
  } catch {
    return {
      data: null,
      error: {
        message: 'Cannot reach the server. Please check your connection and try again.',
        status: 0,
      },
    }
  }

  if (res.status === 204) return { data: null, error: null }

  let payload: unknown = null
  try {
    payload = await res.json()
  } catch {
    /* non-JSON body */
  }

  if (!res.ok) {
    const detail = (payload as { detail?: unknown } | null)?.detail
    return {
      data: null,
      error: { message: typeof detail === 'string' ? detail : `Request failed (${res.status}).`, status: res.status },
    }
  }
  return { data: payload as T, error: null }
}

/** Endpoints that work without being signed in. `base` is needed for server-side callers. */
export const authApi = {
  login: (email: string, password: string, base?: string) =>
    apiFetch<SessionPayload>('POST', '/api/auth/login', { body: { email, password }, base }),
  register: (email: string, password: string, base?: string) =>
    apiFetch<AuthUser>('POST', '/api/auth/register', { body: { email, password }, base }),
  refresh: (refreshToken: string, base?: string) =>
    apiFetch<SessionPayload>('POST', '/api/auth/refresh', { body: { refresh_token: refreshToken }, base }),
  logout: (token: string, base?: string) => apiFetch<null>('POST', '/api/auth/logout', { token, base }),
  me: (token: string, base?: string) => apiFetch<AuthUser>('GET', '/api/auth/me', { token, base }),
}

/**
 * Endpoints for a signed-in user. `getToken` supplies the access token; if the API
 * answers 401 and `refreshToken` is given, the call is retried once with a fresh token.
 * `getBase` supplies the absolute origin for server-side callers.
 */
export function createApi(
  getToken: () => Promise<string | null>,
  refreshToken?: () => Promise<string | null>,
  getBase?: () => Promise<string>
) {
  async function request<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
    const token = await getToken()
    if (!token) {
      return { data: null, error: { message: 'You are not signed in. Please sign in again.', status: 401 } }
    }
    const base = await getBase?.()
    let result = await apiFetch<T>(method, path, { token, body, base })
    if (result.error?.status === 401 && refreshToken) {
      const fresh = await refreshToken()
      if (fresh && fresh !== token) result = await apiFetch<T>(method, path, { token: fresh, body, base })
    }
    return result
  }

  return {
    items: {
      list: () => request<LifeAdminItem[]>('GET', '/api/items'),
      get: (id: string) => request<LifeAdminItem>('GET', `/api/items/${encodeURIComponent(id)}`),
      create: (input: ItemInput) => request<LifeAdminItem>('POST', '/api/items', input),
      update: (id: string, input: ItemInput) =>
        request<LifeAdminItem>('PUT', `/api/items/${encodeURIComponent(id)}`, input),
      remove: (id: string) => request<null>('DELETE', `/api/items/${encodeURIComponent(id)}`),
    },
    categories: {
      list: () => request<Category[]>('GET', '/api/categories'),
      create: (name: string) => request<Category>('POST', '/api/categories', { name }),
      rename: (id: string, name: string) =>
        request<Category>('PATCH', `/api/categories/${encodeURIComponent(id)}`, { name }),
      remove: (id: string) => request<null>('DELETE', `/api/categories/${encodeURIComponent(id)}`),
    },
    auth: {
      changePassword: (password: string) => request<{ ok: boolean }>('PUT', '/api/auth/password', { password }),
    },
    reminders: {
      overview: () => request<{ upcoming: Reminder[]; recent: Reminder[] }>('GET', '/api/reminders'),
    },
    settings: {
      get: () => request<{ timezone: string | null }>('GET', '/api/settings/timezone'),
      setTimezone: (timezone: string) =>
        request<{ timezone: string; changed: boolean }>('PUT', '/api/settings/timezone', { timezone }),
    },
    push: {
      register: (token: string) => request<{ ok: boolean }>('POST', '/api/push/token', { token }),
    },
  }
}
