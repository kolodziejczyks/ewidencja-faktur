/**
 * Heuristic reader for Polish invoices.
 *
 * Takes plain text (from a PDF text layer, OCR or a .docx) and guesses the fields the form needs.
 * It never has to be perfect: every guessed field is shown highlighted in the form so the user
 * checks it before saving. When a field cannot be found it is left empty.
 */

import { parseMoney } from './money'
import { isValidIsoDate, addDays } from './dates'
import { isValidNip, normalizeNip } from './nip'
import type { PaymentMethod } from './types'

export interface ParsedInvoice {
  number: string | null
  supplierName: string | null
  supplierNip: string | null
  issueDate: string | null
  dueDate: string | null
  grossAmount: number | null
  netAmount: number | null
  paymentMethod: PaymentMethod | null
}

export interface ParseOptions {
  /** The buyer's (shop's) own NIP, so it is never mistaken for the supplier's. */
  ownNip?: string
}

interface Found<T> {
  value: T
  index: number
}

const SELLER_LABEL = /\b(sprzedawca|sprzedaj[aą]cy|wystawca|dostawca)\b/i
const BUYER_LABEL = /\b(nabywca|kupuj[aą]cy|odbiorca|p[łl]atnik)\b/i

const GROSS_LABELS = [
  /(?:razem|kwota|pozosta[łl]o)?\s*do\s+zap[łl]aty/i,
  /razem\s+brutto|warto[śs][ćc]\s+brutto|suma\s+brutto|og[óo][łl]em\s+brutto|brutto\s+razem/i,
  /\bnale[żz]no[śs][ćc]\b/i
]
const TOTAL_ROW_LABEL = /^\s*(razem|suma|og[óo][łl]em)\b/i

const ISSUE_DATE_LABELS = [/data\s+wystawienia/i, /wystawion[aoy]\s+(dnia|w\s+dniu)/i, /data\s+sprzeda[żz]y/i, /\bdnia\b/i]
const DUE_DATE_LABELS = [
  /termin\s+(p[łl]atno[śs]ci|zap[łl]aty)/i,
  /(p[łl]atne|zap[łl]ata|p[łl]atno[śs][ćc])\s+do/i,
  /data\s+(p[łl]atno[śs]ci|zap[łl]aty)/i
]

// Whitespace is normalised in parseInvoiceText, so thousands are grouped with a plain space or a dot.
const AMOUNT_RE = /-?\d{1,3}(?:[ .]\d{3})+[.,]\d{2}(?!\d)|-?\d+[.,]\d{2}(?!\d)/g
const DATE_RE = /\b(\d{4})[-./](\d{1,2})[-./](\d{1,2})\b|\b(\d{1,2})[-./](\d{1,2})[-./](\d{4})\b/g
const NIP_CANDIDATE_RE = /(?:PL\s?)?\d{3}[- ]?\d{3}[- ]?\d{2}[- ]?\d{2}(?!\d)|(?:PL\s?)?\d{3}[- ]?\d{2}[- ]?\d{2}[- ]?\d{3}(?!\d)/g
const COMPANY_FORM_RE = /\b(sp\.?\s*z\s*o\.?\s*o\.?|s\.\s?a\.|sp\.\s?j\.|sp\.\s?k\.|sp[óo][łl]ka|p\.?h\.?u\.?|f\.?h\.?u\.?|hurtownia|przedsi[ęe]biorstwo)/i

export function parseInvoiceText(rawText: string, options: ParseOptions = {}): ParsedInvoice {
  // Every kind of space (incl. no-break spaces) becomes a plain one; wide gaps between columns stay as two spaces.
  const text = rawText.replace(/\r/g, '').replace(/\t/g, '  ').replace(/[^\S\n]/g, ' ').replace(/ {3,}/g, '  ')
  const ownNip = options.ownNip ? normalizeNip(options.ownNip) : ''

  const supplierNip = findSupplierNip(text, ownNip)
  const issueDate = findDateAfterLabels(text, ISSUE_DATE_LABELS) ?? findAllDates(text)[0]?.value ?? null
  const { gross, net } = findAmounts(text)

  return {
    number: findInvoiceNumber(text),
    supplierName: findSupplierName(text, ownNip),
    supplierNip,
    issueDate,
    dueDate: findDueDate(text, issueDate),
    grossAmount: gross,
    netAmount: net,
    paymentMethod: findPaymentMethod(text)
  }
}

