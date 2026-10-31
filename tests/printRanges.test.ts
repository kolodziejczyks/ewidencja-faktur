import { describe, expect, it } from 'vitest'
import { printRanges } from '../src/shared/printRanges'

const byId = (today: string) => Object.fromEntries(printRanges(today).map((r) => [r.id, [r.from, r.to]]))

describe('printRanges', () => {
  it('computes every range relative to today', () => {
    expect(byId('2026-10-31')).toEqual({
      last10Days: ['2026-10-22', '2026-10-31'],
      thisMonth: ['2026-10-01', '2026-10-31'],
      lastMonth: ['2026-09-01', '2026-09-30'],
      lastQuarter: ['2026-07-01', '2026-09-30'],
      thisYear: ['2026-01-01', '2026-12-31']
    })
  })

  it('crosses month and year boundaries', () => {
    const r = byId('2026-02-05')
    expect(r.last10Days).toEqual(['2026-01-27', '2026-02-05'])
    expect(r.lastMonth).toEqual(['2026-01-01', '2026-01-31'])
    expect(r.lastQuarter).toEqual(['2025-10-01', '2025-12-31'])
    expect(r.thisMonth).toEqual(['2026-02-01', '2026-02-28'])
  })
})
