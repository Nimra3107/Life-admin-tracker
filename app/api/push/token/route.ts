import { NextResponse, type NextRequest } from 'next/server'
import { errorResponse, getRouteUser, upsertDeviceToken } from '@/lib/supabase/api'
import { parseFcmToken, readJson } from '@/lib/api/schemas'

/** Register the browser's FCM token for the signed-in user. */
export async function POST(req: NextRequest) {
  try {
    const user = await getRouteUser(req)
    const token = parseFcmToken(await readJson(req))
    await upsertDeviceToken(user.token, user.id, token)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
