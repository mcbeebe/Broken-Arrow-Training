import type { RacePriority, ResidualProfile } from '../../types'
import { tier, type TieredValue } from '../evidence'

/**
 * Citations routed through the evidence layer so athlete-facing strings
 * cannot drift from their sources. `value` is the short in-copy label;
 * `citation` carries the full provenance. (The v1 plan shipped
 * "Hickson 1981" on the intensity claim — that year belongs to the
 * reduced-FREQUENCY study; the intensity result is Hickson et al. 1985.)
 */
export const EV_INTENSITY_PRESERVES: TieredValue<string> = tier(
  'Hickson 1985',
  'T1',
  'Hickson, Foster, Pollock, Galassi & Rich 1985, J Appl Physiol 58:492–499 — VO2max was NOT maintained when training intensity was reduced; volume can fall if intensity is preserved. PMID 3156841',
)
export const EV_FREQUENCY_HOLDS: TieredValue<string> = tier(
  'Hickson & Rosenkoetter 1981',
  'T1',
  'Hickson & Rosenkoetter 1981, Med Sci Sports Exerc 13:13–16 — increased aerobic power maintained at 2 or 4 sessions/week. PMID 7219129',
)
export const EV_STRENGTH_HOLDS: TieredValue<string> = tier(
  'Bickel 2011',
  'T1',
  'Bickel, Cross & Bamman 2011, Med Sci Sports Exerc — trained strength maintained at one weekly session. PMID 21131862',
)
export const EV_RESIDUALS: TieredValue<string> = tier(
  'Issurin 2010',
  'T4',
  'Issurin 2010, Sports Med 40:189–206, residual-training-effects table — a coaching heuristic, actively contested; several reviews report aerobic decrements on shorter timescales.',
)
export const EV_INTERFERENCE: TieredValue<string> = tier(
  'Hickson 1980',
  'T1',
  'Hickson 1980, Eur J Appl Physiol 45:255–263 — concurrent-training interference emerged only around week 8 of simultaneous overload. Wilson 2012 meta, PMID 22002517.',
)

/**
 * The science layer of the Season Engine (G1a), pinned to sources per the
 * traceability matrix in docs/gap-closure-build-plan.md §6:
 *
 *  - Residual training effects (Issurin, Sports Med 2010): how long a
 *    trained quality persists once you stop training it. The quantitative
 *    basis for BRIDGE content: qualities with LONG residuals can be held
 *    with minimal doses while SHORT-residual qualities are trained last,
 *    closest to the race that needs them.
 *  - Maintenance doses: strength holds at 1×/week once built (Bickel 2011,
 *    PMID 21131862); aerobic holds on 2–4 d/wk (Hickson & Rosenkoetter
 *    1981, PMID 7219129) IF intensity is preserved (Hickson et al. 1985,
 *    PMID 3156841 — reduced intensity is what causes the loss).
 *  - Interference is run-specific and emerges only ~week 8 of concurrent
 *    overload (Wilson 2012 meta, PMID 22002517; Hickson 1980) — so short
 *    bridges are low-interference by construction.
 *  - Taper depth by race tier via TSB (Friel/TP doctrine): A +15..+25,
 *    B −10..0, C trained through.
 */

/** Central residual days (Issurin 2010; tolerances ±5/±5/±4/±5/±3). */
export const ISSURIN_RESIDUAL_DAYS = {
  aerobic: 30,
  maxStrength: 30,
  glycolytic: 18,
  strengthEndurance: 15,
  speed: 5,
} as const

/** Race-day TSB target band per race priority (Friel tiers). C races are
 *  trained through — no taper, so no band. */
export function taperTierTarget(priority: RacePriority): { tsbLow: number; tsbHigh: number } | null {
  if (priority === 'A') return { tsbLow: 15, tsbHigh: 25 }
  if (priority === 'B') return { tsbLow: -10, tsbHigh: 0 }
  return null
}

