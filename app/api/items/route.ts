import { NextResponse, type NextRequest } from 'next/server'
import { createItem, errorResponse, getRouteUser, listItems } from '@/lib/supabase/api'
import { parseItemInput, readJson } from '@/lib/api/schemas'
import { refreshRemindersForSavedItem } from '@/lib/reminders/schedule'
import type { LifeAdminItem } from '@/lib/types'

export async function GET(req: NextRequest) {
  try {
    const user = await getRouteUser(req)
    const items = await listItems(user.token, user.id)
    return NextResponse.json(items)
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getRouteUser(req)
    const input = parseItemInput(await readJson(req))
    // user_id is always the verified caller, never client-supplied.
    const row = { ...input, user_id: user.id, updated_at: new Date().toISOString() }
    const item = (await createItem(user.token, row)) as LifeAdminItem
    await refreshRemindersForSavedItem(user, item)
    return NextResponse.json(item, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
