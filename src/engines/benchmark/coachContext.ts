import type { CoachBenchmarkContext } from '../../types'
import { BENCHMARK_KINDS, groupBySeries, isStale, ageWeeks, kindsForPlan, type Benchmark, type PlanKind } from './log'
import { formatBenchmarkValue } from './preview'

/**
 * The benchmark log as the coach should see it. The newest of each series
 * with its age and retest status, and the preset kinds this plan accepts —
 * enough to record a reported result as the right kind, dedup it against
 * what is already there ("that's your third 5K; last was 21:52"), and
 * compare honestly. Null when nothing has been measured.
 */
export function buildCoachBenchmarkContext(
  live: readonly Benchmark[],
  plan: PlanKind,
  todayIso: string,
): CoachBenchmarkContext | null {
  const series = groupBySeries(live, plan)
  if (series.length === 0) return null
  return {
    current: series.map(s => {
      const cur = s.entries[0]
      return {
        kind: s.kind,
        label: s.label,
        value: formatBenchmarkValue(cur),
        dateIso: cur.dateIso,
        weeksOld: ageWeeks(cur, todayIso),
        stale: isStale(cur, todayIso),
        ...(cur.protocol ? { protocol: cur.protocol } : {}),
        entries: s.entries.length,
      }
    }),
    kinds: kindsForPlan(plan).map(k => ({ kind: k, label: BENCHMARK_KINDS[k].label, unit: BENCHMARK_KINDS[k].unit })),
  }
}