/** Taper length by priority: A full 2-week taper; B race-week mini-taper;
 *  C trained through (the converged market grammar, plan §7.1). */
export const TAPER_DAYS: Record<RacePriority, number> = { A: 14, B: 7, C: 0 }

/** Consecutive A-race peaks need ≥8 weeks (TrainerRoad hard rule). */
export const MIN_PEAK_SPACING_DAYS = 8 * 7

/** A secondary race closer than this to the next chained race is trained
 *  through (Runna ~7–10 d; Athletica ~2 wk — we take the 10-day midline). */
export const PROXIMITY_THRESHOLD_DAYS = 10

/** Bridge length bounds: at least a real week, at most ~4 weeks — beyond
 *  that the athlete should be BUILDING (28 d also stays inside the aerobic
 *  and max-strength residual windows, so nothing is lost in a full bridge). */
export const BRIDGE_MIN_DAYS = 7
export const BRIDGE_MAX_DAYS = 28

/** What a bridge protects vs concentrates, chosen by the NEXT race's
 *  demands against the decaying residuals of what was just built. */
export interface BridgeEmphasis {
  /** Quality held with a minimal maintenance dose. */
  hold: 'aerobic' | 'strength'
  holdDose: string
  /** Qualities concentrated now because their residuals are short. */
  concentrate: ('strength_endurance' | 'glycolytic' | 'run_volume')[]
  rationale: string
}

/**
 * Residual-aware bridge selection — the category-first piece:
 *  - Running race → Hyrox: the aerobic base IS the Hyrox asset (~51 of ~84
 *    total minutes is running; Frontiers Physiol 2025) and holds on 1–2
 *    intensity-preserving touches (Hickson '85). The differentiators —
 *    strength-endurance + glycolytic capacity — have 15–18 d residuals
 *    (Issurin), so they are trained LAST, i.e. concentrated in the bridge
 *    and the build that follows.
 *  - Hyrox → running race: strength holds at 1×/wk (Bickel '11) while run
 *    volume rebuilds; running-side interference is acceptable because
 *    strength is maintenance-only (Wilson '12).
 */
export function bridgeEmphasis(nextIsHyrox: boolean): BridgeEmphasis {
  if (nextIsHyrox) {
    return {
      hold: 'aerobic',
      holdDose: `2 runs/wk, one with an intensity touch (${EV_INTENSITY_PRESERVES.value}: aerobic holds when intensity is preserved)`,
      concentrate: ['strength_endurance', 'glycolytic'],
      rationale:
        `Your aerobic base is the Hyrox asset and it keeps for ~30 days (${EV_RESIDUALS.value}); ` +
        'strength-endurance and glycolytic capacity fade in 15–18 days, so they get trained last, closest to race day.',
    }
  }
  return {
    hold: 'strength',
    holdDose: `1 strength session/wk (${EV_STRENGTH_HOLDS.value}: strength holds at one weekly dose once built)`,
    concentrate: ['run_volume'],
    rationale:
      'Strength built for Hyrox holds on one weekly dose while run volume rebuilds; ' +
      `short concurrent blocks don’t trigger interference (${EV_INTERFERENCE.value}: it emerges ~week 8).`,
  }
}

/** Residuals remaining at a bridge's start, given days already elapsed
 *  since the prior race (its RECOVER block). Clamped at 0. */
export function residualsAtBridgeStart(daysSinceRace: number): ResidualProfile {
  const left = (d: number) => Math.max(0, d - daysSinceRace)
  return {
    aerobicDays: left(ISSURIN_RESIDUAL_DAYS.aerobic),
    maxStrengthDays: left(ISSURIN_RESIDUAL_DAYS.maxStrength),
    glycolyticDays: left(ISSURIN_RESIDUAL_DAYS.glycolytic),
    strengthEnduranceDays: left(ISSURIN_RESIDUAL_DAYS.strengthEndurance),
    speedDays: left(ISSURIN_RESIDUAL_DAYS.speed),
  }
}
