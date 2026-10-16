#!/usr/bin/env node
/**
 * Local reminder scheduler: ticks /api/cron/reminders once a minute so push
 * reminders fire on time while running the app on this machine. In production
 * the same route is ticked by Supabase pg_cron (see supabase/migrations) or by
 * the daily Vercel Cron fallback, so this script is only needed for local runs.
 *
 * Usage:
 *   npm run scheduler:local                    tick every minute until stopped
 *   node scripts/local-scheduler.mjs --once    single tick, then exit
 *
 * Target URL defaults to http://localhost:3000/api/cron/reminders; override
 * with CRON_TARGET_URL or pass a URL argument. CRON_SECRET is read from the
 * environment or .env and is never printed.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ONCE = process.argv.includes('--once')
const argUrl = process.argv.slice(2).find((a) => a.startsWith('http'))
const TARGET_URL =
  argUrl ?? process.env.CRON_TARGET_URL ?? 'http://localhost:3000/api/cron/reminders'
const INTERVAL_MS = 60_000
const REQUEST_TIMEOUT_MS = 25_000
const TIMEZONE = 'Asia/Karachi'

function readSecret() {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET
  const envPath = path.join(import.meta.dirname, '..', '.env')
  let contents = ''
  try {
    contents = readFileSync(envPath, 'utf8')
  } catch {
    return ''
  }
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*CRON_SECRET\s*=\s*(.*)$/)
    if (!match) continue
    return match[1].trim().replace(/^(['"])(.*)\1$/, '$2')
  }
  return ''
}

function pktTime() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date())
}

async function tick(secret) {
  try {
    const res = await fetch(TARGET_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const text = await res.text()
    if (!res.ok) {
      console.error(
        `[scheduler] ${pktTime()} PKT tick failed: HTTP ${res.status} ${text.slice(0, 200)}`
      )
      return false
    }
    let summary = text
    try {
      const json = JSON.parse(text)
      summary = `processed=${json.processed} sent=${json.sent} failed=${json.failed}`
    } catch {}
    console.log(`[scheduler] ${pktTime()} PKT tick ok: ${summary}`)
    return true
  } catch (err) {
    console.error(
      `[scheduler] ${pktTime()} PKT tick failed: ${err instanceof Error ? err.message : err}`
    )
    return false
  }
}

const secret = readSecret()
if (!secret) {
  console.error('[scheduler] CRON_SECRET not found in the environment or .env — cannot call the cron route.')
  process.exit(1)
}

console.log(
  `[scheduler] target: ${TARGET_URL} (every 60s) — CRON_SECRET loaded (${secret.length} chars)`
)

if (ONCE) {
  const ok = await tick(secret)
  process.exit(ok ? 0 : 1)
}

process.on('SIGINT', () => {
  console.log(`\n[scheduler] ${pktTime()} PKT stopped.`)
  process.exit(0)
})

function schedule() {
  const delay = INTERVAL_MS - (Date.now() % INTERVAL_MS)
  setTimeout(async () => {
    await tick(secret)
    schedule()
  }, delay)
}

schedule()
