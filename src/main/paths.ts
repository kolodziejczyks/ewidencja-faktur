import { app } from 'electron'
import { join, sep } from 'node:path'
import { mkdirSync } from 'node:fs'

/**
 * All user data lives in %APPDATA%\Ewidencja Faktur:
 *   ewidencja.db       – SQLite database
 *   dokumenty\RRRR-MM\ – copies of the imported files
 */
export function dataDir(): string {
  return app.getPath('userData')
}

export function databasePath(): string {
  return join(dataDir(), 'ewidencja.db')
}

export function documentsDir(): string {
  const dir = join(dataDir(), 'dokumenty')
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Files inside app.asar that a worker thread must read from disk are unpacked next to it. */
export function unpacked(path: string): string {
  return path.replace(`app.asar${sep}`, `app.asar.unpacked${sep}`)
}
