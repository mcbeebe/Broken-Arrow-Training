import { useEffect, useRef, useState, type ReactNode } from 'react'

interface TutorialStep {
  emoji: string
  title: string
  blurb: ReactNode
  highlights: string[]
  accent: string
}

const STEPS: TutorialStep[] = [
  {
    emoji: '📅',
    title: 'Your Plan',
    accent: 'from-teal-500 to-emerald-500',
    blurb: (
      <>
        The <span className="font-semibold">Plan tab</span> is the home for your week-by-week schedule
        — every run, strength session, and rest day generated from your onboarding answers.
      </>
    ),
    highlights: [
      'Swipe between weeks at the top to see what\'s ahead.',
      'Tap any day to open its full workout detail and Coach take.',
      'Use the swap button to rearrange days when life gets in the way.',
    ],
  },
  {
    emoji: '⚡',
    title: 'Today\'s Workout',
    accent: 'from-amber-500 to-orange-500',
    blurb: (
      <>
        Tapping a day opens the <span className="font-semibold">workout detail</span>: the breakdown,
        target effort, and a coach take tailored to your readiness today.
      </>
    ),
    highlights: [
      'Expand the warm-up, main set, and cool-down for pace, HR, and form cues.',
      'Hit Log to record what you actually did — or sync from Garmin / Strava.',
      'Quality days show every interval with target zone and recovery.',
    ],
  },
  {
    emoji: '💬',
    title: 'Talk to Your Coach',
    accent: 'from-indigo-500 to-blue-500',
    blurb: (
      <>
        The <span className="font-semibold">Coach tab</span> is your conversation. Ask anything about
        a workout, training load, or how you\'re feeling — the coach has full context on your plan.
      </>
    ),
    highlights: [
      'Daily morning + evening check-ins keep training honest.',
      'Tap "Ask the Coach" from any day to start a thread about that workout.',
      'Customize tone and personality from the persona editor.',
    ],
  },
  {
    emoji: '📊',
    title: 'Stats & Readiness',
    accent: 'from-violet-500 to-purple-500',
    blurb: (
      <>
        The <span className="font-semibold">Stats tab</span> turns your data into signal: training
        load, fitness vs fatigue, weekly compliance, and projected race time.
      </>
    ),
    highlights: [
      'Daily readiness score blends sleep, HRV, RHR, and load.',
      'Watch CTL (fitness) climb and ATL (fatigue) ebb across the build.',
      'Compliance bars show how closely you hit each week\'s prescription.',
    ],
  },
  {
    emoji: '⚙️',
    title: 'Make It Yours',
    accent: 'from-slate-600 to-slate-700',
    blurb: (
      <>
        Visit <span className="font-semibold">Settings</span> to connect your watch, dial in zones,
        and adjust profile details whenever they change.
      </>
    ),
    highlights: [
      'Connect Garmin and Strava to auto-import every activity.',
      'Tune your HR zones once you have a fresh threshold test.',
      'Reset onboarding any time your race or schedule changes.',
    ],
  },
]

interface TutorialProps {
  onClose: () => void
  athleteName?: string
}

export default function Tutorial({ onClose, athleteName }: TutorialProps) {
  const [step, setStep] = useState(0)
  const total = STEPS.length
  const isLast = step === total - 1
  const touchStartX = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  function next() {
    if (isLast) {
      onClose()
    } else {
      setStep(s => Math.min(total - 1, s + 1))
    }
  }
  function prev() { setStep(s => Math.max(0, s - 1)) }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') prev()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  })

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  function onTouchStart(e: React.TouchEvent) { touchStartX.current = e.touches[0].clientX }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current == null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) < 40) return
    if (dx < 0) next(); else prev()
    touchStartX.current = null
  }

  const current = STEPS[step]

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[60] bg-white dark:bg-slate-900 flex flex-col"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome tour"
    >
      {/* Header — Skip + step counter */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <span className="text-sm text-slate-400 dark:text-slate-500 font-medium">
          {step + 1} of {total}
        </span>
        <button
          onClick={onClose}
          className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-medium px-2 py-1"
        >
          Skip
        </button>
      </div>

      {/* Hero panel + content */}
      <div className="flex-1 flex flex-col px-6 pb-4 overflow-y-auto">
        {step === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3 text-center">
            Welcome{athleteName ? `, ${athleteName}` : ''}! Here’s a quick tour.
          </p>
        )}

        <div
          className={`mx-auto w-32 h-32 rounded-3xl bg-gradient-to-br ${current.accent} flex items-center justify-center shadow-xl mb-6 mt-2`}
        >
          <span className="text-6xl" aria-hidden="true">{current.emoji}</span>
        </div>

        <h2 className="text-3xl font-bold text-slate-800 dark:text-white text-center leading-tight">
          {current.title}
        </h2>

        <p className="text-base text-slate-600 dark:text-slate-300 text-center leading-relaxed mt-3 max-w-md mx-auto">
          {current.blurb}
        </p>

        <ul className="mt-6 space-y-2.5 max-w-md mx-auto w-full">
          {current.highlights.map((h, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-slate-600 dark:text-slate-300 leading-snug">
              <span className="text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5">✓</span>
              <span>{h}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Footer — dot indicator + nav */}
      <div className="px-4 pt-3 pb-6 border-t border-slate-100 dark:border-slate-800 shrink-0 space-y-3">
        <div className="flex justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              aria-label={`Go to step ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === step
                  ? 'w-8 bg-teal-500'
                  : i < step
                    ? 'w-1.5 bg-teal-300 dark:bg-teal-700'
                    : 'w-1.5 bg-slate-200 dark:bg-slate-700'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            onClick={prev}
            disabled={step === 0}
            className={`px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
              step === 0
                ? 'text-transparent pointer-events-none'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            ← Back
          </button>
          <button
            onClick={next}
            className="flex-1 max-w-[200px] bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg py-3 px-4 shadow-sm transition-colors"
          >
            {isLast ? 'Start training' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
