import type { OnboardingConfig } from '../hooks/useOnboarding'

/** Seed athletes ship with hand-authored plans and never run the
 *  onboarding method picker, so they have no `selectedMethodId`. They
 *  follow the TrainingPeaks (Joe Friel / PMC) philosophy by default, which
 *  matches the Fitness/Fatigue/Recovery-Balance load model the app already
 *  uses end to end. */
export const SEED_ATHLETE_DEFAULT_METHOD_ID = 'trainingpeaks'
const SEED_ATHLETES: ReadonlySet<string> = new Set(['mike', 'jim', 'lori', 'joel'])

/** Resolve which training-method id an athlete is following: their
 *  onboarding pick if any, else the seed-athlete default. Returns
 *  undefined for non-seed athletes who haven't picked one. */
export function resolveMethodId(athleteId: string | undefined, config?: OnboardingConfig | null): string | undefined {
  if (config?.selectedMethodId) return config.selectedMethodId
  if (athleteId && SEED_ATHLETES.has(athleteId)) return SEED_ATHLETE_DEFAULT_METHOD_ID
  return undefined
}
