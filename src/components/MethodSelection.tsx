import { useMemo, useState } from 'react'
import type { OnboardingConfig } from '../hooks/useOnboarding'
import type { TrainingMethod } from '../types/training-method'
import { ALL_METHODS } from '../data/methods'
import {
  inputsFromOnboarding,
  selectMethods,
  type MethodSelection as MethodPick,
} from '../engines/planGenerator/methodSelection'

interface Props {
  config: OnboardingConfig
  onConfirm: (methodId: string) => void
  onBack?: () => void
  /** Override for tests. Defaults to the full 8-method library. */
  methods?: readonly TrainingMethod[]
}

/**
 * Top-3 method recommendation screen — shown between Onboarding (trail/road
 * flow only) and plan generation. The user reviews three method picks with
 * rationale + any heads-up warnings, then confirms one.
 *
 * Hyrox / General Fitness skip this screen entirely (the caller decides not
 * to render it). If the screen is rendered without a raceDistance, it
 * falls back to a guidance message rather than crashing.
 */
export default function MethodSelection({ config, onConfirm, onBack, methods = ALL_METHODS }: Props) {
  const picks = useMemo<MethodPick[]>(() => {
    const inputs = inputsFromOnboarding(config)
    return inputs ? selectMethods(methods, inputs) : []
  }, [config, methods])

  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (picks.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        <Header onBack={onBack} progress={1} />
        <div className="flex-1 overflow-y-auto px-5 pt-4 pb-24">
          <h1 className="text-2xl font-bold text-slate-900">No race distance set</h1>
          <p className="text-sm text-slate-500 mt-2">
            We need a race distance to pick a training method. Head back and finish onboarding.
          </p>
        </div>
      </div>
    )
  }

  const canContinue = selectedId !== null

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <Header onBack={onBack} progress={1} />

      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-28">
        <h1 className="text-2xl font-bold text-slate-900 leading-tight">Pick your training method</h1>
        <p className="text-sm text-slate-500 mt-1 mb-5">
          Based on your race and experience, here are the three philosophies that fit best.
        </p>

        <div className="space-y-3 mt-4">
          {picks.map((pick, idx) => (
            <MethodCard
              key={pick.methodId}
              pick={pick}
              rank={idx + 1}
              selected={selectedId === pick.methodId}
              onSelect={() => setSelectedId(pick.methodId)}
            />
          ))}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 px-5 py-4 bg-white border-t border-slate-100">
        <button
          onClick={() => selectedId && onConfirm(selectedId)}
          disabled={!canContinue}
          className={`w-full py-3.5 rounded-xl text-base font-semibold transition ${
            canContinue
              ? 'bg-teal-600 text-white active:bg-teal-700'
              : 'bg-slate-200 text-slate-400'
          }`}
        >
          Use this method
        </button>
      </div>
    </div>
  )
}

function Header({ onBack, progress }: { onBack?: () => void; progress: number }) {
  return (
    <div className="flex items-center justify-between px-4 pt-4 pb-2">
      <button
        onClick={onBack}
        disabled={!onBack}
        className={`w-8 h-8 flex items-center justify-center ${onBack ? 'text-slate-600' : 'text-transparent'}`}
        aria-label="Back"
      >
        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 4L7 10l8 6" /></svg>
      </button>
      <div className="flex-1 mx-4 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div className="h-full bg-teal-500 rounded-full transition-all duration-300" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="w-8" />
    </div>
  )
}

function MethodCard({
  pick,
  rank,
  selected,
  onSelect,
}: {
  pick: MethodPick
  rank: number
  selected: boolean
  onSelect: () => void
}) {
  const m = pick.method
  const [expanded, setExpanded] = useState(false)
  return (
    <div
      className={`rounded-xl border-2 transition ${
        selected ? 'border-teal-500 bg-teal-50' : 'border-slate-200 bg-slate-50'
      }`}
    >
      <button
        onClick={onSelect}
        aria-pressed={selected}
        className="w-full text-left p-4"
      >
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold uppercase tracking-wide ${selected ? 'text-teal-700' : 'text-slate-500'}`}>
                {rank === 1 ? 'Top pick' : `#${rank}`}
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-500">{m.coach}</span>
            </div>
            <p className={`font-semibold mt-1 ${selected ? 'text-teal-900' : 'text-slate-900'}`}>{m.name}</p>

            <ul className="mt-2 space-y-1">
              {pick.rationale.map((line, i) => (
                <li
                  key={i}
                  className={`text-sm leading-snug ${
                    line.startsWith('Heads-up')
                      ? 'text-amber-700'
                      : line.startsWith('Why we picked it')
                      ? 'text-slate-700'
                      : 'text-slate-600'
                  }`}
                >
                  {line}
                </li>
              ))}
            </ul>

            {pick.warnings.length > 0 && (
              <div className="mt-2 p-2 rounded-lg bg-amber-50 border border-amber-200">
                {pick.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-800 leading-snug">
                    {w}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div
            className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center shrink-0 ${
              selected ? 'border-teal-500 bg-teal-500' : 'border-slate-300'
            }`}
          >
            {selected && (
              <svg width="12" height="12" fill="white" viewBox="0 0 20 20">
                <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
              </svg>
            )}
          </div>
        </div>
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setExpanded(v => !v)
        }}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between px-4 py-2 text-xs font-medium text-teal-700 border-t border-slate-200/70 hover:bg-white/40 transition"
      >
        <span>{expanded ? `Hide details` : `How ${m.name.split(/[ —]/)[0]} works`}</span>
        <span aria-hidden>{expanded ? '▴' : '▾'}</span>
      </button>

      {expanded && <MethodDetails method={m} />}
    </div>
  )
}

function MethodDetails({ method }: { method: TrainingMethod }) {
  return (
    <div className="px-4 pb-4 pt-1 space-y-3 text-sm text-slate-700 border-t border-slate-200/70">
      <p className="text-xs uppercase tracking-wide font-bold text-slate-500">Signature</p>
      <p className="text-sm leading-snug">{method.signature}</p>

      <p className="text-xs uppercase tracking-wide font-bold text-slate-500">Philosophy</p>
      <p className="text-sm leading-snug text-slate-700">{method.philosophyNarrative}</p>

      {method.phases.length > 0 && (
        <>
          <p className="text-xs uppercase tracking-wide font-bold text-slate-500">Phases</p>
          <ul className="space-y-1.5">
            {method.phases.map(ph => (
              <li key={ph.id} className="text-sm leading-snug">
                <span className="font-semibold text-slate-800">{ph.name}.</span>{' '}
                <span className="text-slate-600">{ph.focus}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="text-xs text-slate-500 italic">
        Reference: {method.keyBook}
        {method.yearOfOrigin ? ` (${method.yearOfOrigin})` : ''}
      </p>
    </div>
  )
}
