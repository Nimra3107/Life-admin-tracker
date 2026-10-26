import { NextResponse, type NextRequest } from 'next/server'
import {
  createCategory,
  errorResponse,
  getRouteUser,
  listCategories,
} from '@/lib/db/api'
import { parseCategoryName, readJson } from '@/lib/api/schemas'

export async function GET(req: NextRequest) {
  try {
    const user = await getRouteUser(req)
    const categories = await listCategories(user.id)
    return NextResponse.json(categories)
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getRouteUser(req)
    const name = parseCategoryName(await readJson(req))
    const category = await createCategory(user.id, name)
    return NextResponse.json(category, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
