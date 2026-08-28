import type { TrainingWeek } from '../../types'
import type { StrengthCapacity } from '../strength/benchmark'
import { buildProgression } from '../../utils/strengthProgression'
import { e1RMTrend } from '../../utils/strengthRecords'

/**
 * The Athlete Model (Adaptive Engine phase 2, PR 4) — a measured model
 * of the athlete, rebuilt from evidence after every workout. This is
 * the substrate the "Your Engine" screen renders and Level Up ranks
 * from: every number here is DERIVED from logged history, never from a
 * questionnaire answer, and every field carries enough provenance
 * (counts, windows, method) for the UI to show its evidence.
 *
 * Honesty rules:
 *  - A field the data cannot support is null — the UI says "not enough
 *    data yet", never a fabricated number.
 *  - Whole-run efforts are SUBMAXIMAL evidence, so the critical-speed
 *    fit is labeled by method: a clean linear fit when the frontier
 *    supports one, a best-effort lower bound when it doesn't.
 */

const MILE_M = 1609.344

export interface CriticalSpeedEstimate {
  /** Sustainable aerobic pace, sec per mile. */
  secPerMi: number
  /** Anaerobic distance reserve (meters); 0 under the fallback method. */
  dPrimeMeters: number
  /** 'linear-fit': distance-time regression over the best-effort
   *  frontier; 'best-effort': lower bound from the fastest sustained
   *  run when the frontier can't support a fit. */
  method: 'linear-fit' | 'best-effort'
  effortCount: number
}

export interface EfficiencyTrend {
  /** Median speed-per-heartbeat over the trailing 28 days, ×1000
   *  ((m/s)/bpm — higher is fitter). */
  current: number
  /** Same metric over the athlete's earliest 28-day window. */
  baseline: number
  deltaPct: number
  sampleCount: number
}

export interface AthleteModel {
  asOfIso: string
  criticalSpeed: CriticalSpeedEstimate | null
  efficiency: EfficiencyTrend | null
  /** Measured trailing-28-day average weekly run miles. */
  weeklyRunMiles4wk: number | null
  /** Longest single run in the trailing 30 days (raw, uncapped). */
  longestRun30dMi: number | null
  /** Top weighted lifts by history depth, with e1RM trend. */
  strength: { name: string; e1RM: number; deltaPct: number; sessions: number }[]
  /** Measured station/benchmark capacities, rendered for display. */
  stationBenchmarks: { label: string; value: string }[]
}

interface RunEffort {
  isoDate: string
  sec: number
  meters: number
  avgHR?: number
  type: string
}

const RUN_TYPES = new Set(['run', 'quality', 'long', 'race'])
const RUN_ACTIVITY = /run|trail|treadmill/i

function collectRuns(weeks: TrainingWeek[], todayIso: string): RunEffort[] {
  const out: RunEffort[] = []
  for (const week of weeks) {
    for (const day of week.days) {
      const a = day.actual
      if (!a) continue
      // A run is a run wherever it happened: run-class days as before,
      // plus run-typed recordings on gym/cross/rest/benchmark days —
      // the field case was a treadmill 1km TT on a gym-classed
      // benchmark day, invisible to the whole model.
      if (!RUN_TYPES.has(day.type) && !RUN_ACTIVITY.test(a.type ?? '')) continue
      const iso = a.startDate?.slice(0, 10)
      if (!iso || iso > todayIso) continue
      if (!a.distance || a.distance <= 0 || !a.movingTime || a.movingTime < 3 * 60) continue
      out.push({ isoDate: iso, sec: a.movingTime, meters: a.distance * MILE_M, avgHR: a.avgHR, type: day.type })
    }
  }
  return out.sort((a, b) => a.isoDate.localeCompare(b.isoDate))
}

// ─── Critical speed ────────────────────────────────────────────

/**
 * Fit CS + D' from the athlete's best-effort frontier: log-spaced
 * duration bins (3–75 min), best distance per bin, OLS over the bins.
 * Whole-run means UNDERESTIMATE true CS — the estimate is a floor that
 * rises as time trials and hard intervals land, which is the honest
 * direction to err.
 */
