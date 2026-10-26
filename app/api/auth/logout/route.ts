import { NextResponse, type NextRequest } from 'next/server'
import { revokeSessionByAccessToken } from '@/lib/auth/sessions'

function bearerToken(req: NextRequest): string {
  const header = req.headers.get('authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

export async function POST(req: NextRequest) {
  // Revoke the session in auth_sessions. Always succeeds from the client's point
  // of view: it clears its cookies regardless, so failures here are not reported.
  const token = bearerToken(req)
  if (token) {
    try {
      await revokeSessionByAccessToken(token)
    } catch (err) {
      console.error('[auth] logout revocation failed:', err instanceof Error ? err.message : err)
    }
  }
  return new NextResponse(null, { status: 204 })
}
