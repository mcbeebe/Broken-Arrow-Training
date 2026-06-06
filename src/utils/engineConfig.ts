import type { AthleteProfile } from '../types'

/**
 * R8 — age/experience-aware tuning of the readiness/load engine.
 *
 * The defaults below are EXACTLY the constants the engine used before R8, so
 * with no profile data the engine behaves byte-for-byte as it always did
 * (`getReadinessTuning(undefined)` deep-equals `DEFAULT_READINESS_TUNING`).
 * The readiness functions take an optional trailing `tuning` arg that defaults
 * to these, so every existing positional call (and test) is unaffected.
 *
 * Tiers (evidence basis lives in the R6 knowledge modules the coach uses to
 * explain the numbers):
 *  - Masters 40+: connective tissue / recovery tolerate less acute load →
 *    a tighter ACWR "danger" ceiling. 50+: tighter still, and overtraining
 *    (state D) triggers a day sooner.
 *  - Beginner / first-timer: less durable, so caution starts earlier (lower
 *    sweet-spot top + danger ceiling) and the advisory weekly ramp is lower.
 */
export interface ReadinessTuning {
  /** ACWR at/below which load is "sweet spot" (also the State-C threshold). */
  acwrSweetTop: number
  /** ACWR above which load is "danger" (−1.0) and PEAK/GREEN are capped. */
  acwrDanger: number
  /** Consecutive RED days that trip training state D (overtrained). */
  stateDConsecutiveRed: number
  /** Advisory weekly volume-increase ceiling (%) the coach respects. */
  weeklyIncreaseCapPct: number
}

export const DEFAULT_READINESS_TUNING: ReadinessTuning = {
  acwrSweetTop: 1.3,
  acwrDanger: 1.5,
  stateDConsecutiveRed: 5,
  weeklyIncreaseCapPct: 10,
}

/** Whole-years age from an ISO 'YYYY-MM-DD'. `now` is injectable for tests. */
export function ageFromBirthDate(birthDate?: string, now: Date = new Date()): number | null {
  if (!birthDate) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDate)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  let age = now.getFullYear() - y
  const month = now.getMonth() + 1
  if (month < mo || (month === mo && now.getDate() < d)) age--
  return age >= 0 && age < 130 ? age : null
}

type ProfileLike = Pick<AthleteProfile, 'birthDate' | 'experienceLevel'>

/**
 * Derive the readiness tuning from an athlete profile. Returns the defaults
 * unchanged when there's no age/experience signal, so the engine is identical
 * for athletes who haven't filled in a profile.
 */
export function getReadinessTuning(
  profile?: Partial<ProfileLike> | null,
  now: Date = new Date(),
): ReadinessTuning {
  const t: ReadinessTuning = { ...DEFAULT_READINESS_TUNING }
  if (!profile) return t

  const age = ageFromBirthDate(profile.birthDate, now)
  if (age !== null && age >= 50) {
    t.acwrDanger = 1.3
    t.stateDConsecutiveRed = 4
  } else if (age !== null && age >= 40) {
    t.acwrDanger = 1.4
  }

  if (profile.experienceLevel === 'first_timer' || profile.experienceLevel === 'beginner') {
    t.acwrSweetTop = Math.min(t.acwrSweetTop, 1.2)
    t.acwrDanger = Math.min(t.acwrDanger, 1.4)
    t.weeklyIncreaseCapPct = 8
  }

  return t
}
