/**
 * Date correctness (PR-5).
 *
 * Three defects, one theme: a calendar date that means one thing to the
 * athlete and another to the code.
 *
 *  1. `parseRaceDate` read a bare `YYYY-MM-DD` as UTC midnight and compared it
 *     with LOCAL date getters, so west of Greenwich every countdown was a day
 *     short — on race morning the athlete was told the race was yesterday.
 *     Reproduced on stock HEAD: `TZ=America/New_York` gave 2 failures with
 *     `expected -1 to be +0`; UTC passed 24/24. That asymmetry is exactly why
 *     it survived: CI runs in UTC, and the app's stated market does not.
 *  2. The onboarding anchor-race year was a silent no-op when picked before a
 *     month, and a month-only pick could stamp a FUTURE anchor date.
 *  3. Tests that call a generator without an explicit `today` read the wall
 *     clock, so a fixed race date makes the runway shrink daily and the suite
 *     is scheduled to fail on a date nobody chose.
 */
import { describe, it, expect } from 'vitest'
import { parseRaceDate, daysUntilRace, weeksUntilRace } from '../../utils/raceCountdown'

describe('parseRaceDate — a bare ISO date is a LOCAL calendar date', () => {
  it('resolves to the calendar day the athlete typed, whatever the host offset', () => {
    // Under the old UTC-midnight parse this returned 13 May in every timezone
    // west of Greenwich. The assertion is offset-independent: it compares the
    // parsed LOCAL components with the string's own components.
    const d = parseRaceDate('2026-05-14')!
    expect(d).not.toBeNull()
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 5, 14])
  })

  it('is midnight local, so a same-day evening reads as 0 days out', () => {
    const d = parseRaceDate('2026-05-14')!
    expect([d.getHours(), d.getMinutes()]).toEqual([0, 0])
    // 18:00 on race day: still race day, not "yesterday".
    expect(daysUntilRace('2026-05-14', new Date(2026, 4, 14, 18, 0))).toBe(0)
  })

  it('still accepts the natural-language form the plan fixtures use', () => {
    const d = parseRaceDate('Saturday, June 20, 2026')!
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 6, 20])
    expect(daysUntilRace('Saturday, June 20, 2026', new Date(2026, 4, 14, 12, 0))).toBe(37)
  })

  it('countdown arithmetic holds across a month boundary and a DST transition', () => {
    // US DST springs forward 2026-03-08; a naive ms/86400000 division across
    // it yields 6.958 days and floors to 6.
    expect(daysUntilRace('2026-03-09', new Date(2026, 2, 2, 9, 0))).toBe(7)
    expect(weeksUntilRace('2026-03-09', new Date(2026, 2, 2, 9, 0))).toBe(1)
    expect(daysUntilRace('2026-04-01', new Date(2026, 2, 30, 23, 30))).toBe(2)
  })

  it('returns null for malformed input rather than an Invalid Date', () => {
    expect(parseRaceDate('')).toBeNull()
    expect(parseRaceDate('not a date')).toBeNull()
    expect(daysUntilRace('2026-13-45')).toBeNull()
  })
})

describe('no test may read the wall clock through a generator', () => {
  // The generators default `today` to `new Date()`. A test that omits it and
  // pins a race date is a time bomb: compromisedRunningCoaching.test.ts was
  // set to start failing on 2026-11-10 with nobody having touched the code.
  // Vite reads the sources for us — no node types, no filesystem walk.
  const SOURCES = import.meta.glob('../**/*.test.{ts,tsx}', {
    query: '?raw', import: 'default', eager: true,
  }) as Record<string, string>
  const CALLS: { fn: string; minArgs: number }[] = [
    { fn: 'generateHyroxPlan', minArgs: 2 },
    { fn: 'generateGeneralFitnessPlan', minArgs: 2 },
    { fn: 'generatePlanFromMethod', minArgs: 3 },
  ]

  /** Argument count for the call whose '(' sits at `open`. */
  function argCount(src: string, open: number): number {
    let depth = 0
    let args = 1
    for (let i = open; i < src.length; i++) {
      const c = src[i]
      if (c === '(' || c === '[' || c === '{') depth++
      else if (c === ')' || c === ']' || c === '}') {
        depth--
        if (depth === 0) return args
      } else if (c === ',' && depth === 1) args++
      else if (c === '`' || c === "'" || c === '"') {
        const quote = c
        i++
        while (i < src.length && src[i] !== quote) { if (src[i] === '\\') i++; i++ }
      }
    }
    return args
  }

  it('every generator call in the suite passes an explicit `today`', () => {
    const violations: string[] = []
    let checked = 0
    for (const [file, src] of Object.entries(SOURCES)) {
      for (const { fn, minArgs } of CALLS) {
        const re = new RegExp(`\\b${fn}\\s*\\(`, 'g')
        let m: RegExpExecArray | null
        while ((m = re.exec(src)) !== null) {
          const open = src.indexOf('(', m.index + fn.length)
          if (open < 0) continue
          // Skip the import/type positions — a call has a body after it.
          checked++
          if (argCount(src, open) < minArgs) {
            const line = src.slice(0, m.index).split('\n').length
            violations.push(`${file}:${line} ${fn}() — needs an explicit \`today\``)
          }
        }
      }
    }
    // Non-vacuity: if the scan finds nothing it is broken, not clean.
    expect(checked, 'the scan found no generator calls at all — it is broken').toBeGreaterThan(20)
    expect(violations).toEqual([])
  })
})
