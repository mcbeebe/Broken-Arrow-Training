/**
 * Injury-aware ramp messaging — pure helpers, no React/IO.
 *
 * The plan generator already ramps a returning/injured athlete gently
 * (see `injuryPolicyFor` in engines/planGenerator/generatePlan.ts). These
 * helpers surface that adaptiveness in the UI: a workout-card note that tells
 * the athlete where they are in the build, and a one-line summary the coach
 * can greet them with. `INJURY_LEADIN_WEEKS` is the single source of truth for
 * how many leading weeks stay easy — the generator imports it too so the
 * message never drifts from the actual plan.
 */
import type { InjuryStatus, OnboardingConfig } from '../hooks/useOnboarding'
import type { CoachDayNote } from './coachNotes'

/** Number of leading weeks where intensity is held easy after injury. */
export const INJURY_LEADIN_WEEKS: Record<InjuryStatus, number> = {
  none: 0,
  returning: 2,
  current: 4,
}

// A couple of weeks past the lead-in we keep a softer "intensity coming back"
// note, then go quiet so we're not nagging an athlete who's clearly fine.
const POST_LEADIN_TAPER_WEEKS = 2

const RUNNING_TYPES = new Set(['run', 'long', 'quality', 'limited'])

/**
 * Decide whether a workout card should carry an injury-ramp note, and what it
 * should say. Returns null when there's nothing useful to add (healthy
 * athlete, rest day, completed workout, or well past the ramp).
 *
 * `eased` is the generator's own stamp (`PlannedDay.leadInEased`) saying it
 * actually downgraded this day. During the lead-in the "intensity stays
 * easy" claim renders ONLY on days that were genuinely eased or were never
 * hard to begin with — a day the generator failed to ease (a pinned VO2
 * workout, in the field report) must not carry a note contradicting its
 * own body. Pass `undefined` from plans that predate the stamp.
 */
export function injuryRampNote(
  status: InjuryStatus | undefined,
  weekNum: number | undefined,
  dayType: string,
  completed?: boolean,
  eased?: boolean,
): CoachDayNote | null {
  if (!status || status === 'none') return null
  if (completed) return null
  if (!RUNNING_TYPES.has(dayType)) return null
  if (weekNum == null || weekNum < 1) return null

  const leadIn = INJURY_LEADIN_WEEKS[status]

  if (weekNum <= leadIn) {
    // A quality-typed day the generator did NOT ease can't honestly claim
    // "intensity stays easy" — stay silent rather than contradict the
    // workout the athlete is looking at.
    if (dayType === 'quality' && eased !== true) return null
    if (status === 'current') {
      return {
        text: `Recovery-first plan · Week ${weekNum} of ${leadIn}: easy aerobic and cross-training only while you heal — no hard intensity yet. Volume stays conservative and builds slowly. Flag any pain to your coach.`,
        tone: 'flag',
      }
    }
    return {
      text: `Coming back from injury · Week ${weekNum} of ${leadIn}: intensity stays easy and volume climbs gently while the tissue re-adapts. We add the harder work from Week ${leadIn + 1}.`,
      tone: 'heads_up',
    }
  }

  if (weekNum <= leadIn + POST_LEADIN_TAPER_WEEKS) {
    return {
      text: `Past the gentle ramp — intensity is phasing back in now that you've banked ${leadIn} easy weeks. Keep listening to the body and tell your coach about any niggles.`,
      tone: 'info',
    }
  }

  return null
}

const AREA_LABELS: Record<string, string> = {
  knee: 'knee',
  achilles_calf: 'Achilles/calf',
  hamstring: 'hamstring',
  hip: 'hip',
  foot: 'foot',
  shin: 'shin',
  it_band: 'IT band',
  back: 'back',
  other: '',
}

/**
 * One-line, human summary of the athlete's injury context for the coach's
 * greeting and the LLM snapshot. Returns null when there's nothing to say.
 */
export function injurySummaryLine(
  config: Pick<
    OnboardingConfig,
    'injuryStatus' | 'injuryArea' | 'injuryTimeframe' | 'injuryNote'
  > | null | undefined,
): string | null {
  if (!config) return null
  const { injuryStatus, injuryArea, injuryTimeframe, injuryNote } = config
  if (!injuryStatus || injuryStatus === 'none') return null

  const area = injuryArea ? (AREA_LABELS[injuryArea] ?? injuryArea) : ''
  const lead = injuryStatus === 'returning'
    ? `coming back from ${area ? `a ${area} ` : 'an '}injury`
    : `currently managing ${area ? `a ${area} ` : 'an '}injury`

  const parts = [lead]
  if (injuryTimeframe) parts.push(injuryTimeframe.toLowerCase())
  if (injuryNote && injuryNote.trim()) parts.push(injuryNote.trim())
  return parts.join(' · ')
}
