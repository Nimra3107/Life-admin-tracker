/**
 * Next.js server bootstrap hook. In development it starts the local reminder
 * scheduler inside the dev server process, so `npm run dev` alone keeps
 * reminders firing on time — the standalone `npm run scheduler:local` was a
 * second process that had to be restarted by hand after every dev-server
 * restart, and forgetting it left due reminders pending and undelivered.
 * Production never runs this loop: the deployed app must be ticked by an
 * external scheduler calling /api/cron/reminders with the CRON_SECRET bearer
 * token (the old Supabase pg_cron trigger no longer applies to a self-hosted
 * PostgreSQL — see db/migrations/001_init.sql for the local schema).
 */

const TICK_MS = 10_000
const REQUEST_TIMEOUT_MS = 25_000
/** Heartbeat cadence for idle ticks, so liveness is visible without flooding the dev log. */
const HEARTBEAT_EVERY_TICKS = 6

interface TickResult {
  id: string
  kind: string
  scheduled_for: string
  status: string
  late_by_ms?: number
  notification_triggered_at?: string
  push_ms?: number
  error?: string
}

function pktTime(date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

function nextTickAt(nowMs = Date.now()): number {
  const boundary = Math.floor(nowMs / TICK_MS) * TICK_MS
  return boundary >= nowMs ? boundary : boundary + TICK_MS
}

function startDevScheduler(): void {
  const secret = process.env.CRON_SECRET ?? ''
  if (!secret) {
    console.error('[dev-scheduler] CRON_SECRET is not set — /api/cron/reminders would reject every tick.')
    return
  }
  const target = `http://127.0.0.1:${process.env.PORT ?? '3000'}/api/cron/reminders`
  console.log(
    `[dev-scheduler] ticking ${target} every 10s (dev only — production is ticked by pg_cron/Vercel Cron)`
  )

  let serverSeen = false
  let tickCount = 0

  async function tick(): Promise<void> {
    try {
      const res = await fetch(target, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      const text = await res.text()
      if (!res.ok) {
        console.error(`[dev-scheduler] ${pktTime()} PKT tick failed: HTTP ${res.status} ${text.slice(0, 200)}`)
        return
      }
      serverSeen = true
      tickCount += 1
      let results: TickResult[] = []
      let summary = ''
      try {
        const json = JSON.parse(text) as {
          processed: number
          sent: number
          failed: number
          skipped?: number
          canceled?: number
          results?: TickResult[]
        }
        summary = `processed=${json.processed} sent=${json.sent} failed=${json.failed} skipped=${json.skipped ?? 0} canceled=${json.canceled ?? 0}`
        results = json.results ?? []
      } catch {
        summary = 'ok (unparsed response)'
      }
      if (results.length || tickCount % HEARTBEAT_EVERY_TICKS === 1) {
        console.log(`[dev-scheduler] ${pktTime()} PKT tick ok: ${summary}`)
      }
      for (const r of results) {
        const error = r.error ? ` error=${String(r.error).replace(/\s+/g, ' ').slice(0, 120)}` : ''
        console.log(
          `[dev-scheduler]   reminder ${r.id.slice(0, 8)} ${r.kind} status=${r.status} scheduled_for=${r.scheduled_for}` +
            `${r.notification_triggered_at ? ` notification_triggered_at=${r.notification_triggered_at}` : ''}` +
            `${typeof r.late_by_ms === 'number' ? ` late_by_ms=${r.late_by_ms}` : ''}` +
            `${typeof r.push_ms === 'number' ? ` push_ms=${r.push_ms}` : ''}${error}`
        )
      }
    } catch (err) {
      // During boot the listener may not be bound yet; that is expected, not an error.
      const message = err instanceof Error ? err.message : String(err)
      if (!serverSeen) console.log(`[dev-scheduler] waiting for the dev server: ${message}`)
      else console.error(`[dev-scheduler] ${pktTime()} PKT tick failed: ${message}`)
    }
  }

  function schedule(): void {
    const now = Date.now()
    const target = nextTickAt(now)
    setTimeout(async () => {
      await tick()
      schedule()
    }, target - now)
  }

  // Catch up anything already due, then align to the 10-second boundary.
  void tick()
  schedule()
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NODE_ENV !== 'development') return
  const g = globalThis as { __lifeAdminDevSchedulerStarted?: boolean }
  if (g.__lifeAdminDevSchedulerStarted) return
  g.__lifeAdminDevSchedulerStarted = true
  startDevScheduler()
}
