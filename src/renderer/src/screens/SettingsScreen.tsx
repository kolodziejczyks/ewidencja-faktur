import { useEffect, useState } from 'react'
import { formatNip, isValidNip } from '@shared/nip'
import type { AppInfo, BackupStatus, UpdateState } from '@shared/types'
import type { AppData } from '../useAppData'
import { Changelog } from '../components/Changelog'
import { ConfirmDialog, Notice, Spinner } from '../components/Common'

interface Props {
  data: AppData
  appInfo: AppInfo | null
  updateState: UpdateState
  notify: (message: string) => void
  onOpenImport: () => void
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return 'jeszcze nigdy'
  return new Date(iso).toLocaleString('pl-PL', { dateStyle: 'long', timeStyle: 'short' })
}

export function SettingsScreen({ data, appInfo, updateState, notify, onOpenImport }: Props) {
  return (
    <div className="screen" style={{ maxWidth: 1000 }}>
      <div className="screen-header">
        <div>
          <h1>Ustawienia</h1>
          <p className="subtitle">Zwykle nie trzeba tu nic zmieniać.</p>
        </div>
      </div>
      <ShopSection data={data} notify={notify} />
      <CategoriesSection data={data} />
      <BackupSection notify={notify} />
      <div className="card settings-section">
        <h2>📥 Wczytaj faktury z pliku</h2>
        <p className="muted">Dodaje wiele faktur naraz z przygotowanego pliku CSV — np. starsze faktury przepisane z zeszytu.</p>
        <button className="btn" onClick={onOpenImport}>
          Wczytaj faktury z pliku…
        </button>
      </div>
      <AboutSection appInfo={appInfo} updateState={updateState} />
    </div>
  )
}

function ShopSection({ data, notify }: { data: AppData; notify: (m: string) => void }) {
  const [nip, setNip] = useState('')
  useEffect(() => setNip(data.settings?.ownNip ? formatNip(data.settings.ownNip) : ''), [data.settings?.ownNip])
  const invalid = nip !== '' && !isValidNip(nip)

  return (
    <div className="card settings-section">
      <h2>🏪 Dane sklepu</h2>
      <div className="field" style={{ maxWidth: 420 }}>
        <label htmlFor="ownNip">NIP sklepu</label>
        <input id="ownNip" className={`input ${invalid ? 'invalid' : ''}`} value={nip} onChange={(e) => setNip(e.target.value)} inputMode="numeric" />
        <span className="hint">Dzięki temu program nie pomyli NIP-u sklepu z NIP-em dostawcy podczas odczytywania faktur.</span>
        {invalid && <span className="error-text">Ten NIP ma błąd — sprawdź cyfry.</span>}
      </div>
      <button
        className="btn btn-primary"
        disabled={invalid}
        onClick={async () => {
          await window.api.setOwnNip(nip)
          await data.refresh()
          notify('Zapisano NIP sklepu ✓')
        }}
      >
        Zapisz
      </button>
    </div>
  )
}

