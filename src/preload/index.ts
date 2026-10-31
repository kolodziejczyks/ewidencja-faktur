import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { Api, UpdateState } from '@shared/types'

const call =
  (channel: string) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args)

const api: Api = {
  getAppInfo: call('getAppInfo'),

  listInvoices: call('listInvoices'),
  listDeletedInvoices: call('listDeletedInvoices'),
  getInvoice: call('getInvoice'),
  saveInvoice: call('saveInvoice'),
  setPaid: call('setPaid'),
  deleteInvoice: call('deleteInvoice'),
  restoreInvoice: call('restoreInvoice'),
  findDuplicate: call('findDuplicate'),

  listSuppliers: call('listSuppliers'),
  listCategories: call('listCategories'),
  addCategory: call('addCategory'),
  renameCategory: call('renameCategory'),

  pickFiles: call('pickFiles'),
  importFiles: call('importFiles'),
  pathForDroppedFile: (file: File) => webUtils.getPathForFile(file),
  readFile: call('readFile'),
  openFileExternally: call('openFileExternally'),
  readDocx: call('readDocx'),
  ocrFile: call('ocrFile'),
  ocrImage: call('ocrImage'),

  exportExcel: call('exportExcel'),
  openPath: call('openPath'),
  showInFolder: call('showInFolder'),

  getSettings: call('getSettings'),
  setOwnNip: call('setOwnNip'),
  setLastSeenVersion: call('setLastSeenVersion'),
  chooseBackupFolder: call('chooseBackupFolder'),
  getBackupStatus: call('getBackupStatus'),
  backupNow: call('backupNow'),
  restoreBackup: call('restoreBackup'),

  getUpdateState: call('getUpdateState'),
  checkForUpdates: call('checkForUpdates'),
  installUpdate: call('installUpdate'),
  onUpdateState: (callback: (state: UpdateState) => void) => {
    const listener = (_event: unknown, state: UpdateState) => callback(state)
    ipcRenderer.on('update-state', listener)
    return () => ipcRenderer.removeListener('update-state', listener)
  }
} as Api

contextBridge.exposeInMainWorld('api', api)
