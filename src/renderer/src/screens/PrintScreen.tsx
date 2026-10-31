/**
 * Printing invoices for a chosen period, either as the full list or as a one-page summary
 * (totals per day or month, per category and per supplier) — a year of invoices would otherwise
 * run to dozens of pages. The page shows exactly what will be printed; "Drukuj" opens the normal
 * Windows print dialog (where "Microsoft Print to PDF" also works).
 */

import { useState } from 'react'
import { daysBetween, formatDate, formatMonthKey, today } from '@shared/dates'
import { formatMoney } from '@shared/money'
import { formatNip } from '@shared/nip'
import { printRanges, type PrintRange, type PrintRangeId } from '@shared/printRanges'
import { paymentMethodLabel, sumAmounts, topWithRest, totalsBy, totalsByPeriod, type GroupTotal } from '@shared/summary'
import type { Invoice } from '@shared/types'
import type { AppData } from '../useAppData'
import { INVOICES, PAGES, plural } from '../lib/plural'

type Layout = 'detailed' | 'summary'

/** Long periods print as a summary by default; the user can always switch. */
const defaultLayout = (id: PrintRangeId): Layout => (id === 'lastQuarter' || id === 'thisYear' ? 'summary' : 'detailed')

/** Rough number of A4 pages the full list needs (about 25 rows a page — rows with a NIP take two lines). */
const estimatePages = (rows: number) => Math.max(1, Math.ceil((rows + 6) / 25))

