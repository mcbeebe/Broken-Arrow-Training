/** The demo coach's header text (design-spec.md § Shared state). */
import { COACH, MAKE, type TraitId } from './content'

/** “Your coach. Warm, Direct.”: selected traits in their canonical order, or the prompt to pick one. */
export function coachStatus(traits: ReadonlySet<TraitId>): string {
  const labels = MAKE.traits.filter(t => traits.has(t.id)).map(t => t.label)
  return labels.length ? `${COACH.headerPrefix}${labels.join(', ')}.` : COACH.noTraits
}

/** The trimmed name, or “Your coach” when blank. */
export function coachDisplayName(name: string): string {
  return name.trim() || COACH.fallbackName
}
