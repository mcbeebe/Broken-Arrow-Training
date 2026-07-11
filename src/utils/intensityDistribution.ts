import type { DayCompliance } from '../types'
import type { TrainingMethod } from '../types/training-method'

/**
 * G7 — the intensity-distribution monitor ("gray-zone guard") and the
 * aerobic-decoupling durability metric.
 *
 * "Your easy days are too hard" is the most-quoted coaching truth in the
 * category — and nobody in the competitive set computes POLARIZATION
 * COMPLIANCE: the athlete's actual weekly easy/hard time split measured
 * against their own chosen method's phase target (every method in the
 * library already declares per-phase intensityDistribution). We say it
 * with receipts: "Koop's build phase wants 80% easy; you ran 61%."
 */

export interface WeeklyIntensitySplit {
  /** Time-weighted % of measured running time in Z1–Z2. */
  easyPct: number
  hardPct: number
  measuredSessions: number
  totalSec: number
}

/** Time-in-zone across a week's HR-measured sessions. Z1–Z2 = easy;
 *  Z3–Z5 = hard (Z3 is the gray zone — it counts AGAINST the easy share,
 *  which is exactly the point). */
export function weeklyIntensitySplit(days: DayCompliance[]): WeeklyIntensitySplit | null {
  let easySec = 0
  let hardSec = 0
  let measuredSessions = 0
  for (const d of days) {
    const zones = d.hrZoneSummary
    if (!zones || zones.length === 0) continue
    let sessionSec = 0
    for (const z of zones) {
      if (!z.seconds || z.seconds <= 0) continue
      sessionSec += z.seconds
      if (z.zone <= 2) easySec += z.seconds
      else hardSec += z.seconds
    }
    if (sessionSec > 0) measuredSessions++
  }
  const totalSec = easySec + hardSec
  if (totalSec === 0) return null
  return {
    easyPct: Math.round((easySec / totalSec) * 100),
    hardPct: Math.round((hardSec / totalSec) * 100),
    measuredSessions,
    totalSec,
  }
}

/** The method's easy-share target for the athlete's current phase —
 *  matched by phase label, falling back to the median across phases. */
export function methodEasyTarget(
  method: TrainingMethod,
  currentPhaseLabel?: string | null,
): { easyPct: number; phaseName: string } {
  const phases = method.phases ?? []
  if (currentPhaseLabel) {
    const match = phases.find(p =>
      p.name.toLowerCase().includes(currentPhaseLabel.toLowerCase()) ||
      currentPhaseLabel.toLowerCase().includes(p.name.toLowerCase()),
    )
    if (match) return { easyPct: match.intensityDistribution.easyPct, phaseName: match.name }
  }
  const sorted = phases
    .map(p => p.intensityDistribution.easyPct)
    .sort((a, b) => a - b)
  const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 80
  return { easyPct: median, phaseName: 'plan' }
}

export interface GrayZoneAssessment {
  flagged: boolean
  message: string | null
}

const MIN_MEASURED_SESSIONS = 3
const TOLERANCE_PCT_POINTS = 10

/** Advisory when the measured week runs meaningfully harder than the
 *  method's own target. Quiet below 3 HR-measured sessions (no verdicts
 *  from thin data) and within tolerance (no nagging over noise). */
export function grayZoneAssessment(
  split: WeeklyIntensitySplit | null,
  target: { easyPct: number; phaseName: string },
  methodName: string,
): GrayZoneAssessment {
  if (!split || split.measuredSessions < MIN_MEASURED_SESSIONS) {
    return { flagged: false, message: null }
  }
  if (split.easyPct >= target.easyPct - TOLERANCE_PCT_POINTS) {
    return { flagged: false, message: null }
  }
  return {
    flagged: true,
    message:
      `${methodName}'s ${target.phaseName} wants your easy time easy — ` +
      `${target.easyPct}% target, you ran ${split.easyPct}% across ${split.measuredSessions} measured sessions. `
      + 'Gray-zone miles cost recovery without buying speed: keep the hard days hard and slow the easy ones down.',
  }
}

// ── Aerobic decoupling (durability) ─────────────────────────────

export interface DecouplingInput {
  /** Per-sample cumulative seconds. */
  time: number[]
  /** Per-sample cumulative distance (meters). */
  dist: number[]
  /** Per-sample heart rate (bpm). */
  hr: (number | null | undefined)[]
}

const MIN_DECOUPLING_SECONDS = 20 * 60

/**
 * Pace:HR decoupling — the classic durability read: the % by which the
 * second half's cost (HR per unit speed) exceeds the first half's on a
 * steady effort. <5% = well-developed aerobic durability; >8% flags
 * endurance still under construction (or a too-hard day, heat, or a
 * fueling miss — the coach frames, never diagnoses).
 * Returns null when the sample is too short or HR is too sparse.
 */
