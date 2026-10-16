/**
 * The single time zone used everywhere in this app: Pakistan Standard Time
 * (UTC+05:00, no DST). Due dates/times are entered, stored and displayed as
 * PKT wall-clock values; reminder instants are converted from PKT to UTC here
 * and only stored as UTC (scheduled_for) in Supabase.
 */
export const APP_TIMEZONE = 'Asia/Karachi'

/**
 * Convert a wall-clock date/time ("2026-10-20", "14:30") in an IANA zone to
 * the matching UTC instant. Converges by repeatedly asking Intl what the guess
 * looks like in the target zone and correcting by the difference.
 */
export function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hour, minute] = timeStr.split(':').map(Number)

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  let ts = Date.UTC(year, month - 1, day, hour, minute)
  const target = ts
  for (let i = 0; i < 3; i++) {
    const parts = formatter.formatToParts(new Date(ts))
    const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
    const asUtc = Date.UTC(
      pick('year'),
      pick('month') - 1,
      pick('day'),
      pick('hour') % 24,
      pick('minute'),
      pick('second')
    )
    // `asUtc - ts` is the zone offset at the current guess; re-derive the
    // candidate from the fixed target so the offset is never added twice.
    const candidate = target - (asUtc - ts)
    if (candidate === ts) break
    ts = candidate
  }
  return new Date(ts)
}
