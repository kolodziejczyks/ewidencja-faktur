/**
 * End-to-end smoke test: starts the built app against a throwaway data folder, types an invoice in
 * by hand, imports a PDF and a photo through the real UI (including OCR), seeds a year of history,
 * checks the print view and saves screenshots of every screen to screenshots/.
 *
 *   npm run test:e2e
 */
import { _electron as electron } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const root = resolve(import.meta.dirname, '../..')
const shots = join(root, 'screenshots')
const work = mkdtempSync(join(tmpdir(), 'ewf-e2e-'))
const fixtures = join(work, 'fixtures')
mkdirSync(shots, { recursive: true })

execFileSync(electronPath, [join(root, 'tests/e2e/make-fixtures.cjs'), fixtures], { stdio: 'inherit' })

const failures = []
const check = (label, actual, expected) => {
  const ok = actual === expected
  console.log(`${ok ? '✓' : '✗'} ${label}: ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`)
  if (!ok) failures.push(label)
}

// EWF_EXE=dist/win-unpacked/"Ewidencja Faktur.exe" runs the same checks against the packaged app.
const packagedExe = process.env.EWF_EXE
const app = await electron.launch({
  executablePath: packagedExe ?? electronPath,
  args: packagedExe ? [] : [root],
  env: { ...process.env, EWF_USER_DATA: join(work, 'data') }
})
const page = await app.firstWindow()
await page.setViewportSize({ width: 1440, height: 900 })
await page.waitForSelector('text=Zeszyt jest jeszcze pusty')
await page.screenshot({ path: join(shots, '01-empty.png') })

await page.evaluate(() => window.api.setOwnNip('7792433421'))

async function importViaDialog(path) {
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] })
  }, path)
  await page.click('nav >> text=Dodaj fakturę')
  await page.click('button:has-text("Dodaj z pliku")')
  await page.waitForSelector('text=Program odczytał część danych', { timeout: 60_000 })
}

const field = (id) => page.inputValue(`#${id}`)

// 0) The default: typing an invoice in by hand (dated today, so it shows up in "last 10 days")
await page.click('nav >> text=Dodaj fakturę')
await page.waitForSelector('text=Masz fakturę w pliku?')
await page.fill('#supplierName', 'Hurtownia Owoców Jabłonka')
await page.fill('#number', 'FV/77/2026')
await page.fill('#gross', '312,40')
await page.selectOption('#category', { label: 'Towar do sklepu' })
await page.selectOption('#paymentMethod', { label: 'Gotówka' })
await page.screenshot({ path: join(shots, '02-add-manual.png') })
await page.click('button:has-text("Zapisz fakturę")')
await page.waitForSelector('text=Zapisano fakturę')
check('manual form resets after saving', await field('supplierName'), '')

// 1) PDF with a text layer
await importViaDialog(join(fixtures, 'faktura-smak.pdf'))
await page.waitForTimeout(800)
await page.screenshot({ path: join(shots, '03-add-pdf.png') })
check('pdf number', await field('number'), 'FV/2026/10/0153')
check('pdf supplier', await field('supplierName'), 'Hurtownia Spożywcza SMAK Sp. z o.o.')
check('pdf nip', await field('nip'), '525-000-12-04')
check('pdf gross', await field('gross'), '776,14')
check('pdf issue date', await field('issueDate'), '2026-10-14')
check('pdf due date', await field('dueDate'), '2026-10-28')
check('pdf payment method', await field('paymentMethod'), 'transfer')
await page.selectOption('#category', { label: 'Towar do sklepu' })
await page.click('button:has-text("Zapisz fakturę")')
await page.waitForSelector('text=Zapisano fakturę')

// 2) Photo of an invoice -> OCR
await importViaDialog(join(fixtures, 'zdjecie-faktury-piekarnia.png'))
await page.waitForTimeout(800)
await page.screenshot({ path: join(shots, '04-add-photo-ocr.png') })
check('ocr number', await field('number'), 'P/1044/2026')
check('ocr supplier', await field('supplierName'), 'Piekarnia Kłos s.c.')
check('ocr nip', await field('nip'), '894-311-05-22')
check('ocr gross', await field('gross'), '437,85')
check('ocr issue date', await field('issueDate'), '2026-10-29')
await page.click('button:has-text("Zapisz fakturę")')
await page.waitForSelector('text=Zapisano fakturę')

