import { useState } from 'react'
import { polishNoteLines } from '@shared/releaseNotes'
import type { UpdateState } from '@shared/types'
import { Modal } from './Common'

/**
 * Shown once an update has downloaded. It stays one short sentence however long the release
 * notes are; the notes themselves open in a dialog behind "Co nowego?".
 */
export function UpdateBanner({ state, onInstall, onLater }: { state: UpdateState; onInstall: () => void; onLater: () => void }) {
  const [showNotes, setShowNotes] = useState(false)
  if (state.status !== 'ready') return null
  const notes = polishNoteLines(state.releaseNotes)

  return (
    <div className="update-banner" role="status">
      <span style={{ fontSize: '2rem' }} aria-hidden>
        🎁
      </span>
      <div className="text">
        <strong>Jest nowa wersja programu ({state.version}).</strong> Aktualizacja zajmie kilka sekund, a wszystkie faktury zostaną na swoim
        miejscu.
      </div>
      <button className="btn btn-primary btn-large" onClick={onInstall}>
        Zaktualizuj teraz
      </button>
      {notes.length > 0 && (
        <button className="btn" onClick={() => setShowNotes(true)}>
          Co nowego?
        </button>
      )}
      <button className="btn" onClick={onLater}>
        Później
      </button>

      {showNotes && (
        <Modal onClose={() => setShowNotes(false)}>
          <h2>Co nowego w wersji {state.version}</h2>
          <ul className="notes-list">
            {notes.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          <div className="btn-row">
            <button className="btn btn-large" onClick={() => setShowNotes(false)}>
              Zamknij
            </button>
            <button className="btn btn-primary btn-large" onClick={onInstall}>
              Zaktualizuj teraz
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
