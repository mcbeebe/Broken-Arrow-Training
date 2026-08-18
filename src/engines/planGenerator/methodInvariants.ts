/**
 * R2 — the machine-checkable subset of each method's authored invariants.
 *
 * Every method JSON ships a `generationRules.invariants` list, and
 * PLAN_GENERATOR_ALGORITHM.md claimed the engine "enforces every rule" —
 * the audit found no code had ever read them (finding E1: Daniels' own
 * "I-pace ≤ 8% of weekly mileage" and "under 20 mi/wk → downgrade
 * routing" would each have caught Jim's plan). The prose lists stay in
 * the JSONs as the source documents; THIS registry is the typed,
 * enforceable extraction, consumed by:
 *  - the QA gate (long-run share, hard-day spacing, quality share), and
 *  - the generator (low-mileage experience downgrade).
 *
 * Values are transcribed from each JSON's invariant strings, with a
 * tolerance philosophy: generation *targets* the authored number; the
 * validator warns just past it and errors only on egregious violation,
 * so honest rounding never cries wolf.
 */

export interface MethodInvariantRules {
  /** Long run's max share of weekly run miles (authored cap). */
  longRunMaxPctOfWeek: number
  /** Absolute long-run ceiling in miles, where a method declares one
   *  (Hansons: "capped at 16 miles — never exceed"). */
  longRunMaxMi?: number
  /** Minimum full days between two quality sessions. 0 = deliberate
   *  stacking (Hansons' cumulative fatigue, Koop's back-to-backs). */
  minDaysBetweenQuality: number
  /** Quality volume's max share of weekly run miles. */
  qualityMaxPctOfWeek: number
  /** Below this current weekly mileage, experience routing caps at
   *  'intermediate' — the athlete gets the gentler workout menu no
   *  matter what level they clicked. */
  lowMileageDowngradeMi?: number
}

const DEFAULT_RULES: MethodInvariantRules = {
  longRunMaxPctOfWeek: 0.5,
  minDaysBetweenQuality: 1,
  qualityMaxPctOfWeek: 0.45,
}

export const METHOD_INVARIANTS: Record<string, MethodInvariantRules> = {
  // "Long run ≤30%", "I ≤8% + R ≤5%" (≈ quality well under a third),
  // "2 days between hard sessions", "<20 mi/wk → recreational routing".
  daniels: { longRunMaxPctOfWeek: 0.30, minDaysBetweenQuality: 2, qualityMaxPctOfWeek: 0.35, lowMileageDowngradeMi: 20 },
  // "moderate-to-hard ≤20% of weekly volume", "long ≤30%", "2 days between".
  fitzgerald_8020: { longRunMaxPctOfWeek: 0.30, minDaysBetweenQuality: 2, qualityMaxPctOfWeek: 0.25 },
  // "long ≤30%", "2 days between hard sessions".
  pfitzinger: { longRunMaxPctOfWeek: 0.30, minDaysBetweenQuality: 2, qualityMaxPctOfWeek: 0.40 },
  // "long capped at 16 mi — never exceed"; stacking is the METHOD
  // (Tue/Thu/Sun quality, cumulative fatigue): spacing rule off.
  hansons: { longRunMaxPctOfWeek: 0.35, longRunMaxMi: 16, minDaysBetweenQuality: 0, qualityMaxPctOfWeek: 0.55 },
  // "long ≤40% (looser — Higdon emphasizes the long run)".
  higdon: { longRunMaxPctOfWeek: 0.40, minDaysBetweenQuality: 1, qualityMaxPctOfWeek: 0.35 },
  // "long cap 55% — RWR makes this safe".
  galloway: { longRunMaxPctOfWeek: 0.55, minDaysBetweenQuality: 1, qualityMaxPctOfWeek: 0.30 },
  // "long ≤45%", back-to-backs are authored → spacing off.
  koop: { longRunMaxPctOfWeek: 0.45, minDaysBetweenQuality: 0, qualityMaxPctOfWeek: 0.40 },
  roche_swap: { longRunMaxPctOfWeek: 0.45, minDaysBetweenQuality: 1, qualityMaxPctOfWeek: 0.40 },
  trainingpeaks: { longRunMaxPctOfWeek: 0.47, minDaysBetweenQuality: 1, qualityMaxPctOfWeek: 0.40 },
}

export function invariantRulesFor(methodId: string | undefined): MethodInvariantRules {
  return (methodId && METHOD_INVARIANTS[methodId]) || DEFAULT_RULES
}
