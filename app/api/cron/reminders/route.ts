import { NextResponse, type NextRequest } from 'next/server'
import {
  ApiError,
  claimReminder,
  disableDeviceToken,
  errorResponse,
  failStuckReminders,
  finishReminder,
  hasServiceRoleKey,
  listActiveDeviceTokens,
  listDueReminders,
} from '@/lib/supabase/api'
<<<<<<< Updated upstream
import { isPushConfigured, missingPushServerEnvVars, sendPush } from '@/lib/reminders/send'
=======
import { isPushConfigured, sendPush } from '@/lib/reminders/send'
import { nativeNotificationsSupported, showWindowsToast } from '@/lib/notifications/native'
>>>>>>> Stashed changes
import { formatDate, formatDateTimeInTimeZone, reminderKindLabel } from '@/lib/utils'
import { APP_TIMEZONE } from '@/lib/time'
import type { Reminder } from '@/lib/types'

/**
<<<<<<< Updated upstream
 * Processes due reminders. Triggered by Supabase Cron (pg_cron + pg_net, every
 * minute — see the setup notes in supabase/migrations) or by the daily Vercel
 * Cron fallback (vercel.json; on the Hobby plan Vercel rejects sub-daily
 * schedules, so pg_cron is the reliable per-minute trigger). Locally,
 * scripts/local-scheduler.mjs (npm run scheduler:local) ticks every minute.
 * Protected by the CRON_SECRET bearer token. Runs with the service role, and
 * each reminder is claimed atomically before delivery so overlapping runs can
 * never send the same notification twice. Reminders that missed their slot by
 * more than a grace window are marked failed instead of sent very late.
=======
 * Processes due reminders. Triggered by Supabase Cron (pg_cron + pg_net) or
 * Vercel Cron (vercel.json), both every minute; locally by
 * scripts/local-scheduler.mjs (npm run scheduler:local), which ticks every
 * 10 seconds just after each 10-second boundary. These triggers, not this
 * route, bound how close to the scheduled second delivery can start; FCM/browser delivery is best-effort
 * after the push is accepted. Protected by the CRON_SECRET bearer token. Runs
 * with the service role, and each reminder is claimed atomically before
 * delivery so overlapping runs can never send the same notification twice.
 * Reminders that missed their slot by more than a grace window are marked
 * failed instead of sent very late.
>>>>>>> Stashed changes
 */

export const dynamic = 'force-dynamic'

const STUCK_AFTER_MINUTES = 15
const MAX_PER_RUN = 50
/** Minutely reminders ("15m") processed later than this are marked missed, not sent late. */
const MINUTE_REMINDER_GRACE_MS = 60 * 60_000
/** Day-based reminders ("1d") processed later than this are marked missed, not sent late. */
const DAY_REMINDER_GRACE_MS = 24 * 60 * 60_000

/** Compact per-reminder timing record, mirrored into the local scheduler log. */
interface RunResult {
  id: string
  kind: string
  scheduled_for: string
  status: 'sent' | 'failed' | 'canceled' | 'skipped'
  late_by_ms?: number
  notification_triggered_at?: string
  push_ms?: number
  delivery?: 'fcm' | 'native'
  error?: string
}

function assertAuthorized(req: NextRequest): void {
  const secret = process.env.CRON_SECRET ?? ''
  if (!secret) throw new ApiError(500, 'CRON_SECRET is not configured on the server.')
  const header = req.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token || token !== secret) throw new ApiError(401, 'Unauthorized.')
}

