import { describe, expect, it } from 'vitest'
import { formatMoney, moneyToInput, parseMoney } from '../src/shared/money'
import { formatNip, isValidNip } from '../src/shared/nip'
import { computeFlags } from '../src/shared/insights'
import { periodLabel, periodOf, periodShortLabel, inPeriodPhrase, invoicesInPeriod, lastDayOf, shiftPeriod } from '../src/shared/periods'
import { compareSuppliers, invoicesInMonth, monthSeries, periodSeries, topWithRest, totalsByPeriod } from '../src/shared/summary'

describe('money', () => {
  it.each([
    ['1 234,56 zł', 123456],
    ['1234.56', 123456],
    ['1.234,56', 123456],
    ['12', 1200],
    ['0,5', 50],
    ['-10,00', -1000],
    ['abc', null],
    ['', null]
  ])('parses %s', (input, expected) => expect(parseMoney(input)).toBe(expected))

  it('formats for display and editing', () => {
    expect(formatMoney(123456)).toBe('1 234,56 zł')
    expect(moneyToInput(123405)).toBe('1234,05')
  })
})

describe('nip', () => {
  it('validates the checksum', () => {
    expect(isValidNip('525-000-12-04')).toBe(true)
    expect(isValidNip('PL 7792433421')).toBe(true)
    expect(isValidNip('5250001205')).toBe(false)
    expect(isValidNip('0000000000')).toBe(false)
  })
  it('formats', () => expect(formatNip('5250001204')).toBe('525-000-12-04'))
})

describe('computeFlags', () => {
  const base = { number: '' }

  it('flags duplicates by supplier and normalized number', () => {
    const flags = computeFlags([
        { ...base, id: 1, supplierId: 7, number: 'FV/1/2026', issueDate: '2026-10-01', grossAmount: 100 },
        { ...base, id: 2, supplierId: 7, number: 'fv/1/2026 ', issueDate: '2026-10-02', grossAmount: 100 },
        { ...base, id: 3, supplierId: 8, number: 'FV/1/2026', issueDate: '2026-10-02', grossAmount: 100 }
    ])
    expect(flags.get(1)).toEqual([{ type: 'duplicate', otherId: 2 }])
    expect(flags.get(3)).toBeUndefined()
  })

  it('does not flag amounts, however much they vary', () => {
    const amounts = [10000, 11000, 9000, 10500, 20000]
    const invoices = amounts.map((a, i) => ({ ...base, id: i + 1, supplierId: 1, issueDate: `2026-0${i + 1}-10`, grossAmount: a }))
    expect(computeFlags(invoices).size).toBe(0)
  })
})

describe('summary', () => {
  const inv = (issueDate: string, supplierName: string, grossAmount: number) => ({
    issueDate, supplierName, grossAmount, categoryName: '', paymentMethod: null
  })
  const data = [inv('2026-09-03', 'A', 1000), inv('2026-10-03', 'A', 1500), inv('2026-10-04', 'B', 500)]

  it('builds a month series including empty months', () => {
    expect(monthSeries(data, '2026-11', 3).map((m) => m.total)).toEqual([1000, 2000, 0])
  })

  it('totals per day and per month with the payment split', () => {
    const paid = [
      { ...inv('2026-09-03', 'A', 1000), paymentMethod: 'cash' as const },
      { ...inv('2026-10-03', 'A', 1500), paymentMethod: 'transfer' as const },
      { ...inv('2026-10-03', 'B', 500), paymentMethod: 'cash' as const }
    ]
    expect(totalsByPeriod(paid, 'month')).toEqual([
      { key: '2026-09', count: 1, cash: 1000, transfer: 0, total: 1000 },
      { key: '2026-10', count: 2, cash: 500, transfer: 1500, total: 2000 }
    ])
    expect(totalsByPeriod(paid, 'day').map((p) => p.key)).toEqual(['2026-09-03', '2026-10-03'])
  })

  it('folds small groups into "Pozostali"', () => {
    const groups = [5, 4, 3, 2, 1].map((t, i) => ({ name: `S${i}`, total: t, count: 1 }))
    expect(topWithRest(groups, 2)).toEqual([groups[0], groups[1], { name: 'Pozostali (3)', total: 6, count: 3 }])
    expect(topWithRest(groups, 4)).toEqual(groups)
  })

  it('compares two months per supplier', () => {
    expect(compareSuppliers(invoicesInMonth(data, '2026-09'), invoicesInMonth(data, '2026-10'))).toEqual([
      { name: 'A', a: 1000, b: 1500, diff: 500, percent: 50 },
      { name: 'B', a: 0, b: 500, diff: 500, percent: null }
    ])
  })
})

describe('periods', () => {
  it('finds the month, quarter and year of a date', () => {
    expect(periodOf('month', '2026-10-31')).toEqual({ kind: 'month', start: '2026-10' })
    expect(periodOf('quarter', '2026-08-15')).toEqual({ kind: 'quarter', start: '2026-07' })
    expect(periodOf('year', '2026-08-15')).toEqual({ kind: 'year', start: '2026-01' })
  })

  it('moves between periods across years', () => {
    expect(shiftPeriod({ kind: 'quarter', start: '2026-01' }, -1)).toEqual({ kind: 'quarter', start: '2025-10' })
    expect(shiftPeriod({ kind: 'year', start: '2026-01' }, -1)).toEqual({ kind: 'year', start: '2025-01' })
  })

  it('names periods', () => {
    expect(periodLabel({ kind: 'quarter', start: '2026-10' })).toBe('IV kwartał 2026')
    expect(periodLabel({ kind: 'year', start: '2026-01' })).toBe('Rok 2026')
    expect(inPeriodPhrase({ kind: 'month', start: '2026-09' })).toBe('we wrześniu')
    expect(inPeriodPhrase({ kind: 'quarter', start: '2026-07' })).toBe('w III kwartale')
    expect(lastDayOf({ kind: 'quarter', start: '2024-01' })).toBe('2024-03-31')
  })

  it('totals a series of quarters and years', () => {
    const inv = (issueDate: string, supplierName: string, grossAmount: number) => ({
      issueDate, supplierName, grossAmount, categoryName: '', paymentMethod: null
    })
    const rows = [
      inv('2025-12-31', 'A', 100),
      inv('2026-01-05', 'A', 200),
      inv('2026-03-31', 'B', 300),
      inv('2026-04-01', 'A', 400)
    ]
    expect(periodSeries(rows, { kind: 'quarter', start: '2026-04' }, 3).map((s) => [periodShortLabel(s.period), s.total])).toEqual([
      ['IV kw. 25', 100],
      ['I kw. 26', 500],
      ['II kw. 26', 400]
    ])
    expect(periodSeries(rows, { kind: 'year', start: '2026-01' }, 2).map((s) => s.total)).toEqual([100, 900])
  })

  it('selects the invoices of a quarter', () => {
    const rows = ['2026-06-30', '2026-07-01', '2026-09-30', '2026-10-01'].map((issueDate) => ({ issueDate }))
    expect(invoicesInPeriod(rows, { kind: 'quarter', start: '2026-07' }).map((r) => r.issueDate)).toEqual(['2026-07-01', '2026-09-30'])
  })
})
