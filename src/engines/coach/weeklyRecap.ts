/**
 * The Sunday recap — a week, told back to the athlete.
 *
 * Deterministic and grounded: every number here comes from the compliance
 * layer (planned vs actual, per day), never from a model. The coach's LLM
 * voice is layered ON TOP of this by the recap surface; when the API is
 * unavailable the text built here ships as-is, so an athlete who trained
 * all week always gets their week acknowledged.
 *
 * Design rule: name what happened before judging it, and never scold. A
 * missed week is information, not a moral failure — the plan already has
 * a mechanism for it (Rule 3 regeneration), and the recap points at that
 * instead of at the athlete.
 */
import type { TrainingWeek, PerformanceMetrics, RaceInfo } from '../../types'
import type { WeekCompliance } from '../../hooks/useCompliance'
import { raceDateToIso } from '../season'

export interface WeeklyRecapInput {
  week: TrainingWeek
  compliance: WeekCompliance
  /** Earlier weeks' compliance, oldest first — powers streaks and trends. */
  history?: WeekCompliance[]
  perf?: PerformanceMetrics | null
  priorPerf?: PerformanceMetrics | null
  race?: RaceInfo | null
  weekNum: number
  totalWeeks: number
  athleteName?: string
  todayIso?: string
}

export interface RecapStat {
  label: string
  value: string
  /** Secondary line, e.g. "of 32 planned". */
  sub?: string
}

export interface WeeklyRecap {
  title: string
  headline: string
  stats: RecapStat[]
  paragraphs: string[]
  /** Present when two consecutive weeks fell below 70% — the same signal
   *  that offers a plan regeneration in the plan view. */
  suggestion?: string
  /** Compact digest handed to the LLM surface as grounding. */
  digest: string
}

const pct = (n: number) => `${Math.round(n * 100)}%`
const mi = (n: number) => (Math.round(n * 10) / 10).toString()

function completionRatio(c: WeekCompliance): number {
  if (c.plannedMiles > 0) return c.actualMiles / c.plannedMiles
  if (c.totalWorkouts > 0) return c.completed / c.totalWorkouts
  return 0
}

/** The one-line verdict. Tone tracks the week, not the athlete. */
function headlineFor(ratio: number, c: WeekCompliance, streak: number): string {
  if (c.totalWorkouts === 0) return 'A quiet week — nothing was on the calendar.'
  if (ratio >= 1.15) return 'You went past the plan this week. Noted — and worth watching.'
  if (ratio >= 0.95) {
    return streak >= 3
      ? `${streak} weeks in a row on plan. This is the part that actually compounds.`
      : 'Week delivered. Every session that mattered, done.'
  }
  if (ratio >= 0.8) return 'Solid week — the important work landed.'
  if (ratio >= 0.5) return 'A partial week. The bones of it are still there.'
  if (ratio > 0) return 'Not much of a training week — and that happens.'
  return 'Nothing logged this week.'
}

/** Consecutive weeks (ending at the most recent) at or above 95%. */
function onPlanStreak(history: WeekCompliance[], current: WeekCompliance): number {
  let streak = completionRatio(current) >= 0.95 ? 1 : 0
  if (streak === 0) return 0
  for (let i = history.length - 1; i >= 0; i--) {
    if (completionRatio(history[i]) >= 0.95) streak += 1
    else break
  }
  return streak
}

function statsFor(c: WeekCompliance, week: TrainingWeek): RecapStat[] {
  const stats: RecapStat[] = []

  stats.push({
    label: 'Miles',
    value: mi(c.actualMiles),
    sub: c.plannedMiles > 0 ? `of ${mi(c.plannedMiles)} planned` : undefined,
  })

  stats.push({
    label: 'Sessions',
    value: `${c.completed}`,
    sub: c.totalWorkouts > 0 ? `of ${c.totalWorkouts}` : undefined,
  })

  if (c.actualDuration > 0) {
    const h = Math.floor(c.actualDuration / 60)
    const m = Math.round(c.actualDuration % 60)
    stats.push({ label: 'Time', value: h > 0 ? `${h}h ${m}m` : `${m}m`, sub: 'moving' })
  }

  if (c.actualElevation > 0) {
    stats.push({ label: 'Climbing', value: `${Math.round(c.actualElevation).toLocaleString()} ft` })
  }

  if (c.hrCheckedWorkouts > 0) {
    stats.push({
      label: 'In zone',
      value: `${Math.round(c.hrCompliance)}%`,
      sub: `across ${c.hrCheckedWorkouts} ${c.hrCheckedWorkouts === 1 ? 'session' : 'sessions'}`,
    })
  }

  const longest = week.days
    .map(d => d.actual?.distance ?? 0)
    .reduce((a, b) => Math.max(a, b), 0)
  if (longest > 0) stats.push({ label: 'Longest', value: `${mi(longest)} mi` })

  return stats
}

