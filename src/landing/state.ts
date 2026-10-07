/**
 * The landing page's shared state and its sync rules (design-spec.md
 * § Shared state). Page-local: nothing is persisted or sent anywhere.
 */
import { MAKE, type PlanKind, type Sport, type TraitId } from './content'

export interface LandingState {
  sport: Sport
  plan: PlanKind
  coachName: string
  traits: ReadonlySet<TraitId>
  approved: boolean
}

export type LandingAction =
  | { type: 'sport'; sport: Sport }
  | { type: 'plan'; plan: PlanKind }
  | { type: 'name'; name: string }
  | { type: 'trait'; id: TraitId }
  | { type: 'approve' }

export const INITIAL_STATE: LandingState = {
  sport: 'run',
  plan: 'race',
  coachName: MAKE.defaultName,
  traits: new Set(MAKE.defaultTraits),
  approved: false,
}

/**
 * Apply one action. The athlete tabs and the chart toggle stay in step:
 * Fitness ⇔ No race, and Racing from Fitness returns to Running (any other
 * sport keeps its tab).
 */
export function landingReducer(state: LandingState, action: LandingAction): LandingState {
  switch (action.type) {
    case 'sport':
      return { ...state, sport: action.sport, plan: action.sport === 'fit' ? 'fit' : 'race' }
    case 'plan':
      if (action.plan === 'fit') return { ...state, plan: 'fit', sport: 'fit' }
      return { ...state, plan: 'race', sport: state.sport === 'fit' ? 'run' : state.sport }
    case 'name':
      return { ...state, coachName: action.name.slice(0, MAKE.nameMaxLength) }
    case 'trait': {
      const traits = new Set(state.traits)
      if (traits.has(action.id)) traits.delete(action.id)
      else traits.add(action.id)
      return { ...state, traits }
    }
    case 'approve':
      return state.approved ? state : { ...state, approved: true }
  }
}
