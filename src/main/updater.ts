/**
 * Automatic updates from GitHub Releases (electron-updater).
 *
 * Updates are downloaded quietly in the background. When one is ready the UI shows a calm banner
 * with "Zaktualizuj teraz"; if the user ignores it, the update installs itself the next time the
 * app is closed. Errors are never shown as pop-ups — only in Settings — so a flaky internet
 * connection does not worry the user.
 */

import { app, BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateState } from '@shared/types'

const { autoUpdater } = electronUpdater
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

let state: UpdateState = { status: 'idle' }

function setState(next: UpdateState): void {
  state = next
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('update-state', state)
}

export function getUpdateState(): UpdateState {
  return state
}

/** Release notes come from GitHub as HTML; the banner only needs plain text. */
function notesToText(notes: unknown): string {
  const raw = Array.isArray(notes) ? notes.map((n) => n.note ?? '').join('\n') : String(notes ?? '')
  return raw
    .replace(/<\/(p|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function initUpdater(): void {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    if (state.status !== 'ready' && state.status !== 'downloading') setState({ status: 'checking' })
  })
  autoUpdater.on('update-not-available', () => setState({ status: 'upToDate' }))
  autoUpdater.on('update-available', (info) => setState({ status: 'downloading', version: info.version, percent: 0 }))
  autoUpdater.on('download-progress', (p) => {
    if (state.status === 'downloading') setState({ ...state, percent: Math.round(p.percent) })
  })
  autoUpdater.on('update-downloaded', (info) =>
    setState({ status: 'ready', version: info.version, releaseNotes: notesToText(info.releaseNotes) })
  )
  autoUpdater.on('error', (e) => {
    // Keep a downloaded update usable even if a later check fails.
    if (state.status !== 'ready') setState({ status: 'error', message: e?.message ?? String(e) })
  })

  setTimeout(() => void checkForUpdates(), 10_000)
  setInterval(() => void checkForUpdates(), CHECK_INTERVAL_MS)
}

export async function checkForUpdates(): Promise<void> {
  if (!app.isPackaged) {
    setState({ status: 'upToDate' })
    return
  }
  if (state.status === 'ready' || state.status === 'downloading') return
  try {
    await autoUpdater.checkForUpdates()
  } catch (e) {
    setState({ status: 'error', message: e instanceof Error ? e.message : String(e) })
  }
}

export function installUpdateNow(): void {
  if (state.status !== 'ready') return
  // Silent install, then start the app again.
  autoUpdater.quitAndInstall(true, true)
}
