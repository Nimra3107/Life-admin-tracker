import { NextResponse, type NextRequest } from 'next/server'
import { errorResponse, getRouteUser } from '@/lib/supabase/api'

export async function GET(req: NextRequest) {
  try {
    const user = await getRouteUser(req)
    return NextResponse.json({ id: user.id, email: user.email })
  } catch (err) {
    return errorResponse(err)
  }
}
