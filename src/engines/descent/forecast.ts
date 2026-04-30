/**
 * DOMS forecast at +12 / +24 / +48 / +72 / +96 / +120 hours after an
 * eccentric bout, attenuated by repeated-bout protection.
 *
 * Forecast value is the eccentric dose (AU) projected forward through a
 * fixed kinetic curve and dampened by the protection factor:
 *
 *     forecastDOMS(dose, state, h) = dose.doseAU
 *                                  × KINETIC_CURVE[h]
 *                                  × (1 − state.protectionFactor)
 *
 * The kinetic curve peaks at +24 h (Vernillo 2020 + creatine-kinase
 * literature) and decays back to ~10 % of peak by +120 h. Hours not in
 * the table return 0 — callers should use the named horizons.
 *
 * @see Vernillo et al. 2020 (PMC7674385) — eccentric kinetics in trail running
 * @see `BA_Terrain_Descent_Engine_Spec_v1.0.docx` §6.2.3
 * @see `BA_Terrain_Descent_IT_Project_Plan_v1.0.md` §PR-11
 */

import type {
  DescentLoadForecast,
  EccentricDose,
  RepeatedBoutState,
} from '../../types'

/**
 * Fraction of peak DOMS at each time horizon (hours after the bout).
 * Frozen so callers can't mutate the canonical curve.
 */
export const KINETIC_CURVE: Readonly<Record<number, number>> = Object.freeze({
  12: 0.55,
  24: 1.0,
  48: 0.85,
  72: 0.55,
  96: 0.25,
  120: 0.1,
})

/**
 * Project the eccentric dose forward to a single time horizon, attenuated
 * by repeated-bout protection. Returns 0 for horizons not in
 * {@link KINETIC_CURVE}.
 */
export function forecastDOMS(
  dose: EccentricDose,
  state: RepeatedBoutState,
  deltaHours: number,
): number {
  const k = KINETIC_CURVE[deltaHours] ?? 0
  return dose.doseAU * k * (1 - state.protectionFactor)
}

/**
 * Forecast at the three horizons the Today / Tomorrow UI cares about
 * (24 / 48 / 72 h), bundled with the underlying dose and protection so
 * downstream components can show "X AU forecast at 24 h, given Y AU dose
 * and Z % protection from your run on April 23".
 */
export function forecastDOMSWindow(
  dose: EccentricDose,
  state: RepeatedBoutState,
): DescentLoadForecast {
  return {
    forecast24h: forecastDOMS(dose, state, 24),
    forecast48h: forecastDOMS(dose, state, 48),
    forecast72h: forecastDOMS(dose, state, 72),
    doseAU: dose.doseAU,
    protectionFactor: state.protectionFactor,
  }
}