export function aerobicDecoupling(input: DecouplingInput): number | null {
  const { time, dist, hr } = input
  const n = Math.min(time.length, dist.length, hr.length)
  if (n < 60) return null
  const totalSec = time[n - 1] - time[0]
  if (totalSec < MIN_DECOUPLING_SECONDS) return null

  const midTime = time[0] + totalSec / 2
  let half1 = { speedSum: 0, hrSum: 0, count: 0 }
  let half2 = { speedSum: 0, hrSum: 0, count: 0 }
  for (let i = 1; i < n; i++) {
    const dt = time[i] - time[i - 1]
    const dd = dist[i] - dist[i - 1]
    const h = hr[i]
    if (dt <= 0 || dd < 0 || !h || h <= 0) continue
    const bucket = time[i] <= midTime ? half1 : half2
    bucket.speedSum += dd / dt
    bucket.hrSum += h
    bucket.count++
  }
  if (half1.count < 30 || half2.count < 30) return null

  const eff1 = (half1.speedSum / half1.count) / (half1.hrSum / half1.count)
  const eff2 = (half2.speedSum / half2.count) / (half2.hrSum / half2.count)
  if (eff1 <= 0) return null
  return Math.round(((eff1 - eff2) / eff1) * 1000) / 10 // % drift, 0.1 precision
}

/** Adapter: decoupling from Garmin activity SPLITS (per-mile/km laps with
 *  duration/distance/avgHR) — the granularity the sync layer already
 *  caches. Rest laps are excluded; needs ≥4 usable laps per half. */
export function decouplingFromSplits(
  splits: { distance?: number; duration?: number; averageHR?: number; splitType?: string }[] | undefined,
): number | null {
  // Array.isArray, not a truthiness check: splits arrive from the SYNCED
  // Garmin detail cache, and a cached entry holding the raw API object
  // shape sails past `!splits` AND past `length < 8` (undefined < 8 is
  // false) straight into `.filter` — the field white-screen of 7/11.
  if (!Array.isArray(splits) || splits.length < 8) return null
  const active = splits.filter(s =>
    (s.distance ?? 0) > 0 && (s.duration ?? 0) > 0 && (s.averageHR ?? 0) > 0 &&
    (!s.splitType || /active/i.test(s.splitType)),
  )
  if (active.length < 8) return null
  // Rebuild cumulative streams at lap granularity and reuse the core math.
  const time: number[] = [0]
  const dist: number[] = [0]
  const hr: number[] = [0]
  for (const s of active) {
    time.push(time[time.length - 1] + s.duration!)
    dist.push(dist[dist.length - 1] + s.distance!)
    hr.push(s.averageHR!)
  }
  // aerobicDecoupling wants dense samples; lap-level is coarse but valid —
  // relax its density floor by expanding each lap into per-30s samples.
  const denseTime: number[] = []
  const denseDist: number[] = []
  const denseHr: number[] = []
  for (let i = 1; i < time.length; i++) {
    const lapSec = time[i] - time[i - 1]
    const steps = Math.max(1, Math.floor(lapSec / 30))
    for (let k = 1; k <= steps; k++) {
      denseTime.push(time[i - 1] + (lapSec * k) / steps)
      denseDist.push(dist[i - 1] + ((dist[i] - dist[i - 1]) * k) / steps)
      denseHr.push(hr[i])
    }
  }
  return aerobicDecoupling({ time: denseTime, dist: denseDist, hr: denseHr })
}

/** One-line coach context (D8 — the INTENSITY section). */
export function buildIntensityContext(
  split: WeeklyIntensitySplit | null,
  target: { easyPct: number; phaseName: string },
  methodName: string,
  longRunDecouplingPct?: number | null,
): string | null {
  if (!split) return null
  const gray = grayZoneAssessment(split, target, methodName)
  const parts = [
    `This week's measured intensity split: ${split.easyPct}% easy / ${split.hardPct}% hard ` +
    `across ${split.measuredSessions} HR-measured sessions (method target: ~${target.easyPct}% easy in ${target.phaseName}).`,
  ]
  if (gray.flagged && gray.message) parts.push(`GRAY-ZONE FLAG: ${gray.message}`)
  if (typeof longRunDecouplingPct === 'number') {
    parts.push(
      `Long-run aerobic decoupling: ${longRunDecouplingPct}% ` +
      `(${longRunDecouplingPct < 5 ? 'well-coupled — durable aerobic base' : longRunDecouplingPct <= 8 ? 'moderate — normal for building endurance' : 'high — endurance durability still under construction (or heat/fueling/pacing on the day)'}).`,
    )
  }
  return parts.join(' ')
}
