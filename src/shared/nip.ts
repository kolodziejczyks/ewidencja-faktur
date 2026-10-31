/** Polish tax identification number (NIP) helpers. */

const WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7]

/** Strips everything except digits, and a leading "PL" country prefix. */
export function normalizeNip(text: string): string {
  return text.replace(/^\s*PL/i, '').replace(/\D/g, '')
}

export function isValidNip(text: string): boolean {
  const nip = normalizeNip(text)
  if (!/^\d{10}$/.test(nip) || /^0+$/.test(nip)) return false
  const sum = WEIGHTS.reduce((acc, w, i) => acc + w * Number(nip[i]), 0)
  const check = sum % 11
  return check !== 10 && check === Number(nip[9])
}

/** 1234567890 -> 123-456-78-90 (the most common way NIPs are printed). */
export function formatNip(text: string): string {
  const nip = normalizeNip(text)
  if (nip.length !== 10) return text
  return `${nip.slice(0, 3)}-${nip.slice(3, 6)}-${nip.slice(6, 8)}-${nip.slice(8)}`
}
