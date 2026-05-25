import { useEffect } from 'react'

interface Props {
  onContinue: () => void
  athleteName?: string
}

const CARDS: { icon: string; title: string; body: string }[] = [
  {
    icon: '⌚',
    title: 'Connect your wearable',
    body: 'Sync HR, sleep, HRV, and recovery so the app scores your readiness and adapts the plan to how you actually feel — not just the calendar.',
  },
  {
    icon: '💬',
    title: 'Talk to your coach',
    body: 'Ask anything — swap a workout, explain a zone, gut-check a niggle. Your coach knows your plan, your data, and your history, and answers in plain language.',
  },
  {
    icon: '🎛',
    title: 'Make it yours',
    body: 'Name your coach and pick its personality. Dial how much data and jargon you see. The more you tune it, the more it feels like training with someone who gets you.',
  },
]

/**
 * Post-onboarding value-prop screen — shown once after the athlete creates
 * their plan and before the "connect your devices" step. Sells why the app is
 * powerful: a wearable, a coach you talk to, and a setup you customize.
 */
export default function OnboardingValueProps({ onContinue, athleteName }: Props) {
  // Match the onboarding overlay's iOS scroll-reset behavior so the fixed
  // overlay paints in the visible viewport rather than wherever the previous
  // screen left the document scrolled.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const active = document.activeElement as HTMLElement | null
      if (active && typeof active.blur === 'function') active.blur()
    }
    if (typeof window !== 'undefined') window.scrollTo(0, 0)
  }, [])

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-slate-900 flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-10 pb-28">
        <p className="text-xs uppercase tracking-wide font-bold text-teal-700">
          {athleteName ? `You're in, ${athleteName}` : "You're in"}
        </p>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white leading-tight mt-1">
          Here's what makes it powerful
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-300 mt-2">
          A plan is just the start. Three things turn this into a coach that
          adapts to you:
        </p>

        <div className="mt-6 space-y-3">
          {CARDS.map(card => (
            <div
              key={card.title}
              className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4 flex gap-3"
            >
              <span className="text-3xl leading-none shrink-0" aria-hidden>{card.icon}</span>
              <div>
                <p className="font-semibold text-slate-800 dark:text-white">{card.title}</p>
                <p className="text-sm text-slate-500 dark:text-slate-300 mt-0.5 leading-snug">{card.body}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-slate-400 mt-6">
          You can set all of this up now, or anytime from Settings and the Coach tab.
        </p>
      </div>

      <div className="fixed bottom-0 left-0 right-0 px-5 py-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-700">
        <button
          onClick={onContinue}
          className="w-full py-3.5 rounded-xl text-base font-semibold transition bg-teal-600 text-white active:bg-teal-700"
        >
          Let's go
        </button>
      </div>
    </div>
  )
}
