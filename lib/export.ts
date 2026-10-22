import { APP_TIMEZONE } from '@/lib/time'
import {
  CHANNEL_LABELS,
  formatDate,
  formatDateTime,
  formatDateTimeInTimeZone,
  formatTime,
  matchesItemFilters,
  type ItemFilters,
} from '@/lib/utils'
import type { LifeAdminItem } from '@/lib/types'

export interface ExportDateRange {
  start: string
  end: string
}

export interface ExportOptions {
  range: ExportDateRange
  filters: ItemFilters
}

/**
 * Validate the export date range. Returns null when valid, otherwise a message
 * safe to show the user. Both dates are required; the range is inclusive on
 * both ends, so start === end exports a single day.
 */
export function validateExportRange(start: string, end: string): string | null {
  if (!start || !end) return 'Please select both a start date and an end date.'
  const datePattern = /^\d{4}-\d{2}-\d{2}$/
  if (!datePattern.test(start) || !datePattern.test(end)) {
    return 'Please enter valid dates in YYYY-MM-DD format.'
  }
  if (Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) {
    return 'Please enter valid dates.'
  }
  if (start > end) return 'The start date cannot be later than the end date.'
  return null
}

/**
 * Narrow the full item dataset to what the export should contain: the due-date
 * range (inclusive on both boundary dates) plus the search/filters active in
 * the items list at export time. due_date is the Pakistan (PKT) wall-clock
 * date and the date pickers produce the same calendar dates, so a plain string
 * comparison is exact — no timezone conversion happens anywhere in the export.
 * Items without a due date can never fall inside a range and are excluded.
 */
export function itemsForExport(items: LifeAdminItem[], opts: ExportOptions): LifeAdminItem[] {
  return items.filter(
    (item) =>
      item.due_date !== null &&
      opts.range.start <= item.due_date &&
      item.due_date <= opts.range.end &&
      matchesItemFilters(item, opts.filters)
  )
}

export function exportFilename(range: ExportDateRange, extension: string): string {
  return `life-admin-items_${range.start}_to_${range.end}.${extension}`
}

// ---- CSV -------------------------------------------------------------------------

const CSV_HEADERS = [
  'Title',
  'Description',
  'Category',
  'Due Date',
  'Due Time',
  'Priority',
  'Status',
  'Reminders (days before due date)',
  'Reminders (minutes before due time)',
  'Notifications',
  'Created (PKT)',
]

/** RFC 4180 escaping: cells containing commas, quotes or line breaks are quoted, quotes doubled. */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function buildItemsCsv(items: LifeAdminItem[]): string {
  const lines = [CSV_HEADERS.map(csvCell).join(',')]
  for (const item of items) {
    lines.push(
      [
        item.title,
        item.description ?? '',
        item.category?.name ?? '',
        item.due_date ? formatDate(item.due_date) : '',
        item.due_time ? formatTime(item.due_time) : '',
        item.priority,
        item.status,
        (item.reminder_days ?? []).join(', '),
        (item.reminder_minutes ?? []).join(', '),
        CHANNEL_LABELS[item.notification_preference],
        formatDateTimeInTimeZone(item.created_at, APP_TIMEZONE),
      ]
        .map(csvCell)
        .join(',')
    )
  }
  // BOM so Excel opens the UTF-8 content correctly.
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

// ---- PDF -------------------------------------------------------------------------

/**
 * A portrait A4 report: title, selected date range, generation date (PKT) and
 * a table of the filtered items. jsPDF + autoTable wrap long text and repeat
 * the header row across pages, so nothing is cut off. Loaded dynamically so
 * the large PDF library stays out of the initial page bundle.
 */
export async function buildItemsPdf(items: LifeAdminItem[], range: ExportDateRange): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('Life Admin Tracker — Items Report', 12, 18)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(80, 90, 100)
  doc.text(`Date range: ${formatDate(range.start)} to ${formatDate(range.end)} (PKT, inclusive)`, 12, 26)
  doc.text(`Generated: ${formatDateTimeInTimeZone(new Date().toISOString(), APP_TIMEZONE)} PKT`, 12, 32)
  doc.text(`Items: ${items.length}`, 12, 38)
  doc.setTextColor(0, 0, 0)

  autoTable(doc, {
    startY: 44,
    head: [['Title', 'Description', 'Category', 'Due Date', 'Priority', 'Status']],
    body: items.map((item) => [
      item.title,
      item.description ?? '',
      item.category?.name ?? '—',
      item.due_date ? formatDateTime(item.due_date, item.due_time) : '—',
      item.priority,
      item.status,
    ]),
    styles: { fontSize: 8.5, cellPadding: 2, overflow: 'linebreak', textColor: [40, 44, 52] },
    headStyles: { fillColor: [13, 148, 136], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [240, 249, 248] },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 54 },
      2: { cellWidth: 24 },
      3: { cellWidth: 28 },
      4: { cellWidth: 16 },
      5: { cellWidth: 18 },
    },
    margin: { left: 12, right: 12, top: 14 },
  })

  return doc.output('blob')
}

// ---- download ----------------------------------------------------------------------

export function downloadFile(content: BlobPart, filename: string, mimeType: string): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
