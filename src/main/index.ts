import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { runBackupIfDue } from './backup'
import { closeDb, getDb } from './db'
import { purgeExpired } from './documents'
import { registerIpc } from './ipc'
import { stopOcr } from './ocr'
import { initUpdater } from './updater'

const BACKUP_CHECK_MS = 6 * 60 * 60 * 1000

// Lets automated tests and screenshots run against a throwaway data folder.
if (process.env.EWF_USER_DATA) app.setPath('userData', process.env.EWF_USER_DATA)

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: 'Ewidencja Faktur',
    backgroundColor: '#f6f4ef',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      spellcheck: true
    }
  })
  win.setMenu(null)
  win.once('ready-to-show', () => {
    win.maximize()
    win.show()
  })

  // Links never open inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

// Only one copy of the app at a time — a second double-click just brings the window forward.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.kolodziejczyks.ewidencjafaktur')
    getDb()
    registerIpc()
    createWindow()
    initUpdater()

    // Housekeeping after the window is up, so start-up stays fast.
    setTimeout(() => {
      purgeExpired()
      runBackupIfDue()
    }, 5_000)
    setInterval(runBackupIfDue, BACKUP_CHECK_MS)
  })

  app.on('window-all-closed', () => app.quit())
  app.on('will-quit', () => {
    void stopOcr()
    closeDb()
  })
}
