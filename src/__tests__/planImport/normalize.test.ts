import { describe, it, expect } from 'vitest'
import { normalizeExtraction, placeWeek } from '../../utils/planImport/normalize'
import { readImportedPlan } from '../../utils/planImport/types'

/**
 * Initiative 004, PR 4: the endpoint's reply becomes the stored plan. Days
 * are placed and kilometres converted in code, sessions stay separate, and
 * whatever comes back is a plan the app can open.
 */

const SOURCE = { name: 'coach-plan.pdf', kind: 'pdf' as const }
const AT = '2026-10-09T08:00:00.000Z'

const S = (t: string, w = t) => ({ d: 'any' as const, t: t as 'run', w })

function extraction(weeks: unknown[], over: Record<string, unknown> = {}) {
  return { status: 'ok', title: 'Spring 10K', sport: 'road', units: 'mi', weeks, ...over }
}

function run(ex: unknown, warnings?: unknown) {
  return normalizeExtraction({ extraction: ex, warnings, source: SOURCE, importedAt: AT })
}

function ok(ex: unknown, warnings?: unknown) {
  const r = run(ex, warnings)
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`)
  return r.value
}

describe('normalizeExtraction — the stored plan', () => {
  it('turns named weekdays, types, amounts and effort into stored sessions', () => {
    const v = ok(extraction([
      { focus: 'Base', s: [
        { d: 'tue', t: 'run', w: 'Easy run', dist: 4, z: 'easy' },
        { d: 'thu', t: 'quality', w: 'Tempo', x: '2 mi at tempo', dist: 5, min: 45, z: 'tempo' },
        { d: 'sun', t: 'long', w: 'Long run', dist: 8 },
      ] },
    ]))
    expect(v.plan.v).toBe(1)
    expect(v.plan.source).toEqual({ name: 'coach-plan.pdf', kind: 'pdf', importedAt: AT })
    expect(v.plan.title).toBe('Spring 10K')
    expect(v.plan.weeks[0].focus).toBe('Base')
    expect(v.plan.weeks[0].sessions).toEqual([
      { day: 2, type: 'run', title: 'Easy run', distanceMi: 4, intensity: 'easy' },
      { day: 4, type: 'quality', title: 'Tempo', detail: '2 mi at tempo', distanceMi: 5, durationMin: 45, intensity: 'tempo' },
      { day: 7, type: 'long', title: 'Long run', distanceMi: 8 },
    ])
  })

  it('keeps two sessions on one day as two sessions', () => {
    const v = ok(extraction([{ s: [
      { d: 'sat', t: 'long', w: 'Long run', dist: 14 },
      { d: 'sat', t: 'quality', w: 'Strides', x: '6 x 20 s' },
    ] }]))
    expect(v.plan.weeks[0].sessions.map(s => [s.day, s.title])).toEqual([[6, 'Long run'], [6, 'Strides']])
  })

  it('converts kilometres to miles and keeps the plan\'s own figure in the detail', () => {
    const v = ok(extraction([{ s: [
      { d: 'tue', t: 'run', w: 'Easy', dist: 10 },
      { d: 'sun', t: 'long', w: 'Long', dist: 21.1, x: 'Half marathon distance' },
      { d: 'thu', t: 'quality', w: 'Intervals', dist: 8, x: '8 km with 5 x 1 km' },
    ] }], { units: 'km' }))
    const [easy, intervals, long] = v.plan.weeks[0].sessions
    expect(easy.distanceMi).toBeCloseTo(6.21, 2)
    expect(easy.detail).toBe('10 km')
    expect(long.distanceMi).toBeCloseTo(13.11, 2)
    expect(long.detail).toBe('21.1 km — Half marathon distance')
    // Already says "8 km": not repeated.
    expect(intervals.detail).toBe('8 km with 5 x 1 km')
    // "18 km" is not "8 km".
    const v2 = ok(extraction([{ s: [{ d: 'tue', t: 'run', w: 'Easy', dist: 8, x: 'Build to 18 km next month' }] }], { units: 'km' }))
    expect(v2.plan.weeks[0].sessions[0].detail).toBe('8 km — Build to 18 km next month')
    expect(v.notes.some(n => /kilometres/.test(n))).toBe(true)
  })

  it('reads miles and unknown units as miles, unconverted', () => {
    for (const units of ['mi', 'none']) {
      const v = ok(extraction([{ s: [{ d: 'tue', t: 'run', w: 'Easy', dist: 6 }] }], { units }))
      expect(v.plan.weeks[0].sessions[0].distanceMi).toBe(6)
      expect(v.plan.weeks[0].sessions[0].detail).toBeUndefined()
    }
  })

  it('keeps an empty week as a week of rest days, in place', () => {
    const v = ok(extraction([
      { s: [{ d: 'tue', t: 'run', w: 'Easy', dist: 3 }] },
      { focus: 'Recovery', s: [] },
      { s: [{ d: 'tue', t: 'run', w: 'Easy', dist: 4 }] },
    ]))
    expect(v.plan.weeks).toHaveLength(3)
    expect(v.plan.weeks[1]).toEqual({ focus: 'Recovery', sessions: [] })
  })

  it('names the plan after the file when the document has no title', () => {
    const v = ok(extraction([{ s: [{ d: 'tue', t: 'run', w: 'Easy' }] }], { title: '' }))
    expect(v.plan.title).toBe('coach-plan')
  })

  it('keeps its own notes when the reader sent the most it may', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => `Reader note ${i + 1}`)
    const v = ok(
      extraction([{ s: [S('run', 'A'), S('long', 'L')] }], { notes: twenty, units: 'km' }),
      ["We couldn't tell if distances are in miles or kilometres. Check them."],
    )
    expect(v.notes).toHaveLength(20)
    expect(v.notes[0]).toMatch(/had no day/)
    expect(v.notes.some(n => /miles or kilometres/.test(n))).toBe(true)
  })

  it('names the source "My plan" when the file name is blank', () => {
    const r = normalizeExtraction({
      extraction: extraction([{ s: [{ d: 'tue', t: 'run', w: 'Easy' }] }], { title: '' }),
      source: { name: '  ', kind: 'text' }, importedAt: AT,
    })
    expect(r.ok && r.value.plan.source.name).toBe('My plan')
    expect(r.ok && r.value.plan.title).toBe('My plan')
  })

  it('passes the reader\'s notes, the server\'s warnings and the levels through', () => {
    const v = ok(
      extraction([{ s: [{ d: 'tue', t: 'run', w: 'Easy' }] }], { notes: ['Week 3 was smudged'], levels: ['Beginner', 'Advanced'] }),
      ['1 item(s) we couldn\'t read were left out.'],
    )
    expect(v.notes).toContain('Week 3 was smudged')
    expect(v.notes).toContain('1 item(s) we couldn\'t read were left out.')
    expect(v.levels).toEqual(['Beginner', 'Advanced'])
    expect(v.plan.notes).toEqual(v.notes)
  })

  it('keeps printed dates as suggestions only, never in the stored plan', () => {
    const v = ok(extraction([{ s: [{ d: 'tue', t: 'run', w: 'Easy' }] }], {
      start_date: '2026-11-02',
      race: { name: 'City Half', date: '2027-03-14', distance: 'Half marathon' },
    }))
    expect(v.suggestions).toEqual({ startDate: '2026-11-02', raceName: 'City Half', raceDate: '2027-03-14' })
    expect(v.plan.raceDistance).toBe('Half marathon')
    expect(JSON.stringify(v.plan)).not.toContain('2026-11-02')
    expect(JSON.stringify(v.plan)).not.toContain('2027-03-14')
  })

  it('builds what the app\'s own check accepts, and what survives sync', () => {
    const v = ok(extraction(Array.from({ length: 6 }, (_, i) => ({ focus: `W${i + 1}`, s: [
      { d: 'any', t: 'run', w: 'Easy', dist: 3 }, { d: 'any', t: 'long', w: 'Long', dist: 6 + i },
    ] })), { units: 'km' }))
    expect(readImportedPlan(JSON.parse(JSON.stringify(v.plan)))).toEqual(v.plan)
  })
})

describe('normalizeExtraction — failures', () => {
  it('says why when there is nothing to store', () => {
    expect(run(extraction([], { status: 'not_a_plan' }))).toEqual({ ok: false, reason: 'not_a_plan' })
    expect(run(extraction([], { status: 'unreadable' }))).toEqual({ ok: false, reason: 'unreadable' })
    expect(run(extraction([{ s: [] }, { s: [{ d: 'mon', t: 'rest', w: 'Rest' }] }]))).toEqual({ ok: false, reason: 'empty' })
  })

  it('never throws, whatever the reply holds', () => {
    const odd = [null, undefined, 1, 'x', [], {}, { status: 'ok' }, { status: 'ok', weeks: 'x' },
      { status: 'ok', weeks: [null, 1, { s: 'x' }, { s: [null, { t: 'run' }, { t: 'nope', w: 'x' }] }] },
      { status: 'ok', sport: ['road'], units: { a: 1 }, weeks: [{ s: [{ d: ['tue'], t: 'run', w: 'Easy', dist: 'x', min: -1, z: 7 }] }] }]
    for (const ex of odd) {
      expect(() => run(ex)).not.toThrow()
    }
    // The last one is readable: odd fields fall back, the session survives.
    const r = run(odd[odd.length - 1])
    expect(r.ok && r.value.plan.weeks[0].sessions[0]).toMatchObject({ type: 'run', title: 'Easy' })
    expect(r.ok && r.value.plan.sport).toBe('road')
  })

  it('stays within the app\'s limits', () => {
    const many = Array.from({ length: 45 }, () => ({ s: [{ d: 'tue', t: 'run', w: 'Easy' }] }))
    const v = ok(extraction(many))
    expect(v.plan.weeks).toHaveLength(40)
    const crowded = ok(extraction([{ s: Array.from({ length: 20 }, () => ({ d: 'tue', t: 'run', w: 'Easy' })) }]))
    expect(crowded.plan.weeks[0].sessions).toHaveLength(14)
  })
})

describe('placeWeek — sessions the plan puts on no day', () => {
  it('seven unnamed sessions become Monday to Sunday in order', () => {
    const week = ['rest', 'run', 'quality', 'run', 'rest', 'run', 'long'].map(t => S(t))
    const { placed, chosen } = placeWeek(week)
    expect(placed.map(s => [s.d, s.t])).toEqual([
      [1, 'rest'], [2, 'run'], [3, 'quality'], [4, 'run'], [5, 'rest'], [6, 'run'], [7, 'long'],
    ])
    expect(chosen).toBe(5)
  })

  it('puts a long run that closes the week on Sunday, the rest spread out before it', () => {
    const { placed } = placeWeek([S('run', 'A'), S('quality', 'B'), S('run', 'C'), S('long', 'L')])
    expect(placed.map(s => [s.w, s.d])).toEqual([['A', 2], ['B', 4], ['C', 6], ['L', 7]])
  })

  it('never changes the plan\'s order, even when the long run is mid-week', () => {
    // A plan whose "Day 5" is the long run and "Day 6" a recovery run.
    const { placed } = placeWeek([S('run', 'A'), S('quality', 'B'), S('run', 'C'), S('run', 'D'), S('long', 'L'), S('run', 'R')])
    expect(placed.map(s => s.w)).toEqual(['A', 'B', 'C', 'D', 'L', 'R'])
    const days = placed.map(s => s.d)
    expect([...days].sort((a, b) => a - b)).toEqual(days)
  })

  it('leaves Sunday to a session the plan named there', () => {
    const { placed } = placeWeek([{ d: 7, t: 'race', w: 'Race' }, S('run', 'A'), S('long', 'L')])
    expect(placed.map(s => [s.w, s.d])).toEqual([['A', 2], ['L', 4], ['Race', 7]])
  })

  it('without a long run, three sessions go Tuesday, Thursday, Saturday', () => {
    const { placed } = placeWeek([S('run', 'A'), S('run', 'B'), S('run', 'C')])
    expect(placed.map(s => s.d)).toEqual([2, 4, 6])
  })

  it('drops unnamed rest days unless the week is a full seven', () => {
    const { placed, chosen } = placeWeek([S('run', 'A'), S('rest', 'R'), S('run', 'B')])
    expect(placed.map(s => s.w)).toEqual(['A', 'B'])
    expect(chosen).toBe(2)
  })

  it('works around days the plan did name', () => {
    const { placed } = placeWeek([
      { d: 2, t: 'quality', w: 'Named Tue' }, S('run', 'A'), S('run', 'B'), S('long', 'L'),
    ])
    expect(placed.map(s => [s.w, s.d])).toEqual([['Named Tue', 2], ['A', 4], ['B', 6], ['L', 7]])
  })

  it('says it spread the sessions, not where long runs went', () => {
    const v = ok(extraction([{ s: ['rest', 'run', 'quality', 'run', 'rest', 'long', 'run'].map(t => S(t)) }]))
    const note = v.notes.find(n => /had no day/.test(n)) ?? ''
    expect(note).toMatch(/in the plan's order/)
    expect(note).not.toMatch(/Sunday/)
  })

  it('doubles up only when the week has more sessions than days', () => {
    const nine = Array.from({ length: 9 }, (_, i) => S('run', `R${i}`))
    const { placed } = placeWeek(nine)
    expect(placed).toHaveLength(9)
    const perDay = new Map<number, number>()
    for (const s of placed) perDay.set(s.d, (perDay.get(s.d) ?? 0) + 1)
    expect([...perDay.values()].every(n => n <= 2)).toBe(true)
    expect(perDay.size).toBe(7)
  })

  it('keeps a fully named week\'s days, Monday first, same-day sessions in the plan\'s order', () => {
    const week = [
      { d: 3, t: 'run' as const, w: 'Wed' }, { d: 1, t: 'run' as const, w: 'Mon' },
      { d: 3, t: 'strength' as const, w: 'Wed gym' },
    ]
    expect(placeWeek(week)).toEqual({ placed: [week[1], week[0], week[2]], chosen: 0 })
  })

  it('tells the athlete when it chose days', () => {
    const v = ok(extraction([{ s: [S('run', 'A'), S('long', 'L')] }]))
    expect(v.notes.some(n => /had no day in your plan/.test(n))).toBe(true)
    const named = ok(extraction([{ s: [{ d: 'tue', t: 'run', w: 'A' }] }]))
    expect(named.notes.some(n => /had no day/.test(n))).toBe(false)
  })
})
