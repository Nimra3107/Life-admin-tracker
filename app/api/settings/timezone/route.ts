import { NextResponse, type NextRequest } from 'next/server'
import { errorResponse, getRouteUser, getUserTimezone, upsertUserTimezone } from '@/lib/supabase/api'
import { parseTimezone, readJson } from '@/lib/api/schemas'
import { rescheduleAllReminders } from '@/lib/reminders/schedule'

export async function GET(req: NextRequest) {
  try {
    const user = await getRouteUser(req)
    const timezone = await getUserTimezone(user.token, user.id)
    return NextResponse.json({ timezone })
  } catch (err) {
    return errorResponse(err)
  }
}

/**
 * Store the caller's IANA time zone. When it actually changes (including the
 * first sync), every pending item's reminders are recomputed so they fire at
 * the user's local time.
 */
export async function PUT(req: NextRequest) {
  try {
    const user = await getRouteUser(req)
    const timezone = parseTimezone(await readJson(req))
    const stored = await getUserTimezone(user.token, user.id)
    const changed = stored !== timezone
    if (changed) {
      await upsertUserTimezone(user.token, user.id, timezone)
    }
    try {
      if (changed) await rescheduleAllReminders(user.token, user.id, timezone)
    } catch (err) {
      // The zone is saved either way; the dashboard card surfaces any reminder
      // problem, and a failed reschedule is retried on the next sync.
      console.error('Failed to reschedule reminders after timezone change', err)
    }
    return NextResponse.json({ timezone, changed })
  } catch (err) {
    return errorResponse(err)
  }
}
