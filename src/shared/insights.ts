/**
 * Warnings shown next to invoices: likely duplicates and amounts that are much higher
 * than what the same supplier usually charges.
 */

import type { Invoice, InvoiceFlag } from './types'

/** How many earlier invoices from the same supplier form the "typical" amount. */
const HISTORY_SIZE = 6
const MIN_HISTORY = 3
/** An amount this many times above the typical one is highlighted. */
const UNUSUAL_RATIO = 1.5

export function normalizeInvoiceNumber(n: string): string {
  return n.toUpperCase().replace(/[\s\-_.]/g, '')
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

type FlagInput = Pick<Invoice, 'id' | 'supplierId' | 'number' | 'issueDate' | 'grossAmount'>

export function computeFlags<T extends FlagInput>(invoices: T[]): Map<number, InvoiceFlag[]> {
  const flags = new Map<number, InvoiceFlag[]>()
  const add = (id: number, flag: InvoiceFlag) => flags.set(id, [...(flags.get(id) ?? []), flag])

  // Duplicates: same supplier and same invoice number
  const byKey = new Map<string, T[]>()
  for (const inv of invoices) {
    if (inv.supplierId == null || !inv.number.trim()) continue
    const key = `${inv.supplierId}|${normalizeInvoiceNumber(inv.number)}`
    byKey.set(key, [...(byKey.get(key) ?? []), inv])
  }
  for (const group of byKey.values()) {
    if (group.length < 2) continue
    for (const inv of group) add(inv.id, { type: 'duplicate', otherId: group.find((g) => g.id !== inv.id)!.id })
  }

  // Unusual amounts compared to the supplier's previous invoices
  const bySupplier = new Map<number, T[]>()
  for (const inv of invoices) {
    if (inv.supplierId == null || inv.grossAmount == null || inv.grossAmount <= 0) continue
    bySupplier.set(inv.supplierId, [...(bySupplier.get(inv.supplierId) ?? []), inv])
  }
  for (const list of bySupplier.values()) {
    list.sort((a, b) => a.issueDate.localeCompare(b.issueDate) || a.id - b.id)
    list.forEach((inv, i) => {
      const history = list.slice(Math.max(0, i - HISTORY_SIZE), i).map((h) => h.grossAmount!)
      if (history.length < MIN_HISTORY) return
      const typical = median(history)
      if (typical > 0 && inv.grossAmount! >= typical * UNUSUAL_RATIO) {
        add(inv.id, { type: 'unusualAmount', percentAboveTypical: Math.round((inv.grossAmount! / typical - 1) * 100) })
      }
    })
  }

  return flags
}
