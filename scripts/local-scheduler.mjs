#!/usr/bin/env node
/**
 * Local reminder scheduler: ticks /api/cron/reminders every 10 seconds so push
 * reminders fire close to their scheduled instant. Optional since the dev
 * server now ticks the same route itself (instrumentation.ts) — run this only
 * to target a different URL (CRON_TARGET_URL) or to watch the tick log in a
 * separate terminal. Ticks land on each 10-second boundary, the instant every
 * reminder scheduled at that boundary becomes due; reminder times are computed
 * from the same clock, so there is no server-time race to wait out. Waiting an
 * extra couple of seconds would only add that delay to every notification. In
 * production the same route is ticked by Supabase pg_cron (see
 * supabase/enable-production-cron.sql) or Vercel Cron, so this script is only
 * needed for local runs.
 *
 * Usage:
 *   npm run scheduler:local                    tick every 10 seconds until stopped
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
const INTERVAL_MS = 10_000
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

function pktTime(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false,
  }).format(date)
}

async function tick(secret) {
  try {
    const res = await fetch(TARGET_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
      },
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
    let results = []
    try {
      const json = JSON.parse(text)
      summary = `processed=${json.processed} sent=${json.sent} failed=${json.failed} skipped=${json.skipped ?? 0} canceled=${json.canceled ?? 0}`
      results = Array.isArray(json.results) ? json.results : []
    } catch {}
    console.log(`[scheduler] ${pktTime()} PKT tick ok: ${summary}`)
    // Mirror per-reminder timing here so scheduled time, trigger time and
    // lateness are visible even when the dev-server console is not being watched.
    for (const r of results) {
      const error = r.error ? ` error=${String(r.error).replace(/\s+/g, ' ').slice(0, 120)}` : ''
      console.log(
        `[scheduler]   reminder ${String(r.id).slice(0, 8)} ${r.kind} status=${r.status} scheduled_for=${r.scheduled_for}` +
          `${r.notification_triggered_at ? ` notification_triggered_at=${r.notification_triggered_at}` : ''}` +
          `${typeof r.late_by_ms === 'number' ? ` late_by_ms=${r.late_by_ms}` : ''}` +
          `${typeof r.push_ms === 'number' ? ` push_ms=${r.push_ms}` : ''}` +
          `${r.delivery ? ` delivery=${r.delivery}` : ''}${error}`
      )
    }
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
  `[scheduler] target: ${TARGET_URL} (every 10s) — CRON_SECRET loaded (${secret.length} chars)`
)

if (ONCE) {
  const ok = await tick(secret)
  process.exit(ok ? 0 : 1)
}

process.on('SIGINT', () => {
  console.log(`\n[scheduler] ${pktTime()} PKT stopped.`)
  process.exit(0)
})

function nextTickAt(nowMs = Date.now()) {
  const boundary = Math.floor(nowMs / INTERVAL_MS) * INTERVAL_MS
  return boundary >= nowMs ? boundary : boundary + INTERVAL_MS
}

function schedule() {
  const now = Date.now()
  const target = nextTickAt(now)
  const delay = target - now
  setTimeout(async () => {
    const startedAt = Date.now()
    const driftMs = startedAt - target
    await tick(secret)
    const elapsedMs = Date.now() - startedAt
    console.log(
      `[scheduler] tick complete target=${new Date(target).toISOString()} actual=${new Date(startedAt).toISOString()} drift=${driftMs}ms request=${elapsedMs}ms${driftMs > 5_000 ? ' (late tick — host may have been asleep/busy)' : ''}`
    )
    schedule()
  }, delay)
}

console.log(`[scheduler] next tick at ${pktTime(new Date(nextTickAt()))} PKT (10s boundary)`)
// Catch anything that came due while this process was not running, then align
// to the 10-second boundary. Overlap with an external trigger is safe: the cron
// route claims each reminder atomically.
await tick(secret)
schedule()
