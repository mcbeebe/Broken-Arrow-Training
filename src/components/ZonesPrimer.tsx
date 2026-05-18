import { useMemo } from 'react'
import type { TrainingPlan } from '../types'
import type { TrainingMethod, PaceZone } from '../types/training-method'
import type { OnboardingConfig } from '../hooks/useOnboarding'

interface Props {
  plan: TrainingPlan
  method?: TrainingMethod
  config: OnboardingConfig
  onContinue: () => void
  onRefineZones: () => void
}

/**
 * Shown once, right after the methodology primer is dismissed. Walks the
 * athlete through their personalized HR zones using the method's own zone
 * definitions (Fitzgerald's 80/20 names + ranges are different from
 * Daniels or Koop), with concrete bpm values + % of max so the numbers
 * are honest with the labels.
 *
 * Dismissal is persisted on `OnboardingConfig.zonesPrimerSeenAt`.
 */
export default function ZonesPrimer({ plan, method, config, onContinue, onRefineZones }: Props) {
  const maxHR = plan.athlete.maxHR
  const fa = config.fitnessAnchor

  const zones = useMemo(() => buildZoneRows(plan, method, maxHR), [plan, method, maxHR])
  const derivation = useMemo(() => buildDerivationLine(fa, maxHR), [fa, maxHR])

  const methodLabel = method?.name ?? 'your method'

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-slate-900 flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-8 pb-28">
        <p className="text-xs uppercase tracking-wide font-bold text-teal-700">Your heart rate zones</p>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white leading-tight mt-1">
          The numbers your plan trains to
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-300 mt-2">
          {methodLabel} defines five zones — each one targets a different physiological adaptation.
          Match the bpm and the workouts make sense.
        </p>

        <div className="mt-5 p-3 rounded-xl bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-800">
          <p className="text-xs text-teal-800 dark:text-teal-200 font-medium">How we got these</p>
          <p className="text-sm text-teal-900 dark:text-teal-100 mt-1">{derivation}</p>
        </div>

        <div className="mt-5 space-y-2.5">
          {zones.map(z => {
            const { key, ...rest } = z
            return <ZoneRow key={key} {...rest} />
          })}
        </div>

        <button
          onClick={onRefineZones}
          className="mt-5 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 text-left active:bg-slate-50"
        >
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Want tighter zones?</p>
          <p className="text-xs text-slate-500 dark:text-slate-300 mt-0.5">
            Enter your LTHR or a recent race time in Settings — it replaces the maxHR-based estimate
            with something measured.
          </p>
          <p className="text-xs font-semibold text-teal-700 dark:text-teal-300 mt-2">Open Settings →</p>
        </button>
      </div>

      <div className="fixed bottom-0 left-0 right-0 px-5 py-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-700">
        <button
          onClick={onContinue}
          className="w-full py-3.5 rounded-xl text-base font-semibold bg-teal-600 text-white active:bg-teal-700 transition"
        >
          Got it — show my plan
        </button>
      </div>
    </div>
  )
}

interface ZoneRowData {
  key: string
  label: string
  abbreviation?: string
  bpmLow?: number
  bpmHigh?: number
  pctLow?: number
  pctHigh?: number
  purpose: string
  rpeLow?: number
  rpeHigh?: number
}

function ZoneRow({ label, abbreviation, bpmLow, bpmHigh, pctLow, pctHigh, purpose, rpeLow, rpeHigh }: ZoneRowData) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-900 dark:text-white">
            {label}
            {abbreviation && (
              <span className="ml-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                {abbreviation}
              </span>
            )}
          </p>
        </div>
        {bpmLow != null && bpmHigh != null && (
          <p className="text-base font-semibold text-teal-700 dark:text-teal-300 whitespace-nowrap">
            {bpmLow}–{bpmHigh} bpm
          </p>
        )}
      </div>
      {(pctLow != null && pctHigh != null) || (rpeLow != null && rpeHigh != null) ? (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {pctLow != null && pctHigh != null && (
            <>{pctLow}–{pctHigh}% of max HR</>
          )}
          {pctLow != null && pctHigh != null && rpeLow != null && rpeHigh != null && <> · </>}
          {rpeLow != null && rpeHigh != null && (
            <>RPE {rpeLow}–{rpeHigh}</>
          )}
        </p>
      ) : null}
      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 leading-snug">{purpose}</p>
    </div>
  )
}

/**
 * Build one row per method zone using the user's resolved bpm bounds. We
 * intentionally pull from `method.paceZones` (not `plan.zones`) so the
 * primer shows EVERY zone the method defines — including ones like
 * "marathon_pace" or "critical_velocity" that don't fit the generic Z1–Z5
 * labels in Settings. Each zone's bpm range is resolved through the same
 * %LTHR → maxHR math the rest of the engine uses, so the numbers match
 * what users see on their workouts.
 */
