import { NextResponse, type NextRequest } from 'next/server'
import { ApiError, authCall, errorResponse, sessionFromTokenResponse } from '@/lib/supabase/api'
import { readJson } from '@/lib/api/schemas'

export async function POST(req: NextRequest) {
  try {
    const body = await readJson(req)
    const refreshToken = typeof body.refresh_token === 'string' ? body.refresh_token : ''
    if (!refreshToken) throw new ApiError(422, 'refresh_token is required.')
    const data = await authCall('POST', 'token', {
      params: { grant_type: 'refresh_token' },
      json: { refresh_token: refreshToken },
    })
    return NextResponse.json(sessionFromTokenResponse(data))
  } catch (err) {
    return errorResponse(err)
  }
}
