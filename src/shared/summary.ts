/** Aggregations used by the summary screen and the Excel export. */

import { monthKey, shiftMonth } from './dates'
import type { Invoice } from './types'

export interface MonthTotal {
  month: string // YYYY-MM
  total: number
  count: number
}

export interface GroupTotal {
  name: string
  total: number
  count: number
}

export interface MonthComparisonRow {
  name: string
  a: number
  b: number
  diff: number
  /** null when there was nothing to compare against */
  percent: number | null
}

type SummaryInput = Pick<Invoice, 'issueDate' | 'grossAmount' | 'supplierName' | 'categoryName' | 'paid' | 'kind'>

const amount = (inv: SummaryInput) => inv.grossAmount ?? 0

export function totalsByMonth(invoices: SummaryInput[]): Map<string, MonthTotal> {
  const map = new Map<string, MonthTotal>()
  for (const inv of invoices) {
    const key = monthKey(inv.issueDate)
    const t = map.get(key) ?? { month: key, total: 0, count: 0 }
    t.total += amount(inv)
    t.count += 1
    map.set(key, t)
  }
  return map
}

/** The last `count` months ending with `lastMonth`, including empty months. */
export function monthSeries(invoices: SummaryInput[], lastMonth: string, count: number): MonthTotal[] {
  const totals = totalsByMonth(invoices)
  return Array.from({ length: count }, (_, i) => {
    const key = shiftMonth(lastMonth, i - count + 1)
    return totals.get(key) ?? { month: key, total: 0, count: 0 }
  })
}

export function totalsBy(invoices: SummaryInput[], keyOf: (inv: SummaryInput) => string): GroupTotal[] {
  const map = new Map<string, GroupTotal>()
  for (const inv of invoices) {
    const name = keyOf(inv) || 'Bez nazwy'
    const t = map.get(name) ?? { name, total: 0, count: 0 }
    t.total += amount(inv)
    t.count += 1
    map.set(name, t)
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}

export function invoicesInMonth<T extends SummaryInput>(invoices: T[], month: string): T[] {
  return invoices.filter((inv) => monthKey(inv.issueDate) === month)
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

/** Per-supplier comparison of two months, biggest changes first. */
export function compareMonths(invoices: SummaryInput[], monthA: string, monthB: string): MonthComparisonRow[] {
  const a = new Map(totalsBy(invoicesInMonth(invoices, monthA), (i) => i.supplierName).map((g) => [g.name, g.total]))
  const b = new Map(totalsBy(invoicesInMonth(invoices, monthB), (i) => i.supplierName).map((g) => [g.name, g.total]))
  const names = new Set([...a.keys(), ...b.keys()])
  return [...names]
    .map((name) => {
      const va = a.get(name) ?? 0
      const vb = b.get(name) ?? 0
      return { name, a: va, b: vb, diff: vb - va, percent: percentChange(vb, va) }
    })
    .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff))
}
