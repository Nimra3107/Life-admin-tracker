import { NextResponse, type NextRequest } from 'next/server'
import { ApiError, errorResponse } from '@/lib/db/api'
import { rotateSession } from '@/lib/auth/sessions'
import { readJson } from '@/lib/api/schemas'

export async function POST(req: NextRequest) {
  try {
    const body = await readJson(req)
    const refreshToken = typeof body.refresh_token === 'string' ? body.refresh_token : ''
    if (!refreshToken) throw new ApiError(422, 'refresh_token is required.')
    const session = await rotateSession(refreshToken)
    if (!session) throw new ApiError(401, 'Your session has expired. Please sign in again.')
    return NextResponse.json(session)
  } catch (err) {
    return errorResponse(err)
  }
}
