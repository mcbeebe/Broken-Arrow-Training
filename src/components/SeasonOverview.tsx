import { useMemo } from 'react'
import type { TrainingPlan, Season, HRZone } from '../types'
import type { TrainingMethod } from '../types/training-method'
import type { OnboardingConfig } from '../hooks/useOnboarding'
import { buildSeasonStructure, type SeasonBlock } from '../utils/seasonStructure'
import Methodology from './Methodology'

interface Props {
  plan: TrainingPlan
  season?: Season | null
  method?: TrainingMethod
  config?: OnboardingConfig
  zones?: HRZone[]
}

const BLOCK_ACCENT: Record<SeasonBlock['id'], string> = {
  base: 'border-l-sky-400',
  build: 'border-l-emerald-400',
  peak: 'border-l-amber-400',
  taper: 'border-l-violet-400',
  race: 'border-l-rose-400',
}

/**
 * The season deep-dive: the whole plan explained as a shape, not a list of
 * days. Answers "what is this season, what is each block for, and where am
 * I in it" — the questions the post-onboarding coach letter answers once
 * and then nothing answers again.
 *
 * Lives as a sub-view of the Plan tab (the bottom bar is deliberately
 * capped at five). The philosophy deep-dive below it is the existing
 * Methodology component, which until now was reachable only by digging
 * through Settings.
 */
export default function SeasonOverview({ plan, season, method, config, zones }: Props) {
  const s = useMemo(() => buildSeasonStructure(plan, { season }), [plan, season])

  return (
    <div className="px-3 py-4 space-y-4 pb-8">
      {/* Where you are right now */}
      <div className="rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 p-4 text-white">
        <p className="text-xs uppercase tracking-wide text-slate-400">Your season</p>
        <p className="text-xl font-bold mt-0.5">{s.raceName}</p>
        {s.position && (
          <>
            <p className="text-sm text-slate-300 mt-2">
              Week {s.position.weekNum} of {s.position.totalWeeks} · {s.blocks.find(b => b.isCurrent)?.label ?? '—'} block
              {s.position.daysToRace !== null && s.position.daysToRace >= 0 && (
                <> · {s.position.daysToRace} {s.position.daysToRace === 1 ? 'day' : 'days'} out</>
              )}
            </p>
            <div className="mt-2.5 h-1.5 w-full rounded-full bg-slate-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-400"
                style={{ width: `${Math.round(Math.min(1, s.position.progress) * 100)}%` }}
              />
            </div>
          </>
        )}
        <p className="text-sm text-slate-300 mt-3 leading-relaxed">
          {s.totalMiles > 0 ? (
            <>The whole plan asks for about <strong className="text-white">{s.totalMiles} miles</strong> across{' '}
              {s.blocks.reduce((n, b) => n + (b.weekTo - b.weekFrom + 1), 0)} weeks, peaking at{' '}
              <strong className="text-white">{s.peakWeekMiles} mi</strong> in week {s.peakWeekNum}. Every block below has a
              different job — the plan is not "the same week, but harder".</>
          ) : (
            <>Every block below has a different job — the plan is not "the same week, but harder".</>
          )}
        </p>
      </div>

      {/* Races in the chain (multi-race seasons only) */}
      {s.races.length > 1 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3.5">
          <p className="text-sm font-bold text-slate-800 dark:text-white">Races this season</p>
          <ul className="mt-2 space-y-1.5">
            {s.races.map(r => (
              <li key={`${r.name}-${r.dateIso}`} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-slate-700 dark:text-slate-200">
                  {r.isPrimary && <span aria-hidden className="mr-1">★</span>}
                  {r.name}
                  {r.priority && <span className="text-xs text-slate-500 dark:text-slate-400"> · {r.priority} race</span>}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">
                  {new Date(`${r.dateIso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2.5 leading-relaxed">
            The ★ race is the one the season is built to peak for. The others bank fitness and race practice on the way.
          </p>
        </div>
      )}

      {/* The blocks */}
      <div className="space-y-2.5">
        {s.blocks.map(b => (
          <div
            key={`${b.id}-${b.weekFrom}`}
            className={`rounded-xl border border-slate-200 dark:border-slate-700 border-l-4 ${BLOCK_ACCENT[b.id]} p-3.5 ${
              b.isCurrent ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : ''
            }`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-bold text-slate-800 dark:text-white">
                {b.label}
                {b.isCurrent && (
                  <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                    You are here
                  </span>
                )}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 shrink-0">
                {b.weekFrom === b.weekTo ? `Week ${b.weekFrom}` : `Weeks ${b.weekFrom}–${b.weekTo}`}
              </p>
            </div>

            {(b.dateRange || b.volumeRange) && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {[b.dateRange, b.volumeRange && `${b.volumeRange}/wk`].filter(Boolean).join(' · ')}
              </p>
            )}

            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed mt-2">{b.job}</p>

            {b.keySessions.length > 0 && (
              <div className="mt-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Sessions that carry it
                </p>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {b.keySessions.map(k => (
                    <li
                      key={k}
                      className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                    >
                      {k}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Why the plan is built this way at all */}
      <details className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <summary className="px-3.5 py-3 text-sm font-bold text-slate-800 dark:text-white cursor-pointer">
          Why it's built this way
        </summary>
        <div className="border-t border-slate-200 dark:border-slate-700">
          <Methodology plan={plan} method={method} onboardingConfig={config} zones={zones} />
        </div>
      </details>
    </div>
  )
}
