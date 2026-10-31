/**
 * Automatic backups. Once a day the database is snapshotted and new documents are mirrored
 * into the backup folder — by default inside OneDrive, so a copy also ends up in the cloud.
 *
 *   <backup folder>\baza\ewidencja-YYYY-MM-DD_HH-mm-ss.db   (last 30 kept)
 *   <backup folder>\dokumenty\...                       (mirror, files are only ever added)
 */

import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { BackupStatus } from '@shared/types'
import { closeDb, getDb, getSetting, nowIso, setSetting } from './db'
import { databasePath, documentsDir } from './paths'

const KEEP_SNAPSHOTS = 30
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000

export function defaultBackupFolder(): string {
  // Test runs keep their backups inside their throwaway data folder.
  if (process.env.EWF_USER_DATA) return join(process.env.EWF_USER_DATA, 'kopia-zapasowa')
  const base = process.env.OneDrive && existsSync(process.env.OneDrive) ? process.env.OneDrive : app.getPath('documents')
  return join(base, 'Ewidencja Faktur - kopia zapasowa')
}

export function backupFolder(): string {
  return getSetting('backupFolder') || defaultBackupFolder()
}

export function setBackupFolder(folder: string): void {
  setSetting('backupFolder', folder)
}

function snapshotsDir(): string {
  return join(backupFolder(), 'baza')
}

function listSnapshots(): BackupStatus['snapshots'] {
  const dir = snapshotsDir()
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.db'))
    .map((fileName) => ({ fileName, createdAt: statSync(join(dir, fileName)).mtime.toISOString() }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function getBackupStatus(): BackupStatus {
  return {
    folder: backupFolder(),
    lastBackupAt: getSetting('lastBackupAt') || null,
    lastError: getSetting('lastBackupError') || null,
    snapshots: listSnapshots()
  }
}

function copyMissing(fromDir: string, toDir: string): void {
  if (!existsSync(fromDir)) return
  for (const entry of readdirSync(fromDir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    const source = join(entry.parentPath, entry.name)
    const target = join(toDir, relative(fromDir, source))
    if (existsSync(target)) continue
    mkdirSync(join(target, '..'), { recursive: true })
    copyFileSync(source, target)
  }
}

export function runBackup(): BackupStatus {
  try {
    const dir = snapshotsDir()
    mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replaceAll(':', '-')
    const target = join(dir, `ewidencja-${stamp}.db`)
    rmSync(target, { force: true })
    // VACUUM INTO writes a consistent copy even while the database is open.
    getDb().prepare('VACUUM INTO ?').run(target)

    for (const old of listSnapshots().slice(KEEP_SNAPSHOTS)) rmSync(join(dir, old.fileName), { force: true })
    copyMissing(documentsDir(), join(backupFolder(), 'dokumenty'))

    setSetting('lastBackupAt', nowIso())
    setSetting('lastBackupError', '')
  } catch (e) {
    setSetting('lastBackupError', e instanceof Error ? e.message : String(e))
  }
  return getBackupStatus()
}

export function runBackupIfDue(): void {
  const last = getSetting('lastBackupAt')
  if (!last || Date.now() - new Date(last).getTime() > BACKUP_INTERVAL_MS) runBackup()
}

/**
 * Replaces the current database with a snapshot and brings back any missing documents.
 * The current state is snapshotted first, so a restore can itself be undone.
 */
export function restoreSnapshot(fileName: string): void {
  const source = join(snapshotsDir(), fileName)
  if (!existsSync(source) || fileName.includes('..')) throw new Error('Nie znaleziono tej kopii zapasowej.')
  runBackup()
  closeDb()
  for (const suffix of ['', '-wal', '-shm']) rmSync(databasePath() + suffix, { force: true })
  copyFileSync(source, databasePath())
  copyMissing(join(backupFolder(), 'dokumenty'), documentsDir())
  app.relaunch()
  app.exit(0)
}