export function PrintScreen({ data }: { data: AppData }) {
  const ranges = printRanges(today())
  const [rangeId, setRangeId] = useState<PrintRangeId>('last10Days')
  const [layout, setLayout] = useState<Layout>(defaultLayout('last10Days'))
  const range = ranges.find((r) => r.id === rangeId)!

  const rows = data.invoices
    .filter((i) => i.issueDate >= range.from && i.issueDate <= range.to)
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate) || a.id - b.id)

  return (
    <div className="screen" style={{ maxWidth: 1100 }}>
      <div className="no-print">
        <div className="screen-header">
          <div>
            <h1>Do druku</h1>
            <p className="subtitle">Wybierz okres i rodzaj wydruku, sprawdź zestawienie poniżej i kliknij „Drukuj”.</p>
          </div>
        </div>
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="btn-row">
            {ranges.map((r) => (
              <button
                key={r.id}
                className={`btn ${r.id === rangeId ? 'btn-primary' : ''}`}
                onClick={() => {
                  setRangeId(r.id)
                  setLayout(defaultLayout(r.id))
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
          <p style={{ margin: '16px 0' }}>
            Od <strong>{formatDate(range.from)}</strong> do <strong>{formatDate(range.to)}</strong>: {plural(rows.length, INVOICES)} na łączną kwotę{' '}
            <strong>{formatMoney(sumAmounts(rows))}</strong>.
          </p>
          <div className="field">
            <span className="label">Rodzaj wydruku</span>
            <div className="choice-group" role="radiogroup">
              <label className={`choice ${layout === 'summary' ? 'selected' : ''}`}>
                <input type="radio" name="layout" checked={layout === 'summary'} onChange={() => setLayout('summary')} />
                📄 Skrócony — na jednej kartce
              </label>
              <label className={`choice ${layout === 'detailed' ? 'selected' : ''}`}>
                <input type="radio" name="layout" checked={layout === 'detailed'} onChange={() => setLayout('detailed')} />
                📚 Wszystkie faktury{rows.length > 0 && ` — ok. ${plural(estimatePages(rows.length), PAGES)}`}
              </label>
            </div>
          </div>
          <button className="btn btn-primary btn-large" disabled={rows.length === 0} onClick={() => window.print()}>
            🖨 Drukuj
          </button>
        </div>
      </div>

      {layout === 'summary' ? <SummarySheet rows={rows} range={range} /> : <DetailedSheet rows={rows} range={range} />}
    </div>
  )
}

function SheetHeader({ title, range }: { title: string; range: PrintRange }) {
  return (
    <header className="print-header">
      <div>
        <h2>{title}</h2>
        <div>
          {range.label}: od {formatDate(range.from)} do {formatDate(range.to)}
        </div>
      </div>
      <div className="muted">Wydrukowano {formatDate(today())}</div>
    </header>
  )
}

/** Every invoice of the period, one per row, with totals at the end. */
function DetailedSheet({ rows, range }: { rows: Invoice[]; range: PrintRange }) {
  const withoutMethod = rows.filter((i) => !i.paymentMethod)
  return (
    <article className="print-sheet">
      <SheetHeader title="Zestawienie faktur" range={range} />

      {rows.length === 0 ? (
        <p className="muted">W tym okresie nie ma żadnych faktur.</p>
      ) : (
        <table className="print-table">
          <thead>
            <tr>
              <th>Lp.</th>
              <th>Data</th>
              <th>Dostawca</th>
              <th>Nr faktury</th>
              <th>Kategoria</th>
              <th>Płatność</th>
              <th className="num">Kwota</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((inv, i) => (
              <tr key={inv.id}>
                <td>{i + 1}</td>
                <td>{formatDate(inv.issueDate)}</td>
                <td>
                  {inv.supplierName || (inv.kind === 'note' ? 'Notatka' : '—')}
                  {inv.supplierNip && <div className="print-small">NIP {formatNip(inv.supplierNip)}</div>}
                </td>
                <td>{inv.number}</td>
                <td>{inv.categoryName}</td>
                <td>{inv.paymentMethod ? paymentMethodLabel(inv.paymentMethod) : ''}</td>
                <td className="num">{formatMoney(inv.grossAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {rows.length > 0 && (
        <table className="print-totals">
          <tbody>
            <tr className="grand">
              <td>Razem ({plural(rows.length, INVOICES)})</td>
              <td className="num">{formatMoney(sumAmounts(rows))}</td>
            </tr>
            <tr>
              <td>w tym przelewem</td>
              <td className="num">{formatMoney(sumAmounts(rows.filter((i) => i.paymentMethod === 'transfer')))}</td>
            </tr>
            <tr>
              <td>w tym gotówką</td>
              <td className="num">{formatMoney(sumAmounts(rows.filter((i) => i.paymentMethod === 'cash')))}</td>
            </tr>
            {withoutMethod.length > 0 && (
              <tr>
                <td>bez podanej formy płatności</td>
                <td className="num">{formatMoney(sumAmounts(withoutMethod))}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </article>
  )
}

/** One A4 page: totals per day (short periods) or per month (long ones), per category and per supplier. */
function SummarySheet({ rows, range }: { rows: Invoice[]; range: PrintRange }) {
  const byMonth = daysBetween(range.from, range.to) > 31
  const periods = totalsByPeriod(rows, byMonth ? 'month' : 'day')
  // "Usługi (księgowa, ochrona, internet)" -> "Usługi": the explanation in brackets doesn't fit on one line.
  const categories = topWithRest(totalsBy(rows, (i) => i.categoryName.replace(/\s*\(.*\)$/, '') || 'Bez kategorii'), 9)
  const suppliers = topWithRest(totalsBy(rows, (i) => i.supplierName), 10)

  return (
    <article className="print-sheet print-compact">
      <SheetHeader title="Podsumowanie faktur" range={range} />

      {rows.length === 0 ? (
        <p className="muted">W tym okresie nie ma żadnych faktur.</p>
      ) : (
        <>
          <div className="print-kpis">
            <div>
              <span>Razem</span>
              <strong>{formatMoney(sumAmounts(rows))}</strong>
              <span className="print-small">{plural(rows.length, INVOICES)}</span>
            </div>
            <div>
              <span>Gotówką</span>
              <strong>{formatMoney(sumAmounts(rows.filter((i) => i.paymentMethod === 'cash')))}</strong>
            </div>
            <div>
              <span>Przelewem</span>
              <strong>{formatMoney(sumAmounts(rows.filter((i) => i.paymentMethod === 'transfer')))}</strong>
            </div>
          </div>

          <div className="print-columns">
            <table className="print-table">
              <thead>
                <tr>
                  <th>{byMonth ? 'Miesiąc' : 'Dzień'}</th>
                  <th className="num">Faktur</th>
                  <th className="num">Gotówka</th>
                  <th className="num">Przelew</th>
                  <th className="num">Razem</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.key}>
                    <td>{byMonth ? formatMonthKey(p.key) : formatDate(p.key)}</td>
                    <td className="num">{p.count}</td>
                    <td className="num">{formatMoney(p.cash)}</td>
                    <td className="num">{formatMoney(p.transfer)}</td>
                    <td className="num">
                      <strong>{formatMoney(p.total)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div>
              <GroupTable title="Według kategorii" groups={categories} />
              <GroupTable title="Najwięcej u dostawców" groups={suppliers} />
            </div>
          </div>
        </>
      )}
    </article>
  )
}

function GroupTable({ title, groups }: { title: string; groups: GroupTotal[] }) {
  return (
    <table className="print-table print-group">
      <thead>
        <tr>
          <th>{title}</th>
          <th className="num">Faktur</th>
          <th className="num">Kwota</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((g) => (
          <tr key={g.name}>
            <td>{g.name}</td>
            <td className="num">{g.count}</td>
            <td className="num">{formatMoney(g.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
