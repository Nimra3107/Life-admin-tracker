import { NextResponse, type NextRequest } from 'next/server'
import { authApi } from '@/lib/api/core'
import {
  ACCESS_COOKIE,
  COOKIE_MAX_AGE,
  EXPIRES_COOKIE,
  REFRESH_COOKIE,
  needsRefresh,
  sessionFromCookies,
  type AuthUser,
  type Session,
} from '@/lib/session'

function setSessionCookies(response: NextResponse, session: Session, secure: boolean) {
  const options = { path: '/', maxAge: COOKIE_MAX_AGE, sameSite: 'lax' as const, secure }
  response.cookies.set(ACCESS_COOKIE, session.access_token, options)
  response.cookies.set(REFRESH_COOKIE, session.refresh_token, options)
  response.cookies.set(EXPIRES_COOKIE, String(session.expires_at), options)
}

function clearSessionCookies(response: NextResponse) {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, EXPIRES_COOKIE]) response.cookies.delete(name)
}

export async function middleware(request: NextRequest) {
  const origin = request.nextUrl.origin
  let session = sessionFromCookies((name) => request.cookies.get(name)?.value)
  let refreshed: Session | null = null
  let sessionRejected = false

  // Keep the session alive: swap the refresh token for a new access token before it expires.
  if (session && needsRefresh(session)) {
    const { data, error } = await authApi.refresh(session.refresh_token, origin)
    if (data) {
      refreshed = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at }
      session = refreshed
    } else if (error && error.status !== 0 && error.status < 500) {
      session = null // refresh token rejected: signed out
      sessionRejected = true
    }
    // otherwise the API is unreachable: carry on with the current token
  }

  // Ask /api/auth/me who this is (it verifies the token against auth_sessions).
  let user: AuthUser | null = null
  if (session) {
    const { data, error } = await authApi.me(session.access_token, origin)
    if (error?.status === 401) sessionRejected = true
    user = error ? null : data
  }

  const { pathname } = request.nextUrl
  const publicPaths = ['/login', '/register']
  const isPublicPath = publicPaths.includes(pathname)
  const secure = request.nextUrl.protocol === 'https:'

  let response: NextResponse
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    response = NextResponse.redirect(url)
  } else if (user && isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    response = NextResponse.redirect(url)
  } else {
    if (refreshed) {
      // Let this request's server components see the new tokens too.
      request.cookies.set(ACCESS_COOKIE, refreshed.access_token)
      request.cookies.set(REFRESH_COOKIE, refreshed.refresh_token)
      request.cookies.set(EXPIRES_COOKIE, String(refreshed.expires_at))
    }
    response = NextResponse.next({ request })
  }

  if (refreshed) setSessionCookies(response, refreshed, secure)
  else if (sessionRejected) clearSessionCookies(response)
  return response
}

export const config = {
  // Only page navigations pass through here. The /api routes are excluded: they
  // do their own bearer-token auth and must answer with JSON 401s (a redirect
  // would make client API calls read an HTML login page instead). The FCM
  // service worker must be fetchable without a session as well.
  matcher: [
    '/((?!api(?:$|/)|_next/static|_next/image|favicon.ico|firebase-messaging-sw\\.js$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
