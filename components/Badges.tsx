import { PRIORITY_COLORS, STATUS_COLORS } from '@/lib/utils'
import type { Priority, Status } from '@/lib/types'

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${PRIORITY_COLORS[priority]}`}
    >
      {priority}
    </span>
  )
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLORS[status]}`}
    >
      {status}
    </span>
  )
}