export function fitCriticalSpeed(runs: RunEffort[]): CriticalSpeedEstimate | null {
  const efforts = runs.filter(r => r.sec >= 3 * 60 && r.sec <= 75 * 60)
  if (efforts.length === 0) return null

  // Log-spaced bins between 3 and 75 minutes; best (fastest avg-speed
  // sustained) distance per bin.
  const BIN_COUNT = 8
  const logMin = Math.log(3 * 60)
  const logMax = Math.log(75 * 60)
  const best: (RunEffort | null)[] = Array(BIN_COUNT).fill(null)
  for (const e of efforts) {
    const idx = Math.min(BIN_COUNT - 1, Math.floor(((Math.log(e.sec) - logMin) / (logMax - logMin)) * BIN_COUNT))
    const cur = best[idx]
    if (!cur || e.meters / e.sec > cur.meters / cur.sec) best[idx] = e
  }
  const frontier = best.filter((e): e is RunEffort => e != null)

  // A linear fit needs spread: ≥3 bins spanning ≥15 minutes.
  const spanSec = frontier.length > 0
    ? Math.max(...frontier.map(e => e.sec)) - Math.min(...frontier.map(e => e.sec))
    : 0
  // Curvature gate: a real speed-duration frontier has the short
  // efforts meaningfully FASTER than the long ones (that difference IS
  // what the fit measures). A flat or inverted frontier — all easy
  // runs, or a warm-up-diluted short session — has no exploitable
  // curvature, and fitting it produces a garbage-slow "CS". Require
  // ≥5% speed spread from the longest to the shortest frontier point.
  const shortest = frontier.length > 0 ? frontier.reduce((a, b) => (a.sec < b.sec ? a : b)) : null
  const longest = frontier.length > 0 ? frontier.reduce((a, b) => (a.sec > b.sec ? a : b)) : null
  const curved = shortest != null && longest != null &&
    (shortest.meters / shortest.sec) >= (longest.meters / longest.sec) * 1.05

  if (curved && frontier.length >= 3 && spanSec >= 15 * 60) {
    const n = frontier.length
    const mt = frontier.reduce((s, e) => s + e.sec, 0) / n
    const md = frontier.reduce((s, e) => s + e.meters, 0) / n
    let num = 0
    let den = 0
    for (const e of frontier) {
      num += (e.sec - mt) * (e.meters - md)
      den += (e.sec - mt) ** 2
    }
    if (den > 0) {
      const cs = num / den                 // m/s
      const dPrime = md - cs * mt          // meters
      const secPerMi = MILE_M / cs
      // Sanity: humans run CS between 4:00 and 20:00 per mile, and a
      // negative D' means the submax data can't support the fit.
      if (dPrime >= 0 && secPerMi >= 240 && secPerMi <= 1200) {
        return {
          secPerMi: Math.round(secPerMi),
          dPrimeMeters: Math.round(dPrime),
          method: 'linear-fit',
          effortCount: efforts.length,
        }
      }
    }
  }

  // Fallback lower bound: fastest sustained pace over ≥8 minutes.
  const sustained = efforts.filter(e => e.sec >= 8 * 60)
  if (sustained.length === 0) return null
  const bestPace = Math.min(...sustained.map(e => e.sec / (e.meters / MILE_M)))
  if (bestPace < 240 || bestPace > 1200) return null
  return {
    secPerMi: Math.round(bestPace),
    dPrimeMeters: 0,
    method: 'best-effort',
    effortCount: sustained.length,
  }
}

// ─── Efficiency (pace-at-HR) trend ─────────────────────────────

/**
 * Speed-per-heartbeat on steady runs — the fitness trend every run
 * measures for free. Medians damp terrain/weather noise; requires ≥3
 * samples in both the earliest and the trailing window.
 */
