/** Plain-language labels for invoice warnings and payment status. */

import type { Invoice, InvoiceFlag } from '@shared/types'

export type Tone = 'good' | 'warn' | 'bad' | 'neutral'

function days(n: number): string {
  if (n === 1) return '1 dzień'
  return `${n} dni`
}

export function flagLabel(flag: InvoiceFlag): { text: string; tone: Tone; icon: string } {
  switch (flag.type) {
    case 'overdue':
      return { text: `Po terminie (${days(flag.daysLate)})`, tone: 'bad', icon: '⏰' }
    case 'dueSoon':
      return {
        text: flag.daysLeft === 0 ? 'Zapłać dzisiaj' : `Zapłać w ciągu ${days(flag.daysLeft)}`,
        tone: 'warn',
        icon: '⏳'
      }
    case 'duplicate':
      return { text: 'Możliwy duplikat', tone: 'warn', icon: '⧉' }
    case 'unusualAmount':
      return { text: `Kwota o ${flag.percentAboveTypical}% wyższa niż zwykle`, tone: 'warn', icon: '📈' }
  }
}

export function paymentStatus(inv: Invoice): { text: string; tone: Tone; icon: string } | null {
  if (inv.kind === 'note') return null
  if (inv.paid) return { text: 'Zapłacona', tone: 'good', icon: '✓' }
  if (inv.flags.some((f) => f.type === 'overdue')) return null // the overdue flag says it more clearly
  return { text: 'Do zapłaty', tone: 'neutral', icon: '•' }
}