function CategoriesSection({ data }: { data: AppData }) {
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null)

  return (
    <div className="card settings-section">
      <h2>🏷 Kategorie</h2>
      <p className="muted">Kategorie pomagają zobaczyć w podsumowaniu, na co idą pieniądze.</p>
      <table className="table" style={{ marginBottom: 16 }}>
        <tbody>
          {data.categories.map((c) => (
            <tr key={c.id}>
              <td>
                {editing?.id === c.id ? (
                  <input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus />
                ) : (
                  c.name
                )}
              </td>
              <td className="num" style={{ width: 220 }}>
                {editing?.id === c.id ? (
                  <button
                    className="btn btn-small btn-primary"
                    disabled={!editing.name.trim()}
                    onClick={async () => {
                      await window.api.renameCategory(c.id, editing.name)
                      setEditing(null)
                      await data.refresh()
                    }}
                  >
                    Zapisz
                  </button>
                ) : (
                  <button className="btn btn-small" onClick={() => setEditing({ id: c.id, name: c.name })}>
                    ✏️ Zmień nazwę
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="btn-row">
        <input className="input" style={{ maxWidth: 420 }} placeholder="Nazwa nowej kategorii" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button
          className="btn"
          disabled={!newName.trim() || data.categories.some((c) => c.name.toLowerCase() === newName.trim().toLowerCase())}
          onClick={async () => {
            await window.api.addCategory(newName)
            setNewName('')
            await data.refresh()
          }}
        >
          ➕ Dodaj kategorię
        </button>
      </div>
    </div>
  )
}

function BackupSection({ notify }: { notify: (m: string) => void }) {
  const [status, setStatus] = useState<BackupStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [restoreFile, setRestoreFile] = useState<string | null>(null)
  const [showRestore, setShowRestore] = useState(false)
  useEffect(() => void window.api.getBackupStatus().then(setStatus), [])

  if (!status) return null
  return (
    <div className="card settings-section">
      <h2>💾 Kopia zapasowa</h2>
      <p>
        Program sam robi kopię wszystkich faktur raz dziennie. Ostatnia kopia: <strong>{formatTimestamp(status.lastBackupAt)}</strong>.
      </p>
      <p>
        Folder z kopiami: <span className="mono">{status.folder}</span>
        {status.folder.toLowerCase().includes('onedrive') && <span className="muted"> — jest w OneDrive, więc kopia trafia też do internetu.</span>}
      </p>
      {status.lastError && (
        <Notice tone="bad" icon="⚠️">
          Ostatnia kopia się nie udała: {status.lastError}
        </Notice>
      )}
      <div className="btn-row">
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            const s = await window.api.backupNow()
            setStatus(s)
            setBusy(false)
            notify(s.lastError ? 'Kopia się nie udała' : 'Zrobiono kopię zapasową ✓')
          }}
        >
          {busy ? <Spinner /> : '💾'} Zrób kopię teraz
        </button>
        <button
          className="btn"
          onClick={async () => {
            if (await window.api.chooseBackupFolder()) setStatus(await window.api.getBackupStatus())
          }}
        >
          📁 Zmień folder
        </button>
        <button className="btn" onClick={() => void window.api.openPath(status.folder)}>
          Otwórz folder
        </button>
        {status.snapshots.length > 0 && (
          <button className="btn btn-danger" onClick={() => setShowRestore((v) => !v)}>
            ↩ Przywróć z kopii…
          </button>
        )}
      </div>

      {showRestore && (
        <div style={{ marginTop: 20 }}>
          <Notice tone="warn" icon="⚠️">
            Przywrócenie zastąpi obecne dane stanem z wybranego dnia. Obecny stan zostanie najpierw zapisany jako nowa kopia, więc można to
            cofnąć.
          </Notice>
          <table className="table">
            <tbody>
              {status.snapshots.slice(0, 10).map((s) => (
                <tr key={s.fileName}>
                  <td>{formatTimestamp(s.createdAt)}</td>
                  <td className="num">
                    <button className="btn btn-small" onClick={() => setRestoreFile(s.fileName)}>
                      Przywróć tę kopię
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {restoreFile && (
        <ConfirmDialog
          title="Przywrócić kopię zapasową?"
          message={<p>Program zamknie się i otworzy ponownie z danymi z wybranej kopii.</p>}
          confirmLabel="Tak, przywróć"
          danger
          onConfirm={() => void window.api.restoreBackup(restoreFile)}
          onCancel={() => setRestoreFile(null)}
        />
      )}
    </div>
  )
}

function updateText(state: UpdateState): string {
  switch (state.status) {
    case 'idle':
    case 'upToDate':
      return 'Masz najnowszą wersję.'
    case 'checking':
      return 'Sprawdzam, czy jest nowa wersja…'
    case 'downloading':
      return `Pobieram nową wersję ${state.version}… ${state.percent}%`
    case 'ready':
      return `Nowa wersja ${state.version} jest gotowa do zainstalowania.`
    case 'error':
      return 'Nie udało się sprawdzić aktualizacji (może brak internetu). Program spróbuje ponownie później.'
  }
}

function AboutSection({ appInfo, updateState }: { appInfo: AppInfo | null; updateState: UpdateState }) {
  const [showChangelog, setShowChangelog] = useState(false)
  return (
    <div className="card settings-section">
      <h2>ℹ️ O programie</h2>
      <p>
        Ewidencja Faktur, wersja <strong>{appInfo?.version ?? '…'}</strong>
      </p>
      <p>{updateText(updateState)}</p>
      {updateState.status === 'error' && <p className="muted mono">{updateState.message}</p>}
      <div className="btn-row" style={{ marginBottom: 16 }}>
        <button className="btn" onClick={() => void window.api.checkForUpdates()} disabled={updateState.status === 'checking'}>
          🔄 Sprawdź aktualizacje
        </button>
        {updateState.status === 'ready' && (
          <button className="btn btn-primary" onClick={() => void window.api.installUpdate()}>
            Zaktualizuj teraz
          </button>
        )}
        <button className="btn" onClick={() => setShowChangelog((v) => !v)}>
          📜 {showChangelog ? 'Ukryj historię zmian' : 'Co nowego w programie'}
        </button>
      </div>
      {showChangelog && <Changelog />}
      {appInfo && (
        <p className="muted" style={{ marginTop: 16 }}>
          Dane programu: <span className="mono">{appInfo.dataFolder}</span>
        </p>
      )}
    </div>
  )
}
