/** The demo coach's header text (design-spec.md § Shared state). */
import { COACH, MAKE, type PersonalityId } from './content'

/** “Your coach. Warm.”: the chosen personality's exact app label. */
export function coachStatus(personality: PersonalityId): string {
  const label = MAKE.traits.find(t => t.id === personality)?.label ?? MAKE.traits[0].label
  return `${COACH.headerPrefix}${label}.`
}

/** The trimmed name, or “Your coach” when blank. */
export function coachDisplayName(name: string): string {
  return name.trim() || COACH.fallbackName
}
