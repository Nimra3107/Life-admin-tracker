import { NextResponse, type NextRequest } from 'next/server'
import {
  errorResponse,
  getRouteUser,
  listRecentReminders,
  listUpcomingReminders,
} from '@/lib/db/api'
import { backfillRemindersIfEmpty } from '@/lib/reminders/schedule'

/** Upcoming scheduled reminders plus recently delivered/failed ones, for the dashboard card. */
export async function GET(req: NextRequest) {
  try {
    const user = await getRouteUser(req)

    // Self-heal: items created before reminder scheduling have no reminder rows
    // yet; create them on first dashboard load. A failure here is logged only —
    // the list queries below still report real problems to the caller.
    try {
      await backfillRemindersIfEmpty(user.id)
    } catch (err) {
      console.error('Failed to backfill reminders', err)
    }

    const [upcoming, recent] = await Promise.all([
      listUpcomingReminders(user.id, 5),
      listRecentReminders(user.id, 3),
    ])
    return NextResponse.json({ upcoming, recent })
  } catch (err) {
    return errorResponse(err)
  }
}
