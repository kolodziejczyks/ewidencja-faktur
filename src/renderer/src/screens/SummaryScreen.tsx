/**
 * Summary of costs for a chosen month, quarter or year: headline numbers compared with the period
 * before and the same period a year earlier, a 12-month chart compared with the year before, where
 * the money went (suppliers, categories) and what changed since the previous period.
 */

import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatMonthKey, MONTH_NAMES_SHORT, shiftMonth, today } from '@shared/dates'
import { formatMoney } from '@shared/money'
import {
  inPeriodPhrase,
  invoicesInPeriod,
  lastDayOf,
  lastMonthOf,
  periodLabel,
  periodName,
  periodOf,
  shiftPeriod,
  yearBefore,
  type Period,
  type PeriodKind
} from '@shared/periods'
import { compareSuppliers, monthSeries, percentChange, sumAmounts, totalsBy } from '@shared/summary'
import type { AppData } from '../useAppData'
import { INVOICES, plural } from '../lib/plural'

const shortMonth = (key: string) => `${MONTH_NAMES_SHORT[Number(key.slice(5)) - 1]} ${key.slice(2, 4)}`
const zl = (grosze: number) => `${Math.round(grosze / 100).toLocaleString('pl-PL')} zł`

const KINDS: { kind: PeriodKind; label: string; previous: string; since: string }[] = [
  { kind: 'month', label: 'Miesiąc', previous: 'Miesiąc wcześniej', since: 'poprzedniego miesiąca' },
  { kind: 'quarter', label: 'Kwartał', previous: 'Kwartał wcześniej', since: 'poprzedniego kwartału' },
  { kind: 'year', label: 'Rok', previous: 'Rok wcześniej', since: 'poprzedniego roku' }
]

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
  const [period, setPeriod] = useState<Period>(periodOf('month', today()))
  const { invoices } = data
  const kind = KINDS.find((k) => k.kind === period.kind)!

  // Switching e.g. from "Rok 2025" to months lands on December 2025; within the current year, on today's month.
  const switchKind = (next: PeriodKind) => {
    const end = lastDayOf(period)
    setPeriod(periodOf(next, end < today() ? end : today()))
  }

  const previous = shiftPeriod(period, -1)
  const yearAgo = yearBefore(period)
  const inPeriod = useMemo(() => invoicesInPeriod(invoices, period), [invoices, period])
  const inPrevious = invoicesInPeriod(invoices, previous)
  const current = sumAmounts(inPeriod)
  const byMethod = (method: 'transfer' | 'cash') => sumAmounts(inPeriod.filter((i) => i.paymentMethod === method))

  const lastMonth = lastMonthOf(period)
  const chartData = useMemo(() => {
    const thisYear = monthSeries(invoices, lastMonth, 12)
    const lastYear = monthSeries(invoices, shiftMonth(lastMonth, -12), 12)
    return thisYear.map((m, i) => ({ label: shortMonth(m.month), month: m.month, current: m.total, previous: lastYear[i].total }))
  }, [invoices, lastMonth])
  const hasLastYear = chartData.some((d) => d.previous > 0)

  const bySupplier = totalsBy(inPeriod, (i) => i.supplierName)
  const byCategory = totalsBy(inPeriod, (i) => i.categoryName || 'Bez kategorii')
  const comparison = compareSuppliers(inPrevious, inPeriod).filter((r) => r.diff !== 0)
  const empty = 'Brak faktur w tym okresie.'

  return (
    <div className="screen">
      <div className="screen-header">
        <div>
          <h1>Podsumowanie</h1>
          <p className="subtitle">Ile kosztował wybrany okres i jak wypada na tle poprzednich.</p>
        </div>
        <div className="period-picker">
          <div className="segmented" role="radiogroup" aria-label="Okres">
            {KINDS.map((k) => (
              <button key={k.kind} role="radio" aria-checked={k.kind === period.kind} className={k.kind === period.kind ? 'active' : ''} onClick={() => switchKind(k.kind)}>
                {k.label}
              </button>
            ))}
          </div>
          <div className="month-picker">
            <button className="btn" onClick={() => setPeriod(previous)} aria-label="Poprzedni okres">
              ◀
            </button>
            <span className="current">{periodLabel(period)}</span>
            <button className="btn" onClick={() => setPeriod(shiftPeriod(period, 1))} aria-label="Następny okres">
              ▶
            </button>
          </div>
        </div>
      </div>

      <div className="stats">
        <div className="card">
          <div className="stat-label">Koszty — {periodName(period)}</div>
          <div className="stat-value">{formatMoney(current)}</div>
          <div className="stat-note">{plural(inPeriod.length, INVOICES)}</div>
          <Change current={current} previous={sumAmounts(inPrevious)} against={inPeriodPhrase(previous)} />
        </div>
        <div className="card">
          <div className="stat-label">
            {kind.previous} — {periodName(previous)}
          </div>
          <div className="stat-value">{formatMoney(sumAmounts(inPrevious))}</div>
          <span className="stat-note">{plural(inPrevious.length, INVOICES)}</span>
        </div>
        {period.kind !== 'year' && (
          <div className="card">
            <div className="stat-label">Rok wcześniej — {periodName(yearAgo)}</div>
            <div className="stat-value">{formatMoney(sumAmounts(invoicesInPeriod(invoices, yearAgo)))}</div>
            <Change current={current} previous={sumAmounts(invoicesInPeriod(invoices, yearAgo))} against="rok temu" />
          </div>
        )}
        <div className="card">
          <div className="stat-label">Jak zapłacono — {periodName(period)}</div>
          <div className="stat-note" style={{ fontSize: '1.05rem', marginTop: 6 }}>
            🏦 Przelewem: <strong>{formatMoney(byMethod('transfer'))}</strong>
          </div>
          <div className="stat-note" style={{ fontSize: '1.05rem', marginTop: 4 }}>
            💵 Gotówką: <strong>{formatMoney(byMethod('cash'))}</strong>
          </div>
        </div>
      </div>

      <div className="card chart-card">
        <h2>
          Koszty miesiąc po miesiącu:{' '}
          {period.kind === 'year'
            ? periodName(period)
            : `${formatMonthKey(shiftMonth(lastMonth, -11)).toLowerCase()} – ${formatMonthKey(lastMonth).toLowerCase()}`}
        </h2>
        <div className="legend" aria-hidden>
          <span>
            <span className="legend-swatch" style={{ background: 'var(--series-1)' }} />
            {period.kind === 'year' ? periodLabel(period) : 'Ostatnie 12 miesięcy'}
          </span>
          {hasLastYear && (
            <span>
              <span className="legend-swatch" style={{ background: 'var(--series-muted)' }} />
              {period.kind === 'year' ? periodLabel(previous) : 'Rok wcześniej'}
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
          <h2>U kogo najwięcej — {periodName(period)}</h2>
          <BarList rows={bySupplier.slice(0, 8)} empty={empty} />
        </div>
        <div className="card">
          <h2>Na co — według kategorii</h2>
          <BarList rows={byCategory} empty={empty} />
        </div>
      </div>

      <div className="card">
        <h2>Co się zmieniło od {kind.since}</h2>
        {comparison.length === 0 ? (
          <p className="muted">Brak różnic do pokazania.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Dostawca</th>
                <th className="num">{periodLabel(previous)}</th>
                <th className="num">{periodLabel(period)}</th>
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
