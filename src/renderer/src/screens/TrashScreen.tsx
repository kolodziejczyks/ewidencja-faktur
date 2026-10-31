import { useEffect, useState } from 'react'
import { formatDate } from '@shared/dates'
import { formatMoney } from '@shared/money'
import type { Invoice } from '@shared/types'
import type { AppData } from '../useAppData'

export function TrashScreen({ data, notify }: { data: AppData; notify: (message: string) => void }) {
  const [deleted, setDeleted] = useState<Invoice[] | null>(null)
  const load = () => void window.api.listDeletedInvoices().then(setDeleted)
  useEffect(load, [])

  const restore = async (id: number) => {
    await window.api.restoreInvoice(id)
    await data.refresh()
    load()
    notify('Przywrócono ✓')
  }

  return (
    <div className="screen" style={{ maxWidth: 1000 }}>
      <div className="screen-header">
        <div>
          <h1>Kosz</h1>
          <p className="subtitle">Usunięte wpisy. Każdy można przywrócić — po 30 dniach znikają na zawsze.</p>
        </div>
      </div>
      {deleted?.length === 0 && (
        <div className="card empty">
          <div className="empty-icon">🗑</div>
          <p>Kosz jest pusty.</p>
        </div>
      )}
      {deleted?.map((inv) => (
        <div key={inv.id} className="entry" style={{ cursor: 'default', gridTemplateColumns: '120px 1fr auto auto' }}>
          <span className="entry-date">{formatDate(inv.issueDate)}</span>
          <span>
            <div className="entry-title">{inv.supplierName || 'Bez nazwy'}</div>
            <div className="entry-meta">
              {inv.number && <span>nr {inv.number}</span>}
              <span>· usunięto {formatDate(inv.deletedAt?.slice(0, 10))}</span>
            </div>
          </span>
          <span className="entry-amount">{formatMoney(inv.grossAmount)}</span>
          <button className="btn" onClick={() => void restore(inv.id)}>
            ↩ Przywróć
          </button>
        </div>
      ))}
    </div>
  )
}
