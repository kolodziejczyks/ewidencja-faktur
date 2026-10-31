/** Warnings shown next to invoices: likely duplicates. */

import type { Invoice, InvoiceFlag } from './types'

export function normalizeInvoiceNumber(n: string): string {
  return n.toUpperCase().replace(/[\s\-_.]/g, '')
}

type FlagInput = Pick<Invoice, 'id' | 'supplierId' | 'number'>

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

  return flags
}
