import { NextResponse, type NextRequest } from 'next/server'
import {
  errorResponse,
  getRouteUser,
  getUserTimezone,
  listRecentReminders,
  listUpcomingReminders,
} from '@/lib/supabase/api'
import { backfillRemindersIfEmpty } from '@/lib/reminders/schedule'

/** Upcoming scheduled reminders plus recently delivered/failed ones, for the dashboard card. */
export async function GET(req: NextRequest) {
  try {
    const user = await getRouteUser(req)

    // Self-heal: items created before reminder scheduling (or before the tables
    // were migrated) have no reminder rows yet; create them on first dashboard load.
    // A failure here is logged only — the list queries below still report real
    // problems (e.g. a missing table) to the caller.
    try {
      const timezone = (await getUserTimezone(user.token, user.id)) ?? 'UTC'
      await backfillRemindersIfEmpty(user.token, user.id, timezone)
    } catch (err) {
      console.error('Failed to backfill reminders', err)
    }

    const [upcoming, recent] = await Promise.all([
      listUpcomingReminders(user.token, user.id, 5),
      listRecentReminders(user.token, user.id, 3),
    ])
    return NextResponse.json({ upcoming, recent })
  } catch (err) {
    return errorResponse(err)
  }
}
