import { NextResponse, type NextRequest } from 'next/server'
import { ApiError, authCall, errorResponse, getRouteUser } from '@/lib/supabase/api'
import { readJson } from '@/lib/api/schemas'

export async function PUT(req: NextRequest) {
  try {
    const user = await getRouteUser(req)
    const body = await readJson(req)
    const password = typeof body.password === 'string' ? body.password : ''
    if (!password) throw new ApiError(422, 'Password is required.')
    await authCall('PUT', 'user', { token: user.token, json: { password } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
