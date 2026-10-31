/**
 * Bulk import from a CSV file (Settings → "Wczytaj faktury z pliku"). Meant for the helper who
 * prepares the file, e.g. history transcribed from the paper notebook: nothing is saved until the
 * preview has been checked, duplicates are skipped by default and the whole import can be undone.
 */

import { useState } from 'react'
import { formatDate } from '@shared/dates'
import { buildImportPlan, decodeCsv, parseCsv, type ImportPlan, type ImportRow } from '@shared/importCsv'
import { formatMoney } from '@shared/money'
import { paymentMethodLabel } from '@shared/summary'
import type { AppData } from '../useAppData'
import { ConfirmDialog, Notice, Pill, Spinner } from '../components/Common'
import { INVOICES, INVOICES_ACCUSATIVE, plural } from '../lib/plural'

interface Props {
  data: AppData
  onBack: () => void
  onShowInvoices: () => void
  notify: (message: string) => void
}

export function ImportScreen({ data, onBack, onShowInvoices, notify }: Props) {
  const [fileName, setFileName] = useState('')
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [includeDuplicates, setIncludeDuplicates] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ids: number[]; backupError: string | null } | null>(null)
  const [confirmUndo, setConfirmUndo] = useState(false)

  const chooseFile = async () => {
    const file = await window.api.pickImportFile()
    if (!file) return
    setFileName(file.fileName)
    setResult(null)
    setPlan(buildImportPlan(parseCsv(decodeCsv(file.bytes)), data.categories, data.invoices))
  }

  const rows = plan?.rows ?? []
  const toImport = rows.filter((r) => r.input && (!r.duplicate || includeDuplicates))
  const duplicates = rows.filter((r) => r.input && r.duplicate)
  const broken = rows.filter((r) => !r.input)
  const withWarnings = rows.filter((r) => r.input && r.warnings.length)

  const runImport = async () => {
    setBusy(true)
    try {
      const res = await window.api.importInvoices(toImport.map((r) => r.input!))
      setResult(res)
      setPlan(null)
      await data.refresh()
    } finally {
      setBusy(false)
    }
  }

  const undo = async () => {
    if (!result) return
    setConfirmUndo(false)
    await window.api.deleteInvoices(result.ids)
    await data.refresh()
    notify(`Cofnięto import (${plural(result.ids.length, INVOICES)} w koszu)`)
    setResult(null)
  }

  return (
    <div className="screen" style={{ maxWidth: 1200 }}>
      <div className="screen-header">
        <div>
          <button className="btn btn-small" onClick={onBack} style={{ marginBottom: 12 }}>
            ← Wróć do ustawień
          </button>
          <h1>Wczytaj faktury z pliku</h1>
          <p className="subtitle">Dodaje wiele faktur naraz z pliku CSV, np. przepisanych z zeszytu.</p>
        </div>
      </div>

      {result && (
        <Notice tone="good" icon="✓">
          <p>
            <strong>Dodano {plural(result.ids.length, INVOICES_ACCUSATIVE)}.</strong>
          </p>
          {result.backupError && <p>Uwaga: nie udało się zrobić kopii zapasowej przed importem ({result.backupError}).</p>}
          <div className="btn-row">
            <button className="btn btn-primary" onClick={onShowInvoices}>
              Przejdź do faktur
            </button>
            <button className="btn btn-danger" onClick={() => setConfirmUndo(true)}>
              ↩ Cofnij ten import
            </button>
          </div>
        </Notice>
      )}

      {!plan && (
        <div className="card">
          <h2>Jak przygotować plik</h2>
          <p>
            Plik CSV (np. zapisany z Excela) z nagłówkiem w pierwszym wierszu. Kolumny: <strong>data</strong>, dostawca, nip, numer,{' '}
            <strong>kwota</strong>, forma_platnosci (przelew / gotówka), kategoria, termin, uwagi. Wymagane są tylko data i kwota.
          </p>
          <p className="muted">
            Kategorie muszą nazywać się tak jak w programie: {data.categories.map((c) => `„${c.name}”`).join(', ')}.
          </p>
          <div className="btn-row">
            <button className="btn btn-primary btn-large" onClick={() => void chooseFile()}>
              📂 Wybierz plik CSV
            </button>
            <button
              className="btn"
              onClick={async () => {
                const path = await window.api.saveImportTemplate()
                if (path) notify('Zapisano wzór pliku ✓')
              }}
            >
              Pobierz wzór pliku
            </button>
          </div>
        </div>
      )}

      {plan?.error && (
        <Notice tone="bad" icon="⚠️">
          <p>
            <strong>{fileName}:</strong> {plan.error}
          </p>
          <button className="btn btn-small" onClick={() => setPlan(null)}>
            Wybierz inny plik
          </button>
        </Notice>
      )}

      {plan && !plan.error && (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <h2>Sprawdź, co zostanie dodane — {fileName}</h2>
            <ul className="notes-list">
              <li>
                <strong>Do dodania: {plural(toImport.length, INVOICES)}</strong> na łączną kwotę {formatMoney(toImport.reduce((sum, r) => sum + (r.input!.grossAmount ?? 0), 0))}
              </li>
              {duplicates.length > 0 && <li>Możliwe duplikaty: {duplicates.length} {includeDuplicates ? '(zostaną dodane)' : '(zostaną pominięte)'}</li>}
              {broken.length > 0 && <li>Wiersze z błędami, które zostaną pominięte: {broken.length}</li>}
              {withWarnings.length > 0 && <li>Wiersze z uwagami (dodane, ale warto je sprawdzić): {withWarnings.length}</li>}
            </ul>
            {duplicates.length > 0 && (
              <label className={`check ${includeDuplicates ? 'checked' : ''}`} style={{ margin: '12px 0' }}>
                <input type="checkbox" checked={includeDuplicates} onChange={(e) => setIncludeDuplicates(e.target.checked)} />
                Dodaj także możliwe duplikaty
              </label>
            )}
            <div className="btn-row">
              <button className="btn btn-good btn-large" disabled={toImport.length === 0 || busy} onClick={() => void runImport()}>
                {busy ? <Spinner /> : '💾'} Dodaj {plural(toImport.length, INVOICES_ACCUSATIVE)}
              </button>
              <button className="btn btn-large" onClick={() => setPlan(null)}>
                Anuluj
              </button>
            </div>
          </div>

          <div className="card">
            <table className="table">
              <thead>
                <tr>
                  <th>Wiersz</th>
                  <th>Data</th>
                  <th>Dostawca</th>
                  <th>Numer</th>
                  <th className="num">Kwota</th>
                  <th>Płatność</th>
                  <th>Kategoria</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <PreviewRow key={row.line} row={row} includeDuplicates={includeDuplicates} categoryName={categoryName(data, row)} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {confirmUndo && result && (
        <ConfirmDialog
          title="Cofnąć ten import?"
          message={<p>Wszystkie faktury z tego importu ({result.ids.length}) trafią do kosza. Można je stamtąd przywrócić.</p>}
          confirmLabel="Tak, cofnij"
          danger
          onConfirm={() => void undo()}
          onCancel={() => setConfirmUndo(false)}
        />
      )}
    </div>
  )
}

function categoryName(data: AppData, row: ImportRow): string {
  return data.categories.find((c) => c.id === row.input?.categoryId)?.name ?? ''
}

function PreviewRow({ row, includeDuplicates, categoryName }: { row: ImportRow; includeDuplicates: boolean; categoryName: string }) {
  const inv = row.input
  const status = !inv ? (
    <Pill tone="bad" icon="✗">
      Pominięty
    </Pill>
  ) : row.duplicate ? (
    <Pill tone="warn" icon="⧉">
      {row.duplicate.kind === 'existing' ? 'Już jest w programie' : `Taki sam jak wiersz ${row.duplicate.line}`}
      {includeDuplicates ? ' — dodany' : ''}
    </Pill>
  ) : (
    <Pill tone="good" icon="✓">
      Do dodania
    </Pill>
  )
  return (
    <tr>
      <td>{row.line}</td>
      <td>{inv ? formatDate(inv.issueDate) : ''}</td>
      <td>{inv?.supplierName}</td>
      <td>{inv?.number}</td>
      <td className="num">{inv ? formatMoney(inv.grossAmount) : ''}</td>
      <td>{inv?.paymentMethod ? paymentMethodLabel(inv.paymentMethod) : ''}</td>
      <td>{categoryName}</td>
      <td>
        {status}
        {[...row.problems, ...row.warnings].map((text, i) => (
          <div key={i} className="muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>
            {text}
          </div>
        ))}
      </td>
    </tr>
  )
}
