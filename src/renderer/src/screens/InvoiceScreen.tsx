/** One invoice: document preview and the editable form, and "move to bin". */

import { useMemo, useState } from 'react'
import { formatDate } from '@shared/dates'
import { formatMoney } from '@shared/money'
import type { AppData } from '../useAppData'
import { ConfirmDialog, Pill } from '../components/Common'
import { DocumentPreview } from '../components/DocumentPreview'
import { formFromInvoice, InvoiceForm } from '../components/InvoiceForm'
import { flagLabel } from '../lib/flags'

interface Props {
  data: AppData
  invoiceId: number
  onBack: () => void
  onOpenInvoice: (id: number) => void
  notify: (message: string, action?: { label: string; run: () => void }) => void
}

export function InvoiceScreen({ data, invoiceId, onBack, onOpenInvoice, notify }: Props) {
  const invoice = data.invoices.find((i) => i.id === invoiceId)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const initial = useMemo(() => (invoice ? formFromInvoice(invoice) : null), [invoice?.id, invoice?.updatedAt])

  if (!invoice || !initial) {
    return (
      <div className="screen">
        <p>Nie znaleziono tej faktury — mogła zostać przeniesiona do kosza.</p>
        <button className="btn" onClick={onBack}>
          ← Wróć do listy
        </button>
      </div>
    )
  }

  const remove = async () => {
    setConfirmDelete(false)
    await window.api.deleteInvoice(invoice.id)
    await data.refresh()
    onBack()
    notify('Przeniesiono do kosza', {
      label: 'Cofnij',
      run: () => void window.api.restoreInvoice(invoice.id).then(data.refresh)
    })
  }

  return (
    <div className="screen" style={{ maxWidth: 'none' }}>
      <div className="screen-header">
        <div>
          <button className="btn btn-small" onClick={onBack} style={{ marginBottom: 12 }}>
            ← Wróć do listy
          </button>
          <h1>
            {invoice.supplierName || (invoice.kind === 'note' ? 'Notatka' : 'Faktura')} {invoice.number && <span className="muted">· {invoice.number}</span>}
          </h1>
          <p className="subtitle">
            {formatDate(invoice.issueDate)} · {formatMoney(invoice.grossAmount)}
          </p>
          <div className="btn-row" style={{ marginTop: 8 }}>
            {invoice.flags.map((f, i) => {
              const l = flagLabel(f)
              return (
                <Pill key={i} tone={l.tone} icon={l.icon}>
                  {l.text}
                </Pill>
              )
            })}
          </div>
        </div>
      </div>

      <div className="split">
        <DocumentPreview files={invoice.files} />
        <InvoiceForm
          invoiceId={invoice.id}
          initial={initial}
          files={invoice.files}
          invoices={data.invoices}
          suppliers={data.suppliers}
          categories={data.categories}
          saveLabel="Zapisz zmiany"
          onSaved={() => {
            void data.refresh()
            notify('Zapisano zmiany ✓')
          }}
          onOpenInvoice={onOpenInvoice}
        >
          <button type="button" className="btn btn-large btn-danger" onClick={() => setConfirmDelete(true)}>
            🗑 Usuń
          </button>
        </InvoiceForm>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Usunąć ten wpis?"
          message={<p>Wpis trafi do kosza. Przez 30 dni można go stamtąd przywrócić.</p>}
          confirmLabel="Tak, usuń"
          danger
          onConfirm={() => void remove()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}
