import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppInfo, ImportResult, UpdateState } from '@shared/types'
import { WhatsNewDialog } from './components/Changelog'
import { Toast } from './components/Common'
import { UpdateBanner } from './components/UpdateBanner'
import { AddScreen } from './screens/AddScreen'
import { PrintScreen } from './screens/PrintScreen'
import { InvoiceScreen } from './screens/InvoiceScreen'
import { LedgerScreen } from './screens/LedgerScreen'
import { ImportScreen } from './screens/ImportScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { SummaryScreen } from './screens/SummaryScreen'
import { TrashScreen } from './screens/TrashScreen'
import { useAppData } from './useAppData'

type Screen = { name: 'ledger' } | { name: 'add' } | { name: 'invoice'; id: number } | { name: 'summary' } | { name: 'print' } | { name: 'trash' } | { name: 'settings' } | { name: 'import' }

const NAV: { name: Screen['name']; label: string; icon: string }[] = [
  { name: 'ledger', label: 'Faktury', icon: '📒' },
  { name: 'summary', label: 'Podsumowanie', icon: '📊' },
  { name: 'print', label: 'Do druku', icon: '🖨' },
  { name: 'trash', label: 'Kosz', icon: '🗑' },
  { name: 'settings', label: 'Ustawienia', icon: '⚙️' }
]

const BACKUP_WARNING_DAYS = 7

export default function App() {
  const data = useAppData()
  const [screen, setScreen] = useState<Screen>({ name: 'ledger' })
  const [incoming, setIncoming] = useState<ImportResult[]>([])
  const [toast, setToast] = useState<{ message: string; action?: { label: string; run: () => void } } | null>(null)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle' })
  const [updateDismissed, setUpdateDismissed] = useState(false)
  const [whatsNewSince, setWhatsNewSince] = useState<string | null>(null)
  const [backupWarning, setBackupWarning] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  // Every screen starts at the top, like turning to a new page.
  const mainRef = useRef<HTMLElement>(null)
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0)
  }, [screen])

  const notify = useCallback((message: string, action?: { label: string; run: () => void }) => setToast({ message, action }), [])

  useEffect(() => {
    void window.api.getAppInfo().then(setAppInfo)
    void window.api.getUpdateState().then(setUpdateState)
    return window.api.onUpdateState(setUpdateState)
  }, [])

  // After an update, show once what changed. On the very first start just remember the version.
  useEffect(() => {
    if (!appInfo || !data.settings) return
    const seen = data.settings.lastSeenVersion
    if (seen === appInfo.version) return
    if (seen) setWhatsNewSince(seen)
    else void window.api.setLastSeenVersion(appInfo.version)
  }, [appInfo, data.settings])

  useEffect(() => {
    void window.api.getBackupStatus().then((s) => {
      const age = s.lastBackupAt ? (Date.now() - new Date(s.lastBackupAt).getTime()) / 86_400_000 : 0
      if (s.lastError) setBackupWarning('Ostatnia kopia zapasowa się nie udała. Zajrzyj do Ustawień albo poproś o pomoc.')
      else if (age > BACKUP_WARNING_DAYS) setBackupWarning(`Kopia zapasowa nie była robiona od ${Math.floor(age)} dni.`)
    })
  }, [])

  const onImport = useCallback(
    (results: ImportResult[]) => {
      if (results.length === 0) {
        notify('Tego pliku nie da się dodać. Można dodawać PDF, zdjęcia (JPG, PNG) i dokumenty Word.')
        return
      }
      setIncoming(results)
      setScreen({ name: 'add' })
    },
    [notify]
  )
  const onIncomingConsumed = useCallback(() => setIncoming([]), [])
  const openInvoice = (id: number) => setScreen({ name: 'invoice', id })

  // Files dropped anywhere in the window go straight to "Dodaj fakturę".
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const paths = [...e.dataTransfer.files].map((f) => window.api.pathForDroppedFile(f)).filter(Boolean)
    if (paths.length) void window.api.importFiles(paths).then(onImport)
  }

  return (
    <div
      className="app"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setDragging(true)
        }
      }}
      onDragLeave={(e) => e.relatedTarget == null && setDragging(false)}
      onDrop={onDrop}
    >
      <nav className="sidebar" aria-label="Menu">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            🧾
          </span>
          Ewidencja Faktur
        </div>
        <button className={`nav-button nav-add ${screen.name === 'add' ? 'active' : ''}`} onClick={() => setScreen({ name: 'add' })}>
          <span className="icon" aria-hidden>
            ➕
          </span>
          Dodaj fakturę
        </button>
        {NAV.map((item) => (
          <button
            key={item.name}
            className={`nav-button ${screen.name === item.name || (item.name === 'ledger' && screen.name === 'invoice') || (item.name === 'settings' && screen.name === 'import') ? 'active' : ''}`}
            onClick={() => setScreen({ name: item.name } as Screen)}
          >
            <span className="icon" aria-hidden>
              {item.icon}
            </span>
            {item.label}
          </button>
        ))}
        <div className="sidebar-footer">
          {updateState.status === 'downloading' && <div>Pobieram nową wersję… {updateState.percent}%</div>}
          {updateState.status === 'ready' && updateDismissed && (
            <button className="btn btn-small btn-primary" onClick={() => void window.api.installUpdate()} style={{ marginBottom: 8 }}>
              🎁 Zaktualizuj
            </button>
          )}
          <div>Wersja {appInfo?.version}</div>
        </div>
      </nav>

      <main className="main" ref={mainRef}>
        {!updateDismissed && (
          <UpdateBanner state={updateState} onInstall={() => void window.api.installUpdate()} onLater={() => setUpdateDismissed(true)} />
        )}
        {screen.name === 'ledger' && (
          <LedgerScreen
            data={data}
            onOpenInvoice={openInvoice}
            onAdd={() => setScreen({ name: 'add' })}
            onOpenSettings={() => setScreen({ name: 'settings' })}
            backupWarning={backupWarning}
          />
        )}
        {screen.name === 'add' && (
          <AddScreen
            data={data}
            incoming={incoming}
            onIncomingConsumed={onIncomingConsumed}
            onImport={onImport}
            onOpenInvoice={openInvoice}
            notify={notify}
          />
        )}
        {screen.name === 'invoice' && (
          <InvoiceScreen data={data} invoiceId={screen.id} onBack={() => setScreen({ name: 'ledger' })} onOpenInvoice={openInvoice} notify={notify} />
        )}
        {screen.name === 'summary' && <SummaryScreen data={data} />}
        {screen.name === 'print' && <PrintScreen data={data} />}
        {screen.name === 'trash' && <TrashScreen data={data} notify={notify} />}
        {screen.name === 'settings' && (
          <SettingsScreen data={data} appInfo={appInfo} updateState={updateState} notify={notify} onOpenImport={() => setScreen({ name: 'import' })} />
        )}
        {screen.name === 'import' && (
          <ImportScreen
            data={data}
            onBack={() => setScreen({ name: 'settings' })}
            onShowInvoices={() => setScreen({ name: 'ledger' })}
            notify={notify}
          />
        )}
      </main>

      {dragging && <div className="drop-overlay">📥 Upuść plik, aby dodać fakturę</div>}
      {toast && <Toast message={toast.message} action={toast.action} onClose={() => setToast(null)} />}
      {whatsNewSince && appInfo && (
        <WhatsNewDialog
          since={whatsNewSince}
          onClose={() => {
            setWhatsNewSince(null)
            void window.api.setLastSeenVersion(appInfo.version).then(data.refresh)
          }}
        />
      )}
    </div>
  )
}
