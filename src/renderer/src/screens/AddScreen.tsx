/**
 * Adding invoices. The default is typing an invoice in by hand; a file (PDF, photo, Word) can be
 * added from the side panel, in which case the document is shown next to the form and the
 * fields are pre-filled from it. Several files are gone through one by one.
 */

import { useEffect, useMemo, useState } from 'react'
import { moneyToInput } from '@shared/money'
import { parseInvoiceText } from '@shared/invoiceParser'
import { formatNip } from '@shared/nip'
import type { ImportResult } from '@shared/types'
import type { AppData } from '../useAppData'
import { DocumentPreview } from '../components/DocumentPreview'
import { emptyForm, InvoiceForm, type FormValues, type ReadingState } from '../components/InvoiceForm'
import { extractText } from '../lib/extract'

interface Props {
  data: AppData
  incoming: ImportResult[]
  onIncomingConsumed: () => void
  onImport: (results: ImportResult[]) => void
  onOpenInvoice: (id: number) => void
  notify: (message: string) => void
}

export function AddScreen({ data, incoming, onIncomingConsumed, onImport, onOpenInvoice, notify }: Props) {
  const [queue, setQueue] = useState<ImportResult[]>([])
  // Bumped after every save so the manual form starts empty again.
  const [entryNumber, setEntryNumber] = useState(0)
  const [suggestion, setSuggestion] = useState<Partial<FormValues> | null>(null)
  const [reading, setReading] = useState<ReadingState>({ status: 'idle' })
  const current = queue[0] ?? null
  const currentFile = current?.file ?? null

  useEffect(() => {
    if (incoming.length === 0) return
    setQueue((q) => [...q, ...incoming])
    onIncomingConsumed()
  }, [incoming, onIncomingConsumed])

  const initial = useMemo(() => emptyForm(), [current, entryNumber])
  const files = useMemo(() => (currentFile ? [currentFile] : []), [currentFile])

  useEffect(() => {
    setSuggestion(null)
    if (!currentFile) {
      setReading({ status: 'idle' })
      return
    }
    let cancelled = false
    setReading({ status: 'reading' })
    ;(async () => {
      try {
        const bytes = await window.api.readFile(currentFile.id)
        const { text } = await extractText(currentFile, bytes)
        if (cancelled) return
        const parsed = parseInvoiceText(text, { ownNip: data.settings?.ownNip })
        const known = parsed.supplierNip ? data.suppliers.find((s) => s.nip === parsed.supplierNip) : undefined
        const next: Partial<FormValues> = {
          number: parsed.number ?? undefined,
          supplierName: known?.name ?? parsed.supplierName ?? undefined,
          supplierNip: parsed.supplierNip ? formatNip(parsed.supplierNip) : undefined,
          issueDate: parsed.issueDate ?? undefined,
          dueDate: parsed.dueDate ?? undefined,
          gross: parsed.grossAmount != null ? moneyToInput(parsed.grossAmount) : undefined,
          net: parsed.netAmount != null ? moneyToInput(parsed.netAmount) : undefined,
          paymentMethod: parsed.paymentMethod ?? undefined
        }
        setSuggestion(next)
        setReading({ status: 'done', found: Object.values(next).filter((v) => v != null).length })
      } catch (e) {
        console.error('Reading the document failed', e)
        if (!cancelled) setReading({ status: 'failed' })
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read each document once
  }, [currentFile?.id])

  const next = () => {
    setQueue((q) => q.slice(1))
    setEntryNumber((n) => n + 1)
  }

  const form = (
    <InvoiceForm
      initial={initial}
      suggestion={suggestion}
      reading={reading}
      files={files}
      alreadyAttachedTo={current?.alreadyAttachedTo ?? null}
      invoices={data.invoices}
      suppliers={data.suppliers}
      categories={data.categories}
      saveLabel={queue.length > 1 ? 'Zapisz i przejdź dalej' : 'Zapisz fakturę'}
      onSaved={() => {
        notify(queue.length > 1 ? 'Zapisano ✓  Następny dokument…' : 'Zapisano fakturę ✓  Możesz wpisać następną.')
        void data.refresh()
        next()
      }}
      onOpenInvoice={onOpenInvoice}
    >
      {current && (
        <button type="button" className="btn btn-large" onClick={next}>
          {queue.length > 1 ? 'Pomiń ten dokument' : 'Anuluj'}
        </button>
      )}
    </InvoiceForm>
  )

  if (current) {
    return (
      <div className="screen" style={{ maxWidth: 'none' }}>
        <div className="screen-header">
          <div>
            <h1>Dodaj fakturę z pliku</h1>
            {queue.length > 1 && <p className="queue-info">Zostało jeszcze {queue.length - 1} do dodania po tym dokumencie.</p>}
          </div>
        </div>
        <div className="split">
          <DocumentPreview files={files} />
          {form}
        </div>
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <div>
          <h1>Dodaj fakturę</h1>
          <p className="subtitle">Przepisz dane z faktury i kliknij „Zapisz fakturę”.</p>
        </div>
      </div>
      <div className="add-layout">
        {form}
        <FileSidePanel onImport={onImport} />
      </div>
    </div>
  )
}

/** The secondary way in: adding a PDF, photo or Word file that the program tries to read. */
function FileSidePanel({ onImport }: { onImport: (results: ImportResult[]) => void }) {
  const [dragOver, setDragOver] = useState(false)

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const paths = [...e.dataTransfer.files].map((f) => window.api.pathForDroppedFile(f)).filter(Boolean)
    void window.api.importFiles(paths).then(onImport)
  }

  return (
    <aside
      className={`card side-panel ${dragOver ? 'over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div style={{ fontSize: '2.2rem' }} aria-hidden>
        📎
      </div>
      <h3>Masz fakturę w pliku?</h3>
      <p className="muted">PDF, zdjęcie albo dokument Word. Program pokaże go obok formularza i spróbuje sam odczytać dane.</p>
      <button className="btn" onClick={() => void window.api.pickFiles().then(onImport)}>
        📂 Dodaj z pliku
      </button>
    </aside>
  )
}
