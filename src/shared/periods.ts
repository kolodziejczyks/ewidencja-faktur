/** Calendar periods for the summary screen: a month, a quarter or a year, identified by its first month. */

import { MONTH_NAMES, MONTH_NAMES_SHORT, inMonthPhrase, monthKey, monthsBetween, shiftDateByMonths, shiftMonth } from './dates'

export type PeriodKind = 'month' | 'quarter' | 'year'

export interface Period {
  kind: PeriodKind
  /** First month of the period, `YYYY-MM` */
  start: string
}

const LENGTH: Record<PeriodKind, number> = { month: 1, quarter: 3, year: 12 }
const ROMAN = ['I', 'II', 'III', 'IV']

/** The period of the given kind that contains a `YYYY-MM-DD` date. */
export function periodOf(kind: PeriodKind, iso: string): Period {
  const [y, m] = iso.split('-').map(Number)
  const first = kind === 'month' ? m : kind === 'quarter' ? m - ((m - 1) % 3) : 1
  return { kind, start: `${y}-${String(first).padStart(2, '0')}` }
}

export function shiftPeriod(p: Period, delta: number): Period {
  return { kind: p.kind, start: shiftMonth(p.start, delta * LENGTH[p.kind]) }
}

/** The same period one year earlier. */
export const yearBefore = (p: Period): Period => ({ kind: p.kind, start: shiftMonth(p.start, -12) })

export const periodMonths = (p: Period): string[] => Array.from({ length: LENGTH[p.kind] }, (_, i) => shiftMonth(p.start, i))

export const lastMonthOf = (p: Period): string => shiftMonth(p.start, LENGTH[p.kind] - 1)

/** Last day of the period, `YYYY-MM-DD`. */
export function lastDayOf(p: Period): string {
  const [y, m] = lastMonthOf(p).split('-').map(Number)
  return `${lastMonthOf(p)}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
}

/** "Październik 2026", "IV kwartał 2026", "Rok 2026" */
export function periodLabel(p: Period): string {
  const [y, m] = p.start.split('-').map(Number)
  if (p.kind === 'month') return `${MONTH_NAMES[m - 1]} ${y}`
  if (p.kind === 'quarter') return `${ROMAN[(m - 1) / 3]} kwartał ${y}`
  return `Rok ${y}`
}

/** Chart axis label: "paź 26", "IV kw. 26", "2026" */
export function periodShortLabel(p: Period): string {
  const [y, m] = p.start.split('-').map(Number)
  if (p.kind === 'month') return `${MONTH_NAMES_SHORT[m - 1]} ${String(y).slice(2)}`
  if (p.kind === 'quarter') return `${ROMAN[(m - 1) / 3]} kw. ${String(y).slice(2)}`
  return String(y)
}

/** The label inside a sentence: "październik 2026", "IV kwartał 2026", "rok 2026". */
export function periodName(p: Period): string {
  const label = periodLabel(p)
  return p.kind === 'quarter' ? label : label.toLowerCase()
}

/** For "więcej niż …": "we wrześniu", "w III kwartale", "w 2025 r." */
export function inPeriodPhrase(p: Period): string {
  const [y, m] = p.start.split('-').map(Number)
  if (p.kind === 'month') return inMonthPhrase(p.start)
  if (p.kind === 'quarter') return `w ${ROMAN[(m - 1) / 3]} kwartale`
  return `w ${y} r.`
}

/** Invoices of the period, optionally only those issued up to and including `until`. */
export function invoicesInPeriod<T extends { issueDate: string }>(invoices: T[], p: Period, until?: string): T[] {
  const months = new Set(periodMonths(p))
  return invoices.filter((inv) => months.has(monthKey(inv.issueDate)) && (!until || inv.issueDate <= until))
}

/** Whether the date falls inside the period, i.e. the period is not over yet. */
export const isOngoing = (p: Period, iso: string): boolean => `${p.start}-01` <= iso && iso <= lastDayOf(p)

/**
 * The point in `other` that matches `iso` in `p` — for comparing an unfinished period fairly:
 * on 31.10.2026 the 4th quarter so far is compared with the 3rd quarter up to 31.07.2026.
 */
export const matchingDay = (p: Period, other: Period, iso: string): string => shiftDateByMonths(iso, monthsBetween(p.start, other.start))
