/**
 * Punch list Excel builder.
 *
 * Builds a workbook with two sheets:
 * 1. "Punch List" — full row per punch with autofilter on the header.
 * 2. "Summary"   — counts by category × status, plus per-area open counts.
 *
 * Conditional formatting (colored category rows) is not supported by the
 * community `xlsx` package — only available in SheetJS Pro. We sort rows
 * by category to keep A blockers at the top instead.
 */

import * as XLSX from 'xlsx'
import { sanitizeCell } from './sanitize'

export type PunchExportRow = {
  project: string        // project code (blank when single-project export)
  punchNumber: string
  category: 'A' | 'B' | 'C'
  status: string
  priority: string
  description: string
  tagNumber: string
  discipline: string
  area: string
  system: string
  subsystem: string
  raisedBy: string
  assignedTo: string
  targetDate: string
  closedDate: string
  createdAt: string
}

type SheetCol = { header: string; key: keyof PunchExportRow; width: number }

const PROJECT_COL: SheetCol = { header: 'Project',     key: 'project',     width: 12 }

const BASE_COLS: SheetCol[] = [
  { header: 'Punch #',     key: 'punchNumber', width: 14 },
  { header: 'Category',    key: 'category',    width: 9 },
  { header: 'Status',      key: 'status',      width: 12 },
  { header: 'Priority',    key: 'priority',    width: 10 },
  { header: 'Description', key: 'description', width: 50 },
  { header: 'Tag',         key: 'tagNumber',   width: 16 },
  { header: 'Discipline',  key: 'discipline',  width: 12 },
  { header: 'Area',        key: 'area',        width: 18 },
  { header: 'System',      key: 'system',      width: 16 },
  { header: 'Subsystem',   key: 'subsystem',   width: 16 },
  { header: 'Raised By',   key: 'raisedBy',    width: 20 },
  { header: 'Assigned To', key: 'assignedTo',  width: 20 },
  { header: 'Target Date', key: 'targetDate',  width: 12 },
  { header: 'Closed Date', key: 'closedDate',  width: 12 },
  { header: 'Created At',  key: 'createdAt',   width: 12 },
]

const STATUS_ORDER = ['open', 'in_progress', 'closed', 'cancelled']

function colLetter(index: number): string {
  // 0-indexed: 0 -> A, 25 -> Z, 26 -> AA
  let n = index
  let s = ''
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  }
  return s
}

export function buildPunchListWorkbook(
  rows: PunchExportRow[],
  opts: { includeProjectCol: boolean },
): Uint8Array {
  const wb = XLSX.utils.book_new()
  const cols: SheetCol[] = opts.includeProjectCol ? [PROJECT_COL, ...BASE_COLS] : BASE_COLS

  // Sort: Cat A first, then by status (open before closed), then punchNumber.
  const sorted = [...rows].sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category)
    const sa = STATUS_ORDER.indexOf(a.status); const sb = STATUS_ORDER.indexOf(b.status)
    if (sa !== sb) return sa - sb
    return a.punchNumber.localeCompare(b.punchNumber)
  })

  // ─── Sheet 1: Punch List ──────────────────────────────────────────────────
  const data: (string | number)[][] = [cols.map(c => c.header)]
  for (const row of sorted) {
    data.push(cols.map(c => sanitizeCell(row[c.key] ?? '')))
  }

  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = cols.map(c => ({ wch: c.width }))

  // Autofilter on header row + freeze the first row.
  const lastColLetter = colLetter(cols.length - 1)
  const lastRow = data.length
  ws['!autofilter'] = { ref: `A1:${lastColLetter}${lastRow}` }
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }

  XLSX.utils.book_append_sheet(wb, ws, 'Punch List')

  // ─── Sheet 2: Summary ─────────────────────────────────────────────────────
  type Counts = { open: number; in_progress: number; closed: number; cancelled: number; total: number }
  const empty = (): Counts => ({ open: 0, in_progress: 0, closed: 0, cancelled: 0, total: 0 })

  const byCategory = new Map<'A' | 'B' | 'C', Counts>([
    ['A', empty()], ['B', empty()], ['C', empty()],
  ])
  const byArea = new Map<string, Counts>()

  for (const row of sorted) {
    const cat = byCategory.get(row.category)
    if (cat) {
      cat.total += 1
      if (row.status === 'open')         cat.open += 1
      else if (row.status === 'in_progress') cat.in_progress += 1
      else if (row.status === 'closed')      cat.closed += 1
      else if (row.status === 'cancelled')   cat.cancelled += 1
    }
    const areaKey = row.area || '(unassigned)'
    if (!byArea.has(areaKey)) byArea.set(areaKey, empty())
    const a = byArea.get(areaKey)!
    a.total += 1
    if (row.status === 'open')         a.open += 1
    else if (row.status === 'in_progress') a.in_progress += 1
    else if (row.status === 'closed')      a.closed += 1
    else if (row.status === 'cancelled')   a.cancelled += 1
  }

  const summaryAoa: (string | number)[][] = []
  summaryAoa.push(['Punch List Summary'])
  summaryAoa.push([])
  summaryAoa.push(['By Category'])
  summaryAoa.push(['Category', 'Open', 'In Progress', 'Closed', 'Cancelled', 'Total'])
  for (const cat of ['A', 'B', 'C'] as const) {
    const c = byCategory.get(cat) ?? empty()
    summaryAoa.push([`Cat ${cat}`, c.open, c.in_progress, c.closed, c.cancelled, c.total])
  }
  summaryAoa.push([])
  summaryAoa.push(['By Area'])
  summaryAoa.push(['Area', 'Open', 'In Progress', 'Closed', 'Cancelled', 'Total'])
  const sortedAreas = [...byArea.entries()].sort((a, b) => b[1].total - a[1].total)
  for (const [area, c] of sortedAreas) {
    summaryAoa.push([sanitizeCell(area), c.open, c.in_progress, c.closed, c.cancelled, c.total])
  }

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoa)
  wsSummary['!cols'] = [
    { wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 8 },
  ]
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array
}
