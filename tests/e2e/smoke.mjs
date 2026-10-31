/**
 * End-to-end smoke test: starts the built app against a throwaway data folder, types an invoice in
 * by hand, imports a PDF and a photo through the real UI (including OCR), seeds a year of history,
 * checks the print view and saves screenshots of every screen to screenshots/.
 *
 *   npm run test:e2e
 */
import { _electron as electron } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
  // An electricity bill much higher than usual — no longer flagged as anything special
  await window.api.saveInvoice({
    kind: 'invoice', number: 'EN/10/2026', supplierName: 'Energa Obrót S.A.', supplierNip: '', issueDate: '2026-10-05',
    dueDate: '2026-10-20', grossAmount: 152000, netAmount: null, categoryId: catId(2), paymentMethod: 'transfer', note: '', fileIds: []
  })
})
await page.reload()
await page.waitForSelector('text=Wrzesień 2026')
await page.screenshot({ path: join(shots, '05-ledger.png') })
check('no unusual-amount warnings', await page.isVisible('text=wyższa niż zwykle'), false)
check('no payment status left', await page.isVisible('text=Do zapłaty'), false)

await page.click('button.entry:has-text("Hurtownia Spożywcza SMAK")')
await page.waitForSelector('text=Wróć do listy')
await page.waitForTimeout(1200)
await page.screenshot({ path: join(shots, '06-invoice.png') })

await page.click('nav >> text=Podsumowanie')
await page.waitForSelector('text=Koszty miesiąc po miesiącu')
await page.waitForTimeout(800)
await page.screenshot({ path: join(shots, '07-summary.png'), fullPage: true })
await page.click('.period-picker >> button:has-text("Kwartał")')
check('summary switches to quarters', await page.isVisible('text=Co się zmieniło od poprzedniego kwartału'), true)
check('summary chart goes by quarters', await page.isVisible('text=Koszty kwartał po kwartale'), true)
check('ongoing quarter is compared with the same stretch', await page.isVisible('text=jeszcze trwa, więc porównanie obejmuje'), true)
await page.click('.period-picker >> button:has-text("Rok")')
check('summary chart goes by years', await page.isVisible('text=Koszty rok po roku'), true)
await page.click('[aria-label="Poprzedni okres"]')
check('summary goes back a year', await page.isVisible(`.month-picker >> text=Rok ${new Date().getFullYear() - 1}`), true)
await page.click('.period-picker >> button:has-text("Miesiąc")')
check('summary back to months lands on December', await page.isVisible(`.month-picker >> text=Grudzień ${new Date().getFullYear() - 1}`), true)

await page.click('nav >> text=Do druku')
await page.waitForSelector('text=Faktury kosztowe — podsumowanie')
check('one-page summary is the default printout', await page.isChecked('label:has-text("Skrócony") input'), true)
await page.click('label:has-text("Wszystkie faktury")')
await page.waitForSelector('text=Faktury kosztowe — pełna lista')
check('print defaults to the last 10 days', await page.isVisible('.print-header >> text=/^\\d\\d\\.\\d\\d – \\d\\d\\.\\d\\d\\.\\d{4}$/'), true)
check('manual entry is on the printout', await page.isVisible('.print-table >> text=Hurtownia Owoców Jabłonka'), true)
await page.screenshot({ path: join(shots, '08-print.png') })
await page.click('button:has-text("Wybrane daty")')
await page.fill('#printFrom', '2026-09-01')
await page.fill('#printTo', '2026-09-30')
check('custom dates name the month on the printout', await page.isVisible('.print-header h2 >> text=Wrzesień 2026'), true)
await page.fill('#printFrom', '2026-09-15')
check('custom dates print the exact range', await page.isVisible('.print-header h2 >> text=15.09 – 30.09.2026'), true)
await page.click('button:has-text("Ostatni kwartał")')
check('quarter is named on the printout', await page.isVisible('.print-header h2 >> text=/kwartał \\d{4}/'), true)
await page.emulateMedia({ media: 'print' })
await page.screenshot({ path: join(shots, '09-print-preview.png'), fullPage: true })
await page.emulateMedia({ media: 'screen' })

// CSV import: one new row, one duplicate of the manual entry above, one broken row
const csvPath = join(work, 'zeszyt.csv')
const today = new Date().toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })
writeFileSync(
  csvPath,
  [
    'data;dostawca;numer;kwota;forma_platnosci;kategoria',
    '02.09.2026;Hurtownia Napojów Zdrój;Z/12/2026;845,10;przelew;Towar do sklepu',
    `${today};Hurtownia Owoców Jabłonka;FV/77/2026;312,40;gotówka;`,
    ';Bez daty;;10,00;;'
  ].join('\r\n')
)
await app.evaluate(({ dialog }, p) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] })
}, csvPath)
const countInvoices = () => page.evaluate(async () => (await window.api.listInvoices()).length)
const before = await countInvoices()
await page.click('nav >> text=Ustawienia')
await page.click('button:has-text("Wczytaj faktury z pliku")')
await page.click('button:has-text("Wybierz plik CSV")')
await page.waitForSelector('text=Sprawdź, co zostanie dodane')
check('import: duplicate recognised', await page.isVisible('text=Już jest w programie'), true)
check('import: broken row reported', await page.isVisible('text=Brak daty.'), true)
await page.screenshot({ path: join(shots, '10-import-preview.png'), fullPage: true })
await page.click('button:has-text("Dodaj 1 fakturę")')
await page.waitForSelector('text=Dodano 1 fakturę')
check('import: one invoice added', (await countInvoices()) - before, 1)
await page.click('button:has-text("Cofnij ten import")')
await page.click('.modal >> button:has-text("Tak, cofnij")')
await page.waitForSelector('text=Cofnięto import')
check('import: undo removes it again', (await countInvoices()) - before, 0)

await page.click('nav >> text=Ustawienia')
await page.click('button:has-text("Co nowego w programie")')
await page.screenshot({ path: join(shots, '11-settings.png'), fullPage: true })

// Update banner, as the user would see it once an update has downloaded — with real, long notes
const releaseNotes = readFileSync(join(root, 'build/release-notes.md'), 'utf8')
await app.evaluate(({ BrowserWindow }, notes) => {
  BrowserWindow.getAllWindows()[0].webContents.send('update-state', { status: 'ready', version: '9.9.9', releaseNotes: notes })
}, releaseNotes)
await page.click('nav >> text=Faktury')
const banner = await page.locator('.update-banner').boundingBox()
check('update banner stays compact', banner != null && banner.height < 140, true)
await page.screenshot({ path: join(shots, '12-update-banner.png') })
await page.click('.update-banner >> button:has-text("Co nowego?")')
check('release notes dialog lists the Polish changes', (await page.locator('.notes-list li').count()) > 0, true)
check('release notes dialog has no English part', await page.isVisible('.notes-list >> text=What'), false)
await page.screenshot({ path: join(shots, '13-update-notes.png') })
await page.click('.modal >> button:has-text("Zamknij")')

await app.close()
rmSync(work, { recursive: true, force: true })
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed: ${failures.join(', ')}`)
  process.exit(1)
}
console.log('\nAll checks passed. Screenshots in screenshots/')
