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
import { isPushConfigured, missingPushServerEnvVars, sendPush } from '@/lib/reminders/send'
import { formatDate, formatDateTimeInTimeZone, reminderKindLabel } from '@/lib/utils'
import { APP_TIMEZONE } from '@/lib/time'
import type { Reminder } from '@/lib/types'

/**
 * Processes due reminders. Triggered by Supabase Cron (pg_cron + pg_net, every
 * minute — see the setup notes in supabase/migrations) or by the daily Vercel
 * Cron fallback (vercel.json; on the Hobby plan Vercel rejects sub-daily
 * schedules, so pg_cron is the reliable per-minute trigger). Locally,
 * scripts/local-scheduler.mjs (npm run scheduler:local) ticks every minute.
 * Protected by the CRON_SECRET bearer token. Runs with the service role, and
 * each reminder is claimed atomically before delivery so overlapping runs can
 * never send the same notification twice. Reminders that missed their slot by
 * more than a grace window are marked failed instead of sent very late.
 */

export const dynamic = 'force-dynamic'

const STUCK_AFTER_MINUTES = 15
const MAX_PER_RUN = 50
/** Minutely reminders ("15m") processed later than this are marked missed, not sent late. */
const MINUTE_REMINDER_GRACE_MS = 60 * 60_000
/** Day-based reminders ("1d") processed later than this are marked missed, not sent late. */
const DAY_REMINDER_GRACE_MS = 24 * 60 * 60_000

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
    await failStuckReminders(stuckCutoff)

    const due = (await listDueReminders(MAX_PER_RUN)) as Reminder[]

    console.log(`[cron] due reminders: ${due.length}`)
    for (const reminder of due) {
      console.log(
        `[cron] due: id=${reminder.id} scheduled_for=${reminder.scheduled_for} channel=${reminder.channel} status=${reminder.status} kind=${reminder.kind} item=${reminder.item_id}`
      )
    }

    let sent = 0
    let failed = 0
    for (const reminder of due) {
      const claimed = (await claimReminder(reminder.id)) as Reminder | null
      if (!claimed) {
        console.log(`[cron] skipped: reminder ${reminder.id} was already claimed by another run`)
        continue // claimed by another run
      }

      const item = claimed.item
      if (!item || item.status !== 'Pending') {
        await finishReminder(claimed.id, {
          status: 'canceled',
          last_error: 'The task is no longer pending.',
        })
        console.log(`[cron] canceled: reminder ${claimed.id} — task is no longer pending`)
        continue
      }

      // A scheduler outage can leave reminders pending long past their slot;
      // delivering hours-late notifications is worse than marking them missed.
      const graceMs = claimed.kind.endsWith('d') ? DAY_REMINDER_GRACE_MS : MINUTE_REMINDER_GRACE_MS
      const lateByMs = Date.now() - new Date(claimed.scheduled_for).getTime()
      if (lateByMs > graceMs) {
        const lateMinutes = Math.round(lateByMs / 60_000)
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
        console.error(
          `[cron] missed: reminder ${claimed.id} — scheduled ${claimed.scheduled_for}, processed ${lateMinutes} min late; marked failed`
        )
        continue
      }

      const needsPush = claimed.channel !== 'dashboard'
      let status: 'sent' | 'failed' = 'sent'
      let lastError: string | null = null

      if (needsPush) {
        if (!isPushConfigured()) {
          status = 'failed'
          lastError = `Firebase is not configured on the server (missing: ${missingPushServerEnvVars().join(', ')}).`
        } else {
          try {
            const tokens = await listActiveDeviceTokens(claimed.user_id)
            if (!tokens.length) {
              status = 'failed'
              lastError = 'No active device tokens for this user.'
            } else {
              const title = item.title || claimed.title
              // due_date/due_time are Pakistan-time wall-clock values.
              const body = `${reminderKindLabel(claimed.kind)}: due ${formatDate(item.due_date)}${
                item.due_time ? ` at ${item.due_time.slice(0, 5)} (PKT)` : ' (PKT)'
              }`
              const result = await sendPush(tokens, { title, body, itemId: claimed.item_id })
              for (const deadToken of result.disabledTokens) {
                await disableDeviceToken(deadToken)
              }
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
  } catch (err) {
    console.error('[cron] run failed:', err instanceof Error ? err.message : err)
    return errorResponse(err)
  }
}

export const GET = handle
export const POST = handle
