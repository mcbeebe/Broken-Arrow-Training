import { MORNING, SPORTS, type Sport } from '../content'
import { SIGNAL } from '../tokens'
import { SegmentedControl } from './SegmentedControl'

interface Props {
  sport: Sport
  /** Wired in initiative 003 PR 4. */
  onSportChange?: (sport: Sport) => void
}

/** “This morning”: the same readings, adjusted four ways (design-spec.md § MorningCard). */
export function MorningCard({ sport, onSportChange }: Props) {
  const example = SPORTS.find(s => s.id === sport) ?? SPORTS[0]
  const ring = MORNING.readiness.value
  return (
    <div className="rounded-[28px] bg-landing-card px-7 pb-7 pt-[26px] shadow-landing-float">
      <p id="morning-tabs" className="m-0 text-sm text-landing-muted">
        {MORNING.groupLabel}
      </p>
      <SegmentedControl
        tone="light"
        labelledBy="morning-tabs"
        options={SPORTS.map(s => ({ id: s.id, label: s.tab }))}
        value={sport}
        onChange={onSportChange}
        className="mt-2.5"
      />
      <div className="mt-[18px] flex items-baseline justify-between gap-3">
        <p className="m-0 text-[15px] font-bold">{MORNING.heading}</p>
        <p className="m-0 text-right text-[13px] text-landing-muted">{example.who}</p>
      </div>
      <dl className="m-0 mt-3 grid grid-cols-3 gap-2.5">
        {MORNING.metrics.map(m => (
          <div key={m.label} className="min-w-0 rounded-[14px] bg-landing-soft px-3.5 py-3 max-[640px]:px-2.5">
            <dt className="whitespace-nowrap text-[13px] text-landing-muted">{m.label}</dt>
            <dd className="m-0 mt-1 whitespace-nowrap text-[clamp(20px,5vw,26px)] font-extrabold tracking-[-0.02em]">
              {m.value}
              {m.unit && <span className="text-[13px] font-medium"> {m.unit}</span>}
            </dd>
            <dd className={`m-0 mt-0.5 text-[13px] font-semibold ${m.flagged ? 'text-landing-signal-text' : 'text-landing-muted'}`}>
              {m.note}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 flex items-center gap-3.5">
        <div
          aria-hidden="true"
          className="flex size-16 flex-none items-center justify-center rounded-full"
          style={{ background: `conic-gradient(${SIGNAL.signal} 0 ${ring}%, ${SIGNAL.line} ${ring}% 100%)` }}
        >
          <div className="flex size-12 items-center justify-center rounded-full bg-landing-card text-[17px] font-extrabold">{ring}</div>
        </div>
        <div>
          <p className="m-0 text-[17px] font-bold">{MORNING.readiness.title}</p>
          <p className="m-0 mt-0.5 text-sm text-landing-muted">{MORNING.readiness.basis}</p>
        </div>
      </div>
      <div aria-live="polite" className="mt-5 min-h-[196px] border-0 border-t border-solid border-landing-line pt-[18px]">
        <p className="m-0 text-sm text-landing-muted">{MORNING.plannedLabel}</p>
        <p className="m-0 mt-0.5 text-lg font-semibold text-landing-muted">
          <s>{example.planned}</s>
        </p>
        <p className="m-0 mt-3.5 text-sm font-bold text-landing-signal-text">{MORNING.adjustedLabel}</p>
        <p className="m-0 mt-0.5 text-2xl font-extrabold leading-[1.15] tracking-[-0.02em]">{example.adjusted}</p>
        <p className="m-0 mt-2.5 text-[15px] leading-normal text-landing-muted">{example.why}</p>
      </div>
    </div>
  )
}
