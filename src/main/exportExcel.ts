/** Excel export of invoices for a date range — one sheet with the list, one with monthly and supplier totals. */

import ExcelJS from 'exceljs'
import { formatDate, formatMonthKey } from '@shared/dates'
import { formatNip } from '@shared/nip'
import { totalsBy, totalsByMonth } from '@shared/summary'
import type { Invoice } from '@shared/types'

const MONEY_FORMAT = '#,##0.00 "zł"'
const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } }

function styleHeader(row: ExcelJS.Row): void {
  row.font = { bold: true }
  row.fill = HEADER_FILL
  row.alignment = { vertical: 'middle' }
  row.height = 22
}

const toZl = (grosze: number | null) => (grosze == null ? null : grosze / 100)

export async function writeExcel(invoices: Invoice[], range: { from: string; to: string }, path: string): Promise<void> {
  const rows = invoices
    .filter((i) => i.issueDate >= range.from && i.issueDate <= range.to)
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate) || a.id - b.id)

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Ewidencja Faktur'
  wb.created = new Date()

  // --- Sheet 1: every invoice ---
  const list = wb.addWorksheet('Faktury', { views: [{ state: 'frozen', ySplit: 1 }] })
  list.columns = [
    { header: 'Lp.', key: 'lp', width: 6 },
    { header: 'Data wystawienia', key: 'issueDate', width: 16 },
    { header: 'Numer faktury', key: 'number', width: 22 },
    { header: 'Dostawca', key: 'supplier', width: 34 },
    { header: 'NIP', key: 'nip', width: 16 },
    { header: 'Kategoria', key: 'category', width: 24 },
    { header: 'Netto', key: 'net', width: 14, style: { numFmt: MONEY_FORMAT } },
    { header: 'Brutto', key: 'gross', width: 14, style: { numFmt: MONEY_FORMAT } },
    { header: 'Termin płatności', key: 'dueDate', width: 16 },
    { header: 'Zapłacona', key: 'paid', width: 12 },
    { header: 'Notatka', key: 'note', width: 40 }
  ]
  styleHeader(list.getRow(1))
  rows.forEach((inv, i) =>
    list.addRow({
      lp: i + 1,
      issueDate: formatDate(inv.issueDate),
      number: inv.number,
      supplier: inv.supplierName,
      nip: inv.supplierNip ? formatNip(inv.supplierNip) : '',
      category: inv.categoryName,
      net: toZl(inv.netAmount),
      gross: toZl(inv.grossAmount),
      dueDate: inv.dueDate ? formatDate(inv.dueDate) : '',
      paid: inv.kind === 'note' ? '' : inv.paid ? 'tak' : 'NIE',
      note: inv.note
    })
  )
  const totalRow = list.addRow({
    supplier: 'RAZEM',
    net: { formula: `SUM(G2:G${rows.length + 1})` },
    gross: { formula: `SUM(H2:H${rows.length + 1})` }
  })
  totalRow.font = { bold: true }
  list.autoFilter = { from: 'A1', to: `K${rows.length + 1}` }

  // --- Sheet 2: totals ---
  const summary = wb.addWorksheet('Podsumowanie')
  summary.columns = [
    { key: 'name', width: 36 },
    { key: 'count', width: 14 },
    { key: 'total', width: 16, style: { numFmt: MONEY_FORMAT } }
  ]
  summary.addRow([`Zestawienie faktur od ${formatDate(range.from)} do ${formatDate(range.to)}`]).font = { bold: true, size: 14 }
  summary.addRow([])

  styleHeader(summary.addRow(['Miesiąc', 'Liczba faktur', 'Suma brutto']))
  for (const m of [...totalsByMonth(rows).values()].sort((a, b) => a.month.localeCompare(b.month))) {
    summary.addRow([formatMonthKey(m.month), m.count, toZl(m.total)])
  }
  summary.addRow([])

  styleHeader(summary.addRow(['Dostawca', 'Liczba faktur', 'Suma brutto']))
  for (const s of totalsBy(rows, (i) => i.supplierName)) summary.addRow([s.name, s.count, toZl(s.total)])
  summary.addRow([])

  styleHeader(summary.addRow(['Kategoria', 'Liczba faktur', 'Suma brutto']))
  for (const c of totalsBy(rows, (i) => i.categoryName)) summary.addRow([c.name, c.count, toZl(c.total)])

  await wb.xlsx.writeFile(path)
}
