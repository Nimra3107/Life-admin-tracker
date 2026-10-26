import { NextResponse, type NextRequest } from 'next/server'
import {
  deleteCategory,
  errorResponse,
  getRouteUser,
  renameCategory,
} from '@/lib/db/api'
import { parseCategoryName, parsePathId, readJson } from '@/lib/api/schemas'

interface Context {
  params: Promise<{ id: string }>
}

export async function PATCH(req: NextRequest, { params }: Context) {
  try {
    const { id } = await params
    parsePathId(id, 'category id')
    const user = await getRouteUser(req)
    const name = parseCategoryName(await readJson(req))
    const category = await renameCategory(user.id, id, name)
    return NextResponse.json(category)
  } catch (err) {
    return errorResponse(err)
  }
}

export async function DELETE(req: NextRequest, { params }: Context) {
  try {
    const { id } = await params
    parsePathId(id, 'category id')
    const user = await getRouteUser(req)
    await deleteCategory(user.id, id)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return errorResponse(err)
  }
}
