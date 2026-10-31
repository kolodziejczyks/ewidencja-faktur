/**
 * Adding invoices: drop or pick one or more files, then go through them one by one —
 * document on the left, form on the right, with fields pre-filled from the document.
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

type Item = ImportResult | { manual: true }

export function AddScreen({ data, incoming, onIncomingConsumed, onImport, onOpenInvoice, notify }: Props) {
  const [queue, setQueue] = useState<Item[]>([])
  const [suggestion, setSuggestion] = useState<Partial<FormValues> | null>(null)
  const [reading, setReading] = useState<ReadingState>({ status: 'idle' })
  const [dragOver, setDragOver] = useState(false)
  const current = queue[0]
  const currentFile = current && 'file' in current ? current.file : null

  useEffect(() => {
    if (incoming.length === 0) return
    setQueue((q) => [...q, ...incoming])
    onIncomingConsumed()
  }, [incoming, onIncomingConsumed])

  // A fresh, empty form for every document in the queue.
  const initial = useMemo(() => emptyForm(), [current])
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
          net: parsed.netAmount != null ? moneyToInput(parsed.netAmount) : undefined
        }
        const found = Object.values(next).filter((v) => v != null).length
        setSuggestion(next)
        setReading({ status: 'done', found })
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

  const next = () => setQueue((q) => q.slice(1))

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const paths = [...e.dataTransfer.files].map((f) => window.api.pathForDroppedFile(f)).filter(Boolean)
    void window.api.importFiles(paths).then(onImport)
  }

  if (!current) {
    return (
      <div className="screen">
        <div className="screen-header">
          <div>
            <h1>Dodaj fakturę</h1>
            <p className="subtitle">Możesz dodać plik PDF, zdjęcie faktury (JPG, PNG) albo dokument Word.</p>
          </div>
        </div>
        <div
          className={`dropzone ${dragOver ? 'over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <div className="big-icon">📥</div>
          <h2>Przeciągnij tutaj plik z fakturą</h2>
          <p className="subtitle">albo</p>
          <div className="btn-row" style={{ justifyContent: 'center', marginTop: 16 }}>
            <button className="btn btn-primary btn-large" onClick={() => void window.api.pickFiles().then(onImport)}>
              📂 Wybierz plik z komputera
            </button>
            <button className="btn btn-large" onClick={() => setQueue([{ manual: true }])}>
              ⌨️ Wpisz bez pliku
            </button>
          </div>
          <p className="muted" style={{ marginTop: 20 }}>
            Można wybrać kilka plików naraz — program przeprowadzi przez nie po kolei.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="screen" style={{ maxWidth: 'none' }}>
      <div className="screen-header">
        <div>
          <h1>Dodaj fakturę</h1>
          {queue.length > 1 && <p className="queue-info">Zostało jeszcze {queue.length - 1} do dodania po tym dokumencie.</p>}
        </div>
      </div>
      <div className="split">
        <DocumentPreview files={files} />
        <InvoiceForm
          initial={initial}
          suggestion={suggestion}
          reading={reading}
          files={files}
          alreadyAttachedTo={current && 'file' in current ? current.alreadyAttachedTo : null}
          invoices={data.invoices}
          suppliers={data.suppliers}
          categories={data.categories}
          saveLabel={queue.length > 1 ? 'Zapisz i przejdź dalej' : 'Zapisz fakturę'}
          onSaved={() => {
            notify(queue.length > 1 ? 'Zapisano ✓  Następny dokument…' : 'Zapisano fakturę ✓')
            void data.refresh()
            next()
          }}
          onOpenInvoice={onOpenInvoice}
        >
          <button type="button" className="btn btn-large" onClick={next}>
            {queue.length > 1 ? 'Pomiń ten dokument' : 'Anuluj'}
          </button>
        </InvoiceForm>
      </div>
    </div>
  )
}
