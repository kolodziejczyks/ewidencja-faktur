/** The "notebook": all invoices grouped by month, newest first, with a search box and simple filters. */

import { useMemo, useState } from 'react'
import { formatDate, formatMonthKey, monthKey, inMonthPhrase, shiftMonth } from '@shared/dates'
import { formatMoney } from '@shared/money'
import { normalizeNip } from '@shared/nip'
import { percentChange, totalsByMonth } from '@shared/summary'
import type { Invoice } from '@shared/types'
import type { AppData } from '../useAppData'
import { Notice, Pill } from '../components/Common'
import { flagLabel, paymentStatus } from '../lib/flags'
import { ENTRIES, INVOICES, plural } from '../lib/plural'

type Filter = 'all' | 'unpaid' | 'overdue'

interface Props {
  data: AppData
  onOpenInvoice: (id: number) => void
  onAdd: () => void
  onOpenSettings: () => void
  backupWarning: string | null
}

function matches(inv: Invoice, query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase().trim()
  const digits = q.replace(/[\s,.-]/g, '')
  const haystack = [inv.supplierName, inv.number, inv.note, inv.categoryName, formatDate(inv.issueDate)].join(' ').toLowerCase()
  if (haystack.includes(q)) return true
  // "625,80", "625.80" or "62580" all find an invoice for 625,80 zł; digits also match the NIP.
  if (digits && /^\d+$/.test(digits)) {
    if (inv.grossAmount != null && String(inv.grossAmount).startsWith(digits.length > 2 ? digits : digits + '00')) return true
    if (normalizeNip(inv.supplierNip).includes(digits)) return true
  }
  return false
}