// 3) Seed a year of history so the summary has something to show
await page.evaluate(async () => {
  const suppliers = [
    ['Hurtownia Spożywcza SMAK Sp. z o.o.', '5250001204', 1, 520000],
    ['Piekarnia Kłos s.c.', '', 1, 140000],
    ['Energa Obrót S.A.', '', 2, 68000],
    ['Wynajem lokalu — p. Nowak', '', 3, 250000]
  ]
  const cats = await window.api.listCategories()
  const catId = (order) => cats.find((c) => c.sortOrder === order)?.id ?? null
  for (let m = 1; m <= 13; m++) {
    const d = new Date(2026, 9 - m, 10)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-10`
    for (const [name, nip, cat, base] of suppliers) {
      const wobble = 1 + Math.sin(m * 1.7 + base) * 0.15
      await window.api.saveInvoice({
        kind: 'invoice', number: `S/${m}/${base}`, supplierName: name, supplierNip: nip, issueDate: iso, dueDate: null,
        grossAmount: Math.round(base * wobble), netAmount: null, categoryId: catId(cat), paymentMethod: m % 3 ? 'transfer' : 'cash', note: '', fileIds: []
      })
    }
  }
  // An electricity bill that is much higher than usual
  await window.api.saveInvoice({
    kind: 'invoice', number: 'EN/10/2026', supplierName: 'Energa Obrót S.A.', supplierNip: '', issueDate: '2026-10-05',
    dueDate: '2026-10-20', grossAmount: 152000, netAmount: null, categoryId: catId(2), paymentMethod: 'transfer', note: '', fileIds: []
  })
})
await page.reload()
await page.waitForSelector('text=Wrzesień 2026')
await page.screenshot({ path: join(shots, '05-ledger.png') })
check('unusual amount flagged', await page.isVisible('text=Kwota o'), true)
check('no payment status left', await page.isVisible('text=Do zapłaty'), false)

await page.click('button.entry:has-text("Hurtownia Spożywcza SMAK")')
await page.waitForSelector('text=Wróć do listy')
await page.waitForTimeout(1200)
await page.screenshot({ path: join(shots, '06-invoice.png') })

await page.click('nav >> text=Podsumowanie')
await page.waitForSelector('text=Koszty w ostatnich 12 miesiącach')
await page.waitForTimeout(800)
await page.screenshot({ path: join(shots, '07-summary.png'), fullPage: true })

await page.click('nav >> text=Do druku')
await page.waitForSelector('text=Zestawienie faktur')
check('print defaults to the last 10 days', await page.isVisible('.print-header >> text=Ostatnie 10 dni'), true)
check('manual entry is on the printout', await page.isVisible('.print-table >> text=Hurtownia Owoców Jabłonka'), true)
await page.screenshot({ path: join(shots, '08-print.png') })
await page.click('button:has-text("Ostatni kwartał")')
await page.emulateMedia({ media: 'print' })
await page.screenshot({ path: join(shots, '09-print-preview.png'), fullPage: true })
await page.emulateMedia({ media: 'screen' })

await page.click('nav >> text=Ustawienia')
await page.click('button:has-text("Co nowego w programie")')
await page.screenshot({ path: join(shots, '10-settings.png'), fullPage: true })

// Update banner, as the user would see it once an update has downloaded
await app.evaluate(({ BrowserWindow }) => {
  BrowserWindow.getAllWindows()[0].webContents.send('update-state', {
    status: 'ready',
    version: '0.2.0',
    releaseNotes: 'Co nowego\nDodaliśmy przypomnienia o terminach płatności.\n\nWhat’s new\nPayment reminders.'
  })
})
await page.click('nav >> text=Faktury')
await page.screenshot({ path: join(shots, '11-update-banner.png') })

await app.close()
rmSync(work, { recursive: true, force: true })
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed: ${failures.join(', ')}`)
  process.exit(1)
}
console.log('\nAll checks passed. Screenshots in screenshots/')
