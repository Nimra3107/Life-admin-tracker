import { type NextRequest } from 'next/server'
import { ApiError } from '@/lib/supabase/api'
import type { ItemInput } from './core'
import type { Priority, Status } from '@/lib/types'

const PRIORITIES: readonly Priority[] = ['Low', 'Medium', 'High', 'Urgent']
const STATUSES: readonly Status[] = ['Pending', 'Completed', 'Renewed']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function bad(message: string): never {
  throw new ApiError(422, message)
}

/** Parse the request body as a JSON object. */
export async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body = await req.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) bad('Invalid request body.')
    return body as Record<string, unknown>
  } catch (err) {
    if (err instanceof ApiError) throw err
    bad('Invalid request body.')
  }
}

export function parsePathId(id: string, label = 'id'): string {
  if (!UUID_RE.test(id)) bad(`Invalid ${label}.`)
  return id
}

/**
 * Body for creating/updating an item. user_id is never accepted from the client:
 * the route sets it from the verified login.
 */
export function parseItemInput(body: Record<string, unknown>): ItemInput {
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) bad('Title must not be empty.')

  let description: string | null = null
  if (typeof body.description === 'string') {
    description = body.description.trim() || null
  } else if (body.description != null) {
    bad('Description must be text.')
  }

  let categoryId: string | null = null
  if (typeof body.category_id === 'string' && body.category_id) {
    if (!UUID_RE.test(body.category_id)) bad('category_id must be a valid id.')
    categoryId = body.category_id
  } else if (body.category_id != null) {
    bad('category_id must be a valid id.')
  }

  let dueDate: string | null = null
  if (typeof body.due_date === 'string' && body.due_date) {
    if (!DATE_RE.test(body.due_date) || Number.isNaN(new Date(`${body.due_date}T00:00:00`).getTime())) {
      bad('due_date must be a valid date (YYYY-MM-DD).')
    }
    dueDate = body.due_date
  } else if (body.due_date != null) {
    bad('due_date must be a valid date (YYYY-MM-DD).')
  }

  let priority: Priority = 'Medium'
  if (body.priority !== undefined) {
    if (!PRIORITIES.includes(body.priority as Priority)) bad('priority is not a valid value.')
    priority = body.priority as Priority
  }

  let status: Status = 'Pending'
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status as Status)) bad('status is not a valid value.')
    status = body.status as Status
  }

  let reminderDays: number[] = []
  if (body.reminder_days !== undefined) {
    if (!Array.isArray(body.reminder_days)) bad('reminder_days must be a list of numbers.')
    reminderDays = body.reminder_days.map((day) => {
      if (typeof day !== 'number' || !Number.isInteger(day) || day < 0 || day > 365) {
        bad('Each reminder day must be a whole number between 0 and 365.')
      }
      return day
    })
  }

  return { title, description, category_id: categoryId, due_date: dueDate, priority, status, reminder_days: reminderDays }
}

export function parseCategoryName(body: Record<string, unknown>): string {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) bad('Name must not be empty.')
  return name
}

export function parseEmailPassword(body: Record<string, unknown>): { email: string; password: string } {
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!email || !password) bad('Email and password are required.')
  return { email, password }
}
