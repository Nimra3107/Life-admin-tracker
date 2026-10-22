'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { createBrowserApi } from '@/lib/api/client'
import {
  buildItemsCsv,
  buildItemsPdf,
  downloadFile,
  exportFilename,
  itemsForExport,
  validateExportRange,
} from '@/lib/export'
import type { ItemFilters } from '@/lib/utils'
import type { LifeAdminItem } from '@/lib/types'

interface Props {
  filters: ItemFilters
}

/**
 * Export Data button for the items page. The dropdown picks an inclusive due-date
 * range and a format; the export re-fetches the signed-in user's full item list
 * (not just what is on screen), applies the current search/filters plus the date
 * range, and downloads a CSV or PDF built entirely in the browser.
 */
export default function ExportMenu({ filters }: Props) {
  const [open, setOpen] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Close on outside click and on Escape, like the rest of the app's overlays.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const filtersActive = Boolean(filters.search || filters.categoryId || filters.status || filters.priority)

  async function runExport(format: 'csv' | 'pdf') {
    const validation = validateExportRange(startDate, endDate)
    if (validation) {
      setError(validation)
      setNotice('')
      return
    }

    setError('')
    setNotice('')
    setBusy(true)
    try {
      // Re-fetch so the export covers the user's actual dataset, not a stale page.
      const { data: items, error: fetchError } = await createBrowserApi().items.list()
      if (fetchError || !items) {
        setError(fetchError?.message ?? 'Could not load your items. Please try again.')
        return
      }

      const range = { start: startDate, end: endDate }
      const selected = itemsForExport(items as LifeAdminItem[], { range, filters })
      if (!selected.length) {
        setNotice('No items found for the selected date range.')
        return
      }

      if (format === 'csv') {
        downloadFile(buildItemsCsv(selected), exportFilename(range, 'csv'), 'text/csv;charset=utf-8')
      } else {
        const blob = await buildItemsPdf(selected, range)
        downloadFile(blob, exportFilename(range, 'pdf'), 'application/pdf')
      }
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const inputClass =
    'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent'

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((prev) => !prev)
          setError('')
          setNotice('')
        }}
        disabled={busy}
        className="flex items-center gap-2 bg-white hover:border-teal-400 hover:text-teal-600 text-slate-700 border border-slate-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
      >
        <Download className="w-4 h-4" />
        Export Data
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-xl border border-slate-200 shadow-xl p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Export items</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Downloads items whose due date falls within the selected range (both dates included, PKT)
              {filtersActive ? ', matching your current search and filters.' : '.'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="export-start" className="block text-xs font-medium text-slate-500 mb-1">
                Start Date
              </label>
              <input
                id="export-start"
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  setError('')
                  setNotice('')
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="export-end" className="block text-xs font-medium text-slate-500 mb-1">
                End Date
              </label>
              <input
                id="export-end"
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => {
                  setEndDate(e.target.value)
                  setError('')
                  setNotice('')
                }}
                className={inputClass}
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
          {notice && <p className="text-xs text-slate-500">{notice}</p>}

          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={() => void runExport('csv')}
              disabled={busy}
              className="flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {busy ? 'Exporting…' : 'Export as CSV'}
            </button>
            <button
              type="button"
              onClick={() => void runExport('pdf')}
              disabled={busy}
              className="flex items-center justify-center gap-2 bg-white hover:border-teal-400 hover:text-teal-600 disabled:opacity-60 text-slate-700 border border-slate-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <FileText className="w-4 h-4" />
              {busy ? 'Exporting…' : 'Export as PDF'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
