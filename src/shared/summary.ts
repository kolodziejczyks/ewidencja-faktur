/** Aggregations used by the summary screen and the Excel export. */

import { monthKey, shiftMonth } from './dates'
import type { Invoice, PaymentMethod } from './types'

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

type SummaryInput = Pick<Invoice, 'issueDate' | 'grossAmount' | 'supplierName' | 'categoryName' | 'paymentMethod'>

const amount = (inv: SummaryInput) => inv.grossAmount ?? 0

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = { transfer: 'Przelew', cash: 'Gotówka' }

export function paymentMethodLabel(method: PaymentMethod | null): string {
  return method ? PAYMENT_METHOD_LABELS[method] : 'Nie podano'
}

export function sumAmounts(invoices: SummaryInput[]): number {
  return invoices.reduce((s, i) => s + amount(i), 0)
}

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

export interface PeriodTotal {
  /** `YYYY-MM-DD` for days, `YYYY-MM` for months */
  key: string
  count: number
  cash: number
  transfer: number
  total: number
}

/** Totals per day or per month, oldest first, only for periods that have entries. */
export function totalsByPeriod(invoices: SummaryInput[], period: 'day' | 'month'): PeriodTotal[] {
  const map = new Map<string, PeriodTotal>()
  for (const inv of invoices) {
    const key = period === 'day' ? inv.issueDate : monthKey(inv.issueDate)
    const t = map.get(key) ?? { key, count: 0, cash: 0, transfer: 0, total: 0 }
    t.count += 1
    t.total += amount(inv)
    if (inv.paymentMethod === 'cash') t.cash += amount(inv)
    if (inv.paymentMethod === 'transfer') t.transfer += amount(inv)
    map.set(key, t)
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key))
}

/** The biggest `limit` groups, with everything else folded into one "Pozostali" row. */
export function topWithRest(groups: GroupTotal[], limit: number, restLabel = 'Pozostali'): GroupTotal[] {
  if (groups.length <= limit + 1) return groups
  const rest = groups.slice(limit)
  return [
    ...groups.slice(0, limit),
    { name: `${restLabel} (${rest.length})`, total: rest.reduce((s, g) => s + g.total, 0), count: rest.reduce((s, g) => s + g.count, 0) }
  ]
}

export function invoicesInMonth<T extends SummaryInput>(invoices: T[], month: string): T[] {
  return invoices.filter((inv) => monthKey(inv.issueDate) === month)
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

/** Per-supplier comparison of two periods' invoices, biggest changes first. */
export function compareSuppliers(before: SummaryInput[], after: SummaryInput[]): MonthComparisonRow[] {
  const a = new Map(totalsBy(before, (i) => i.supplierName).map((g) => [g.name, g.total]))
  const b = new Map(totalsBy(after, (i) => i.supplierName).map((g) => [g.name, g.total]))
  const names = new Set([...a.keys(), ...b.keys()])
  return [...names]
    .map((name) => {
      const va = a.get(name) ?? 0
      const vb = b.get(name) ?? 0
      return { name, a: va, b: vb, diff: vb - va, percent: percentChange(vb, va) }
    })
    .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff))
}
