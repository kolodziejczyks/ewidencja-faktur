/** Money helpers. All amounts are integer grosze. */

const formatter = new Intl.NumberFormat('pl-PL', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: 'always'
})

/** 123456 -> "1 234,56 zł" */
export function formatMoney(grosze: number | null | undefined): string {
  if (grosze == null) return '—'
  // Intl uses (narrow) no-break spaces as the thousands separator; a regular space reads the same and copies better.
  return formatter.format(grosze / 100).replace(/\s/g, ' ') + ' zł'
}

/** "1 234,56 zł" / "1234.56" / "1.234,56" -> 123456. Returns null when the text is not an amount. */
export function parseMoney(text: string): number | null {
  let s = text.replace(/zł|pln|\s/gi, '')
  if (!s) return null
  const negative = s.startsWith('-')
  s = s.replace(/^[-+]/, '')
  if (!/^[\d.,']+$/.test(s)) return null

  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  const decimalPos = Math.max(lastComma, lastDot)
  let integerPart = s
  let fractionPart = ''
  // A separator followed by 1-2 digits at the end is the decimal separator; anything else groups thousands.
  if (decimalPos >= 0 && s.length - decimalPos - 1 <= 2) {
    integerPart = s.slice(0, decimalPos)
    fractionPart = s.slice(decimalPos + 1)
  }
  integerPart = integerPart.replace(/[.,']/g, '')
  if (!integerPart && !fractionPart) return null
  const value = Number(integerPart || '0') * 100 + Number(fractionPart.padEnd(2, '0') || '0')
  if (!Number.isFinite(value)) return null
  return negative ? -value : value
}

/** Formats grosze for an editable text field: 123456 -> "1234,56". */
export function moneyToInput(grosze: number | null | undefined): string {
  if (grosze == null) return ''
  const sign = grosze < 0 ? '-' : ''
  const abs = Math.abs(grosze)
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}
