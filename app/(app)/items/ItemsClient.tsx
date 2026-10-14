'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createBrowserApi } from '@/lib/api/client'
import { PriorityBadge, StatusBadge } from '@/components/Badges'
import { formatDate, isOverdue, PRIORITY_ORDER } from '@/lib/utils'
import type { LifeAdminItem, Category, Priority, Status } from '@/lib/types'
import {
  Plus,
  Search,
  Filter,
  Trash2,
  Edit,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
} from 'lucide-react'

type SortKey = 'due_date' | 'priority' | 'created_at'

interface Props {
  initialItems: LifeAdminItem[]
  categories: Category[]
}

export default function ItemsClient({ initialItems, categories }: Props) {
  const router = useRouter()
  const [items, setItems] = useState<LifeAdminItem[]>(initialItems)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState<Status | ''>('')
  const [filterPriority, setFilterPriority] = useState<Priority | ''>('')
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortAsc, setSortAsc] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [, startTransition] = useTransition()
  const [successMsg, setSuccessMsg] = useState('')

  // Filter + sort
  const filtered = items
    .filter((item) => {
      const q = search.toLowerCase()
      if (q && !item.title.toLowerCase().includes(q) && !(item.description ?? '').toLowerCase().includes(q)) return false
      if (filterCategory && item.category_id !== filterCategory) return false
      if (filterStatus && item.status !== filterStatus) return false
      if (filterPriority && item.priority !== filterPriority) return false
      return true
    })
    .sort((a, b) => {
      let cmp = 0
      if (sortKey === 'due_date') {
        cmp = (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
      } else if (sortKey === 'priority') {
        cmp = PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]
      } else {
        cmp = b.created_at.localeCompare(a.created_at)
      }
      return sortAsc ? -cmp : cmp
    })

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(key === 'due_date') }
  }

  async function confirmDelete() {
    if (!deleteId) return
    const { error } = await createBrowserApi().items.remove(deleteId)
    if (error) { setDeleteError(error.message); return }
    setItems((prev) => prev.filter((i) => i.id !== deleteId))
    setDeleteId(null)
    setSuccessMsg('Item deleted successfully.')
    startTransition(() => router.refresh())
    setTimeout(() => setSuccessMsg(''), 3000)
  }

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k ? (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : null

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Items</h1>
          <p className="text-slate-500 text-sm mt-1">{items.length} total item{items.length !== 1 ? 's' : ''}</p>
        </div>
        <Link
          href="/items/new"
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Item
        </Link>
      </div>

      {successMsg && (
        <div className="bg-teal-50 border border-teal-200 text-teal-800 px-4 py-3 rounded-lg text-sm">{successMsg}</div>
      )}

      {/* Search + Filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
          <Filter className="w-4 h-4" />
          Search & Filter
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search title or description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-700"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as Status | '')}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-700"
          >
            <option value="">All Statuses</option>
            <option>Pending</option>
            <option>Completed</option>
            <option>Renewed</option>
          </select>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as Priority | '')}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-700"
          >
            <option value="">All Priorities</option>
            <option>Urgent</option>
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500">Sort:</span>
          {([['due_date', 'Due Date'], ['priority', 'Priority'], ['created_at', 'Newest']] as [SortKey, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => toggleSort(k)}
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                sortKey === k ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-600 border-slate-200 hover:border-teal-400'
              }`}
            >
              {label} <SortIcon k={k} />
            </button>
          ))}
          {(search || filterCategory || filterStatus || filterPriority) && (
            <button
              onClick={() => { setSearch(''); setFilterCategory(''); setFilterStatus(''); setFilterPriority('') }}
              className="px-3 py-1 rounded-full text-xs font-medium border border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-500 transition-colors ml-auto"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-slate-400 text-sm">No items match your filters.</p>
            <Link href="/items/new" className="text-teal-600 text-sm hover:underline mt-1 inline-block">Add a new item</Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 uppercase tracking-wider bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th
                  className="px-4 py-3 font-medium cursor-pointer hover:text-slate-700 select-none"
                  onClick={() => toggleSort('priority')}
                >
                  <span className="flex items-center gap-1">Priority <SortIcon k="priority" /></span>
                </th>
                <th
                  className="px-4 py-3 font-medium cursor-pointer hover:text-slate-700 select-none"
                  onClick={() => toggleSort('due_date')}
                >
                  <span className="flex items-center gap-1">Due Date <SortIcon k="due_date" /></span>
                </th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((item) => {
                const overdue = isOverdue(item.due_date, item.status)
                return (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        {overdue && <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />}
                        <div>
                          <p className="font-medium text-slate-900">{item.title}</p>
                          {item.description && (
                            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[220px]">{item.description}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{item.category?.name ?? '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                    <td className="px-4 py-3"><PriorityBadge priority={item.priority} /></td>
                    <td className={`px-4 py-3 text-xs ${overdue ? 'text-red-500 font-semibold' : 'text-slate-500'}`}>
                      {formatDate(item.due_date)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/items/${item.id}/edit`}
                          className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => { setDeleteId(item.id); setDeleteError('') }}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 py-12 text-center">
            <p className="text-slate-400 text-sm">No items match your filters.</p>
          </div>
        ) : (
          filtered.map((item) => {
            const overdue = isOverdue(item.due_date, item.status)
            return (
              <div key={item.id} className={`bg-white rounded-xl border shadow-sm p-4 ${overdue ? 'border-red-200' : 'border-slate-200'}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-start gap-2 min-w-0">
                    {overdue && <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />}
                    <p className="font-semibold text-slate-900 text-sm leading-tight">{item.title}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Link href={`/items/${item.id}/edit`} className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors">
                      <Edit className="w-4 h-4" />
                    </Link>
                    <button onClick={() => { setDeleteId(item.id); setDeleteError('') }} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {item.description && <p className="text-xs text-slate-400 mb-2 line-clamp-2">{item.description}</p>}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <StatusBadge status={item.status} />
                  <PriorityBadge priority={item.priority} />
                  {item.category?.name && (
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full border border-slate-200">{item.category.name}</span>
                  )}
                  {item.due_date && (
                    <span className={`px-2 py-0.5 rounded-full border ${overdue ? 'bg-red-50 text-red-600 border-red-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                      {formatDate(item.due_date)}
                    </span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Delete confirm modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Delete Item?</h3>
            <p className="text-sm text-slate-500 mb-4">This action cannot be undone. Are you sure you want to delete this item?</p>
            {deleteError && <p className="text-sm text-red-600 mb-3">{deleteError}</p>}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
