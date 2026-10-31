import { describe, expect, it } from 'vitest'
import { parseInvoiceText } from '../src/shared/invoiceParser'

// The NIPs below are made up but pass the checksum.
const OWN_NIP = '7792433421'

const typicalPdf = `
Faktura VAT nr FV/2026/10/0153
Data wystawienia: 14.10.2026 Miejsce wystawienia: Poznań
Data sprzedaży: 14.10.2026
Sprzedawca: Nabywca:
Hurtownia Spożywcza SMAK Sp. z o.o.   Sklep Spożywczy u Anny
ul. Magazynowa 5, 61-001 Poznań   ul. Polna 3, 62-020 Swarzędz
NIP: 525-000-12-04   NIP: 779-243-34-21
Lp. Nazwa Ilość Cena netto Wartość netto VAT Wartość brutto
1 Mleko 3,2% 1L 120 2,80 336,00 5% 352,80
2 Masło 200g 40 6,50 260,00 5% 273,00
Razem 596,00 29,80 625,80
Sposób płatności: przelew
Termin płatności: 28.10.2026
Do zapłaty: 625,80 zł
Słownie: sześćset dwadzieścia pięć 80/100
`

describe('parseInvoiceText', () => {
  it('reads a typical wholesaler invoice', () => {
    const r = parseInvoiceText(typicalPdf, { ownNip: OWN_NIP })
    expect(r).toEqual({
      number: 'FV/2026/10/0153',
      supplierName: 'Hurtownia Spożywcza SMAK Sp. z o.o.',
      supplierNip: '5250001204',
      issueDate: '2026-10-14',
      dueDate: '2026-10-28',
      grossAmount: 62580,
      netAmount: 59600
    })
  })

  it('ignores the buyer NIP even when it comes first', () => {
    const text = `Nabywca: Sklep u Anny NIP 7792433421\nSprzedawca: Piekarnia Kłos\nNIP 5250001204\nDo zapłaty 100,00 zł`
    expect(parseInvoiceText(text, { ownNip: OWN_NIP }).supplierNip).toBe('5250001204')
  })

  it('handles thousands separators, ISO dates and payment terms in days', () => {
    const text = `FAKTURA NR 12/10/2026
Data wystawienia 2026-10-02
Sprzedawca
P.H.U. Napoje Kowalski
PL5250001204
Termin płatności: 14 dni
Razem brutto: 12 345,67 PLN`
    const r = parseInvoiceText(text)
    expect(r.number).toBe('12/10/2026')
    expect(r.supplierName).toBe('P.H.U. Napoje Kowalski')
    expect(r.issueDate).toBe('2026-10-02')
    expect(r.dueDate).toBe('2026-10-16')
    expect(r.grossAmount).toBe(1234567)
  })

  it('copes with OCR noise and dotted decimals', () => {
    const text = `Faktura VAT Nr: A-77/26\nWystawiona dnia 3.09.2026\nDO ZAPŁATY: 1 049.99 zł`
    const r = parseInvoiceText(text)
    expect(r.number).toBe('A-77/26')
    expect(r.issueDate).toBe('2026-09-03')
    expect(r.grossAmount).toBe(104999)
  })

  it('returns nulls for unrelated text instead of guessing wildly', () => {
    const r = parseInvoiceText('Kupić chleb i mleko. Zadzwonić do pana Marka.')
    expect(r).toEqual({
      number: null,
      supplierName: null,
      supplierNip: null,
      issueDate: null,
      dueDate: null,
      grossAmount: null,
      netAmount: null
    })
  })
})
