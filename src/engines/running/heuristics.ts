/**
 * The road/trail engine's personalization constants, tiered (R1 of the
 * running-plan audit — docs/running-plan-audit.md).
 *
 * Same contract as the Hyrox registry (engines/hyrox/heuristics.ts):
 * the generator READS its constants from here so behavior can never
 * silently drift from the documented value, and the unverified surface
 * is enumerable for expert review. Unlike Hyrox, masters endurance and
 * older-adult resistance training have real peer-reviewed literature,
 * so several constants enter above T4.
 *
 * Tier meanings: T1 meta-analysis / position stand · T2 peer-reviewed
 * study/review · T3 first-principles or verifiable primary source ·
 * T4 coaching heuristic. Upgrade only with a citable source.
 */
import { tier, type TieredValue } from '../evidence'

/** Age tiers for masters adjustments. 58 mirrors the Hyrox engine's
 *  MASTERS_RECOVERY threshold (one product, one age story); 70 opens the
 *  senior tier where intensity selection and strength loading change. */
export const MASTERS_AGE_TIERS: TieredValue<{ masters: number; senior: number }> = tier(
  { masters: 58, senior: 70 },
  'T4',
  'Thresholds are judgment calls: recovery capacity declines gradually (no bright line in the literature). 58 keeps parity with the Hyrox engine; 70 marks where VO2-interval substitution and non-maximal strength loading begin. Expert-review target — flagged in the Hyrox packet too.',
)

/** Masters (≥58): recovery week every N weeks instead of the method's
 *  default (typically 4). */
export const MASTERS_RECOVERY_CADENCE: TieredValue<{ cadenceWeeks: number }> = tier(
  { cadenceWeeks: 3 },
  'T3',
  'Recovery need rises with age: masters athletes show slower recovery of performance and muscle function after damaging exercise (Reaburn & Dascombe 2008, Eur Rev Aging Phys Act; Fell & Williams 2008, J Aging Phys Act). The 3-week cadence itself is practitioner convention (Friel, Fast After 50) and matches the Hyrox engine.',
)

/** Masters (≥58): weekly volume ramp cap (fraction/week), tighter than
 *  the method defaults of 0.10–0.15. */
export const MASTERS_RAMP_CAP: TieredValue<number> = tier(
  0.08,
  'T4',
  'Tissue tolerance to rapid load increases declines with age (tendon stiffness / collagen turnover changes — Reeves 2006). The 8% number is a coaching heuristic between the 10% rule and the injury-return cap (5-8%) already used by the injury policy.',
)

/** Senior (≥70): at most this many quality sessions per week; VO2-max
 *  interval categories are substituted with threshold work. */
export const SENIOR_INTENSITY: TieredValue<{ maxQualityPerWeek: number; substituteVo2: boolean }> = tier(
  { maxQualityPerWeek: 1, substituteVo2: true },
  'T3',
  'Masters runners retain trainability but tolerate less high-intensity frequency; threshold work and strides preserve intensity with lower structural cost (Tanaka & Seals 2008, J Physiol — performance declines are driven more by reduced training stimulus than trainability; Reaburn & Dascombe 2008 recommend preserved intensity with reduced frequency). One quality day/week at 70+ is the practitioner-consensus floor that keeps the stimulus without stacking recovery debt.',
)

/** Senior (≥70): multiplier on the long-run time cap. */
export const SENIOR_LONG_RUN_CAP_MULT: TieredValue<number> = tier(
  0.85,
  'T4',
  'Coaching heuristic: cap the single longest session before capping weekly frequency — long-duration eccentric load drives the most recovery debt in older runners.',
)

/**
 * Weekly-volume factor by RUNNING days per week (5 days = 1.0 baseline).
 * Before R1 a 3-day athlete received ~98% of the 6-day athlete's weekly
 * mileage crammed into fewer, longer runs — backwards: volume should
 * scale with available frequency, keeping per-run length sane.
 */
export const DAYS_VOLUME_FACTOR: TieredValue<Record<number, number>> = tier(
  { 3: 0.75, 4: 0.9, 5: 1.0, 6: 1.1, 7: 1.15 },
  'T4',
  'Coaching convention: each running day beyond 3 adds diminishing weekly capacity (~10-15%/day flattening past 5). Exact factors are judgment calls; the direction (fewer days → less weekly volume, not longer runs) is uncontroversial.',
)

/**
 * Strength scheme selection (see extraDays.ts): per-phase set/rep schemes
 * matched to the R8 emphasis, gated by strengthExperience and age.
 */
export const STRENGTH_SCHEME_POLICY: TieredValue<{ seniorAge: number; rirCue: number }> = tier(
  { seniorAge: 70, rirCue: 2 },
  'T1',
  'NSCA position statement on resistance training for older adults (Fragala et al. 2019, JSCR): older adults benefit from progressive resistance training including power work, at 70-85%1RM for the trained, with emphasis on technique, controlled tempo, and balance integration — and novices of any age start with technique-first moderate loads. Heavy maximal testing (RM attempts) is not recommended prescription language for novices or seniors; reps-in-reserve cues replace it (Borde et al. 2015 meta-analysis for dose-response in seniors).',
)

/** Everything above, enumerable for audit docs and tests. */
export const RUNNING_HEURISTICS: Record<string, TieredValue<unknown>> = {
  MASTERS_AGE_TIERS,
  MASTERS_RECOVERY_CADENCE,
  MASTERS_RAMP_CAP,
  SENIOR_INTENSITY,
  SENIOR_LONG_RUN_CAP_MULT,
  DAYS_VOLUME_FACTOR,
  STRENGTH_SCHEME_POLICY,
}
