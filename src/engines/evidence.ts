/**
 * Evidence-tier provenance primitives.
 *
 * Every algorithmic constant in the engine layer ships with a tier (T1–T4)
 * and a citation. Encoding that as a type prevents constants from drifting
 * away from their evidence over time.
 *
 * @see BA_Vector1_Science_v3.html §1.1
 * @see BA_Terrain_Descent_Engine_Spec_v1.0.docx §5.7
 * @see PROJECT_PLAN.md §3 (T1–T4 source-tier definitions)
 */

export type EvidenceTier = 'T1' | 'T2' | 'T3' | 'T4'

export const TIER_LABELS: Record<EvidenceTier, string> = {
  T1: 'Peer-reviewed RCT or meta-analysis',
  T2: 'Peer-reviewed observational',
  T3: 'First-principles biomechanics or physics',
  T4: 'Heuristic / coaching wisdom',
}

export interface TieredValue<T> {
  readonly value: T
  readonly tier: EvidenceTier
  readonly citation: string
  readonly url?: string
}

/**
 * Build a {@link TieredValue} that pairs a constant with its evidence tier
 * and source citation.
 *
 * @param value     the underlying constant (number, string, object, ...)
 * @param evidenceTier  T1–T4 per {@link EvidenceTier}
 * @param citation  short human-readable source, e.g. "Minetti 2002 PMID 12183501"
 * @param url       optional canonical link
 * @returns         frozen-shape {@link TieredValue}
 */
export const tier = <T>(
  value: T,
  evidenceTier: EvidenceTier,
  citation: string,
  url?: string,
): TieredValue<T> => ({ value, tier: evidenceTier, citation, url })
