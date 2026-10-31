/** Wires the `window.api` calls from the UI to the main-process modules. */

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { IMPORT_TEMPLATE } from '@shared/importCsv'
import { normalizeNip } from '@shared/nip'
import type { ImportResult, InvoiceInput } from '@shared/types'
import { backupFolder, getBackupStatus, restoreSnapshot, runBackup, setBackupFolder } from './backup'
import { getSetting, setSetting } from './db'
import { absolutePathOf, importFile, readDocx, readStoredFile, SUPPORTED_EXTENSIONS } from './documents'
import { recognizeText } from './ocr'
import { dataDir } from './paths'
import * as repo from './repository'
import { checkForUpdates, getUpdateState, installUpdateNow } from './updater'

function importMany(paths: string[]): ImportResult[] {
  return paths.filter((p) => SUPPORTED_EXTENSIONS.some((ext) => p.toLowerCase().endsWith(`.${ext}`))).map(importFile)
}

export function registerIpc(): void {
  const handle = <A extends unknown[], R>(channel: string, fn: (...args: A) => R) =>
    ipcMain.handle(channel, (_event, ...args) => fn(...(args as A)))

  handle('getAppInfo', () => ({ version: app.getVersion(), isPackaged: app.isPackaged, dataFolder: dataDir() }))

  handle('listInvoices', repo.listInvoices)
  handle('listDeletedInvoices', repo.listDeletedInvoices)
  handle('getInvoice', repo.getInvoice)
  handle('saveInvoice', (input: InvoiceInput) => repo.saveInvoice(input))
  handle('deleteInvoice', repo.softDeleteInvoice)
  handle('restoreInvoice', repo.restoreInvoice)
  handle('importInvoices', (inputs: InvoiceInput[]) => {
    // A snapshot right before a bulk change, so an unwanted import can always be rolled back.
    const backup = runBackup()
    return { ids: repo.importInvoices(inputs), backupError: backup.lastError }
  })
  handle('deleteInvoices', repo.softDeleteInvoices)
  handle('pickImportFile', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Wybierz plik z fakturami',
      buttonLabel: 'Wczytaj',
      properties: ['openFile'],
      filters: [{ name: 'Plik CSV', extensions: ['csv', 'txt'] }]
    })
    const path = result.filePaths[0]
    return result.canceled || !path ? null : { fileName: basename(path), bytes: new Uint8Array(readFileSync(path)) }
  })
  handle('saveImportTemplate', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Zapisz wzór pliku',
      defaultPath: join(app.getPath('documents'), 'wzor-importu-faktur.csv'),
      filters: [{ name: 'Plik CSV', extensions: ['csv'] }]
    })
    if (result.canceled || !result.filePath) return null
    // UTF-8 with a BOM, so Excel shows Polish letters correctly.
    writeFileSync(result.filePath, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(IMPORT_TEMPLATE, 'utf8')]))
    return result.filePath
  })
  handle('findDuplicate', repo.findDuplicate)

  handle('listSuppliers', repo.listSuppliers)
  handle('listCategories', repo.listCategories)
  handle('addCategory', repo.addCategory)
  handle('renameCategory', repo.renameCategory)

  handle('pickFiles', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const options: Electron.OpenDialogOptions = {
      title: 'Wybierz faktury',
      buttonLabel: 'Dodaj',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Faktury i zdjęcia', extensions: SUPPORTED_EXTENSIONS },
        { name: 'Wszystkie pliki', extensions: ['*'] }
      ]
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return result.canceled ? [] : importMany(result.filePaths)
  })
  handle('importFiles', importMany)
  handle('readFile', readStoredFile)
  handle('openFileExternally', async (fileId: number) => void (await shell.openPath(absolutePathOf(fileId))))
  handle('readDocx', readDocx)
  handle('ocrFile', (fileId: number) => recognizeText(readStoredFile(fileId)))
  handle('ocrImage', (png: Uint8Array) => recognizeText(png))

  handle('openPath', async (path: string) => void (existsSync(path) && (await shell.openPath(path))))

  handle('getSettings', () => ({
    ownNip: getSetting('ownNip'),
    backupFolder: backupFolder(),
    lastSeenVersion: getSetting('lastSeenVersion')
  }))
  handle('setOwnNip', (nip: string) => setSetting('ownNip', normalizeNip(nip)))
  handle('setLastSeenVersion', (version: string) => setSetting('lastSeenVersion', version))
  handle('chooseBackupFolder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Gdzie zapisywać kopie zapasowe?',
      buttonLabel: 'Wybierz ten folder',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    setBackupFolder(result.filePaths[0])
    runBackup()
    return result.filePaths[0]
  })
  handle('getBackupStatus', getBackupStatus)
  handle('backupNow', runBackup)
  handle('restoreBackup', restoreSnapshot)

  handle('getUpdateState', getUpdateState)
  handle('checkForUpdates', checkForUpdates)
  handle('installUpdate', installUpdateNow)
}
