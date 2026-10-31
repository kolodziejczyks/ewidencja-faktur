/** Release history bundled with the app, readable in Polish or English. */

import { useState } from 'react'
import changelog from '../../../../changelog.json'
import { formatDate } from '@shared/dates'
import { Modal } from './Common'

export interface ChangelogEntry {
  version: string
  date: string
  pl: string[]
  en: string[]
}

const entries = changelog as ChangelogEntry[]

/** Compares "1.2.10" and "1.10.0" numerically. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d
  }
  return 0
}

export function entriesNewerThan(version: string): ChangelogEntry[] {
  return entries.filter((e) => compareVersions(e.version, version) > 0)
}

export function Changelog({ items = entries }: { items?: ChangelogEntry[] }) {
  const [lang, setLang] = useState<'pl' | 'en'>('pl')
  return (
    <div>
      <div className="segmented" style={{ marginBottom: 16 }} role="group" aria-label="Język">
        <button className={lang === 'pl' ? 'active' : ''} onClick={() => setLang('pl')}>
          Polski
        </button>
        <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>
          English
        </button>
      </div>
      {items.map((e) => (
        <div key={e.version} className="changelog-entry">
          <h3>
            {lang === 'pl' ? 'Wersja' : 'Version'} {e.version} <span className="muted">· {formatDate(e.date)}</span>
          </h3>
          <ul>
            {e[lang].map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/** Shown once after an update, listing what changed since the version the user had before. */
export function WhatsNewDialog({ since, onClose }: { since: string; onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <h2>🎉 Program został zaktualizowany</h2>
      <p>Oto co nowego:</p>
      <Changelog items={entriesNewerThan(since)} />
      <div className="btn-row">
        <button className="btn btn-primary btn-large" onClick={onClose} autoFocus>
          Rozumiem
        </button>
      </div>
    </Modal>
  )
}
