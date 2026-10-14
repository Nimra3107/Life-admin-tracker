import { NextResponse, type NextRequest } from 'next/server'
import { authCall, errorResponse, sessionFromTokenResponse } from '@/lib/supabase/api'
import { parseEmailPassword, readJson } from '@/lib/api/schemas'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = parseEmailPassword(await readJson(req))
    const data = await authCall('POST', 'token', {
      params: { grant_type: 'password' },
      json: { email, password },
    })
    return NextResponse.json(sessionFromTokenResponse(data))
  } catch (err) {
    return errorResponse(err)
  }
}
