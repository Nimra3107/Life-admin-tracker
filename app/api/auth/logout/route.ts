import { NextResponse, type NextRequest } from 'next/server'
import { authCall } from '@/lib/supabase/api'

function bearerToken(req: NextRequest): string {
  const header = req.headers.get('authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

export async function POST(req: NextRequest) {
  // Revoke the session at Supabase. Always succeeds from the client's point of
  // view: it clears its cookies regardless, so failures here are not reported.
  const token = bearerToken(req)
  if (token) {
    try {
      await authCall('POST', 'logout', { token })
    } catch {
      // Expired/invalid token or Supabase unreachable: nothing left to revoke.
    }
  }
  return new NextResponse(null, { status: 204 })
}
