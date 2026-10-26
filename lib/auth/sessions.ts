import { createHash, randomBytes } from 'node:crypto'
import { query } from '@/lib/db/pool'
import type { AuthUserRow } from './users'

/**
 * Database-backed sessions replacing Supabase's access/refresh token flow.
 * The browser keeps the same three cookies (la_access_token, la_refresh_token,
 * la_expires_at); the raw tokens are random secrets, and auth_sessions stores
 * only their sha256 hashes, so a leaked table cannot be used to authenticate.
 */

export const ACCESS_TTL_SECONDS = 60 * 60
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60

export interface SessionTokens {
  access_token: string
  refresh_token: string
  /** Unix seconds when the access token expires. */
  expires_at: number
}

export interface SessionPayload extends SessionTokens {
  user: { id: string; email: string | null }
}

function randomToken(): string {
  return randomBytes(32).toString('base64url')
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

export async function createSession(user: AuthUserRow): Promise<SessionPayload> {
  const access = randomToken()
  const refresh = randomToken()
  const expiresAt = nowSeconds() + ACCESS_TTL_SECONDS
  await query(
    `insert into auth_sessions
       (user_id, access_token_hash, refresh_token_hash, access_expires_at, refresh_expires_at)
     values ($1, $2, $3, now() + make_interval(secs => $4), now() + make_interval(secs => $5))`,
    [user.id, hashToken(access), hashToken(refresh), ACCESS_TTL_SECONDS, REFRESH_TTL_SECONDS]
  )
  return { access_token: access, refresh_token: refresh, expires_at: expiresAt, user: { id: user.id, email: user.email } }
}

/** Verify a bearer access token; returns the signed-in user and the session id. */
export async function findUserByAccessToken(
  token: string
): Promise<({ sessionId: string } & AuthUserRow) | null> {
  if (!token) return null
  const result = await query(
    `select s.id as session_id, u.id, u.email
       from auth_sessions s
       join app_users u on u.id = s.user_id
      where s.access_token_hash = $1 and s.revoked_at is null and s.access_expires_at > now()`,
    [hashToken(token)]
  )
  const row = result.rows[0] as { session_id: string; id: string; email: string } | undefined
  return row ? { sessionId: row.session_id, id: row.id, email: row.email } : null
}

/**
 * Exchange a refresh token for a fresh pair (rotation): the stored hashes are
 * replaced, so an old refresh token stops working after one use.
 */
export async function rotateSession(refreshToken: string): Promise<SessionPayload | null> {
  if (!refreshToken) return null
  const lookup = await query(
    `select s.id, s.user_id, u.email
       from auth_sessions s
       join app_users u on u.id = s.user_id
      where s.refresh_token_hash = $1 and s.revoked_at is null and s.refresh_expires_at > now()`,
    [hashToken(refreshToken)]
  )
  const row = lookup.rows[0] as { id: string; user_id: string; email: string } | undefined
  if (!row) return null

  const access = randomToken()
  const refresh = randomToken()
  const updated = await query(
    `update auth_sessions
        set access_token_hash = $2, refresh_token_hash = $3,
            access_expires_at = now() + make_interval(secs => $4),
            refresh_expires_at = now() + make_interval(secs => $5)
      where id = $1 and revoked_at is null
      returning user_id`,
    [row.id, hashToken(access), hashToken(refresh), ACCESS_TTL_SECONDS, REFRESH_TTL_SECONDS]
  )
  if (!updated.rowCount) return null
  return {
    access_token: access,
    refresh_token: refresh,
    expires_at: nowSeconds() + ACCESS_TTL_SECONDS,
    user: { id: row.user_id, email: row.email },
  }
}

export async function revokeSessionByAccessToken(token: string): Promise<void> {
  if (!token) return
  await query('update auth_sessions set revoked_at = now() where access_token_hash = $1 and revoked_at is null', [
    hashToken(token),
  ])
}

/** Used after a password change: every session except the caller's own is signed out. */
export async function revokeOtherSessions(userId: string, keepSessionId: string): Promise<void> {
  await query(
    'update auth_sessions set revoked_at = now() where user_id = $1 and id <> $2 and revoked_at is null',
    [userId, keepSessionId]
  )
}
