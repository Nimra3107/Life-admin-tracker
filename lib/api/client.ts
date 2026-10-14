'use client'

import {
  ACCESS_COOKIE,
  COOKIE_MAX_AGE,
  EXPIRES_COOKIE,
  REFRESH_COOKIE,
  needsRefresh,
  sessionFromCookies,
  type Session,
} from '@/lib/session'
import { authApi, createApi } from './core'

// ---- session cookies (browser) ------------------------------------------------

function readCookie(name: string): string | undefined {
  const hit = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : undefined
}

function writeCookie(name: string, value: string) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`
}

function deleteCookie(name: string) {
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`
}

export function readSession(): Session | null {
  return sessionFromCookies(readCookie)
}

export function saveSession(session: Session) {
  writeCookie(ACCESS_COOKIE, session.access_token)
  writeCookie(REFRESH_COOKIE, session.refresh_token)
  writeCookie(EXPIRES_COOKIE, String(session.expires_at))
}

export function clearSession() {
  deleteCookie(ACCESS_COOKIE)
  deleteCookie(REFRESH_COOKIE)
  deleteCookie(EXPIRES_COOKIE)
}

// ---- token refresh -------------------------------------------------------------

let refreshing: Promise<string | null> | null = null

/** Exchanges the refresh token for a new session. Shared so parallel calls refresh only once. */
export function refreshBrowserSession(): Promise<string | null> {
  if (refreshing) return refreshing
  refreshing = (async () => {
    const session = readSession()
    if (!session) return null
    const { data, error } = await authApi.refresh(session.refresh_token)
    if (data) {
      saveSession(data)
      return data.access_token
    }
    // Refresh token rejected: the user is signed out. If the API merely couldn't be reached,
    // keep the session so it works again once the backend is back.
    if (error && error.status !== 0 && error.status < 500) clearSession()
    return null
  })().finally(() => {
    refreshing = null
  })
  return refreshing
}

// ---- what the UI calls ---------------------------------------------------------

/** API client for Client Components. Uses (and refreshes) the session cookies. */
export function createBrowserApi() {
  return createApi(async () => {
    const session = readSession()
    if (!session) return null
    if (needsRefresh(session)) return (await refreshBrowserSession()) ?? session.access_token
    return session.access_token
  }, refreshBrowserSession)
}

/** Sign in and store the session. Same { error } shape as before. */
export async function signIn(email: string, password: string) {
  const result = await authApi.login(email, password)
  if (result.data) saveSession(result.data)
  return result
}

/** Create the account (signing in is a separate step, exactly as before). */
export function signUp(email: string, password: string) {
  return authApi.register(email, password)
}

/** Revoke the session on the backend, then forget it locally. */
export async function signOut() {
  const session = readSession()
  if (session) await authApi.logout(session.access_token)
  clearSession()
}
