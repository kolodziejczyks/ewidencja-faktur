/**
 * Bulk import of invoices from a CSV file — used to bring in history, e.g. transcribed from the
 * paper notebook. The file is checked row by row before anything is saved, so the preview can
 * show what will be added, what is skipped as a duplicate and what has to be fixed first.
 *
 * Format (see docs/IMPORT.md): a header row, then one invoice per row. Columns are matched by
 * name, in any order; ";" (Polish Excel), "," and tab separators are all accepted.
 */

import { isValidIsoDate } from './dates'
import { normalizeInvoiceNumber } from './insights'
import { parseMoney } from './money'
import { isValidNip, normalizeNip } from './nip'
import type { Category, Invoice, InvoiceInput, PaymentMethod } from './types'

type Field = 'issueDate' | 'supplierName' | 'supplierNip' | 'number' | 'gross' | 'paymentMethod' | 'category' | 'dueDate' | 'note'

/** Accepted header names for each field, written without Polish letters and spaces. */
const HEADER_ALIASES: Record<Field, string[]> = {
  issueDate: ['data', 'datawystawienia', 'datafaktury'],
  supplierName: ['dostawca', 'kontrahent', 'sprzedawca', 'odkogo', 'firma'],
  supplierNip: ['nip', 'nipdostawcy'],
  number: ['numer', 'nr', 'nrfaktury', 'numerfaktury'],
  gross: ['kwota', 'brutto', 'kwotabrutto', 'wartosc', 'suma'],
  paymentMethod: ['formaplatnosci', 'platnosc', 'forma', 'sposobplatnosci'],
  category: ['kategoria'],
  dueDate: ['termin', 'terminplatnosci'],
  note: ['uwagi', 'notatka', 'opis']
}

const REQUIRED: Field[] = ['issueDate', 'gross']

export const IMPORT_TEMPLATE = [
  'data;dostawca;nip;numer;kwota;forma_platnosci;kategoria;termin;uwagi',
  '03.09.2026;Hurtownia Spożywcza SMAK;525-000-12-04;FV/2026/09/0101;1 250,40;przelew;Towar do sklepu;17.09.2026;',
  '05.09.2026;Piekarnia Kłos;;P/811/2026;437,85;gotówka;Towar do sklepu;;zapłacone kierowcy'
].join('\r\n')

export type Duplicate = { kind: 'existing'; invoiceId: number } | { kind: 'file'; line: number }

export interface ImportRow {
  /** Line in the file (the header is line 1), so problems can be found in Excel. */
  line: number
  input: InvoiceInput | null
  /** Reasons the row cannot be imported. */
  problems: string[]
  /** The row can be imported, but something was left out or looks odd. */
  warnings: string[]
  duplicate: Duplicate | null
}

export interface ImportPlan {
  /** Set when the file as a whole cannot be read (e.g. no "kwota" column). */
  error: string | null
  rows: ImportRow[]
}

// ---------- reading the file ----------

/** Excel saves "CSV UTF-8" with a BOM, but plain "CSV" in the Windows-1250 code page. */
export function decodeCsv(bytes: Uint8Array): string {
  const utf8 = new TextDecoder('utf-8').decode(bytes)
  const text = utf8.includes('\uFFFD') ? new TextDecoder('windows-1250').decode(bytes) : utf8
  return text.replace(/^\uFEFF/, '')
}

/** Minimal RFC 4180 parser: quoted fields may contain separators, quotes ("") and line breaks. */
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0]
  const separator = [';', '\t', ','].reduce((best, s) => (firstLine.split(s).length > firstLine.split(best).length ? s : best), ';')

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"' && field === '') quoted = true
    else if (c === separator) {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

// ---------- interpreting rows ----------

function simplify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]/g, '')
}

/** "3.9.2026", "03.09.26", "2026-09-03", "03/09/2026" -> "2026-09-03" */
export function parseLooseDate(text: string): string | null {
  const s = text.trim()
  let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/)
  if (m) return checked(m[1], m[2], m[3])
  m = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{2}|\d{4})$/)
  if (m) return checked(m[3].length === 2 ? `20${m[3]}` : m[3], m[2], m[1])
  return null
}

function checked(y: string, m: string, d: string): string | null {
  const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  return isValidIsoDate(iso) ? iso : null
}

function parsePaymentMethod(text: string): PaymentMethod | null | undefined {
  const s = simplify(text)
  if (!s) return null
  if (s.startsWith('p')) return 'transfer'
  if (s.startsWith('g')) return 'cash'
  return undefined
}

