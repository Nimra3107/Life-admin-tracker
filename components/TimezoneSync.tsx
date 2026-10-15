'use client'

import { useEffect } from 'react'
import { createBrowserApi } from '@/lib/api/client'

/**
 * Keeps the stored IANA time zone in step with the browser. Runs once per
 * session; the API only reschedules reminders when the zone actually changed.
 */
export default function TimezoneSync() {
  useEffect(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!timezone) return
    const key = 'la_timezone_synced'
    if (sessionStorage.getItem(key) === timezone) return
    sessionStorage.setItem(key, timezone)
    createBrowserApi()
      .settings.setTimezone(timezone)
      .then(({ error }) => {
        if (error) sessionStorage.removeItem(key)
      })
  }, [])

  return null
}
