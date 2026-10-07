/**
 * The landing page's shared state and its sync rules (design-spec.md
 * § Shared state). Page-local: nothing is persisted or sent anywhere, so a
 * reload starts the demo over, try limit included.
 */
import { COACH, MAKE, type CoachQuestion, type PersonalityId, type PlanKind, type Sport } from './content'

export interface LandingState {
  sport: Sport
  plan: PlanKind
  coachName: string
  personality: PersonalityId
  /** Index into COACH.questions. */
  question: number
  approved: boolean
  /**
   * Personality and question changes so far; at COACH.tryLimit (content.ts)
   * new personalities and questions are ignored. Reset still works.
   */
  tries: number
  /**
   * The coach's name when the limit was reached. The invite line is a live
   * region, so it names the coach as it was then rather than re-announcing
   * on every keystroke in the name field.
   */
  limitName: string | null
}

export type LandingAction =
  | { type: 'sport'; sport: Sport }
  | { type: 'plan'; plan: PlanKind }
  | { type: 'name'; name: string }
  | { type: 'personality'; id: PersonalityId }
  | { type: 'ask' }
  | { type: 'reset' }
  | { type: 'approve' }

export const INITIAL_STATE: LandingState = {
  sport: 'run',
  plan: 'race',
  coachName: MAKE.defaultName,
  personality: MAKE.defaultPersonality,
  question: 0,
  approved: false,
  tries: 0,
  limitName: null,
}

/** Whether the visitor has used up the demo's changes for this visit. */
export function atTryLimit(state: LandingState): boolean {
  return state.tries >= COACH.tryLimit
}

/** Spend one try, noting the coach's name if that was the last one. */
function spendTry(state: LandingState): Pick<LandingState, 'tries' | 'limitName'> {
  const tries = state.tries + 1
  return { tries, limitName: tries >= COACH.tryLimit ? state.coachName : state.limitName }
}

/**
 * Apply one action. The athlete tabs and the chart toggle stay in step:
 * Fitness ⇔ No race, and Racing from Fitness returns to Running (any other
 * sport keeps its tab). In the coach demo a new personality or question costs
 * one try, typing a name costs nothing, and Reset puts the demo back without
 * giving tries back.
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
    case 'personality':
      if (action.id === state.personality || atTryLimit(state)) return state
      return { ...state, personality: action.id, ...spendTry(state) }
    case 'ask':
      if (atTryLimit(state)) return state
      return { ...state, question: (state.question + 1) % COACH.questions.length, approved: false, ...spendTry(state) }
    case 'reset':
      return {
        ...state,
        coachName: INITIAL_STATE.coachName,
        personality: INITIAL_STATE.personality,
        question: INITIAL_STATE.question,
        approved: false,
      }
    case 'approve': {
      const q: CoachQuestion = COACH.questions[state.question]
      return state.approved || !q.proposal ? state : { ...state, approved: true }
    }
  }
}
