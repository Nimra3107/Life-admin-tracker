import { Pool, types } from 'pg'

/**
 * Server-side-only access to the local PostgreSQL database (DATABASE_URL).
 * Never import this from client components: data reaches the UI through the
 * /api routes, which call the functions in lib/db/api.ts.
 *
 * The type parsers below make pg return values in the same JSON shapes the
 * old Supabase REST layer produced, so existing UI code keeps working:
 *  - date        -> 'YYYY-MM-DD' string (not a Date object)
 *  - time        -> 'HH:MM:SS' string
 *  - timestamptz -> full ISO string (the pool session runs with timezone UTC,
 *                   so the parsed instant is exact regardless of server locale)
 */
types.setTypeParser(1082, (value) => value)
types.setTypeParser(1266, (value) => value)
types.setTypeParser(1184, (value) => new Date(value).toISOString())
types.setTypeParser(1114, (value) => new Date(value).toISOString())

export type SqlParam = string | number | boolean | null | Date | number[]

let pool: Pool | null = null

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL?.trim() ?? ''
    if (!connectionString) {
      throw new Error('DATABASE_URL is not configured. Set it in .env.local (see .env.example).')
    }
    pool = new Pool({
      connectionString,
      max: 6,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      options: '-c timezone=UTC',
    })
    // An idle client that errors (e.g. server restart) must not crash the process.
    pool.on('error', (err) => console.error('[db] idle client error:', err.message))
  }
  return pool
}

export async function query(text: string, params: SqlParam[] = []) {
  return getPool().query(text, params)
}

/** The PostgreSQL error code of an error, when it was raised by the database itself. */
export function pgErrorCode(err: unknown): string | null {
  const code = (err as { code?: unknown } | null)?.code
  return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? code : null
}
