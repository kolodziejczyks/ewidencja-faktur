/**
 * Summary of costs: headline numbers for a chosen month, a 12-month chart compared with the
 * year before, where the money went (suppliers, categories) and what changed since last month.
 */

import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatMonthKey, inMonthPhrase, monthKey, MONTH_NAMES_SHORT, shiftMonth, today } from '@shared/dates'
import { formatMoney } from '@shared/money'
import { compareMonths, invoicesInMonth, monthSeries, percentChange, totalsBy } from '@shared/summary'
import type { AppData } from '../useAppData'
import { INVOICES, plural } from '../lib/plural'

const shortMonth = (key: string) => `${MONTH_NAMES_SHORT[Number(key.slice(5)) - 1]} ${key.slice(2, 4)}`
const zl = (grosze: number) => `${Math.round(grosze / 100).toLocaleString('pl-PL')} zł`

function Change({ current, previous, against }: { current: number; previous: number; against: string }) {
  const pct = percentChange(current, previous)
  if (pct == null) return <span className="stat-note">brak danych {against}</span>
  if (pct === 0) return <span className="stat-note">tyle samo co {against}</span>
  return (
    <span className="stat-note">
      <span className={pct > 0 ? 'up' : 'down'}>
        {pct > 0 ? '▲' : '▼'} {Math.abs(pct)}% {pct > 0 ? 'więcej' : 'mniej'}
      </span>{' '}
      niż {against}
    </span>
  )
}

