/** Plain-language labels for invoice warnings. */

import type { InvoiceFlag } from '@shared/types'

export type Tone = 'good' | 'warn' | 'bad' | 'neutral'

export function flagLabel(flag: InvoiceFlag): { text: string; tone: Tone; icon: string } {
  switch (flag.type) {
    case 'duplicate':
      return { text: 'Możliwy duplikat', tone: 'warn', icon: '⧉' }
    case 'unusualAmount':
      return { text: `Kwota o ${flag.percentAboveTypical}% wyższa niż zwykle`, tone: 'warn', icon: '📈' }
  }
}
