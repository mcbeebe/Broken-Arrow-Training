import type { OnboardingConfig } from '../hooks/useOnboarding'
import { injurySummaryLine } from '../utils/injuryRamp'

interface Props {
  coachName: string
  athleteName?: string
  config?: OnboardingConfig | null
  /** Jump to Settings so the athlete can name + customize their coach. */
  onCustomize?: () => void
}

/**
 * First-run welcome from the Coach. Shown on the Coach tab only until the
 * athlete sends their first message (it's not stored in the conversation —
 * it naturally disappears once `hasTurns` flips true). Greets the athlete,
 * invites them to name/customize the coach in Settings, encourages them to
 * ask something, and acknowledges any injury they shared in onboarding.
 */
export default function CoachWelcomeCard({ coachName, athleteName, config, onCustomize }: Props) {
  const named = coachName && coachName !== 'Coach'
  const greeting = athleteName ? `Hey ${athleteName} — ` : 'Hey there — '
  const injury = injurySummaryLine(config)

  return (
    <div className="flex">
      <div className="max-w-[90%] bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-slate-800 dark:text-slate-100 rounded-2xl rounded-tl-sm px-3.5 py-3 text-base leading-relaxed">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-base leading-none" role="img" aria-label="coach">🧢</span>
          <p className="text-xs uppercase font-bold tracking-wider text-amber-700 dark:text-amber-400">
            {named ? coachName : 'Your Coach'} · Welcome
          </p>
        </div>

        <p>
          {greeting}welcome aboard. {named ? `I'm ${coachName}, your` : "I'm your"} coach, and I'm
          here to help you train smart and show up on race day ready.
        </p>

        {injury && (
          <p className="mt-2">
            I see you're {injury}. We'll build back gradually and keep an eye on it — tell me
            the moment anything feels off and we'll adjust.
          </p>
        )}

        <p className="mt-2">
          Two quick things: give me a name and a personality in{' '}
          {onCustomize ? (
            <button
              onClick={onCustomize}
              className="font-semibold text-teal-700 dark:text-teal-400 underline underline-offset-2"
            >
              Settings
            </button>
          ) : (
            <span className="font-semibold">Settings</span>
          )}{' '}
          so I talk to you the way you like — and then just ask me anything. Swap a workout,
          explain a zone, gut-check how you're feeling. I've got your plan and your data in front
          of me.
        </p>

        <p className="mt-2 text-slate-600 dark:text-slate-300">
          What's on your mind? Type a message below to get started. 👇
        </p>
      </div>
    </div>
  )
}
