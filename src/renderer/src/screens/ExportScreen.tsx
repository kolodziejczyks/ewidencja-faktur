/** Saving a period of invoices to an Excel file, e.g. for the accountant. */

import { useState } from 'react'
import { addDays, formatDate, isValidIsoDate, monthKey, shiftMonth, today } from '@shared/dates'
import { formatMoney } from '@shared/money'
import type { AppData } from '../useAppData'
import { Notice, Spinner } from '../components/Common'
import { INVOICES, plural } from '../lib/plural'

type Range = { from: string; to: string }

function monthRange(key: string): Range {
  return { from: `${key}-01`, to: addDays(`${shiftMonth(key, 1)}-01`, -1) }
}

function presets(): { label: string; range: Range }[] {
  const thisMonth = monthKey(today())
  const year = Number(today().slice(0, 4))
  return [
    { label: 'Ten miesiąc', range: monthRange(thisMonth) },
    { label: 'Poprzedni miesiąc', range: monthRange(shiftMonth(thisMonth, -1)) },
    { label: `Cały rok ${year}`, range: { from: `${year}-01-01`, to: `${year}-12-31` } },
    { label: `Cały rok ${year - 1}`, range: { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` } }
  ]
}

export function ExportScreen({ data }: { data: AppData }) {
  const options = presets()
  const [range, setRange] = useState<Range>(options[1].range)
  const [saving, setSaving] = useState(false)
  const [savedPath, setSavedPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const valid = isValidIsoDate(range.from) && isValidIsoDate(range.to) && range.from <= range.to
  const selected = valid ? data.invoices.filter((i) => i.issueDate >= range.from && i.issueDate <= range.to) : []

  const save = async () => {
    setSaving(true)
    setError(null)
    setSavedPath(null)
    try {
      setSavedPath(await window.api.exportExcel(range))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="screen" style={{ maxWidth: 900 }}>
      <div className="screen-header">
        <div>
          <h1>Eksport do Excela</h1>
          <p className="subtitle">Zapisz zestawienie faktur do pliku, który otworzysz w Excelu albo wyślesz księgowej.</p>
        </div>
      </div>

      <div className="card">
        <h2>1. Wybierz okres</h2>
        <div className="btn-row" style={{ marginBottom: 20 }}>
          {options.map((o) => (
            <button
              key={o.label}
              className={`btn ${o.range.from === range.from && o.range.to === range.to ? 'btn-primary' : ''}`}
              onClick={() => {
                setRange(o.range)
                setSavedPath(null)
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="from">Od dnia</label>
            <input id="from" type="date" className="input" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="to">Do dnia</label>
            <input id="to" type="date" className="input" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          </div>
        </div>

        <h2 style={{ marginTop: 8 }}>2. Zapisz</h2>
        {valid ? (
          <p>
            W okresie od <strong>{formatDate(range.from)}</strong> do <strong>{formatDate(range.to)}</strong> jest{' '}
            <strong>{plural(selected.length, INVOICES)}</strong> na łączną kwotę{' '}
            <strong>{formatMoney(selected.reduce((s, i) => s + (i.grossAmount ?? 0), 0))}</strong>.
          </p>
        ) : (
          <Notice tone="warn" icon="📅">
            Sprawdź daty — „Od dnia” musi być przed „Do dnia”.
          </Notice>
        )}
        <button className="btn btn-primary btn-large" disabled={!valid || selected.length === 0 || saving} onClick={() => void save()}>
          {saving ? <Spinner /> : '📊'} Zapisz do Excela
        </button>

        {savedPath && (
          <div style={{ marginTop: 20 }}>
            <Notice tone="good" icon="✓">
              <p>
                <strong>Zapisano plik:</strong> <span className="mono">{savedPath}</span>
              </p>
              <div className="btn-row">
                <button className="btn btn-small" onClick={() => void window.api.openPath(savedPath)}>
                  Otwórz plik
                </button>
                <button className="btn btn-small" onClick={() => void window.api.showInFolder(savedPath)}>
                  Pokaż w folderze
                </button>
              </div>
            </Notice>
          </div>
        )}
        {error && (
          <div style={{ marginTop: 20 }}>
            <Notice tone="bad" icon="⚠️">
              Nie udało się zapisać pliku: {error}. Jeśli ten plik jest otwarty w Excelu, zamknij go i spróbuj ponownie.
            </Notice>
          </div>
        )}
      </div>
    </div>
  )
}