export function LedgerScreen({ data, onOpenInvoice, onAdd, onOpenSettings, backupWarning }: Props) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [year, setYear] = useState<string>('all')
  const { invoices } = data

  const years = useMemo(() => [...new Set(invoices.map((i) => i.issueDate.slice(0, 4)))].sort().reverse(), [invoices])
  const allMonthTotals = useMemo(() => totalsByMonth(invoices), [invoices])

  const visible = invoices.filter(
    (inv) =>
      matches(inv, query) &&
      (year === 'all' || inv.issueDate.startsWith(year)) &&
      (filter === 'all' ||
        (filter === 'unpaid' && inv.kind === 'invoice' && !inv.paid) ||
        (filter === 'overdue' && inv.flags.some((f) => f.type === 'overdue')))
  )

  const months = new Map<string, Invoice[]>()
  for (const inv of visible) months.set(monthKey(inv.issueDate), [...(months.get(monthKey(inv.issueDate)) ?? []), inv])

  const overdue = invoices.filter((i) => i.flags.some((f) => f.type === 'overdue'))
  const dueSoon = invoices.filter((i) => i.flags.some((f) => f.type === 'dueSoon'))
  const isFiltered = query || filter !== 'all' || year !== 'all'

  return (
    <div className="screen">
      <div className="screen-header">
        <div>
          <h1>Faktury</h1>
          <p className="subtitle">Wszystkie wpisy, od najnowszych. Kliknij wpis, aby go obejrzeć lub poprawić.</p>
        </div>
      </div>

      {backupWarning && (
        <Notice tone="warn" icon="💾">
          {backupWarning}
        </Notice>
      )}
      {overdue.length > 0 && (
        <Notice tone="bad" icon="⏰">
          <strong>Po terminie płatności: {plural(overdue.length, INVOICES)}</strong>{' '}
          — razem {formatMoney(overdue.reduce((s, i) => s + (i.grossAmount ?? 0), 0))}.{' '}
          <button className="btn btn-small" onClick={() => setFilter('overdue')}>
            Pokaż je
          </button>
        </Notice>
      )}
      {dueSoon.length > 0 && (
        <Notice tone="warn" icon="⏳">
          <strong>Do zapłaty w najbliższych dniach:</strong>{' '}
          {dueSoon.map((i) => `${i.supplierName} (${formatMoney(i.grossAmount)}, do ${formatDate(i.dueDate)})`).join('; ')}
        </Notice>
      )}
      {data.loaded && !data.settings?.ownNip && invoices.length < 3 && (
        <Notice tone="info" icon="💡">
          Wpisz NIP sklepu w <button className="btn btn-small" onClick={onOpenSettings}>Ustawieniach</button> — dzięki temu program lepiej
          odczytuje faktury.
        </Notice>
      )}

      {invoices.length > 0 && (
        <div className="toolbar">
          <div className="search">
            <input
              className="input"
              type="search"
              placeholder="Szukaj: dostawca, numer, kwota…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Szukaj"
            />
          </div>
          <div className="segmented" role="group" aria-label="Pokaż">
            {(
              [
                ['all', 'Wszystkie'],
                ['unpaid', 'Do zapłaty'],
                ['overdue', 'Po terminie']
              ] as const
            ).map(([key, label]) => (
              <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>
                {label}
              </button>
            ))}
          </div>
          {years.length > 1 && (
            <select className="input" style={{ width: 'auto' }} value={year} onChange={(e) => setYear(e.target.value)} aria-label="Rok">
              <option value="all">Wszystkie lata</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  Rok {y}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {data.loaded && invoices.length === 0 && (
        <div className="card empty">
          <div className="empty-icon">📒</div>
          <h2>Zeszyt jest jeszcze pusty</h2>
          <p>Dodaj pierwszą fakturę — wystarczy przeciągnąć plik albo go wybrać.</p>
          <button className="btn btn-primary btn-large" onClick={onAdd}>
            ➕ Dodaj fakturę
          </button>
        </div>
      )}

      {invoices.length > 0 && visible.length === 0 && (
        <div className="card empty">
          <div className="empty-icon">🔍</div>
          <p>Nic nie pasuje do wyszukiwania.</p>
          {isFiltered && (
            <button
              className="btn"
              onClick={() => {
                setQuery('')
                setFilter('all')
                setYear('all')
              }}
            >
              Pokaż wszystko
            </button>
          )}
        </div>
      )}

      {[...months.entries()].map(([month, items]) => {
        const total = items.reduce((s, i) => s + (i.grossAmount ?? 0), 0)
        const prevKey = shiftMonth(month, -1)
        const prev = allMonthTotals.get(prevKey)?.total ?? 0
        const change = isFiltered ? null : percentChange(total, prev)
        return (
          <section key={month} className="month">
            <div className="month-header">
              <h2>{formatMonthKey(month)}</h2>
              <div>
                <span className="muted">{plural(items.length, ENTRIES)} · razem </span>
                <span className="month-total">{formatMoney(total)}</span>
                {change != null && change !== 0 && (
                  <span className="month-compare">
                    <span className={change > 0 ? 'up' : 'down'}>
                      {change > 0 ? '▲' : '▼'} {Math.abs(change)}%
                    </span>{' '}
                    {change > 0 ? 'więcej' : 'mniej'} niż {inMonthPhrase(prevKey)}
                  </span>
                )}
              </div>
            </div>
            {items.map((inv) => (
              <InvoiceRow key={inv.id} invoice={inv} onOpen={() => onOpenInvoice(inv.id)} />
            ))}
          </section>
        )
      })}
    </div>
  )
}

function InvoiceRow({ invoice: inv, onOpen }: { invoice: Invoice; onOpen: () => void }) {
  const status = paymentStatus(inv)
  return (
    <button className="entry" onClick={onOpen}>
      <span className="entry-date">{formatDate(inv.issueDate)}</span>
      <span>
        <div className="entry-title">
          {inv.kind === 'note' && '📝 '}
          {inv.supplierName || (inv.kind === 'note' ? 'Notatka' : 'Bez dostawcy')}
        </div>
        <div className="entry-meta">
          {inv.number && <span>nr {inv.number}</span>}
          {inv.categoryName && <span>· {inv.categoryName}</span>}
          {inv.files.length > 0 && <span>· 📎 {inv.files.length === 1 ? 'plik' : `${inv.files.length} pliki`}</span>}
          {inv.note && <span>· „{inv.note.slice(0, 50)}{inv.note.length > 50 ? '…' : ''}”</span>}
        </div>
      </span>
      <span className="entry-amount">{formatMoney(inv.grossAmount)}</span>
      <span className="entry-status">
        {status && (
          <Pill tone={status.tone} icon={status.icon}>
            {status.text}
          </Pill>
        )}
        {inv.flags.map((f, i) => {
          const l = flagLabel(f)
          return (
            <Pill key={i} tone={l.tone} icon={l.icon}>
              {l.text}
            </Pill>
          )
        })}
      </span>
    </button>
  )
}
