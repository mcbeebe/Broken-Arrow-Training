/**
 * The structural half of P8: admin is not merely discouraged in the
 * morning, it cannot render there. "The morning is for the next hour" is
 * enforced by the code rather than by remembering.
 *
 * P15 changed HOW it is enforced. Four separately-gated cards became one
 * queue inside the evening branch, so the guard changed shape: instead of
 * checking four gates, it checks that the single surface which renders
 * proposals sits inside the evening branch, and that no proposal source
 * reaches Today by any other route.
 */
import { describe, it, expect } from 'vitest'

const APP = Object.values(import.meta.glob('../App.tsx', {
  query: '?raw', import: 'default', eager: true,
}))[0] as string

/** The Today block, from the phase ternary to the Summary that closes it. */
function todaySurface(): string {
  const start = APP.indexOf("{todayPhase === 'evening' ? (")
  expect(start, 'phase ternary not found').toBeGreaterThan(-1)
  const end = APP.indexOf('<Summary', start)
  expect(end, 'Summary not found after the ternary').toBeGreaterThan(start)
  return APP.slice(start, end)
}

/** The evening arm alone — everything before the ternary's `) : (`. */
function eveningArm(): string {
  const surface = todaySurface()
  const split = surface.indexOf('        ) : (')
  expect(split, 'ternary has no morning arm').toBeGreaterThan(-1)
  return surface.slice(0, split)
}

const PROPOSAL_SOURCES = [
  'benchAssessment.qualifies',
  'recalAssessment.qualifies',
  'mimCalibration.pendingSuggestions',
  'domsCalibration.pendingSuggestions',
]

describe('proposals wait for the close', () => {
  it('renders proposals through exactly one surface on Today', () => {
    // More than one means the pile can grow back a card at a time.
    const mounts = todaySurface().match(/<ReviewQueuePanel/g) ?? []
    expect(mounts).toHaveLength(1)
  })

  it('puts that surface inside the evening arm, never the morning', () => {
    expect(eveningArm()).toContain('<ReviewQueuePanel')
    const morning = todaySurface().slice(todaySurface().indexOf('        ) : ('))
    expect(morning).not.toContain('<ReviewQueuePanel')
  })

  for (const source of PROPOSAL_SOURCES) {
    it(`does not let ${source} reach Today by any other route`, () => {
      // The queue is fed from `reviewItems`; a proposal source appearing
      // directly in the Today markup is a card sneaking back in.
      expect(todaySurface(), `${source} renders directly on Today`).not.toContain(source)
    })
  }

  it('feeds the queue from every one of those sources, so none is silently dropped', () => {
    for (const source of PROPOSAL_SOURCES) {
      expect(APP, `${source} no longer reaches the queue`).toContain(source)
    }
  })

  it('offers the count in the morning instead, as one line', () => {
    // Held back, not hidden: the athlete still knows something is waiting,
    // and can go to it — it simply does not interrupt the morning.
    expect(APP).toMatch(/data-testid="ledger-row"/)
    expect(APP).toMatch(/todayPhase === 'morning' && notesWaiting > 0/)
    expect(APP).toMatch(/at your close/)
  })

  it('drops the close’s "somewhere else" row when the proposals are right there', () => {
    // A button offering to take you elsewhere, sitting on top of the thing
    // it points at, is a lie about where you are.
    expect(APP).toMatch(/notesInline=\{reviewItems\.length > 0\}/)
  })
})
