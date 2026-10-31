/** Date ranges offered on the "Do druku" screen, all relative to today. */

import { addDays, formatDate, monthKey, shiftMonth } from './dates'
import { lastDayOf, periodName, periodOf, type PeriodKind } from './periods'

export type PrintRangeId = 'last10Days' | 'thisMonth' | 'lastMonth' | 'lastQuarter' | 'thisYear' | 'custom'

export interface PrintRange {
  id: PrintRangeId
  label: string
  from: string
  to: string
}

/**
 * A date range in words, for the top of a printout: "październik 2026", "III kwartał 2026",
 * "rok 2026" when it covers exactly that, otherwise "22.10 – 31.10.2026" or "15.12.2025 – 14.01.2026".
 */
export function describeRange(from: string, to: string): string {
  for (const kind of ['month', 'quarter', 'year'] as PeriodKind[]) {
    const p = periodOf(kind, from)
    if (from === `${p.start}-01` && to === lastDayOf(p)) return periodName(p)
  }
  if (from === to) return formatDate(from)
  return from.slice(0, 4) === to.slice(0, 4) ? `${formatDate(from).slice(0, 5)} – ${formatDate(to)}` : `${formatDate(from)} – ${formatDate(to)}`
}

function monthEnd(key: string): string {
  return addDays(`${shiftMonth(key, 1)}-01`, -1)
}

export function printRanges(todayIso: string): PrintRange[] {
  const thisMonth = monthKey(todayIso)
  const lastMonth = shiftMonth(thisMonth, -1)
  const year = todayIso.slice(0, 4)
  // The last full calendar quarter, e.g. July–September when today is in October.
  const month = Number(thisMonth.slice(5))
  const quarterStart = shiftMonth(`${year}-${String(month - ((month - 1) % 3)).padStart(2, '0')}`, -3)

  return [
    // Calendar days, today included: 22.10–31.10 on 31.10.
    { id: 'last10Days', label: 'Ostatnie 10 dni', from: addDays(todayIso, -9), to: todayIso },
    { id: 'thisMonth', label: 'Cały ten miesiąc', from: `${thisMonth}-01`, to: monthEnd(thisMonth) },
    { id: 'lastMonth', label: 'Ostatni miesiąc', from: `${lastMonth}-01`, to: monthEnd(lastMonth) },
    { id: 'lastQuarter', label: 'Ostatni kwartał', from: `${quarterStart}-01`, to: monthEnd(shiftMonth(quarterStart, 2)) },
    { id: 'thisYear', label: `Cały rok ${year}`, from: `${year}-01-01`, to: `${year}-12-31` }
  ]
}
