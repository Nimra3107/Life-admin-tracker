import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { sessionFromCookies, type AuthUser, type Session } from '@/lib/session'
import { API_URL, authApi, createApi } from './core'

/** The session cookies of the current request (middleware has already refreshed them if needed). */
export async function getServerSession(): Promise<Session | null> {
  const store = await cookies()
  return sessionFromCookies((name) => store.get(name)?.value)
}

/**
 * Absolute origin of the current request, so server components can call this
 * app's own /api routes. NEXT_PUBLIC_API_URL overrides it when set.
 */
async function requestOrigin(): Promise<string> {
  if (API_URL) return API_URL
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto =
    (h.get('x-forwarded-proto') ?? '').split(',')[0].trim() ||
    (/^(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?$/.test(host) ? 'http' : 'https')
  return `${proto}://${host}`
}

/**
 * The signed-in user, verified by the /api/auth/me route, or null. Cached per
 * request, so the layout and the page can both call it with a single round trip.
 */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const session = await getServerSession()
  if (!session) return null
  const { data, error } = await authApi.me(session.access_token, await requestOrigin())
  return error ? null : data
})

/** API client for Server Components, using the current request's session. */
export async function createServerApi() {
  const session = await getServerSession()
  const base = await requestOrigin()
  return createApi(async () => session?.access_token ?? null, undefined, async () => base)
}