export function efficiencyTrend(runs: RunEffort[], todayIso: string): EfficiencyTrend | null {
  const steady = runs.filter(r => (r.type === 'run' || r.type === 'long') && r.avgHR && r.avgHR >= 90 && r.sec >= 15 * 60)
  if (steady.length < 6) return null

  const ei = (r: RunEffort) => ((r.meters / r.sec) / (r.avgHR as number)) * 1000
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b)
    return s[Math.floor(s.length / 2)]
  }

  const first = steady[0].isoDate
  const baselineEnd = shiftIso(first, 28)
  const currentStart = shiftIso(todayIso, -28)
  const baselinePts = steady.filter(r => r.isoDate <= baselineEnd)
  const currentPts = steady.filter(r => r.isoDate >= currentStart)
  if (baselinePts.length < 3 || currentPts.length < 3) return null

  const baseline = median(baselinePts.map(ei))
  const current = median(currentPts.map(ei))
  if (baseline <= 0) return null
  return {
    current: Math.round(current * 100) / 100,
    baseline: Math.round(baseline * 100) / 100,
    deltaPct: Math.round(((current - baseline) / baseline) * 100),
    sampleCount: steady.length,
  }
}

function shiftIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dd}`
}

// ─── Assembly ──────────────────────────────────────────────────

export function buildAthleteModel(
  weeks: TrainingWeek[],
  todayIso: string,
  opts: { capacity?: StrengthCapacity | null } = {},
): AthleteModel {
  const runs = collectRuns(weeks, todayIso)

  const windowStart = shiftIso(todayIso, -28)
  const recent = runs.filter(r => r.isoDate >= windowStart)
  const weeklyRunMiles4wk = recent.length > 0
    ? Math.round((recent.reduce((s, r) => s + r.meters, 0) / MILE_M / 4) * 10) / 10
    : null
  const window30 = shiftIso(todayIso, -30)
  const recent30 = runs.filter(r => r.isoDate >= window30)
  const longestRun30dMi = recent30.length > 0
    ? Math.round(Math.max(...recent30.map(r => r.meters / MILE_M)) * 10) / 10
    : null

  const strength = Array.from(buildProgression(weeks).values())
    .filter(p => !p.isBodyweight && p.sessions.length >= 2)
    .map(p => ({ prog: p, trend: e1RMTrend(p) }))
    .filter((x): x is { prog: typeof x.prog; trend: NonNullable<typeof x.trend> } => x.trend != null)
    .sort((a, b) => b.prog.sessions.length - a.prog.sessions.length)
    .slice(0, 3)
    .map(({ prog, trend }) => ({
      name: prog.displayName,
      e1RM: trend.current,
      deltaPct: trend.deltaPct,
      sessions: prog.sessions.length,
    }))

  const c = opts.capacity
  const fmtSec = (v: number) => `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`
  const stationBenchmarks: { label: string; value: string }[] = []
  if (typeof c?.gobletSquatLb === 'number') stationBenchmarks.push({ label: 'Goblet squat 8RM', value: `${c.gobletSquatLb} lb` })
  if (typeof c?.pushUps === 'number') stationBenchmarks.push({ label: 'Push-ups (max set)', value: `${c.pushUps}` })
  if (typeof c?.wallBallsUnbroken === 'number') stationBenchmarks.push({ label: 'Wall balls unbroken', value: `${c.wallBallsUnbroken}` })
  if (typeof c?.erg1kSec === 'number') stationBenchmarks.push({ label: '1 km erg', value: fmtSec(c.erg1kSec) })
  if (typeof c?.erg500Sec === 'number') stationBenchmarks.push({ label: '500 m erg', value: fmtSec(c.erg500Sec) })
  if (typeof c?.plankSec === 'number') stationBenchmarks.push({ label: 'Plank hold', value: fmtSec(c.plankSec) })

  return {
    asOfIso: todayIso,
    criticalSpeed: fitCriticalSpeed(runs),
    efficiency: efficiencyTrend(runs, todayIso),
    weeklyRunMiles4wk,
    longestRun30dMi,
    strength,
    stationBenchmarks,
  }
}

/** "7:58 /mi" for display. */
export function fmtPaceSecMi(secPerMi: number): string {
  const m = Math.floor(secPerMi / 60)
  const s = Math.round(secPerMi % 60)
  return `${m}:${String(s).padStart(2, '0')} /mi`
}
