/**
 * Initiative 003 PR 4: the landing page's shared state and its sync rules
 * (design-spec.md § Shared state), as a pure reducer.
 */
import { describe, it, expect } from 'vitest'
import { INITIAL_STATE, landingReducer, type LandingState } from '../../landing/state'
import { MAKE } from '../../landing/content'

const run = (...actions: Parameters<typeof landingReducer>[1][]): LandingState =>
  actions.reduce(landingReducer, INITIAL_STATE)

describe('the initial state', () => {
  it('is Running, Racing, Mira with Warm and Direct, not approved', () => {
    expect(INITIAL_STATE.sport).toBe('run')
    expect(INITIAL_STATE.plan).toBe('race')
    expect(INITIAL_STATE.coachName).toBe(MAKE.defaultName)
    expect([...INITIAL_STATE.traits]).toEqual(['warm', 'direct'])
    expect(INITIAL_STATE.approved).toBe(false)
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
})

describe('persona', () => {
  it('stores the name as typed, capped at the app’s limit', () => {
    expect(run({ type: 'name', name: ' Coach K ' }).coachName).toBe(' Coach K ')
    expect(run({ type: 'name', name: 'x'.repeat(50) }).coachName).toHaveLength(MAKE.nameMaxLength)
  })

  it('toggles a trait on and off without touching the others', () => {
    const on = run({ type: 'trait', id: 'funny' })
    expect([...on.traits].sort()).toEqual(['direct', 'funny', 'warm'])
    const off = landingReducer(on, { type: 'trait', id: 'warm' })
    expect([...off.traits].sort()).toEqual(['direct', 'funny'])
  })

  it('never mutates the previous state', () => {
    const before = INITIAL_STATE.traits
    landingReducer(INITIAL_STATE, { type: 'trait', id: 'funny' })
    expect([...before]).toEqual(['warm', 'direct'])
  })
})

describe('approve', () => {
  it('sets approved once and stays approved', () => {
    expect(run({ type: 'approve' }, { type: 'approve' }).approved).toBe(true)
  })
})