function bodyFor(input: WeeklyRecapInput, ratio: number, streak: number): string[] {
  const { compliance: c, week, perf, priorPerf, weekNum, totalWeeks, race, todayIso } = input
  const out: string[] = []

  // 1. What the week was supposed to be.
  const focus = (week.focus ?? '').replace(/\s*·\s*replanned\s*$/i, '').trim()
  if (focus) {
    out.push(`Week ${weekNum} was ${focus.replace(/\.$/, '').toLowerCase()}${
      /·\s*replanned/i.test(week.focus ?? '') ? ' — and it was replanned partway through, so its original target no longer applied' : ''
    }.`)
  }

  // 2. What actually happened, in numbers, without spin.
  if (c.totalWorkouts > 0) {
    const missedClause = c.missed > 0
      ? ` ${c.missed} ${c.missed === 1 ? 'session' : 'sessions'} went unlogged.`
      : ''
    out.push(
      c.plannedMiles > 0
        ? `You covered ${mi(c.actualMiles)} of ${mi(c.plannedMiles)} planned miles — ${pct(ratio)} of the week.${missedClause}`
        : `You logged ${c.completed} of ${c.totalWorkouts} sessions.${missedClause}`,
    )
  }

  // 3. Quality of execution, where there's evidence for it.
  if (c.hrCheckedWorkouts >= 2) {
    const inZone = Math.round(c.hrCompliance)
    out.push(inZone >= 75
      ? `Your easy work stayed easy — ${inZone}% time in the prescribed zones. That discipline is what lets the hard days be hard.`
      : inZone >= 50
        ? `${inZone}% of your time landed in the prescribed zones. The usual culprit is easy days creeping up; the cost shows up two weeks later, not today.`
        : `Only ${inZone}% of your measured time was in the prescribed zones. Worth a look at whether the easy days are actually easy.`)
  }

  if (c.flaggedCount > 0) {
    out.push(`${c.flaggedCount} ${c.flaggedCount === 1 ? 'session' : 'sessions'} missed target by a wide margin — not a problem on its own, but a pattern worth watching.`)
  }

  // 4. Fitness direction, when the load model has something to say.
  if (perf && priorPerf) {
    const dCtl = perf.ctl - priorPerf.ctl
    if (Math.abs(dCtl) >= 1) {
      out.push(dCtl > 0
        ? `Fitness is up ${Math.abs(dCtl).toFixed(0)} points on the week. That's consistency converting, nothing more exotic.`
        : `Fitness dipped ${Math.abs(dCtl).toFixed(0)} points. Expected in a lighter week; worth attention if it keeps sliding.`)
    }
    if (perf.tsb < -20) {
      out.push('Recovery balance is deep in the red — you\'re carrying real fatigue into next week. Protect the easy days.')
    }
  }

  // 5. Where this sits, and what's next.
  const left = Math.max(0, totalWeeks - weekNum)
  const raceIso = race ? raceDateToIso(race.date) : null
  const out5 = raceIso && todayIso
    ? Math.max(0, Math.round((Date.parse(`${raceIso}T12:00:00`) - Date.parse(`${todayIso}T12:00:00`)) / 86_400_000))
    : null
  out.push(
    left === 0
      ? `That was the last full week. ${race?.name ?? 'Race day'} is what's left.`
      : `${left} ${left === 1 ? 'week' : 'weeks'} of the plan to go${out5 !== null ? `, ${out5} days to ${race?.name ?? 'race day'}` : ''}. ${
          streak >= 3
            ? 'Keep doing exactly this.'
            : ratio >= 0.8
              ? 'Next week builds on this one.'
              : 'Next week starts clean — nothing to make up.'
        }`,
  )

  return out
}

export function buildWeeklyRecap(input: WeeklyRecapInput): WeeklyRecap {
  const { compliance: c, week, weekNum, history = [] } = input
  const ratio = completionRatio(c)
  const streak = onPlanStreak(history, c)

  const recentTwo = [...history.slice(-1), c].map(completionRatio)
  const suggestion = recentTwo.length === 2 && recentTwo.every(r => r < 0.7)
    ? 'Two short weeks in a row. That usually means the plan no longer matches the life around it — rebuilding the remainder from where you actually are beats chasing a target that has moved.'
    : undefined

  const stats = statsFor(c, week)
  const paragraphs = bodyFor(input, ratio, streak)

  return {
    title: `Week ${weekNum} recap`,
    headline: headlineFor(ratio, c, streak),
    stats,
    paragraphs,
    suggestion,
    digest: [
      `Week ${weekNum} of ${input.totalWeeks}${week.focus ? ` (${week.focus})` : ''}`,
      `Completed ${c.completed}/${c.totalWorkouts} sessions, ${mi(c.actualMiles)}/${mi(c.plannedMiles)} mi (${pct(ratio)})`,
      c.hrCheckedWorkouts > 0 ? `Time in zone ${Math.round(c.hrCompliance)}% over ${c.hrCheckedWorkouts} sessions` : '',
      c.actualElevation > 0 ? `${Math.round(c.actualElevation)} ft climbed` : '',
      c.flaggedCount > 0 ? `${c.flaggedCount} sessions well off target` : '',
      streak >= 2 ? `${streak}-week on-plan streak` : '',
      suggestion ? 'Two consecutive weeks under 70% — regeneration is on the table' : '',
    ].filter(Boolean).join('. ') + '.',
  }
}

/** The plain-text form archived to the coach conversation. */
export function recapToMarkdown(r: WeeklyRecap): string {
  const statLine = r.stats.map(s => `${s.label} ${s.value}${s.sub ? ` (${s.sub})` : ''}`).join(' · ')
  return [
    `**${r.title}** — ${r.headline}`,
    statLine,
    ...r.paragraphs,
    r.suggestion ? `_${r.suggestion}_` : '',
  ].filter(Boolean).join('\n\n')
}
