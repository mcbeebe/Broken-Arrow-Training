import type { PlanAdvisory } from '../../types'
import type { LayerReport } from './layerSecondaryWork'

/**
 * D6 — say what actually happened to a layered race.
 *
 * The app told every athlete who picked "layer it into my build now" that
 * "1–2 station sessions a week are woven into your build", on the strength of
 * the REQUEST. The transform refuses outright on a Hyrox or general-fitness
 * anchor, and returns nothing at all when the runway holds no eligible week —
 * and in both cases the coach letter, the onboarding review screen and the
 * season panel went on describing sessions that were never written. An
 * athlete reading that has no way to discover the difference: the days they
 * were promised simply are not in the plan.
 *
 * These advisories are derived from the transform's own report, so they can
 * never drift from what it did. Nothing here is stored.
 */

/** Below this, layered work is a top-up rather than a build, and the advisory
 *  says so instead of letting a two-session "layer" read like preparation.
 *  There is no REFUSAL floor — a thin dose still ships (an athlete who asked
 *  for it and got two useful sessions is better served than one who got a
 *  silent nothing). */
export const LAYER_THIN_SESSIONS = 6

const ANCHOR_REASON: Record<string, string> = {
  hyrox: 'your main race is a Hyrox too, so its build already trains every station to full race spec and benchmarks your strength twice — there are no spare slots to lend, and layering over them would overwrite the rehearsals you need',
  general: 'your main plan is a general-fitness build, which is already strength-led — its sessions are the ones a layered block would have to replace',
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * @param reports  one per second-and-later race, in season order
 * @param anchorName  the athlete's main race, named in every "starts after" line
 * @param anchorRaceType  config.raceType — picks the refusal wording
 */
export function layeringAdvisories(
  reports: LayerReport[],
  anchorName: string,
  anchorRaceType?: string | null,
): PlanAdvisory[] {
  const out: PlanAdvisory[] = []
  for (const r of reports) {
    // The athlete never asked. Nothing to report, and nothing claims otherwise.
    if (r.refusal === 'not-requested') continue

    if (r.refusal === 'anchor-format') {
      out.push({
        id: `season_layer_refused_${r.raceName}`,
        severity: 'caution',
        title: `${r.raceName} prep was not layered in`,
        detail: `You asked for ${r.raceName}'s training to be woven into your current build, and it was not: ` +
          `${ANCHOR_REASON[anchorRaceType ?? ''] ?? 'your main race’s build has no ordinary strength or cross slots to lend'}. ` +
          `Your plan is unchanged.`,
        suggestion: `${r.raceName} still gets its own full block, starting after ${anchorName}.`,
      })
      continue
    }

    if (r.refusal === 'not-hyrox') {
      out.push({
        id: `season_layer_refused_${r.raceName}`,
        severity: 'info',
        title: `${r.raceName} prep starts after ${anchorName}`,
        detail: `Layering is defined for Hyrox races — a race-specific block of station and strength work that can ride inside a running build. ` +
          `${r.raceName} isn't one, and its running prep already transfers from the build you're doing, so nothing was added.`,
      })
      continue
    }

    if (r.refusal === 'no-eligible-weeks') {
      out.push({
        id: `season_layer_none_${r.raceName}`,
        severity: 'caution',
        title: `No week could carry ${r.raceName}'s layered work`,
        detail: `You asked for ${r.raceName}'s prep to be woven into your current build, and no week in the runway could take it — ` +
          `the weeks before ${anchorName} are taper, cutback or recovery weeks, the runway is too short, or their strength slots are already spoken for. ` +
          `Zero sessions were added. Nothing in your plan claims otherwise.`,
        suggestion: `${r.raceName} still gets its own full block, starting after ${anchorName}.`,
      })
      continue
    }

    // It happened. Name the actual number — "1–2 sessions a week" was a
    // description of the algorithm, not of the athlete's plan.
    const thin = r.sessions < LAYER_THIN_SESSIONS
    out.push({
      id: `season_layer_dose_${r.raceName}`,
      severity: thin ? 'caution' : 'info',
      title: `${plural(r.sessions, 'layered session')} for ${r.raceName}`,
      detail: `${plural(r.sessions, 'station/strength session')} across ${plural(r.weeks, 'week')} of your current build are ` +
        `${r.raceName}'s prep. Your running is untouched — these replace strength and cross-training slots you already had.` +
        (r.eased > 0
          ? ` ${r.eased} of them ${r.eased === 1 ? 'is' : 'are'} eased, because the only free slot that week sat beside a quality or long run.`
          : ''),
      suggestion: thin
        ? `That's a top-up, not a build — treat ${r.raceName}'s real preparation as its own block after ${anchorName}.`
        : `The rest of ${r.raceName}'s preparation comes in its own block after ${anchorName}.`,
    })
  }
  return out
}
