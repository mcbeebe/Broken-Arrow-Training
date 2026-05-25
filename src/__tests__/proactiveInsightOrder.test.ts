import { describe, it, expect } from 'vitest'
import { proactiveInsightIndex } from '../utils/coachThreadOrder'

/**
 * Locks the continuous-conversation ordering: the daily insight (a proactive
 * coach message refreshed 3x/day) is woven into the thread by its generation
 * time, so the freshest message — a chat reply OR a fresh daily update — is
 * always at the bottom. Regression guard for the insight popping to the top.
 */
describe('proactiveInsightIndex', () => {
  it('puts a fresh insight at the bottom when it is newer than every turn', () => {
    const turns = [100, 200, 300]
    // 8 PM daily update arrives after this afternoon's chat → bottom.
    expect(proactiveInsightIndex(turns, 400)).toBe(3)
  })

  it('keeps a later reply below the insight (does not pop it to the top)', () => {
    // 1 PM insight, then the athlete replies at 2 PM. Insight slots before
    // the 2 PM turn — i.e. the reply stays below it.
    const turns = [100, 150, 250 /* 2 PM reply */]
    expect(proactiveInsightIndex(turns, 200 /* 1 PM */)).toBe(2)
  })

  it('places an older insight above newer turns', () => {
    const turns = [500, 600]
    expect(proactiveInsightIndex(turns, 100)).toBe(0)
  })

  it('is the only item when there are no turns', () => {
    expect(proactiveInsightIndex([], 123)).toBe(0)
  })

  it('treats a turn at the exact same ts as older (insight goes after it)', () => {
    expect(proactiveInsightIndex([200], 200)).toBe(1)
  })
})
