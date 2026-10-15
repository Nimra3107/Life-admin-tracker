export type Priority = 'Low' | 'Medium' | 'High' | 'Urgent'
export type Status = 'Pending' | 'Completed' | 'Renewed'
export type NotificationPreference = 'dashboard' | 'push' | 'both'
export type ReminderStatus = 'pending' | 'processing' | 'sent' | 'failed' | 'canceled'

export interface Category {
  id: string
  user_id: string
  name: string
  is_default: boolean
  created_at: string
}

export interface LifeAdminItem {
  id: string
  user_id: string
  title: string
  description: string | null
  category_id: string | null
  due_date: string | null
  due_time: string | null
  priority: Priority
  status: Status
  reminder_days: number[]
  reminder_minutes: number[]
  notification_preference: NotificationPreference
  created_at: string
  updated_at: string
  category?: Category
}

/** A scheduled reminder row, with the task it belongs to joined in. */
export interface Reminder {
  id: string
  user_id: string
  item_id: string
  kind: string
  offset_minutes: number
  scheduled_for: string
  channel: NotificationPreference
  title: string
  status: ReminderStatus
  attempts: number
  last_error: string | null
  sent_at: string | null
  created_at: string
  item?: Pick<LifeAdminItem, 'id' | 'title' | 'due_date' | 'due_time' | 'status' | 'priority'>
}
