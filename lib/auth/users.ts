import { query } from '@/lib/db/pool'

export interface AuthUserRow {
  id: string
  email: string
}

/** Emails are stored lowercased so 'Foo@X.com' and 'foo@x.com' are one account. */
export async function findUserByEmail(email: string): Promise<(AuthUserRow & { password_hash: string }) | null> {
  const result = await query(
    'select id, email, password_hash from app_users where email = lower($1)',
    [email.trim()]
  )
  const row = result.rows[0] as (AuthUserRow & { password_hash: string }) | undefined
  return row ?? null
}

/** Inserts a user; on duplicate email pg raises 23505, which the caller maps to 422. */
export async function insertUser(email: string, passwordHash: string): Promise<AuthUserRow> {
  const result = await query(
    'insert into app_users (email, password_hash) values (lower($1), $2) returning id, email',
    [email.trim(), passwordHash]
  )
  return result.rows[0] as AuthUserRow
}

export async function setUserPassword(userId: string, passwordHash: string): Promise<void> {
  await query('update app_users set password_hash = $2, updated_at = now() where id = $1', [userId, passwordHash])
}
