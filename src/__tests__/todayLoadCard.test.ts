/**
 * Today carries the 7-day Training Load card under "Your last 7 days".
 *
 * Field request (2026-10-04): "I'm missing the 7 day load." Settings had
 * long listed a "7-day training load" switch for Today with no card behind
 * it; the card now exists and that switch controls it. Read from source,
 * as Summary's other mount guards are, because Summary needs a full app's
 * worth of props to render.
 */
import { describe, it, expect } from 'vitest'
import { SECTION_GROUPS } from '../utils/sectionGroups'

const SUMMARY = Object.values(import.meta.glob('../components/Summary.tsx', {
  query: '?raw', import: 'default', eager: true,
}))[0] as string

/** The JSX element for the first `<Tag` mount, through its `/>`. */
const element = (src: string, tag: string) => {
  const start = src.indexOf(`<${tag}`)
  expect(start, `${tag} not mounted`).toBeGreaterThan(-1)
  return src.slice(start, src.indexOf('/>', start) + 2)
}
/** The `{ … && (` guard wrapping a mount. */
const guard = (src: string, tag: string) => {
  const at = src.indexOf(`<${tag}`)
  return src.slice(src.lastIndexOf('{', at), at)
}

describe('Today: the 7-day Training Load card', () => {
  it('is mounted once, below "Your last 7 days"', () => {
    expect(SUMMARY.match(/<TRIMPBreakdown/g)).toHaveLength(1)
    expect(SUMMARY.indexOf('<TRIMPBreakdown')).toBeGreaterThan(SUMMARY.indexOf('<WeekReviewCard'))
  })

  it('answers to the Settings switch, needs load data, and not a watch', () => {
    const g = guard(SUMMARY, 'TRIMPBreakdown')
    expect(g).toContain("isSectionVisible('summary.trainingLoad')")
    expect(g).toContain('dailyTrimp.some(d => d.total > 0)')
    expect(g).not.toMatch(/garmin/i)
    expect(SECTION_GROUPS.flatMap(g => g.items)).toContainEqual({ id: 'summary.trainingLoad', label: '7-day training load' })
  })

  it('keeps its own 7d / 30d / 90d / YTD tabs, opening on 7 days', () => {
    // A `range` prop would hide the tabs and pin the window (Progress
    // drives it from its own toggle); Today leaves it to the card.
    const el = element(SUMMARY, 'TRIMPBreakdown')
    expect(el).not.toMatch(/\brange=/)
    expect(el).toContain('performance={performance}')
  })
})
