/**
 * The weekly narrative — the plain-English lines under the Summary charts.
 *
 * Pure and standalone: it builds strings out of metrics and the plan, so it
 * belongs outside the component, where it can also be asserted directly.
 */
import type { PerformanceMetrics, DailyTRIMP, TrainingWeek } from '../types'
import type { TrainingSignals } from './trainingSignals'
import { localDateStr } from './format'

/** The planned days that fall inside [fromIso, toIso], flattened out of the
 *  plan weeks with their real dates. Used to tell a planned rest day apart
 *  from a planned session nobody logged — the app used to call both "rest". */
function plannedDaysBetween(
  weeks: TrainingWeek[] | undefined,
  fromIso: string,
  toIso: string,
): { iso: string; isRest: boolean }[] {
  if (!weeks?.length) return []
  const out: { iso: string; isRest: boolean }[] = []
  for (const week of weeks) {
    if (!week.startIso) continue
    week.days.forEach((day, i) => {
      const d = new Date(`${week.startIso}T12:00:00`)
      d.setDate(d.getDate() + i)
      const iso = d.toISOString().slice(0, 10)
      if (iso < fromIso || iso > toIso) return
      out.push({ iso, isRest: day.type === 'rest' })
    })
  }
  return out
}

/** Exported for test: the honest-narrative rules are worth asserting directly. */
export function buildWeekNarrative(
  performance: PerformanceMetrics[],
  dailyTrimp: DailyTRIMP[],
  signals: TrainingSignals,
  weeks?: TrainingWeek[],
): string[] {
  const lines: string[] = []
  if (performance.length < 2) return lines

  const today = localDateStr()
  const sevenAgo = localDateStr(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))

  // Get performance 7 days ago vs now
  const weekAgo = performance.find(p => p.date === sevenAgo) || performance[Math.max(0, performance.length - 8)]
  const latest = performance[performance.length - 1]

  if (!weekAgo || !latest) return lines

  // Today's biometric / damage signals can contradict a "fresher" load
  // delta. When that happens we still report the direction (it's real
  // load math) but append a one-clause qualifier so the user doesn't
  // read "improving +14" as permission to push through a sleep-deficit
  // morning.
  const bodyRestrictive = signals.body.severity >= 2
  const damageRestrictive = signals.damage.severity >= 2
  const positiveQualifier = bodyRestrictive
    ? ` Body still says rest — bank the gain tomorrow.`
    : damageRestrictive
      ? ` Soreness still flagged — don't bank it on a heavy session yet.`
      : ''

  // CTL trend
  const ctlDelta = latest.ctl - weekAgo.ctl
  // Deliberately deferred: what pulled fitness down depends on whether the
  // week was genuinely lighter or simply unlogged, and we don't know that
  // until the open-day count below. `ctlLine` is pushed after it.
  const ctlDrop = Math.abs(ctlDelta).toFixed(0)
  if (ctlDelta >= 1) {
    lines.push(`📈 Fitness up ${ctlDrop} pts this week from consistent training.`)
  }

  // Find biggest workout in last 7 days
  const recentDays = dailyTrimp.filter(d => d.date >= sevenAgo && d.date <= today && d.total > 0)
  if (recentDays.length > 0) {
    const biggest = recentDays.reduce((a, b) => a.total > b.total ? a : b)
    const topRecord = biggest.records[0]
    const dayName = new Date(biggest.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })
    const sportLabel = topRecord ? topRecord.sportType.replace(/_/g, ' ') : 'workout'
    lines.push(
      `💪 Biggest load: ${dayName} ${sportLabel} (${Math.round(biggest.total)} adjusted TRIMP).`
    )
  }

  // ATL vs CTL relationship
  if (latest.atl > latest.ctl * 1.3) {
    lines.push(`⚡ Recent training intensity exceeds your base — fatigue is building faster than fitness. Normal in build weeks.`)
  } else if (latest.atl < latest.ctl * 0.7) {
    const baseLine = `🔋 Recovery mode — recent load is well below your fitness base. Good time for a quality session.`
    lines.push(bodyRestrictive || damageRestrictive
      ? `${baseLine}${positiveQualifier}`
      : baseLine)
  }

  // Days with no recorded load split two ways, and the difference matters:
  // a day the plan called REST is recovery, a day the plan called a session
  // is an OPEN day. Counting both as rest let the app tell an athlete who
  // missed three sessions that recovery was pulling their fatigue down.
  const trainedDates = new Set(recentDays.map(d => d.date))
  const plannedInWindow = plannedDaysBetween(weeks, sevenAgo, today)
  let restedAsPlanned = 0
  let open = 0
  for (const day of plannedInWindow) {
    if (trainedDates.has(day.iso)) continue
    if (day.isRest) restedAsPlanned += 1
    else open += 1
  }
  // With no plan to compare against (legacy plans have no startIso), we
  // genuinely cannot tell a rest day from a skipped one — so we say the
  // neutral thing rather than guessing in the flattering direction.
  const knowThePlan = plannedInWindow.length > 0
  const untrained = Math.max(0, 7 - recentDays.length)

  if (ctlDelta <= -1) {
    lines.push(open > 0
      ? `📉 Fitness down ${ctlDrop} pts — ${open === 1 ? 'a planned session' : `${open} planned sessions`} went unlogged.`
      : `📉 Fitness down ${ctlDrop} pts — a lighter week pulled it down.`)
  }
  if (open > 0) {
    lines.push(open === 1
      ? `⭕ 1 planned session is still open this week.`
      : `⭕ ${open} planned sessions are still open this week.`)
  }
  if (knowThePlan) {
    // We know which days the plan called rest, so we can say what rest did.
    if (restedAsPlanned >= 3 && open === 0) {
      lines.push(`😴 ${restedAsPlanned} rest days this week — recovery is pulling fatigue down.`)
    } else if (restedAsPlanned >= 3) {
      lines.push(`😴 ${restedAsPlanned} rest days this week.`)
    } else if (restedAsPlanned === 0 && open === 0) {
      lines.push(`🔥 No rest days this week — consider scheduling recovery.`)
    }
  } else if (untrained >= 3) {
    // Count only. No claim about what those days did for the athlete.
    lines.push(`😴 ${untrained} days without a recorded session this week.`)
  }

  // Recovery Balance direction
  const tsbDelta = latest.tsb - weekAgo.tsb
  if (Math.abs(tsbDelta) >= 3) {
    if (tsbDelta > 0) {
      lines.push(
        `🌱 Recovery Balance improving (+${Math.abs(tsbDelta).toFixed(0)}) — you're getting fresher.${positiveQualifier}`
      )
    } else {
      lines.push(
        `⬇️ Recovery Balance dropped (${tsbDelta.toFixed(0)}) — fatigue accumulating from training load.`
      )
    }
  }

  return lines
}

