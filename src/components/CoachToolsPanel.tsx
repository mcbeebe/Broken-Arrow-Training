import type { ReactNode } from 'react'
import type { LevelUpLever } from '../engines/adaptive/levelUp'
import type { AdaptationLogEntry } from '../hooks/useAdaptationLog'
import LevelUpCard from './LevelUpCard'

/**
 * Coach → Tools (N14): the adaptive engine's surfaces in one always-
 * findable place. Each conditional surface (morning card, Monday
 * review) shows its live STATUS here even when it isn't firing, so
 * "where are these screens?" always has an answer; Level Up gets its
 * permanent home here alongside its Summary card.
 */

export interface AutopilotStatus {
  /** Nights of HRV history banked toward the readiness gate. */
  baselineNights: number
  baselineTarget: number
  healthConnected: boolean
  lastAction: Pick<AdaptationLogEntry, 'title' | 'atMs' | 'kind'> | null
}

interface Props {
  autopilot: AutopilotStatus
  mondayReviewLive: boolean
  logCount: number
  onOpenLog: () => void
  levers: LevelUpLever[]
  onAskCoach?: (seed: string) => void
  onOpenEngine: () => void
}

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700">
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      {children}
    </div>
  )
}

export default function CoachToolsPanel({
  autopilot, mondayReviewLive, logCount, onOpenLog, levers, onAskCoach, onOpenEngine,
}: Props) {
  const { baselineNights, baselineTarget, healthConnected, lastAction } = autopilot
  const armed = healthConnected && baselineNights >= baselineTarget
  return (
    <div className="px-3 py-3 space-y-3" data-testid="coach-tools">
      {/* Ordered per the athlete: the accelerator first, the model
          it stands on second, the log last. */}

      <LevelUpCard levers={levers} onAskCoach={onAskCoach} />

      <Row title="Your engine">
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
          The measured model your plan runs on — critical speed, efficiency, volume, strength, projection.
        </p>
        <button
          onClick={onOpenEngine}
          className="mt-2 w-full h-9 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-xs font-semibold"
          data-testid="tools-open-engine"
        >
          Open in Stats →
        </button>
      </Row>

      <Row title="Daily autopilot">
        {!healthConnected ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            Connect Garmin or Apple Health and the autopilot watches your overnight data every morning — swapping or trimming a hard day only when a multi-day trend says so.
          </p>
        ) : armed ? (
          <>
            <p className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold mt-1" data-testid="autopilot-armed">
              Armed — watching your overnight data every morning.
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
              Adjustments appear as a morning card on Summary, auto-applied with one-tap revert. Quiet mornings mean the plan stands.
            </p>
          </>
        ) : (
          <>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1" data-testid="autopilot-building">
              Building your baseline — {baselineNights} of {baselineTarget} nights of HRV.
            </p>
            <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-teal-600"
                style={{ width: `${Math.min(100, Math.round((baselineNights / baselineTarget) * 100))}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              Until the baseline is real, readiness never moves a session — heat re-pacing works from day one.
            </p>
          </>
        )}
        {lastAction && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
            Last action: {lastAction.title}{lastAction.kind === 'reverted' ? ' (you reverted it)' : ''}
          </p>
        )}
      </Row>

      <Row title="Monday review">
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
          {mondayReviewLive
            ? "This week's review is live — open Summary to see the evidence and one-tap adjustments."
            : 'Arrives Mondays at 6am: last week scored from your data, next week adjusted with your consent. A 14+ day gap raises it immediately.'}
        </p>
      </Row>

      <Row title="Adaptation log">
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
          Every change the engine made or proposed — and why — with undo.
        </p>
        <button
          onClick={onOpenLog}
          className="mt-2 w-full h-9 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-xs font-semibold"
          data-testid="tools-open-log"
        >
          Open the log{logCount > 0 ? ` · ${logCount} change${logCount === 1 ? '' : 's'}` : ''}
        </button>
      </Row>
    </div>
  )
}
