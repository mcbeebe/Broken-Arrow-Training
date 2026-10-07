/**
 * Initiative 003 PR 4 / 4b: the landing page's shared state and its sync
 * rules (design-spec.md § Shared state), as a pure reducer.
 */
import { describe, it, expect } from 'vitest'
import { INITIAL_STATE, atTryLimit, landingReducer, type LandingAction, type LandingState } from '../../landing/state'
import { COACH, MAKE } from '../../landing/content'

const run = (...actions: LandingAction[]): LandingState => actions.reduce(landingReducer, INITIAL_STATE)

describe('the initial state', () => {
  it('is Running, Racing, Mira, Warm, question 1, not approved, no tries used', () => {
    expect(INITIAL_STATE).toEqual({
      sport: 'run',
      plan: 'race',
      coachName: MAKE.defaultName,
      personality: 'warm',
      question: 0,
      approved: false,
      tries: 0,
    })
  })
})

describe('sync rules', () => {
  it('picking Fitness sets No race', () => {
    expect(run({ type: 'sport', sport: 'fit' })).toMatchObject({ sport: 'fit', plan: 'fit' })
  })

  it.each(['run', 'trail', 'hyrox'] as const)('picking %s sets Racing', sport => {
    expect(run({ type: 'sport', sport: 'fit' }, { type: 'sport', sport })).toMatchObject({ sport, plan: 'race' })
  })

  it('picking No race sets Fitness', () => {
    expect(run({ type: 'plan', plan: 'fit' })).toMatchObject({ sport: 'fit', plan: 'fit' })
  })

  it('picking Racing from Fitness returns to Running', () => {
    expect(run({ type: 'sport', sport: 'fit' }, { type: 'plan', plan: 'race' })).toMatchObject({ sport: 'run', plan: 'race' })
  })

  it.each(['run', 'trail', 'hyrox'] as const)('picking Racing on %s leaves the sport alone', sport => {
    expect(run({ type: 'sport', sport }, { type: 'plan', plan: 'race' })).toMatchObject({ sport, plan: 'race' })
  })

  it('the tabs and chart never touch the coach demo or its tries', () => {
    const s = run({ type: 'sport', sport: 'fit' }, { type: 'plan', plan: 'race' }, { type: 'sport', sport: 'hyrox' })
    expect(s.tries).toBe(0)
    expect(s.personality).toBe('warm')
  })
})

describe('name', () => {
  it('stores the name as typed, capped at the app’s limit', () => {
    expect(run({ type: 'name', name: ' Coach K ' }).coachName).toBe(' Coach K ')
    expect(run({ type: 'name', name: 'x'.repeat(50) }).coachName).toHaveLength(MAKE.nameMaxLength)
  })

  it('costs no tries', () => {
    expect(run({ type: 'name', name: 'a' }, { type: 'name', name: 'ab' }, { type: 'name', name: 'abc' }, { type: 'name', name: 'abcd' }).tries).toBe(0)
  })
})

describe('personality', () => {
  it('picks one at a time and costs a try', () => {
    const s = run({ type: 'personality', id: 'funny' })
    expect(s).toMatchObject({ personality: 'funny', tries: 1 })
  })

  it('picking the one already chosen is free and changes nothing', () => {
    expect(run({ type: 'personality', id: 'warm' })).toBe(INITIAL_STATE)
  })

  it('keeps the question and the approval', () => {
    const s = run({ type: 'approve' }, { type: 'personality', id: 'nerdy' })
    expect(s).toMatchObject({ question: 0, approved: true })
  })
})

describe('ask something else', () => {
  it('cycles the questions in order and back to the first', () => {
    const qs: number[] = []
    let s = INITIAL_STATE
    for (let i = 0; i < COACH.questions.length; i++) {
      s = landingReducer({ ...s, tries: 0 }, { type: 'ask' })
      qs.push(s.question)
    }
    expect(qs).toEqual([1, 2, 0])
  })

  it('clears the approval, since the proposal on screen is a new one', () => {
    expect(run({ type: 'approve' }, { type: 'ask' })).toMatchObject({ question: 1, approved: false, tries: 1 })
  })
})

describe('the try limit', () => {
  const used = run({ type: 'personality', id: 'funny' }, { type: 'ask' }, { type: 'personality', id: 'direct' })

  it(`allows exactly ${COACH.tryLimit} changes`, () => {
    expect(used.tries).toBe(COACH.tryLimit)
    expect(atTryLimit(used)).toBe(true)
    expect(atTryLimit(run({ type: 'ask' }, { type: 'ask' }))).toBe(false)
  })

  it('then ignores new personalities and questions', () => {
    expect(landingReducer(used, { type: 'personality', id: 'old-school' })).toBe(used)
    expect(landingReducer(used, { type: 'ask' })).toBe(used)
  })

  it('still lets the visitor type a name and approve', () => {
    const named = landingReducer(used, { type: 'name', name: 'Kip' })
    expect(named.coachName).toBe('Kip')
    expect(landingReducer({ ...used, question: 0 }, { type: 'approve' }).approved).toBe(true)
  })
})

describe('reset', () => {
  it('puts the demo back to question 1, Warm, Mira, not approved', () => {
    const s = run({ type: 'name', name: 'Kip' }, { type: 'personality', id: 'funny' }, { type: 'ask' }, { type: 'reset' })
    expect(s).toMatchObject({ coachName: MAKE.defaultName, personality: 'warm', question: 0, approved: false })
  })

  it('does not give tries back', () => {
    const s = run({ type: 'personality', id: 'funny' }, { type: 'ask' }, { type: 'reset' })
    expect(s.tries).toBe(2)
  })

  it('leaves the athlete tabs and chart alone', () => {
    expect(run({ type: 'sport', sport: 'trail' }, { type: 'reset' })).toMatchObject({ sport: 'trail', plan: 'race' })
  })
})

describe('approve', () => {
  it('sets approved once and stays approved', () => {
    expect(run({ type: 'approve' }, { type: 'approve' }).approved).toBe(true)
  })

  it('does nothing on a question without a proposal', () => {
    const noProposal = COACH.questions.findIndex(q => !('proposal' in q))
    expect(noProposal).toBeGreaterThan(-1)
    const s = { ...INITIAL_STATE, question: noProposal }
    expect(landingReducer(s, { type: 'approve' })).toBe(s)
  })
})
