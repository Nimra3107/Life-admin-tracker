import { NextResponse, type NextRequest } from 'next/server'
import { ApiError, authCall, errorResponse } from '@/lib/supabase/api'
import { parseEmailPassword, readJson } from '@/lib/api/schemas'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = parseEmailPassword(await readJson(req))
    const data = (await authCall('POST', 'signup', { json: { email, password } })) as {
      user?: { id?: unknown; email?: string | null }
    } | null
    const user = data?.user ?? {}
    return NextResponse.json(
      { id: String(user.id ?? ''), email: user.email ?? null },
      { status: 201 }
    )
  } catch (err) {
    return errorResponse(err)
  }
}