// ---------- payment method ----------

/** "Sposób płatności: przelew" / "Forma płatności: gotówka". Card payments are left for the user to choose. */
function findPaymentMethod(text: string): PaymentMethod | null {
  const m = text.match(/(?:spos[óo]b|forma|rodzaj)\s+(?:p[łl]atno[śs]ci|zap[łl]aty)\s*:?\s*([a-ząćęłńóśźż]+)/i)
  if (!m) return null
  if (/^przelew/i.test(m[1])) return 'transfer'
  if (/^got[óo]wk/i.test(m[1])) return 'cash'
  return null
}

// ---------- NIP & supplier ----------

function findAllNips(text: string): Found<string>[] {
  const result: Found<string>[] = []
  for (const m of text.matchAll(NIP_CANDIDATE_RE)) {
    const nip = normalizeNip(m[0])
    if (isValidNip(nip)) result.push({ value: nip, index: m.index })
  }
  return result
}

function findSupplierNip(text: string, ownNip: string): string | null {
  const nips = findAllNips(text).filter((n) => n.value !== ownNip)
  if (nips.length === 0) return null
  const sellerAt = text.search(SELLER_LABEL)
  if (sellerAt >= 0) {
    const afterSeller = nips.find((n) => n.index > sellerAt)
    if (afterSeller) return afterSeller.value
  }
  return nips[0].value
}

function findSupplierName(text: string, ownNip: string): string | null {
  const lines = text.split('\n').map((l) => l.trim())
  const labelLine = lines.findIndex((l) => SELLER_LABEL.test(l))

  if (labelLine >= 0) {
    const line = lines[labelLine]
    const sellerMatch = line.match(SELLER_LABEL)!
    const sellerFirst = !BUYER_LABEL.test(line) || line.search(BUYER_LABEL) > (sellerMatch.index ?? 0)
    // "Sprzedawca: Hurtownia ABC" — the name is on the same line.
    const sameLine = cleanName(line.slice((sellerMatch.index ?? 0) + sellerMatch[0].length).split(BUYER_LABEL)[0])
    if (sameLine) return sameLine

    for (let i = labelLine + 1; i < Math.min(lines.length, labelLine + 4); i++) {
      if (!lines[i]) continue
      // Seller and buyer printed side by side end up on one OCR line separated by a wide gap.
      const columns = lines[i].split(/\s{2,}|\t/)
      const candidate = cleanName(sellerFirst ? columns[0] : columns[columns.length - 1])
      if (candidate && !/^nip\b/i.test(candidate)) return candidate
    }
  }

  // Fallback: the first line that looks like a company name and is not next to our own NIP.
  for (let i = 0; i < lines.length; i++) {
    if (COMPANY_FORM_RE.test(lines[i]) && !(ownNip && normalizeNip(lines[i + 1] ?? '').includes(ownNip))) {
      const candidate = cleanName(lines[i])
      if (candidate) return candidate
    }
  }
  return null
}

function cleanName(raw: string | undefined): string | null {
  if (!raw) return null
  const name = raw
    .replace(/^[\s:;,.-]+/, '')
    .replace(/\bNIP\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (name.length < 3 || !/[a-ząćęłńóśźż]{2}/i.test(name)) return null
  return name.slice(0, 120)
}

// ---------- invoice number ----------

function findInvoiceNumber(text: string): string | null {
  const patterns = [
    /faktura(?:\s+vat)?(?:\s+(?:korekta|korygująca))?\s*(?:nr|numer|no)\.?\s*:?\s*([A-Z0-9][A-Z0-9/\-_.]*)/i,
    /(?:nr|numer)\s+faktury\s*:?\s*([A-Z0-9][A-Z0-9/\-_.]*)/i,
    /faktura(?:\s+vat)?\s*:?\s*([A-Z0-9][A-Z0-9/\-_.]*\/[A-Z0-9/\-_.]*)/i
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m && /\d/.test(m[1])) return m[1].replace(/[.\-_/]+$/, '')
  }
  return null
}