async function handle(req: NextRequest) {
  try {
    assertAuthorized(req)
    if (!hasServiceRoleKey()) {
      throw new ApiError(500, 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server.')
    }

    // A previous run that crashed mid-delivery leaves rows in processing; fail
    // them so they are never sent twice.
    const stuckCutoff = new Date(Date.now() - STUCK_AFTER_MINUTES * 60_000).toISOString()

<<<<<<< Updated upstream
    const due = (await listDueReminders(MAX_PER_RUN)) as Reminder[]

    console.log(`[cron] due reminders: ${due.length}`)
    for (const reminder of due) {
      console.log(
        `[cron] due: id=${reminder.id} scheduled_for=${reminder.scheduled_for} channel=${reminder.channel} status=${reminder.status} kind=${reminder.kind} item=${reminder.item_id}`
      )
    }
=======
    // Only the local Windows scheduler asks for native delivery when it cannot
    // find a browser process. External triggers (production pg_cron/Vercel)
    // never send these headers, so they keep using FCM.
    const localNativeMode =
      req.headers.get('x-local-scheduler') === '1' &&
      req.headers.get('x-browser-running') === '0' &&
      nativeNotificationsSupported()

    const queryAt = new Date()
    // The sweep only touches rows already in processing and the due query only
    // reads pending rows, so neither depends on the other. Running them together
    // keeps the sweep's round trip out of the notification dispatch path.
    const [, dueRows] = await Promise.all([
      failStuckReminders(stuckCutoff),
      listDueReminders(MAX_PER_RUN, queryAt),
    ])
    const due = dueRows as Reminder[]
    const startIso = new Date(runStart).toISOString()
    console.log(
      `[cron] run start ${startIso} (${formatDateTimeInTimeZone(startIso, APP_TIMEZONE)} ${APP_TIMEZONE}) query_at=${queryAt.toISOString()} due=${due.length}`
    )
>>>>>>> Stashed changes

    let sent = 0
    let failed = 0
    let skipped = 0
    let canceled = 0
    const results: RunResult[] = []
    for (const reminder of due) {
      const willPush = reminder.channel !== 'dashboard' && !localNativeMode && isPushConfigured()
      // The token lookup is read-only and does not depend on the claim result,
      // so run it alongside the claim instead of after it.
      const [claimedRow, prefetchedTokens] = await Promise.all([
        claimReminder(reminder.id),
        willPush
          ? listActiveDeviceTokens(reminder.user_id).catch((err) => {
              console.error(
                `[cron] token prefetch failed, will retry at dispatch: ${
                  err instanceof Error ? err.message : String(err)
                }`
              )
              return null
            })
          : Promise.resolve(null),
      ])
      const claimed = claimedRow as Reminder | null
      if (!claimed) {
<<<<<<< Updated upstream
        console.log(`[cron] skipped: reminder ${reminder.id} was already claimed by another run`)
        continue // claimed by another run
=======
        skipped += 1
        results.push({
          id: reminder.id,
          kind: reminder.kind,
          scheduled_for: reminder.scheduled_for,
          status: 'skipped',
          error: 'claim lost',
        })
        console.log(
          `[cron] ${reminder.id.slice(0, 8)} ${reminder.kind} skip: pending->processing claim lost (another run delivered it) scheduled_for=${reminder.scheduled_for}`
        )
        continue
>>>>>>> Stashed changes
      }

      const item = claimed.item
      if (!item || item.status !== 'Pending') {
        await finishReminder(claimed.id, {
          status: 'canceled',
          last_error: 'The task is no longer pending.',
        })
<<<<<<< Updated upstream
        console.log(`[cron] canceled: reminder ${claimed.id} — task is no longer pending`)
        continue
      }

=======
        canceled += 1
        results.push({
          id: claimed.id,
          kind: claimed.kind,
          scheduled_for: claimed.scheduled_for,
          status: 'canceled',
          error: 'item not pending',
        })
        continue
      }

      const processedAtMs = Date.now()
      const processedAtIso = new Date(processedAtMs).toISOString()
      const lateByMs = processedAtMs - new Date(claimed.scheduled_for).getTime()
      const lateBySeconds = lateByMs / 1000
      console.log(
        `[cron] ${shortId} ${claimed.kind} "${item.title}" scheduled_for=${claimed.scheduled_for} (${formatDateTimeInTimeZone(claimed.scheduled_for, APP_TIMEZONE)} ${APP_TIMEZONE}) processed_at=${processedAtIso} (${formatDateTimeInTimeZone(processedAtIso, APP_TIMEZONE)} ${APP_TIMEZONE}) late_by_ms=${lateByMs} late_by_s=${lateBySeconds.toFixed(3)} channel=${claimed.channel}`
      )

>>>>>>> Stashed changes
      // A scheduler outage can leave reminders pending long past their slot;
      // delivering hours-late notifications is worse than marking them missed.
      const graceMs = claimed.kind.endsWith('d') ? DAY_REMINDER_GRACE_MS : MINUTE_REMINDER_GRACE_MS
      const lateByMs = Date.now() - new Date(claimed.scheduled_for).getTime()
      if (lateByMs > graceMs) {
        const lateMinutes = (lateByMs / 60_000).toFixed(1)
        const graceLabel = graceMs === DAY_REMINDER_GRACE_MS ? '24 hours' : '60 minutes'
        const lastError = `Missed: scheduled for ${formatDateTimeInTimeZone(
          claimed.scheduled_for,
          APP_TIMEZONE
        )} (PKT) but processed ${lateMinutes} min late, beyond the ${graceLabel} grace window.`
        await finishReminder(claimed.id, {
          status: 'failed',
          attempts: claimed.attempts + 1,
          last_error: lastError,
        })
        failed += 1
<<<<<<< Updated upstream
        console.error(
          `[cron] missed: reminder ${claimed.id} — scheduled ${claimed.scheduled_for}, processed ${lateMinutes} min late; marked failed`
        )
=======
        results.push({
          id: claimed.id,
          kind: claimed.kind,
          scheduled_for: claimed.scheduled_for,
          status: 'failed',
          late_by_ms: lateByMs,
          error: 'missed grace window',
        })
>>>>>>> Stashed changes
        continue
      }

      const needsPush = claimed.channel !== 'dashboard'
      let status: 'sent' | 'failed' = 'sent'
      let lastError: string | null = null
      let notificationTriggeredAt: string | undefined
      let pushMs: number | undefined
      let delivery: 'fcm' | 'native' | undefined

      if (needsPush) {
        const title = item.title || claimed.title
        const body = `${reminderKindLabel(claimed.kind)}: due ${formatDate(item.due_date)}${
          item.due_time ? ` at ${item.due_time.slice(0, 5)}` : ''
        }`

        if (localNativeMode) {
          // No browser process: web push would be held until Chrome reopens, so
          // deliver exactly once through the Windows toast fallback instead.
          const startedMs = Date.now()
          notificationTriggeredAt = new Date(startedMs).toISOString()
          try {
            await showWindowsToast(title, body)
            pushMs = Date.now() - startedMs
            delivery = 'native'
            console.log(
              `[cron] ${shortId} native toast notification_triggered_at=${notificationTriggeredAt} dispatch_ms=${pushMs} browser_running=0 (FCM skipped)`
            )
          } catch (err) {
            status = 'failed'
            lastError = err instanceof Error ? err.message : 'Native notification failed.'
            console.error(`[cron] ${shortId} native toast failed: ${lastError}`)
          }
        } else if (!isPushConfigured()) {
          status = 'failed'
          lastError = `Firebase is not configured on the server (missing: ${missingPushServerEnvVars().join(', ')}).`
        } else {
          try {
            const tokens = prefetchedTokens ?? (await listActiveDeviceTokens(claimed.user_id))
            if (!tokens.length) {
              status = 'failed'
              lastError = 'No active device tokens for this user.'
            } else {
<<<<<<< Updated upstream
              const title = item.title || claimed.title
              // due_date/due_time are Pakistan-time wall-clock values.
              const body = `${reminderKindLabel(claimed.kind)}: due ${formatDate(item.due_date)}${
                item.due_time ? ` at ${item.due_time.slice(0, 5)} (PKT)` : ' (PKT)'
              }`
              const result = await sendPush(tokens, { title, body, itemId: claimed.item_id })
              for (const deadToken of result.disabledTokens) {
                await disableDeviceToken(deadToken)
              }
=======
              const pushStartedMs = Date.now()
              notificationTriggeredAt = new Date(pushStartedMs).toISOString()
              delivery = 'fcm'
              console.log(
                `[cron] ${shortId} push start notification_triggered_at=${notificationTriggeredAt} tokens=${tokens.length} tag=reminder-${claimed.id} queue_latency_ms=${pushStartedMs - new Date(claimed.scheduled_for).getTime()} urgency=high ttl=3600`
              )
              const result = await sendPush(tokens, {
                title,
                body,
                itemId: claimed.item_id,
                reminderId: claimed.id,
                kind: claimed.kind,
              })
              pushMs = Date.now() - pushStartedMs
              const pushAcceptedAt = new Date().toISOString()
              for (const deadToken of result.disabledTokens) {
                await disableDeviceToken(deadToken)
              }
              console.log(
                `[cron] ${shortId} push result: push_accepted_at=${pushAcceptedAt} delivered=${result.delivered}/${result.attempted} duplicate_tokens_skipped=${result.duplicateTokens} dead_tokens=${result.disabledTokens.length} push_ms=${pushMs}${result.errors.length ? ` errors=${result.errors.join(' | ')}` : ''}`
              )
>>>>>>> Stashed changes
              if (result.delivered === 0) {
                status = 'failed'
                lastError = result.errors.join('; ').slice(0, 500) || 'Push delivery failed.'
              }
            }
          } catch (err) {
            status = 'failed'
            lastError = err instanceof Error ? err.message : 'Push delivery failed.'
          }
        }
      }

<<<<<<< Updated upstream
      await finishReminder(claimed.id, {
        status,
        attempts: claimed.attempts + 1,
        last_error: lastError,
        ...(status === 'sent' ? { sent_at: new Date().toISOString() } : {}),
      })
      if (status === 'sent') {
        sent += 1
        console.log(`[cron] sent: reminder ${claimed.id} (channel=${claimed.channel})`)
      } else {
        failed += 1
        console.error(`[cron] failed: reminder ${claimed.id} (channel=${claimed.channel}) — ${lastError}`)
      }
    }

    console.log(`[cron] run complete: due=${due.length} sent=${sent} failed=${failed}`)
    return NextResponse.json({ processed: due.length, sent, failed })
=======
      const finishedAtIso = new Date().toISOString()
      const totalLatencyMs = Date.now() - new Date(claimed.scheduled_for).getTime()
      try {
        await finishReminder(claimed.id, {
          status,
          attempts: claimed.attempts + 1,
          last_error: lastError,
          ...(status === 'sent' ? { sent_at: finishedAtIso } : {}),
        })
      } catch (err) {
        // The push may have been accepted, but without the status transition the
        // reminder stays processing and is failed by the stuck sweep. It is never
        // retried, so a failed bookkeeping write cannot duplicate the notification.
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[cron] ${shortId} finish failed: ${message}`)
        failed += 1
        results.push({
          id: claimed.id,
          kind: claimed.kind,
          scheduled_for: claimed.scheduled_for,
          status: 'failed',
          late_by_ms: lateByMs,
          notification_triggered_at: notificationTriggeredAt,
          push_ms: pushMs,
          delivery,
          error: 'finish write failed',
        })
        continue
      }
      console.log(
        `[cron] ${shortId} -> ${status} finished_at=${finishedAtIso} total_latency_ms=${totalLatencyMs}${lastError ? ` (err: ${lastError.slice(0, 160)})` : ''}`
      )
      results.push({
        id: claimed.id,
        kind: claimed.kind,
        scheduled_for: claimed.scheduled_for,
        status,
        late_by_ms: lateByMs,
        notification_triggered_at: notificationTriggeredAt,
        push_ms: pushMs,
        delivery,
        ...(lastError ? { error: lastError.slice(0, 160) } : {}),
      })
      if (status === 'sent') sent += 1
      else failed += 1
    }

    const durationMs = Date.now() - runStart
    console.log(
      `[cron] run end processed=${due.length} sent=${sent} failed=${failed} skipped=${skipped} canceled=${canceled} duration=${durationMs}ms`
    )
    return NextResponse.json({
      processed: due.length,
      sent,
      failed,
      skipped,
      canceled,
      results,
    })
>>>>>>> Stashed changes
  } catch (err) {
    console.error('[cron] run failed:', err instanceof Error ? err.message : err)
    return errorResponse(err)
  }
}

export const GET = handle
export const POST = handle
