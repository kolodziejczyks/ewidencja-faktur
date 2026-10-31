import { describe, expect, it } from 'vitest'
import { buildImportPlan, decodeCsv, IMPORT_TEMPLATE, parseCsv, parseLooseDate } from '../src/shared/importCsv'

const categories = [
  { id: 1, name: 'Towar do sklepu', sortOrder: 1 },
  { id: 2, name: 'Prąd, woda, gaz', sortOrder: 2 }
]

describe('parseCsv', () => {
  it('detects the separator and handles quotes', () => {
    expect(parseCsv('a;b;c\r\n1;"x; y";"say ""hi"""\r\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x; y', 'say "hi"']
    ])
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ])
    expect(parseCsv('a\tb\n1\t2')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ])
  })
})

describe('decodeCsv', () => {
  it('reads UTF-8 with a BOM and falls back to Windows-1250', () => {
    const utf8 = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Kłos')])
    expect(decodeCsv(utf8)).toBe('Kłos')
    // "Kłos" in Windows-1250: ł = 0xB3
    expect(decodeCsv(new Uint8Array([0x4b, 0xb3, 0x6f, 0x73]))).toBe('Kłos')
  })
})

describe('parseLooseDate', () => {
  it.each([
    ['3.9.2026', '2026-09-03'],
    ['03.09.26', '2026-09-03'],
    ['2026-09-03', '2026-09-03'],
    ['03/09/2026', '2026-09-03'],
    ['31.02.2026', null],
    ['wrzesień', null]
  ])('%s', (input, expected) => expect(parseLooseDate(input)).toBe(expected))
})

describe('buildImportPlan', () => {
  it('reads the template', () => {
    const plan = buildImportPlan(parseCsv(IMPORT_TEMPLATE), categories, [])
    expect(plan.error).toBeNull()
    expect(plan.rows.map((r) => r.input)).toEqual([
      {
        kind: 'invoice', number: 'FV/2026/09/0101', supplierName: 'Hurtownia Spożywcza SMAK', supplierNip: '5250001204',
        issueDate: '2026-09-03', dueDate: '2026-09-17', grossAmount: 125040, netAmount: null, categoryId: 1,
        paymentMethod: 'transfer', note: '', fileIds: []
      },
      {
        kind: 'invoice', number: 'P/811/2026', supplierName: 'Piekarnia Kłos', supplierNip: '', issueDate: '2026-09-05',
        dueDate: null, grossAmount: 43785, netAmount: null, categoryId: 1, paymentMethod: 'cash',
        note: 'zapłacone kierowcy', fileIds: []
      }
    ])
    expect(plan.rows.every((r) => !r.problems.length && !r.warnings.length && !r.duplicate)).toBe(true)
  })

  it('matches headers loosely and in any order', () => {
    const plan = buildImportPlan(parseCsv('Kwota brutto;Data wystawienia;Kontrahent\n10,00;1.9.2026;Sklep'), categories, [])
    expect(plan.rows[0].input).toMatchObject({ grossAmount: 1000, issueDate: '2026-09-01', supplierName: 'Sklep' })
  })

  it('rejects a file without the required columns', () => {
    expect(buildImportPlan(parseCsv('dostawca;numer\nA;1'), categories, []).error).toMatch(/data, kwota/)
  })

  it('reports problems and warnings per row', () => {
    const plan = buildImportPlan(
      parseCsv('data;dostawca;kwota;nip;forma_platnosci;kategoria\n;A;10\n1.9.2026;B;abc\n1.9.2026;C;5,00;123;karta;Paliwo'),
      categories,
      []
    )
    expect(plan.rows[0].problems).toEqual(['Brak daty.'])
    expect(plan.rows[1].problems).toEqual(['Nie rozumiem kwoty „abc”.'])
    expect(plan.rows[2].problems).toEqual([])
    expect(plan.rows[2].warnings).toHaveLength(3)
    expect(plan.rows[2].input).toMatchObject({ supplierNip: '', paymentMethod: null, categoryId: null })
  })

  it('flags duplicates of saved invoices and of earlier rows in the file', () => {
    const existing = [{ id: 7, supplierName: 'Piekarnia Kłos', number: '', issueDate: '2026-09-05', grossAmount: 43785 }]
    const csv = 'data;dostawca;numer;kwota\n5.9.2026;PIEKARNIA KŁOS;;437,85\n6.9.2026;Smak;FV/1;10,00\n7.9.2026;smak;fv/1 ;12,00'
    const plan = buildImportPlan(parseCsv(csv), categories, existing)
    expect(plan.rows.map((r) => r.duplicate)).toEqual([{ kind: 'existing', invoiceId: 7 }, null, { kind: 'file', line: 3 }])
  })
})
