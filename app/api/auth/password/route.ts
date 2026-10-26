import { NextResponse, type NextRequest } from 'next/server'
import { ApiError, errorResponse, getRouteUser } from '@/lib/db/api'
import { hashPassword } from '@/lib/auth/passwords'
import { setUserPassword } from '@/lib/auth/users'
import { revokeOtherSessions } from '@/lib/auth/sessions'
import { readJson } from '@/lib/api/schemas'

export async function PUT(req: NextRequest) {
  try {
    const user = await getRouteUser(req)
    const body = await readJson(req)
    const password = typeof body.password === 'string' ? body.password : ''
    if (password.length < 6) throw new ApiError(422, 'Password must be at least 6 characters.')
    await setUserPassword(user.id, await hashPassword(password))
    // The caller's current session keeps working; every other device is signed out.
    await revokeOtherSessions(user.id, user.sessionId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
