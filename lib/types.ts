export type Priority = 'Low' | 'Medium' | 'High' | 'Urgent'
export type Status = 'Pending' | 'Completed' | 'Renewed'

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
  priority: Priority
  status: Status
  reminder_days: number[]
  created_at: string
  updated_at: string
  category?: Category
}
