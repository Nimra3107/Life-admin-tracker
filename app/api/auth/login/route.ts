import { NextResponse, type NextRequest } from 'next/server'
import { ApiError, errorResponse } from '@/lib/db/api'
import { verifyPassword } from '@/lib/auth/passwords'
import { findUserByEmail } from '@/lib/auth/users'
import { createSession } from '@/lib/auth/sessions'
import { parseEmailPassword, readJson } from '@/lib/api/schemas'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = parseEmailPassword(await readJson(req))
    const user = await findUserByEmail(email)
    // Same message for unknown email and wrong password: don't reveal which accounts exist.
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      throw new ApiError(401, 'Invalid login credentials.')
    }
    return NextResponse.json(await createSession(user))
  } catch (err) {
    return errorResponse(err)
  }
}
