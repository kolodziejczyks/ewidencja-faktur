/**
 * Renders build/icon.png (512×512) from an inline SVG using Electron itself — no image tools needed.
 * Run with: npx electron scripts/make-icon.cjs
 */
const { app, BrowserWindow } = require('electron')
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect x="16" y="16" width="480" height="480" rx="104" fill="#1f5fbf"/>
  <path d="M150 96h170l70 70v250a24 24 0 0 1-24 24H150a24 24 0 0 1-24-24V120a24 24 0 0 1 24-24z" fill="#fffdf7"/>
  <path d="M320 96v46a24 24 0 0 0 24 24h46z" fill="#cfdcf2"/>
  <rect x="166" y="200" width="180" height="20" rx="10" fill="#9fb4d6"/>
  <rect x="166" y="248" width="140" height="20" rx="10" fill="#9fb4d6"/>
  <rect x="166" y="296" width="160" height="20" rx="10" fill="#9fb4d6"/>
  <circle cx="330" cy="370" r="62" fill="#1e7a3a"/>
  <path d="M300 370l20 20 40-42" fill="none" stroke="#fff" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 512, height: 512, transparent: true, frame: false, webPreferences: { offscreen: true } })
  await win.loadURL(
    'data:text/html;charset=utf-8,' +
      encodeURIComponent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`)
  )
  await new Promise((r) => setTimeout(r, 300))
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 })
  writeFileSync(join(__dirname, '..', 'build', 'icon.png'), image.resize({ width: 512, height: 512 }).toPNG())
  console.log('build/icon.png written')
  app.quit()
})
