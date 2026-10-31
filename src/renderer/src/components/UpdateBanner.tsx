import type { UpdateState } from '@shared/types'

/** Release notes contain a Polish and an English section; the banner shows only the Polish one. */
function polishNotes(notes: string): string {
  return notes
    .split(/what.?s new/i)[0]
    .replace(/co nowego:?/i, '')
    .trim()
}

export function UpdateBanner({ state, onInstall, onLater }: { state: UpdateState; onInstall: () => void; onLater: () => void }) {
  if (state.status !== 'ready') return null
  const notes = polishNotes(state.releaseNotes)
  return (
    <div className="update-banner" role="status">
      <span style={{ fontSize: '2rem' }} aria-hidden>
        🎁
      </span>
      <div className="text">
        <strong>Jest nowa wersja programu ({state.version}).</strong> Aktualizacja jest już pobrana — zajmie kilka sekund, a wszystkie faktury
        zostaną na swoim miejscu.
        {notes && <div className="notes">{notes}</div>}
      </div>
      <button className="btn btn-primary btn-large" onClick={onInstall}>
        Zaktualizuj teraz
      </button>
      <button className="btn" onClick={onLater}>
        Później
      </button>
    </div>
  )
}
