/**
 * Strength records (Phase 4, design screen 10) — estimated 1RM trends,
 * personal-record detection, and weekly working-set volume.
 *
 * Pure functions over the same buildProgression() history the rest of
 * the strength layer uses, so skips and warm-ups are already excluded
 * before any math here runs. No React, no storage — tested directly.
 */

import type { TrainingWeek } from '../types'
import {
  buildProgression,
  normalizeExerciseName,
  parseWeightLb,
  type ExerciseProgression,
  type ExerciseSession,
} from './strengthProgression'
import type { StrengthCapacity } from '../engines/strength/benchmark'

/** Epley reliability degrades fast past ~12 reps; clamp so a 20-rep
 *  endurance set doesn't fabricate a heroic max. */
const EPLEY_MAX_REPS = 12

/** Estimated one-rep max via Epley: w × (1 + r/30). 0 when unloaded. */
export function epley1RM(weightLb: number, reps: number): number {
  if (weightLb <= 0 || reps <= 0) return 0
  const r = Math.min(reps, EPLEY_MAX_REPS)
  return Math.round(weightLb * (1 + r / 30) * 10) / 10
}

/** The best estimated 1RM across a session's performed sets. */
export function sessionBestE1RM(session: ExerciseSession): number {
  return session.sets.reduce(
    (best, s) => Math.max(best, epley1RM(parseWeightLb(s.weight), s.reps || 0)),
    0,
  )
}

export interface E1RMPoint {
  weekNum: number
  date: string
  e1RM: number
}

/** Session-by-session e1RM series for a weighted exercise (loaded
 *  sessions only — a deload to bodyweight isn't a zero-strength day). */
export function e1RMSeries(prog: ExerciseProgression): E1RMPoint[] {
  return prog.sessions
    .map(s => ({ weekNum: s.weekNum, date: s.date, e1RM: sessionBestE1RM(s) }))
    .filter(p => p.e1RM > 0)
}

/** Current e1RM + change since the first loaded session. Null when the
 *  exercise has never been loaded. */
export function e1RMTrend(prog: ExerciseProgression): { current: number; first: number; deltaPct: number } | null {
  const series = e1RMSeries(prog)
  if (series.length === 0) return null
  const first = series[0].e1RM
  const current = series[series.length - 1].e1RM
  return {
    current,
    first,
    deltaPct: first > 0 ? Math.round(((current - first) / first) * 100) : 0,
  }
}

export interface PersonalRecord {
  canonicalName: string
  displayName: string
  /** YYYY-MM-DD of the session that set it. */
  date: string
  dayLabel: string
  weekNum: number
  /** 'e1rm' for weighted lifts, 'reps' for bodyweight work. */
  kind: 'e1rm' | 'reps'
  /** New best: e1RM in lb, or reps in a single set. */
  value: number
  /** The best it beat. */
  prev: number
}

/**
 * Every personal record in the logged history, oldest first. A PR needs
 * something to beat — the first session of an exercise establishes the
 * baseline, it doesn't set a record. Weighted lifts PR on estimated 1RM;
 * bodyweight work PRs on best single-set reps.
 */
export function detectPRs(weeks: TrainingWeek[]): PersonalRecord[] {
  const out: PersonalRecord[] = []
  for (const prog of buildProgression(weeks).values()) {
    if (prog.isBodyweight) {
      let best = -1
      for (const session of prog.sessions) {
        const top = session.sets.reduce((m, s) => Math.max(m, s.reps || 0), 0)
        if (top <= 0) continue
        if (best >= 0 && top > best) {
          out.push({
            canonicalName: prog.canonicalName,
            displayName: prog.displayName,
            date: session.date,
            dayLabel: session.dayLabel,
            weekNum: session.weekNum,
            kind: 'reps',
            value: top,
            prev: best,
          })
        }
        best = Math.max(best, top)
      }
    } else {
      let best = -1
      for (const session of prog.sessions) {
        const e = sessionBestE1RM(session)
        if (e <= 0) continue
        if (best >= 0 && e > best) {
          out.push({
            canonicalName: prog.canonicalName,
            displayName: prog.displayName,
            date: session.date,
            dayLabel: session.dayLabel,
            weekNum: session.weekNum,
            kind: 'e1rm',
            value: e,
            prev: best,
          })
        }
        best = Math.max(best, e)
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** PRs set on one calendar day — the WorkoutModal / Journal chip. */
export function prsOnDate(prs: PersonalRecord[], dateIso: string): PersonalRecord[] {
  return prs.filter(p => p.date === dateIso)
}

/** One line per PR: "Goblet squat — e1RM 41 lb (was 38)". */
export function formatPR(pr: PersonalRecord): string {
  return pr.kind === 'e1rm'
    ? `${pr.displayName} — e1RM ${pr.value} lb (was ${pr.prev})`
    : `${pr.displayName} — ${pr.value} reps (was ${pr.prev})`
}

export interface WeeklyVolumePoint {
  weekNum: number
  /** Performed working sets that week (skips and warm-ups excluded). */
  sets: number
}

/**
 * Working sets per plan week, for weeks that logged any. Counts every
 * performed non-warm-up set across all strength logs — the honest volume
 * number the recap and Stats bar chart share.
 */
export function weeklyStrengthVolume(weeks: TrainingWeek[]): WeeklyVolumePoint[] {
  const out: WeeklyVolumePoint[] = []
  for (const week of weeks) {
    // The synthetic "previous plan" bucket (weeksWithPriorLogs) spans
    // months — one giant bar would be a lie, so it stays off the chart.
    if (week.num <= 0) continue
    let sets = 0
    for (const day of week.days) {
      for (const ex of day.actual?.strengthLog ?? []) {
        sets += ex.sets.filter(s => s.done !== false && s.setType !== 'warmup').length
      }
    }
    if (sets > 0) out.push({ weekNum: week.num, sets })
  }
  return out
}

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5)

export interface BenchmarkComparison {
  /** Last session's working top weight in lb. */
  workingLb: number
  /** The measured 8RM benchmark in lb. */
  benchLb: number
  /** working / bench, in whole percent. */
  pct: number
  /** What the current e1RM says an 8RM re-test should clear, when it has
   *  moved past the measured number. Null when there's nothing new to say. */
  expectedNext8RMLb: number | null
}

/**
 * Working weight vs the measured goblet-squat 8RM benchmark (the one
 * loaded lift the benchmark tests). Null without both a benchmark and a
 * loaded session history.
 */
export function gobletBenchmarkComparison(
  progressions: Map<string, ExerciseProgression>,
  capacity: StrengthCapacity | null | undefined,
): BenchmarkComparison | null {
  const benchLb = capacity?.gobletSquatLb
  if (typeof benchLb !== 'number' || benchLb <= 0) return null
  const prog = progressions.get(normalizeExerciseName('Goblet squat'))
  if (!prog?.last || prog.last.topWeightLb <= 0) return null
  const workingLb = prog.last.topWeightLb
  const trend = e1RMTrend(prog)
  // An 8RM implied by the current e1RM: e1RM / (1 + 8/30).
  const implied8RM = trend ? round5(trend.current / (1 + 8 / 30)) : null
  return {
    workingLb,
    benchLb,
    pct: Math.round((workingLb / benchLb) * 100),
    expectedNext8RMLb: implied8RM != null && implied8RM > benchLb ? implied8RM : null,
  }
}
