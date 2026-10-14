'use client'

import { useState, useTransition } from 'react'
import { createBrowserApi } from '@/lib/api/client'
import { useRouter } from 'next/navigation'
import type { Category } from '@/lib/types'
import { Plus, Pencil, Trash2, Check, X, Tag } from 'lucide-react'

interface Props {
  initialCategories: Category[]
}

export default function CategoriesClient({ initialCategories }: Props) {
  const router = useRouter()
  const [categories, setCategories] = useState<Category[]>(initialCategories)
  const [newName, setNewName] = useState('')
  const [addError, setAddError] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editError, setEditError] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [, startTransition] = useTransition()

  function flash(msg: string) {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(''), 3000)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAddError('')
    const name = newName.trim()
    if (!name) { setAddError('Name is required.'); return }
    const dup = categories.some((c) => c.name.toLowerCase() === name.toLowerCase())
    if (dup) { setAddError('A category with this name already exists.'); return }

    setAddLoading(true)
    const { data, error } = await createBrowserApi().categories.create(name)
    setAddLoading(false)
    if (error) { setAddError(error.message); return }
    setCategories((prev) => [...prev, data as Category].sort((a, b) => a.name.localeCompare(b.name)))
    setNewName('')
    flash('Category added.')
    startTransition(() => router.refresh())
  }

  async function handleEdit(id: string) {
    setEditError('')
    const name = editName.trim()
    if (!name) { setEditError('Name is required.'); return }
    const dup = categories.some((c) => c.name.toLowerCase() === name.toLowerCase() && c.id !== id)
    if (dup) { setEditError('A category with this name already exists.'); return }

    const { error } = await createBrowserApi().categories.rename(id, name)
    if (error) { setEditError(error.message); return }
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name } : c)).sort((a, b) => a.name.localeCompare(b.name))
    )
    setEditId(null)
    flash('Category renamed.')
    startTransition(() => router.refresh())
  }

  async function confirmDelete() {
    if (!deleteId) return
    // The backend detaches items from this category, then deletes the category
    const { error } = await createBrowserApi().categories.remove(deleteId)
    if (error) { setDeleteError(error.message); return }
    setCategories((prev) => prev.filter((c) => c.id !== deleteId))
    setDeleteId(null)
    flash('Category deleted.')
    startTransition(() => router.refresh())
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Categories</h1>
        <p className="text-slate-500 text-sm mt-1">Organise your items with custom categories.</p>
      </div>

      {successMsg && (
        <div className="bg-teal-50 border border-teal-200 text-teal-800 px-4 py-3 rounded-lg text-sm">{successMsg}</div>
      )}

      {/* Add new category */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Add New Category</h2>
        <form onSubmit={handleAdd} className="flex gap-2">
          <div className="flex-1">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Medical, Travel…"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
            {addError && <p className="text-xs text-red-500 mt-1">{addError}</p>}
          </div>
          <button
            type="submit"
            disabled={addLoading}
            className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            {addLoading ? 'Adding…' : 'Add'}
          </button>
        </form>
      </div>

      {/* Category list */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
        <div className="px-4 py-3 flex items-center gap-2">
          <Tag className="w-4 h-4 text-teal-600" />
          <span className="text-sm font-semibold text-slate-700">{categories.length} Categories</span>
        </div>
        {categories.length === 0 ? (
          <div className="px-4 py-10 text-center text-slate-400 text-sm">No categories yet.</div>
        ) : (
          categories.map((cat) => (
            <div key={cat.id} className="flex items-center gap-3 px-4 py-3">
              {editId === cat.id ? (
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') handleEdit(cat.id); if (e.key === 'Escape') setEditId(null) }}
                  />
                  <button onClick={() => handleEdit(cat.id)} className="p-1.5 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => setEditId(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                  {editError && <p className="text-xs text-red-500">{editError}</p>}
                </div>
              ) : (
                <>
                  <span className="flex-1 text-sm text-slate-800 font-medium">{cat.name}</span>
                  {cat.is_default && (
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Default</span>
                  )}
                  <div className="flex gap-1">
                    <button
                      onClick={() => { setEditId(cat.id); setEditName(cat.name); setEditError('') }}
                      className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => { setDeleteId(cat.id); setDeleteError('') }}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {/* Delete confirm modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Delete Category?</h3>
            <p className="text-sm text-slate-500 mb-4">
              Any items using this category will have their category cleared. This cannot be undone.
            </p>
            {deleteError && <p className="text-sm text-red-600 mb-3">{deleteError}</p>}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={confirmDelete} className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
