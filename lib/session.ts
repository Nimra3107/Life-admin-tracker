/**
 * Session handling shared by the browser, server components and middleware.
 * The session (issued by the /api/auth routes from Supabase Auth) lives in
 * three cookies so that middleware and server pages can read it.
 */
export const ACCESS_COOKIE = 'la_access_token'
export const REFRESH_COOKIE = 'la_refresh_token'
export const EXPIRES_COOKIE = 'la_expires_at'

/** ~400 days, the maximum browsers allow (the refresh token keeps the user signed in). */
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 400

/** Refresh the access token when it has less than this many seconds left. */
export const REFRESH_MARGIN_SECONDS = 60

export interface Session {
  access_token: string
  refresh_token: string
  /** Unix time (seconds) when the access token expires. */
  expires_at: number
}

export interface AuthUser {
  id: string
  email: string | null
}

export function sessionFromCookies(get: (name: string) => string | undefined): Session | null {
  const access = get(ACCESS_COOKIE)
  const refresh = get(REFRESH_COOKIE)
  const expiresRaw = get(EXPIRES_COOKIE)
  if (!access || !refresh || !expiresRaw) return null
  const expires = Number(expiresRaw)
  if (!Number.isFinite(expires)) return null
  return { access_token: access, refresh_token: refresh, expires_at: expires }
}

export function needsRefresh(session: Session, nowSeconds: number = Date.now() / 1000): boolean {
  return session.expires_at - nowSeconds < REFRESH_MARGIN_SECONDS
}