type ExistingInvoice = Pick<Invoice, 'id' | 'supplierName' | 'number' | 'issueDate' | 'grossAmount'>

function duplicateKeys(supplier: string, number: string, date: string, gross: number): string[] {
  const s = simplify(supplier)
  const keys = [`${s}|${date}|${gross}`]
  const n = normalizeInvoiceNumber(number)
  if (n) keys.push(`${s}|#${n}`)
  return keys
}

export function buildImportPlan(table: string[][], categories: Category[], existing: ExistingInvoice[]): ImportPlan {
  const [header = [], ...body] = table
  const columns = new Map<Field, number>()
  header.forEach((name, index) => {
    const key = simplify(name)
    const field = (Object.keys(HEADER_ALIASES) as Field[]).find((f) => HEADER_ALIASES[f].includes(key))
    if (field && !columns.has(field)) columns.set(field, index)
  })
  const missing = REQUIRED.filter((f) => !columns.has(f))
  if (missing.length) {
    const names = missing.map((f) => HEADER_ALIASES[f][0]).join(', ')
    return { error: `W pierwszym wierszu pliku brakuje kolumny: ${names}. Pobierz wzór pliku i porównaj nagłówki.`, rows: [] }
  }

  const categoryByName = new Map(categories.map((c) => [simplify(c.name), c]))
  const existingKeys = new Map<string, number>()
  for (const inv of existing) {
    if (inv.grossAmount == null) continue
    for (const k of duplicateKeys(inv.supplierName, inv.number, inv.issueDate, inv.grossAmount)) existingKeys.set(k, inv.id)
  }
  const fileKeys = new Map<string, number>()

  const rows: ImportRow[] = []
  body.forEach((cells, i) => {
    const line = i + 2
    const get = (f: Field) => (columns.has(f) ? (cells[columns.get(f)!] ?? '').trim() : '')
    if (cells.every((c) => !c.trim())) return // empty line

    const problems: string[] = []
    const warnings: string[] = []

    const issueDate = parseLooseDate(get('issueDate'))
    if (!issueDate) problems.push(get('issueDate') ? `Nie rozumiem daty „${get('issueDate')}”.` : 'Brak daty.')
    const gross = parseMoney(get('gross'))
    if (gross == null) problems.push(get('gross') ? `Nie rozumiem kwoty „${get('gross')}”.` : 'Brak kwoty.')

    const supplierName = get('supplierName')
    if (!supplierName) warnings.push('Brak dostawcy.')

    let supplierNip = normalizeNip(get('supplierNip'))
    if (supplierNip && !isValidNip(supplierNip)) {
      warnings.push(`NIP „${get('supplierNip')}” ma błąd — pominięto go.`)
      supplierNip = ''
    }

    const paymentMethod = parsePaymentMethod(get('paymentMethod'))
    if (paymentMethod === undefined) warnings.push(`Nieznana forma płatności „${get('paymentMethod')}” — pominięto ją.`)

    let categoryId: number | null = null
    if (get('category')) {
      const category = categoryByName.get(simplify(get('category')))
      if (category) categoryId = category.id
      else warnings.push(`Nie ma kategorii „${get('category')}” — wpis będzie bez kategorii.`)
    }

    let dueDate: string | null = null
    if (get('dueDate')) {
      dueDate = parseLooseDate(get('dueDate'))
      if (!dueDate) warnings.push(`Nie rozumiem terminu „${get('dueDate')}” — pominięto go.`)
    }

    if (problems.length) {
      rows.push({ line, input: null, problems, warnings, duplicate: null })
      return
    }

    const number = get('number')
    const keys = duplicateKeys(supplierName, number, issueDate!, gross!)
    const existingId = keys.map((k) => existingKeys.get(k)).find((id) => id != null)
    const earlierLine = keys.map((k) => fileKeys.get(k)).find((l) => l != null)
    const duplicate: Duplicate | null =
      existingId != null ? { kind: 'existing', invoiceId: existingId } : earlierLine != null ? { kind: 'file', line: earlierLine } : null
    for (const k of keys) if (!fileKeys.has(k)) fileKeys.set(k, line)

    rows.push({
      line,
      problems,
      warnings,
      duplicate,
      input: {
        kind: 'invoice',
        number,
        supplierName,
        supplierNip,
        issueDate: issueDate!,
        dueDate,
        grossAmount: gross!,
        netAmount: null,
        categoryId,
        paymentMethod: paymentMethod ?? null,
        note: get('note'),
        fileIds: []
      }
    })
  })
  return { error: rows.length ? null : 'Plik nie zawiera żadnych faktur.', rows }
}
