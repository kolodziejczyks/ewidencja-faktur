/** Polish plural forms: plural(5, ['faktura', 'faktury', 'faktur']) -> "5 faktur". */
export function plural(n: number, [one, few, many]: [string, string, string]): string {
  const lastTwo = n % 100
  const last = n % 10
  const word = n === 1 ? one : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many
  return `${n} ${word}`
}

export const INVOICES: [string, string, string] = ['faktura', 'faktury', 'faktur']
export const ENTRIES: [string, string, string] = ['wpis', 'wpisy', 'wpisów']
