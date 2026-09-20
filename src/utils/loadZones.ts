import type { TSBState, ACWRRisk } from '../types'
import type { ReadinessTuning } from './engineConfig'

/**
 * The one table every load surface reads from.
 *
 * Field bug (2026-09-20): a Load Ratio of 1.27 read "Sweet Spot · Safe
 * zone" on one card and "Injury Risk Alert · Deload this week" on the
 * next; a Recovery Balance of −13.2 sat inside the chart's "Training
 * Zone" while its card said "Overreaching — back off" and the glossary
 * said overreaching starts below −30. Four files each defined their own
 * boundaries and the prose was typed by hand, so they drifted.
 *
 * Now the chart bands, the stat cards, the glossary bullets, the
 * training-signals classifier and the injury checks all render from
 * here. `loadZones.test.ts` fails the build if any of them disagree.
 *
 * The science behind the numbers is unchanged: TSB bands are the
 * TrainingPeaks conventions (Coggan/Allen 2010) with the overreaching
 * line at −30 per Meeusen et al. 2013; ACWR bands are Gabbett 2016
 * (0.8–1.3 lowest injury incidence) and Hulin 2014 (>1.5 = 2–4× risk).
 */

export type ZoneTone = 'good' | 'neutral' | 'warning' | 'critical'

export interface LoadZone<K extends string> {
  key: K
  /** The one word every surface uses for this range. */
  label: string
  tone: ZoneTone
  /** Human range, for legends and glossaries ("−30 to −10"). */
  range: string
  /** What the stat card says underneath the number. */
  note: string
}

// ─── Recovery balance (TSB = fitness − fatigue) ────────────────

/** Lower bounds, inclusive: a TSB at or above the bound is in that zone. */
export const TSB_BOUNDS = {
  peaked: 15,
  fresh: 5,
  steady: -10,
  /** The build zone runs from here up to `steady`; below it is overreaching. */
  build: -30,
} as const

export const TSB_ZONES: readonly LoadZone<TSBState>[] = [
  { key: 'peaked', label: 'Peaked', tone: 'good', range: '+15 and up', note: 'Race-ready. Ideal for a race or a time trial.' },
  { key: 'fresh', label: 'Fresh', tone: 'good', range: '+5 to +15', note: 'Fresh. Good day for a quality session.' },
  { key: 'steady', label: 'Steady', tone: 'neutral', range: '−10 to +5', note: 'Absorbing this week’s load. Building fitness.' },
  { key: 'build', label: 'Build zone', tone: 'neutral', range: '−30 to −10', note: 'Tired by design in a build week. Back off only if Readiness agrees for 3+ days.' },
  { key: 'overreaching', label: 'Overreaching', tone: 'critical', range: 'below −30', note: 'Fatigue has outrun your base. Deload, and confirm with Readiness.' },
]

export function tsbZone(tsb: number): LoadZone<TSBState> {
  const key: TSBState =
    tsb >= TSB_BOUNDS.peaked ? 'peaked'
    : tsb >= TSB_BOUNDS.fresh ? 'fresh'
    : tsb >= TSB_BOUNDS.steady ? 'steady'
    : tsb >= TSB_BOUNDS.build ? 'build'
    : 'overreaching'
  return TSB_ZONES.find(z => z.key === key)!
}

// ─── Load ratio (ACWR = acute ÷ chronic) ──────────────────────

export interface AcwrBounds {
  /** Below this the athlete is undertraining. */
  low: number
  /** Top of the in-range band (inclusive). Tunable by age/experience. */
  sweetTop: number
  /** Above this is a spike. Tunable by age/experience. */
  danger: number
}

export const ACWR_BOUNDS: AcwrBounds & { detrained: number } = {
  low: 0.8,
  sweetTop: 1.3,
  danger: 1.5,
  /** The training-signals engine's stricter floor: rest days naturally
   *  dip the ratio below 0.8, so only a genuinely low ratio counts as
   *  chronic load decaying. */
  detrained: 0.7,
}

/** The athlete's tuned bounds (a beginner's in-range band tops out at
 *  1.2; a masters athlete's spike line sits at 1.3). */
export function acwrBoundsFrom(tuning?: Pick<ReadinessTuning, 'acwrSweetTop' | 'acwrDanger'> | null): AcwrBounds {
  return {
    low: ACWR_BOUNDS.low,
    sweetTop: tuning?.acwrSweetTop ?? ACWR_BOUNDS.sweetTop,
    danger: tuning?.acwrDanger ?? ACWR_BOUNDS.danger,
  }
}

const fmt = (n: number) => n.toFixed(1)

export function acwrZones(b: AcwrBounds = ACWR_BOUNDS): LoadZone<ACWRRisk>[] {
  return [
    { key: 'detraining', label: 'Undertraining', tone: 'warning', range: `below ${fmt(b.low)}`, note: 'Load fell below your base. Add volume gradually.' },
    { key: 'in_range', label: 'In range', tone: 'good', range: `${fmt(b.low)} to ${fmt(b.sweetTop)}`, note: 'This week matches your base.' },
    { key: 'ramping', label: 'Ramping fast', tone: 'warning', range: `${fmt(b.sweetTop)} to ${fmt(b.danger)}`, note: 'Injury risk climbing. Hold or trim volume this week.' },
    { key: 'spike', label: 'Spike', tone: 'critical', range: `above ${fmt(b.danger)}`, note: 'Ramped too fast. Deload this week.' },
  ]
}

export function acwrZone(acwr: number, b: AcwrBounds = ACWR_BOUNDS): LoadZone<ACWRRisk> {
  const key: ACWRRisk =
    acwr < b.low ? 'detraining'
    : acwr <= b.sweetTop ? 'in_range'
    : acwr <= b.danger ? 'ramping'
    : 'spike'
  return acwrZones(b).find(z => z.key === key)!
}

/** What the in-range card says while the ramp alert is live: the level
 *  is fine, the rate is not. */
export const ACWR_IN_RANGE_RAMPING_NOTE = 'In range, but climbing fast. Hold this week’s volume flat.'

// ─── Ramp alert (rate of change, not level) ───────────────────

export const RAMP_ALERT = {
  /** The ratio must have risen at least this much over three days. */
  minRise3d: 0.1,
  /** …and sit at least here, so noise around a low ratio never fires. */
  levelFloor: 1.25,
} as const

// ─── Chart bands ──────────────────────────────────────────────

/** The shaded bands on the Fitness / Fatigue / Recovery chart. */
export const TSB_BANDS = {
  build: { y1: TSB_BOUNDS.build, y2: TSB_BOUNDS.steady, label: 'Build zone' },
  raceDay: { y1: TSB_BOUNDS.fresh, y2: 25, label: 'Race Day' },
  overreachingLine: { y: TSB_BOUNDS.build, label: 'Overreaching below' },
} as const