export function SummaryScreen({ data }: { data: AppData }) {
  const [month, setMonth] = useState(monthKey(today()))
  const { invoices } = data

  const prevMonth = shiftMonth(month, -1)
  const yearAgo = shiftMonth(month, -12)
  const inMonth = useMemo(() => invoicesInMonth(invoices, month), [invoices, month])
  const total = (key: string) => invoicesInMonth(invoices, key).reduce((s, i) => s + (i.grossAmount ?? 0), 0)
  const current = total(month)
  const unpaid = invoices.filter((i) => i.kind === 'invoice' && !i.paid)

  const chartData = useMemo(() => {
    const thisYear = monthSeries(invoices, month, 12)
    const lastYear = monthSeries(invoices, yearAgo, 12)
    return thisYear.map((m, i) => ({ label: shortMonth(m.month), month: m.month, current: m.total, previous: lastYear[i].total }))
  }, [invoices, month, yearAgo])
  const hasLastYear = chartData.some((d) => d.previous > 0)

  const bySupplier = totalsBy(inMonth, (i) => i.supplierName)
  const byCategory = totalsBy(inMonth, (i) => i.categoryName || 'Bez kategorii')
  const comparison = compareMonths(invoices, prevMonth, month).filter((r) => r.diff !== 0)

  return (
    <div className="screen">
      <div className="screen-header">
        <div>
          <h1>Podsumowanie</h1>
          <p className="subtitle">Ile kosztował wybrany miesiąc i jak wypada na tle poprzednich.</p>
        </div>
        <div className="month-picker">
          <button className="btn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Poprzedni miesiąc">
            ◀
          </button>
          <span className="current">{formatMonthKey(month)}</span>
          <button className="btn" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Następny miesiąc">
            ▶
          </button>
        </div>
      </div>

      <div className="stats">
        <div className="card">
          <div className="stat-label">Koszty — {formatMonthKey(month).toLowerCase()}</div>
          <div className="stat-value">{formatMoney(current)}</div>
          <div className="stat-note">{plural(inMonth.length, INVOICES)}</div>
          <Change current={current} previous={total(prevMonth)} against={inMonthPhrase(prevMonth)} />
        </div>
        <div className="card">
          <div className="stat-label">Miesiąc wcześniej — {formatMonthKey(prevMonth).toLowerCase()}</div>
          <div className="stat-value">{formatMoney(total(prevMonth))}</div>
          <span className="stat-note">{plural(invoicesInMonth(invoices, prevMonth).length, INVOICES)}</span>
        </div>
        <div className="card">
          <div className="stat-label">Rok wcześniej — {formatMonthKey(yearAgo).toLowerCase()}</div>
          <div className="stat-value">{formatMoney(total(yearAgo))}</div>
          <Change current={current} previous={total(yearAgo)} against="rok temu" />
        </div>
        <div className="card">
          <div className="stat-label">Wszystkie niezapłacone</div>
          <div className="stat-value">{formatMoney(unpaid.reduce((s, i) => s + (i.grossAmount ?? 0), 0))}</div>
          <span className="stat-note">{plural(unpaid.length, INVOICES)}</span>
        </div>
      </div>

      <div className="card chart-card">
        <h2>Koszty w ostatnich 12 miesiącach</h2>
        <div className="legend" aria-hidden>
          <span>
            <span className="legend-swatch" style={{ background: 'var(--series-1)' }} />
            Ostatnie 12 miesięcy
          </span>
          {hasLastYear && (
            <span>
              <span className="legend-swatch" style={{ background: 'var(--series-muted)' }} />
              Rok wcześniej
            </span>
          )}
        </div>
        <div style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barGap={2} barCategoryGap="22%" margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid vertical={false} stroke="#ebe8e0" />
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#c4bfb2' }} tick={{ fill: '#4a4945', fontSize: 15 }} />
              <YAxis tickFormatter={zl} tickLine={false} axisLine={false} width={96} tick={{ fill: '#6d6b65', fontSize: 14 }} />
              <Tooltip
                cursor={{ fill: 'rgb(31 95 191 / 6%)' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload as (typeof chartData)[number]
                  return (
                    <div className="chart-tooltip">
                      <strong>{formatMonthKey(d.month)}</strong>
                      <div>{formatMoney(d.current)}</div>
                      {hasLastYear && (
                        <div className="muted">
                          rok wcześniej: {formatMoney(d.previous)}
                        </div>
                      )}
                    </div>
                  )
                }}
              />
              {hasLastYear && <Bar dataKey="previous" fill="var(--series-muted)" radius={[4, 4, 0, 0]} maxBarSize={28} />}
              <Bar dataKey="current" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>U kogo najwięcej — {formatMonthKey(month).toLowerCase()}</h2>
          <BarList rows={bySupplier.slice(0, 8)} empty="Brak faktur w tym miesiącu." />
        </div>
        <div className="card">
          <h2>Na co — według kategorii</h2>
          <BarList rows={byCategory} empty="Brak faktur w tym miesiącu." />
        </div>
      </div>

      <div className="card">
        <h2>Co się zmieniło od poprzedniego miesiąca</h2>
        {comparison.length === 0 ? (
          <p className="muted">Brak różnic do pokazania.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Dostawca</th>
                <th className="num">{formatMonthKey(prevMonth)}</th>
                <th className="num">{formatMonthKey(month)}</th>
                <th className="num">Różnica</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td className="num">{formatMoney(r.a)}</td>
                  <td className="num">{formatMoney(r.b)}</td>
                  <td className="num">
                    <span className={r.diff > 0 ? 'up' : 'down'}>
                      {r.diff > 0 ? '▲ +' : '▼ −'}
                      {formatMoney(Math.abs(r.diff))}
                    </span>
                    {r.percent != null && <span className="muted"> ({r.percent > 0 ? '+' : ''}{r.percent}%)</span>}
                    {r.a === 0 && <span className="muted"> (nowy)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function BarList({ rows, empty }: { rows: { name: string; total: number; count: number }[]; empty: string }) {
  if (rows.length === 0) return <p className="muted">{empty}</p>
  const max = Math.max(...rows.map((r) => r.total), 1)
  return (
    <div className="bar-list">
      {rows.map((r) => (
        <div key={r.name} className="bar-row" title={`${r.name}: ${formatMoney(r.total)} (${plural(r.count, INVOICES)})`}>
          <span>{r.name}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(r.total / max) * 100}%`, display: 'block' }} />
          </span>
          <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(r.total)}</strong>
        </div>
      ))}
    </div>
  )
}