// ---------- dates ----------

function findAllDates(text: string): Found<string>[] {
  const result: Found<string>[] = []
  for (const m of text.matchAll(DATE_RE)) {
    const [y, mo, d] = m[1] ? [m[1], m[2], m[3]] : [m[6], m[5], m[4]]
    const iso = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
    if (isValidIsoDate(iso)) result.push({ value: iso, index: m.index })
  }
  return result
}

function findDateAfterLabels(text: string, labels: RegExp[], maxDistance = 80): string | null {
  for (const label of labels) {
    for (const m of text.matchAll(new RegExp(label.source, 'gi'))) {
      const start = m.index + m[0].length
      const date = findAllDates(text.slice(start, start + maxDistance))[0]
      if (date) return date.value
    }
  }
  return null
}

function findDueDate(text: string, issueDate: string | null): string | null {
  const explicit = findDateAfterLabels(text, DUE_DATE_LABELS)
  if (explicit) return explicit
  // "Termin płatności: 14 dni"
  for (const label of DUE_DATE_LABELS) {
    const m = text.match(new RegExp(label.source + String.raw`[^\n\d]{0,20}(\d{1,3})\s*dni`, 'i'))
    if (m && issueDate) return addDays(issueDate, Number(m[m.length - 1]))
  }
  return null
}

// ---------- amounts ----------

function amountsIn(line: string): number[] {
  const result: number[] = []
  for (const m of line.matchAll(AMOUNT_RE)) {
    const value = parseMoney(m[0])
    if (value != null) result.push(value)
  }
  return result
}

function findAmounts(text: string): { gross: number | null; net: number | null } {
  const lines = text.split('\n')
  let gross: number | null = null
  let net: number | null = null

  // 1) "Do zapłaty: 1 230,00 zł" and friends — the first amount after the label.
  outer: for (const label of GROSS_LABELS) {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(label)
      if (!m) continue
      const rest = lines[i].slice((m.index ?? 0) + m[0].length)
      const amounts = amountsIn(rest)
      const next = amountsIn(lines[i + 1] ?? '')
      const candidate = amounts.length ? amounts[amounts.length > 2 ? amounts.length - 1 : 0] : next[0]
      if (candidate != null && candidate > 0) {
        gross = candidate
        break outer
      }
    }
  }

  // 2) The "Razem" row of the items table: net, VAT, gross — gross is the biggest, net + VAT = gross.
  for (const line of lines) {
    if (!TOTAL_ROW_LABEL.test(line)) continue
    const amounts = amountsIn(line)
    if (amounts.length >= 3) {
      const [a, b, c] = amounts.slice(-3)
      if (a + b === c) {
        net = a
        gross ??= c
        break
      }
    }
    if (amounts.length && gross == null) gross = Math.max(...amounts)
  }

  // 3) Net total on its own line.
  if (net == null) {
    const m = text.match(/(?:razem|warto[śs][ćc]|suma)\s+netto[^\n\d-]*([-\d][\d .,]*\d)/i)
    if (m) net = amountsIn(m[1])[0] ?? null
  }

  // 4) Last resort: the largest amount written with a currency.
  if (gross == null) {
    const withCurrency = [...text.matchAll(new RegExp(`(${AMOUNT_RE.source})\\s*(zł|pln)`, 'gi'))]
      .map((m) => parseMoney(m[1]))
      .filter((v): v is number => v != null)
    if (withCurrency.length) gross = Math.max(...withCurrency)
  }

  if (net != null && gross != null && net > gross) net = null
  return { gross, net }
}