function buildZoneRows(plan: TrainingPlan, method: TrainingMethod | undefined, maxHR: number): ZoneRowData[] {
  // When no method is available (e.g. Hyrox flow) fall back to the
  // generic 5-zone bands stored on the plan.
  if (!method) {
    return plan.zones.map((z, i) => {
      const [low, high] = parseRange(z.hr)
      return {
        key: `zone-${i}`,
        label: z.zone,
        bpmLow: low,
        bpmHigh: high,
        pctLow: low != null ? Math.round((low / maxHR) * 100) : undefined,
        pctHigh: high != null ? Math.round((high / maxHR) * 100) : undefined,
        purpose: z.desc,
      }
    })
  }

  // Method-defined zones: each has its own displayName, purpose, hrRange.
  // We resolve the bpm bounds using the same LTHR estimate the rest of the
  // engine uses (paceTargets → ESTIMATED_LTHR_PCT_OF_MAX or user LTHR).
  const lthrBpm = resolveLthrBpm(plan, maxHR)
  return method.paceZones.map((z, i) => paceZoneToRow(z, i, lthrBpm, maxHR))
}

function paceZoneToRow(z: PaceZone, i: number, lthrBpm: number, maxHR: number): ZoneRowData {
  const hr = z.hrRange
  const bpmLow = hr?.minPctLthr != null ? Math.round(hr.minPctLthr * lthrBpm) : undefined
  const bpmHigh = hr?.maxPctLthr != null ? Math.round(hr.maxPctLthr * lthrBpm) : undefined
  return {
    key: `zone-${i}-${z.canonical}`,
    label: z.displayName,
    abbreviation: z.abbreviation,
    bpmLow,
    bpmHigh,
    pctLow: bpmLow != null ? Math.round((bpmLow / maxHR) * 100) : undefined,
    pctHigh: bpmHigh != null ? Math.round((bpmHigh / maxHR) * 100) : undefined,
    purpose: z.purpose,
    rpeLow: z.rpeRange?.min,
    rpeHigh: z.rpeRange?.max,
  }
}

/**
 * Pull a representative LTHR bpm value out of the plan's resolved zones.
 * We grab the "easy" / Z2 row's high bpm and divide by the upper %LTHR
 * the method uses for that zone — typically 0.89. This avoids re-running
 * the pace resolver on the client. If it can't be inferred (very rare),
 * fall back to the 0.88×maxHR estimate.
 */
function resolveLthrBpm(plan: TrainingPlan, maxHR: number): number {
  // plan.zones[1] is conventionally Z2. Its `hr` is "low–high".
  const z2 = plan.zones[1]
  if (z2) {
    const [, high] = parseRange(z2.hr)
    // Fitzgerald 80/20 puts Z2 high at 0.89 LTHR; Koop / Pfitz are
    // similar (within 0.85–0.92). Solving for LTHR: LTHR = high / 0.89.
    if (high != null) return Math.round(high / 0.89)
  }
  return Math.round(maxHR * 0.88)
}

function parseRange(s: string): [number | undefined, number | undefined] {
  const m = s.match(/(\d+)\s*[–-]\s*(\d+)/)
  if (!m) return [undefined, undefined]
  return [parseInt(m[1], 10), parseInt(m[2], 10)]
}

function buildDerivationLine(fa: OnboardingConfig['fitnessAnchor'], maxHR: number): string {
  if (fa?.type === 'lthr' && fa.bpm) {
    return `Your LTHR is ${fa.bpm} bpm (you told us). We translate each method zone through that — these numbers are calibrated to you.`
  }
  if (fa?.type === 'race_5k' && fa.valueSeconds) {
    return `Derived from your recent 5K. We compute VDOT from the race time, then translate each method zone through pace + HR estimates calibrated to your performance.`
  }
  if (fa?.type === 'race_10k' || fa?.type === 'race_hm' || fa?.type === 'race_marathon') {
    return `Derived from your recent race time. We compute VDOT from your performance, then translate each method zone through pace + HR estimates calibrated to you.`
  }
  if (fa?.type === 'easy_pace' && fa.valueSeconds) {
    return `Derived from your self-reported easy pace. Zones are scaled around that anchor — rough but usable. Enter a race time or LTHR for tighter numbers.`
  }
  return `You gave us your max HR (${maxHR} bpm). We estimate your lactate threshold at 88% of that (${Math.round(maxHR * 0.88)} bpm), then translate each method zone through it. For tighter numbers, enter a recent race time or your LTHR.`
}
