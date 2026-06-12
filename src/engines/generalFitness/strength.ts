// Goal-personalized strength programming for the General Fitness path.
//
// The old engine emitted ONE fixed six-movement full-body template on every
// strength day, for every goal — so a "build muscle / big biceps" athlete got
// the same goblet-squat/RDL/row session as a "stay healthy" one, every single
// day. This module fixes that on two axes:
//
//   1. VARIETY — two distinct full-body sessions (A/B) rotate across the block,
//      so consecutive strength days train different movements instead of being
//      identical. Both hit every major pattern (squat · hinge · push · pull ·
//      carry/core) so the ≥2×/week per-muscle floor still holds.
//   2. TARGETING — the athlete's free-text goal ("big biceps", "wider back") is
//      parsed for the muscle(s) they named, and direct accessory work for those
//      muscles is appended to every session. A single, focused emphasis gets
//      two direct movements per session for real hypertrophy volume.
//
// Every exercise name here resolves to a form-cue guide in utils/exercises, so
// each row stays tap-for-cues. Pure + deterministic.

import type { GeneralGoal } from '../../hooks/useOnboarding'

/** Major muscle groups an athlete can name in their free-text goal. */
export type MuscleEmphasis =
  | 'arms'
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'glutes'
  | 'legs'
  | 'core'

/** A single prescribed movement. `hold` moves use a seconds hold instead of a
 *  rep target (carries, planks). Names must contain an exercises.ts guide key. */
export interface StrengthMove {
  name: string
  hold?: boolean
}

// Keyword → emphasis. Ordered most-specific-first within each group; matched as
// word-ish substrings against the lowercased goal text. Deliberately generous
// with the words real users type ("guns", "booty", "wheels") per the
// customer-language rule.
const EMPHASIS_KEYWORDS: { emphasis: MuscleEmphasis; words: string[] }[] = [
  { emphasis: 'arms', words: ['bicep', 'biceps', 'tricep', 'triceps', 'arms', 'arm ', 'guns', 'sleeve'] },
  { emphasis: 'chest', words: ['chest', 'pec', 'pecs', 'bench'] },
  { emphasis: 'back', words: ['back', 'lat', 'lats', 'wide', 'v-taper', 'v taper', 'pull-up', 'pullup'] },
  { emphasis: 'shoulders', words: ['shoulder', 'shoulders', 'delt', 'delts', 'boulder'] },
  { emphasis: 'glutes', words: ['glute', 'glutes', 'butt', 'booty', 'hip'] },
  { emphasis: 'legs', words: ['leg', 'legs', 'quad', 'quads', 'wheels', 'hamstring', 'calf', 'calves', 'squat'] },
  { emphasis: 'core', words: ['ab', 'abs', 'core', 'six-pack', 'six pack', 'sixpack', 'obliques', 'midsection'] },
]

/**
 * Parse a free-text goal ("I want big biceps and a wider back") into the muscle
 * groups to emphasize. Returns [] when nothing specific is named — the athlete
 * gets the well-rounded A/B rotation with no extra accessory bias.
 */
export function parseGoalEmphasis(goalText?: string): MuscleEmphasis[] {
  if (!goalText) return []
  const text = ` ${goalText.toLowerCase()} `
  const found: MuscleEmphasis[] = []
  for (const { emphasis, words } of EMPHASIS_KEYWORDS) {
    if (found.includes(emphasis)) continue
    if (words.some(w => text.includes(w))) found.push(emphasis)
  }
  return found
}

// Two rotating full-body sessions. Each covers squat · hinge · push · pull ·
// carry/core so every strength day trains the whole body (research: ≥2×/week
// per muscle), but A and B use different movements so back-to-back days — and
// week-over-week — never read as the same workout.
const BASE_A: StrengthMove[] = [
  { name: 'Goblet squat' },
  { name: 'RDL' },
  { name: 'DB bench press' },
  { name: 'DB row' },
  { name: 'Farmer carry', hold: true },
  { name: 'Plank', hold: true },
]
const BASE_B: StrengthMove[] = [
  { name: 'Bulgarian split squat' },
  { name: 'Weighted hip thrust' },
  { name: 'Overhead press' },
  { name: 'Lat pulldown' },
  { name: 'Walking lunge' },
  { name: 'Dead bug' },
]

