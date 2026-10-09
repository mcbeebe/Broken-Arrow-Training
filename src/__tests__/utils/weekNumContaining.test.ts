import { describe, it, expect } from 'vitest'
import { weekNumContaining } from '../../utils/planDates'

const weeks = [
  { num: 1, startIso: '2026-10-12' },
  { num: 2, startIso: '2026-10-19' },
  { num: 3, startIso: '2026-10-26' },
]

describe('weekNumContaining', () => {
  it('finds the week whose seven days hold the date, Monday through Sunday', () => {
    expect(weekNumContaining(weeks, '2026-10-12')).toBe(1)
    expect(weekNumContaining(weeks, '2026-10-18')).toBe(1)
    expect(weekNumContaining(weeks, '2026-10-19')).toBe(2)
    expect(weekNumContaining(weeks, '2026-11-01')).toBe(3)
  })

  it('maps a date before the plan to its first week and after it to its last', () => {
    expect(weekNumContaining(weeks, '2026-09-01')).toBe(1)
    expect(weekNumContaining(weeks, '2027-03-01')).toBe(3)
  })

  it('reads weeks in date order whatever order they arrive in', () => {
    expect(weekNumContaining([weeks[2], weeks[0], weeks[1]], '2026-10-20')).toBe(2)
  })

  it('maps a date in a gap between weeks to the week before the gap', () => {
    const gapped = [{ num: 1, startIso: '2026-10-12' }, { num: 2, startIso: '2026-11-02' }]
    expect(weekNumContaining(gapped, '2026-10-25')).toBe(1)
  })

  it('gives up when the plan is empty or any week has no start date', () => {
    expect(weekNumContaining([], '2026-10-12')).toBeUndefined()
    expect(weekNumContaining([...weeks, { num: 4 }], '2026-10-12')).toBeUndefined()
  })
})
