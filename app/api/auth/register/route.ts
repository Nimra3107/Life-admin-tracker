import { NextResponse, type NextRequest } from 'next/server'
import { ApiError, errorResponse } from '@/lib/db/api'
import { pgErrorCode } from '@/lib/db/pool'
import { hashPassword } from '@/lib/auth/passwords'
import { insertUser } from '@/lib/auth/users'
import { parseEmailPassword, readJson } from '@/lib/api/schemas'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = parseEmailPassword(await readJson(req))
    let user
    try {
      user = await insertUser(email, await hashPassword(password))
    } catch (err) {
      if (pgErrorCode(err) === '23505') {
        throw new ApiError(422, 'An account with this email already exists. Try signing in instead.')
      }
      throw err
    }
    return NextResponse.json({ id: user.id, email: user.email }, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
