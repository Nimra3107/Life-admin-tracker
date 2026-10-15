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
import { isPushConfigured, sendPush } from '@/lib/reminders/send'
import { formatDate, reminderKindLabel } from '@/lib/utils'
import type { Reminder } from '@/lib/types'

/**
 * Processes due reminders. Triggered by Vercel Cron (vercel.json) or Supabase
 * Cron (pg_cron + pg_net); protected by the CRON_SECRET bearer token. Runs with
 * the service role, and each reminder is claimed atomically before delivery so
 * overlapping runs can never send the same notification twice.
 */

export const dynamic = 'force-dynamic'

const STUCK_AFTER_MINUTES = 15
const MAX_PER_RUN = 50

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

    let sent = 0
    let failed = 0
    for (const reminder of due) {
      const claimed = (await claimReminder(reminder.id)) as Reminder | null
      if (!claimed) continue // claimed by another run

      const item = claimed.item
      if (!item || item.status !== 'Pending') {
        await finishReminder(claimed.id, {
          status: 'canceled',
          last_error: 'The task is no longer pending.',
        })
        continue
      }

      const needsPush = claimed.channel !== 'dashboard'
      let status: 'sent' | 'failed' = 'sent'
      let lastError: string | null = null

      if (needsPush) {
        if (!isPushConfigured()) {
          status = 'failed'
          lastError = 'Firebase is not configured on the server.'
        } else {
          try {
            const tokens = await listActiveDeviceTokens(claimed.user_id)
            if (!tokens.length) {
              status = 'failed'
              lastError = 'No active device tokens for this user.'
            } else {
              const title = item.title || claimed.title
              const body = `${reminderKindLabel(claimed.kind)}: due ${formatDate(item.due_date)}${
                item.due_time ? ` at ${item.due_time.slice(0, 5)}` : ''
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
      if (status === 'sent') sent += 1
      else failed += 1
    }

    return NextResponse.json({ processed: due.length, sent, failed })
  } catch (err) {
    return errorResponse(err)
  }
}

export const GET = handle
export const POST = handle
