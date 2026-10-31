/**
 * Renders a sample Polish invoice to PDF (with a text layer) and to PNG (like a scan/photo),
 * so the import + OCR flow can be tested end to end. Run with: electron make-fixtures.cjs <outDir>
 */
const { app, BrowserWindow } = require('electron')
const { writeFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')

const outDir = process.argv[process.argv.length - 1]

const invoiceHtml = ({ number, date, due, seller, sellerNip, rows }) => {
  const net = rows.reduce((s, r) => s + r.qty * r.price, 0)
  const vat = rows.reduce((s, r) => s + r.qty * r.price * r.vat, 0)
  const fmt = (n) => n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font-family: Arial, sans-serif; font-size: 14px; margin: 40px; color: #111; width: 720px; background: white; }
    h1 { font-size: 22px; margin: 0 0 6px; }
    .cols { display: flex; gap: 60px; margin: 24px 0; }
    .cols div { flex: 1; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { border: 1px solid #999; padding: 6px; text-align: right; }
    th:nth-child(2), td:nth-child(2) { text-align: left; }
    .total { font-size: 18px; font-weight: bold; margin-top: 16px; }
  </style></head><body>
    <h1>Faktura VAT nr ${number}</h1>
    <div>Data wystawienia: ${date}</div>
    <div>Data sprzedaży: ${date}</div>
    <div class="cols">
      <div><b>Sprzedawca:</b><br>${seller}<br>ul. Magazynowa 5<br>61-001 Poznań<br>NIP: ${sellerNip}</div>
      <div><b>Nabywca:</b><br>Sklep Spożywczy u Anny<br>ul. Polna 3<br>62-020 Swarzędz<br>NIP: 779-243-34-21</div>
    </div>
    <table>
      <tr><th>Lp.</th><th>Nazwa</th><th>Ilość</th><th>Cena netto</th><th>Wartość netto</th><th>VAT</th><th>Wartość brutto</th></tr>
      ${rows
        .map(
          (r, i) =>
            `<tr><td>${i + 1}</td><td>${r.name}</td><td>${r.qty}</td><td>${fmt(r.price)}</td><td>${fmt(r.qty * r.price)}</td><td>${r.vat * 100}%</td><td>${fmt(r.qty * r.price * (1 + r.vat))}</td></tr>`
        )
        .join('')}
      <tr><td></td><td><b>Razem</b></td><td></td><td></td><td>${fmt(net)}</td><td>${fmt(vat)}</td><td>${fmt(net + vat)}</td></tr>
    </table>
    <div style="margin-top:16px">Sposób płatności: przelew<br>Termin płatności: ${due}</div>
    <div class="total">Do zapłaty: ${fmt(net + vat)} zł</div>
  </body></html>`
}

const fixtures = [
  {
    file: 'faktura-smak.pdf',
    data: {
      number: 'FV/2026/10/0153',
      date: '14.10.2026',
      due: '28.10.2026',
      seller: 'Hurtownia Spożywcza SMAK Sp. z o.o.',
      sellerNip: '525-000-12-04',
      rows: [
        { name: 'Mleko 3,2% 1L', qty: 120, price: 2.8, vat: 0.05 },
        { name: 'Masło 200g', qty: 40, price: 6.5, vat: 0.05 },
        { name: 'Woda mineralna 1,5L', qty: 96, price: 1.45, vat: 0.08 }
      ]
    }
  },
  {
    file: 'zdjecie-faktury-piekarnia.png',
    data: {
      number: 'P/1044/2026',
      date: '29.10.2026',
      due: '05.11.2026',
      seller: 'Piekarnia Kłos s.c.',
      sellerNip: '894-311-05-22',
      rows: [
        { name: 'Chleb wiejski 600g', qty: 60, price: 4.2, vat: 0.05 },
        { name: 'Bułka kajzerka', qty: 300, price: 0.55, vat: 0.05 }
      ]
    }
  }
]

app.whenReady().then(async () => {
  mkdirSync(outDir, { recursive: true })
  // Offscreen rendering, because capturePage() never resolves for a plain hidden window.
  const win = new BrowserWindow({ show: false, width: 800, height: 1100, webPreferences: { offscreen: true } })
  for (const f of fixtures) {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(invoiceHtml(f.data)))
    if (f.file.endsWith('.pdf')) {
      writeFileSync(join(outDir, f.file), await win.webContents.printToPDF({ pageSize: 'A4' }))
    } else {
      writeFileSync(join(outDir, f.file), (await win.webContents.capturePage()).toPNG())
    }
  }
  console.log('fixtures written to', outDir)
  app.quit()
})