/** Direct accessory pools per emphasis. The day index rotates through the pool
 *  so a muscle isn't trained with the exact same isolation move every session.
 *  Single-emphasis athletes get BOTH moves each session (see buildStrengthDay)
 *  for the higher direct volume their focused goal calls for. */
const EMPHASIS_ACCESSORIES: Record<MuscleEmphasis, StrengthMove[]> = {
  arms: [{ name: 'Bicep curl' }, { name: 'Hammer curl' }, { name: 'Overhead tricep extension' }],
  chest: [{ name: 'Chest fly' }, { name: 'Push-up' }],
  back: [{ name: 'Lat pulldown' }, { name: 'DB row' }],
  shoulders: [{ name: 'Lateral raise' }, { name: 'Overhead press' }],
  glutes: [{ name: 'Weighted hip thrust' }, { name: 'Glute bridge' }],
  legs: [{ name: 'Walking lunge' }, { name: 'Leg curl' }],
  core: [{ name: 'Dead bug' }, { name: 'Russian twists' }],
}

const norm = (name: string) => name.trim().toLowerCase()

/**
 * Build one strength day's ordered movement list for a goal + emphasis.
 *
 * - `dayIndex` is the strength session's running count from the start of the
 *   block (0-based). Even → session A, odd → session B, so days alternate.
 * - Emphasis accessories are appended after the base and de-duped against it
 *   (and each other) so a move never appears twice in one session.
 * - A single focused emphasis ("big biceps") gets two direct accessories per
 *   session; multiple emphases get one rotating accessory each to keep the
 *   session a sane length.
 * - Fat-loss always finishes with direct core work (its core emphasis is
 *   implicit), matching the goal's "abs show once you're lean" framing.
 */
export function buildStrengthDay(
  goalId: GeneralGoal,
  emphases: MuscleEmphasis[],
  dayIndex: number,
): StrengthMove[] {
  const base = dayIndex % 2 === 0 ? BASE_A : BASE_B
  const moves: StrengthMove[] = [...base]
  const seen = new Set(base.map(m => norm(m.name)))

  const add = (move: StrengthMove) => {
    if (seen.has(norm(move.name))) return
    seen.add(norm(move.name))
    moves.push(move)
  }

  // Fat-loss carries an implicit core emphasis (trained abs read better once
  // lean), layered on top of anything the athlete named.
  const effective: MuscleEmphasis[] = [...emphases]
  if (goalId === 'lose_fat' && !effective.includes('core')) effective.push('core')

  const single = effective.length === 1
  for (const emphasis of effective) {
    const pool = EMPHASIS_ACCESSORIES[emphasis]
    if (emphasis === 'core') {
      // Core gets both direct moves (anti-extension + rotation) on every day —
      // keeps the long-standing fat-loss "Dead bug + Russian twists" finisher.
      for (const m of pool) add(m)
    } else if (single) {
      // One focused muscle → two direct movements this session for real volume,
      // rotated so the pairing shifts day to day.
      add(pool[dayIndex % pool.length])
      add(pool[(dayIndex + 1) % pool.length])
    } else {
      add(pool[dayIndex % pool.length])
    }
  }

  return moves
}

/** Human emphasis phrase for plan/coaching copy, e.g. ["arms"] → "your arms". */
export function emphasisLabel(emphases: MuscleEmphasis[]): string | null {
  if (emphases.length === 0) return null
  const names: Record<MuscleEmphasis, string> = {
    arms: 'arms',
    chest: 'chest',
    back: 'back',
    shoulders: 'shoulders',
    glutes: 'glutes',
    legs: 'legs',
    core: 'core',
  }
  const labels = emphases.map(e => names[e])
  if (labels.length === 1) return labels[0]
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`
}
