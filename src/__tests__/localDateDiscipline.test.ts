/**
 * A calendar date is never read out of a Date through `toISOString()`.
 *
 * `toISOString()` formats in UTC. Reading a Date built from LOCAL components
 * through it re-interprets the moment in another day whenever the local
 * offset pushes it across midnight UTC — so the athlete's plan is generated
 * for the wrong day.
 *
 * The codebase guarded that by anchoring at local noon
 * (`new Date(iso + 'T12:00:00')`) and reasoning, in a comment, that "a
 * negative timezone offset never slips a day". Half the world. Noon local is
 * 00:00 UTC at UTC+12 and 23:00 UTC the PREVIOUS day at UTC+13, so the anchor
 * holds from UTC-11 through UTC+12 and fails past it: New Zealand and Fiji
 * through their summer (+13), Samoa and Tonga (+13), Kiritimati year-round
 * (+14). Under TZ=Pacific/Auckland the suite failed 112 tests across 27 files
 * — every one a plan whose weeks started on Sunday.
 *
 * The rule is simple enough to enforce mechanically: local components in,
 * local components out (`isoFromLocalDate` / `todayDateString`). This test
 * stops the pattern coming back — including into test helpers, where three
 * copies of it were hiding and only ever agreed with the product because CI
 * runs in UTC.
 *
 * A full `toISOString()` for a TIMESTAMP (`updatedAt`, `measuredAt`) is
 * correct and untouched: an instant is genuinely absolute. Only the
 * date-extraction forms are banned.
 */
import { describe, it, expect } from 'vitest'

// Vite's glob loader: every source file as a string, no node builtins (this
// tsconfig has no @types/node, and `tsc -b` is part of the deploy gate).
const SOURCES = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw', eager: true, import: 'default',
}) as Record<string, string>

/** `.toISOString()` immediately narrowed to a calendar date. */
const DATE_EXTRACTION = /\.toISOString\(\)\s*\.\s*(?:slice\(\s*0\s*,\s*10\s*\)|split\(\s*['"`]T['"`]\s*\)\s*\[\s*0\s*\])/

/** Does the contiguous comment block immediately above line `i` carry the
 *  `utc-domain:` marker? Walking the whole block (rather than one line) means
 *  the exemption can be explained properly instead of crammed onto one line. */
function inPrecedingComment(lines: string[], i: number): boolean {
  for (let j = i - 1; j >= 0; j--) {
    const t = lines[j].trim()
    if (!t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')) return false
    if (/utc-domain:/.test(t)) return true
  }
  return false
}

describe('local calendar dates never round-trip through UTC', () => {
  const files = Object.keys(SOURCES)

  it('actually sees the source tree', () => {
    // Guards the guard: a glob that silently matched nothing would make the
    // assertion below vacuously true forever.
    expect(files.length).toBeGreaterThan(100)
  })

  it('no file extracts a calendar date from toISOString()', () => {
    const offenders: string[] = []
    for (const file of files) {
      // This test names the pattern in its own prose.
      if (file.endsWith('localDateDiscipline.test.ts')) continue
      const lines = SOURCES[file].split('\n')
      lines.forEach((line, i) => {
        // A genuinely UTC-domain computation (one that reads getUTC*/setUTC*
        // throughout, matching a module that snaps to UTC days) is correct as
        // it stands. Opting out takes an explicit `utc-domain:` comment on the
        // line or the one above, with the reason — so the exemption is a
        // decision someone wrote down, not a pattern that slips back in.
        const exempt = /utc-domain:/.test(line) || inPrecedingComment(lines, i)
        if (DATE_EXTRACTION.test(line) && !exempt) {
          offenders.push(`${file.replace(/^\.\.\//, 'src/')}:${i + 1}  ${line.trim()}`)
        }
      })
    }
    expect(
      offenders,
      'Use isoFromLocalDate(d) / todayDateString() from utils/planDates instead — ' +
      'toISOString() formats in UTC and shifts the day at offsets past +12:\n' +
      offenders.join('\n'),
    ).toEqual([])
  })
})
