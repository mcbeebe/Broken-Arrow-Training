import type { OutlookCard } from '../hooks/useMorningOutlook'
import type { Verdict } from '../utils/verdict'
import type { PlannedDay } from '../types'

/**
 * The Verdict card — the pinned answer at the top of Today.
 *
 * Two paths, one shape. When the autopilot ACTED overnight it presents the
 * change, the reason, the before→after and a one-tap revert. On every other
 * morning it presents the verdict the engine reached anyway, the session it
 * is standing behind, and the evidence — because "am I good to go?" is the
 * question the page exists to answer, and silence was never an answer to it.
 */

const REVERT_LABEL: Record<OutlookCard['verdict'], string> = {
  swap: 'Do the hard session anyway',
  trim: 'Do the full session',
  'heat-repace': 'Keep the original paces',
  confirm: 'Keep as planned',
}

const RING: Record<Verdict['tone'], { stroke: string; text: string; ring: string }> = {
  clear: { stroke: 'stroke-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', ring: 'border-emerald-200 dark:border-emerald-900' },
  watch: { stroke: 'stroke-amber-500', text: 'text-amber-700 dark:text-amber-300', ring: 'border-amber-200 dark:border-amber-900' },
  arming: { stroke: 'stroke-slate-400', text: 'text-slate-600 dark:text-slate-300', ring: 'border-slate-200 dark:border-slate-700' },
  unknown: { stroke: 'stroke-slate-300', text: 'text-slate-500 dark:text-slate-400', ring: 'border-slate-200 dark:border-slate-700' },
}

function Bubble({ score, tone, onClick }: { score: number | null; tone: Verdict['tone']; onClick?: () => void }) {
  const c = RING[tone]
  const r = 22
  const circumference = 2 * Math.PI * r
  const filled = score != null ? circumference * (1 - score / 100) : circumference
  return (
    <button
      onClick={onClick}
      className="relative w-[52px] h-[52px] shrink-0"
      aria-label={score != null ? `Readiness ${score} of 100 — see the detail` : 'Readiness detail'}
      data-testid="verdict-bubble"
    >
      <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true">
        <circle cx="26" cy="26" r={r} fill="none" strokeWidth="6" className="stroke-slate-100 dark:stroke-slate-700" />
        {score != null && (
          <circle
            cx="26" cy="26" r={r} fill="none" strokeWidth="6" strokeLinecap="round"
            className={c.stroke}
            strokeDasharray={circumference.toFixed(1)}
            strokeDashoffset={filled.toFixed(1)}
            transform="rotate(-90 26 26)"
          />
        )}
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-base font-bold ${c.text}`}>
        {score ?? '—'}
      </span>
    </button>
  )
}

export interface VerdictCardProps {
  verdict: Verdict
  /** Present only on mornings the autopilot acted. */
  outlook?: OutlookCard | null
  /** Today's session, shown as the ticket on non-acted mornings. */
  today?: PlannedDay | null
  lockedIn?: boolean
  onOpenReadiness?: () => void
  onOpenSession?: () => void
  onLockIn?: () => void
  onAdjust?: () => void
  onSoundsRight?: () => void
  onRevert?: () => void
}

export default function VerdictCard({
  verdict, outlook, today, lockedIn,
  onOpenReadiness, onOpenSession, onLockIn, onAdjust, onSoundsRight, onRevert,
}: VerdictCardProps) {
  const acted = !!outlook
  const headline = acted ? outlook!.headline : verdict.headline
  const sub = acted ? outlook!.why : verdict.sub
  const evidence = acted
    ? outlook!.evidence.slice(0, 3).map(e => ({ label: e.label, value: e.value, sub: '' }))
    : verdict.evidence

  return (
    <div
      className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700"
      data-testid="verdict-card"
      data-tone={acted ? 'acted' : verdict.tone}
    >
      <div className="flex items-start gap-3">
        <Bubble score={verdict.score} tone={acted ? 'watch' : verdict.tone} onClick={onOpenReadiness} />
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-slate-800 dark:text-white leading-snug" data-testid="verdict-headline">
            {headline}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mt-0.5">{sub}</p>
        </div>
      </div>

      {/* The ticket. On an acted morning it carries the before→after; on any
          other morning it is simply the session the verdict stands behind. */}
      {acted && outlook!.before && outlook!.after ? (
        <div className="mt-3 border border-slate-100 dark:border-slate-700 rounded-xl px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
            Today's session — adjusted
          </p>
          <p className="text-xs text-slate-400 line-through">{outlook!.before}</p>
          <p className="text-sm font-semibold text-slate-800 dark:text-white mt-0.5">{outlook!.after}</p>
          {outlook!.movedToDay && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              The hard session moved to <span className="font-semibold">{outlook!.movedToDay}</span> — moved, never deleted.
            </p>
          )}
        </div>
      ) : today ? (
        <button
          onClick={onOpenSession}
          className="mt-3 w-full text-left border border-slate-100 dark:border-slate-700 rounded-xl px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
          data-testid="verdict-ticket"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300 mb-1">
            Today's ticket
          </p>
          <p className="text-sm font-semibold text-slate-800 dark:text-white">
            {today.workout}
            {today.time && today.time !== '—' && <span className="font-normal text-slate-500 dark:text-slate-400"> · {today.time}</span>}
          </p>
          {today.detail && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed line-clamp-2">{today.detail}</p>
          )}
        </button>
      ) : null}

      {evidence.length > 0 && (
        <div className="mt-2.5 grid grid-cols-3 gap-1.5" data-testid="verdict-evidence">
          {evidence.map(row => (
            <div key={row.label} className="bg-slate-50 dark:bg-slate-900 rounded-lg px-2 py-1.5">
              <p className="text-[11px] text-slate-400 leading-tight">{row.label}</p>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mt-0.5">{row.value}</p>
              {row.sub && <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{row.sub}</p>}
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        {acted ? (
          <>
            <button
              onClick={onSoundsRight}
              className="flex-1 h-10 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold"
            >
              Sounds right
            </button>
            <button
              onClick={onRevert}
              className="flex-1 h-10 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-xs font-semibold"
              data-testid="outlook-revert"
            >
              {REVERT_LABEL[outlook!.verdict]}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onLockIn}
              disabled={lockedIn}
              className="flex-1 h-10 rounded-lg bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-bold"
              data-testid="verdict-lock-in"
            >
              {lockedIn ? 'Locked in ✓' : 'Locked in'}
            </button>
            <button
              onClick={onAdjust}
              className="w-28 h-10 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-xs font-semibold"
              data-testid="verdict-adjust"
            >
              Adjust ▾
            </button>
          </>
        )}
      </div>

      <p className="mt-2.5 text-[10px] text-slate-400 leading-snug" data-testid="verdict-footer">
        {acted
          ? 'Autopilot adjusts today only. Future days are proposals; race week is never touched. Every change is in the log, with undo.'
          : verdict.footer}
      </p>
    </div>
  )
}
