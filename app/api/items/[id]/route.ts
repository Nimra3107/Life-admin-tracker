import { NextResponse, type NextRequest } from 'next/server'
import {
  deleteItem,
  errorResponse,
  getItem,
  getRouteUser,
  updateItem,
} from '@/lib/supabase/api'
import { parseItemInput, parsePathId, readJson } from '@/lib/api/schemas'
import { clearRemindersForDeletedItem, refreshRemindersForSavedItem } from '@/lib/reminders/schedule'
import type { LifeAdminItem } from '@/lib/types'

interface Context {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, { params }: Context) {
  try {
    const { id } = await params
    parsePathId(id, 'item id')
    const user = await getRouteUser(req)
    const item = await getItem(user.token, user.id, id)
    return NextResponse.json(item)
  } catch (err) {
    return errorResponse(err)
  }
}

export async function PUT(req: NextRequest, { params }: Context) {
  try {
    const { id } = await params
    parsePathId(id, 'item id')
    const user = await getRouteUser(req)
    const input = parseItemInput(await readJson(req))
    const { timezone, ...columns } = input
    const row = { ...columns, updated_at: new Date().toISOString() }
    const item = (await updateItem(user.token, user.id, id, row)) as LifeAdminItem
    await refreshRemindersForSavedItem(user, item, timezone)
    return NextResponse.json(item)
  } catch (err) {
    return errorResponse(err)
  }
}

export async function DELETE(req: NextRequest, { params }: Context) {
  try {
    const { id } = await params
    parsePathId(id, 'item id')
    const user = await getRouteUser(req)
    // Fast-path cleanup; the reminders FK also cascades on item delete.
    await clearRemindersForDeletedItem(user, id)
    await deleteItem(user.token, user.id, id)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return errorResponse(err)
  }
}
