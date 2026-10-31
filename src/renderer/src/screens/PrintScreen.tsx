/**
 * A printable list of invoices for a chosen period. The page shows exactly what will be printed;
 * "Drukuj" opens the normal Windows print dialog (where "Microsoft Print to PDF" also works).
 */

import { useState } from 'react'
import { formatDate, today } from '@shared/dates'
import { formatMoney } from '@shared/money'
import { formatNip } from '@shared/nip'
import { printRanges, type PrintRangeId } from '@shared/printRanges'
import { paymentMethodLabel, sumAmounts } from '@shared/summary'
import type { AppData } from '../useAppData'
import { INVOICES, plural } from '../lib/plural'

export function PrintScreen({ data }: { data: AppData }) {
  const ranges = printRanges(today())
  const [rangeId, setRangeId] = useState<PrintRangeId>('last10Days')
  const range = ranges.find((r) => r.id === rangeId)!

  const rows = data.invoices
    .filter((i) => i.issueDate >= range.from && i.issueDate <= range.to)
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate) || a.id - b.id)
  const withoutMethod = rows.filter((i) => !i.paymentMethod)

  return (
    <div className="screen" style={{ maxWidth: 1100 }}>
      <div className="no-print">
        <div className="screen-header">
          <div>
            <h1>Do druku</h1>
            <p className="subtitle">Wybierz okres, sprawdź zestawienie poniżej i kliknij „Drukuj”.</p>
          </div>
        </div>
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="btn-row">
            {ranges.map((r) => (
              <button key={r.id} className={`btn ${r.id === rangeId ? 'btn-primary' : ''}`} onClick={() => setRangeId(r.id)}>
                {r.label}
              </button>
            ))}
          </div>
          <p style={{ margin: '16px 0' }}>
            Od <strong>{formatDate(range.from)}</strong> do <strong>{formatDate(range.to)}</strong>: {plural(rows.length, INVOICES)} na łączną kwotę{' '}
            <strong>{formatMoney(sumAmounts(rows))}</strong>.
          </p>
          <button className="btn btn-primary btn-large" disabled={rows.length === 0} onClick={() => window.print()}>
            🖨 Drukuj
          </button>
        </div>
      </div>

      <article className="print-sheet">
        <header className="print-header">
          <div>
            <h2>Zestawienie faktur</h2>
            <div>
              {range.label}: od {formatDate(range.from)} do {formatDate(range.to)}
            </div>
          </div>
          <div className="muted">Wydrukowano {formatDate(today())}</div>
        </header>

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
    </div>
  )
}
