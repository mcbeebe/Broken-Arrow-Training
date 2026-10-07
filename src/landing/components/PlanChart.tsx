import { PLAN, SPORTS, changesToday, type PlanKind, type Sport } from '../content'
import { SegmentedControl } from './SegmentedControl'

interface Props {
  plan: PlanKind
  sport: Sport
  onPlanChange?: (plan: PlanKind) => void
}

const height = (v: number) => Math.round((v / PLAN.max) * PLAN.plot)

/**
 * “Your plan, week by week”: 16 weekly bars with today (week 9) marked. When
 * this morning changed today's session, the bar is cut back from its dashed
 * planned height; when it didn't, the bar is full and there's no outline
 * (design-spec.md § PlanChart). Plain divs, not recharts: the landing page
 * can't afford the chart library.
 */
export function PlanChart({ plan, sport, onPlanChange }: Props) {
  const bars = PLAN.bars[plan]
  const example = SPORTS.find(s => s.id === sport) ?? SPORTS[0]
  const changed = changesToday(example.outcome)
  return (
    <>
      <div className="mt-16 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0 flex-[1_1_420px]">
          <h3 className="m-0 text-[clamp(26px,3vw,34px)] font-extrabold tracking-[-0.03em]">{PLAN.title}</h3>
          <p className="m-0 mt-2 text-[17px] leading-[1.55] text-landing-on-deep-muted">{PLAN.intro[plan]}</p>
        </div>
        <SegmentedControl
          tone="deep"
          label={PLAN.toggleLabel}
          options={[
            { id: 'race', label: PLAN.toggle.race },
            { id: 'fit', label: PLAN.toggle.fit },
          ]}
          value={plan}
          onChange={onPlanChange}
        />
      </div>
      <figure className="m-0 mt-7 p-0">
        <div
          role="img"
          aria-label={`${PLAN.chartLabel[plan]} ${changed ? PLAN.week9.changed : PLAN.week9.same}`}
          className="flex h-[236px] items-end gap-1.5 border-0 border-b-2 border-solid border-landing-deep-line"
        >
          {bars.map((v, i) => {
            const h = height(v)
            if (i !== PLAN.todayIndex) {
              return (
                <div key={i} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                  <div data-bar="week" className="rounded-t-md bg-landing-chart-bar" style={{ height: `${h}px` }} />
                </div>
              )
            }
            return (
              <div key={i} className="relative flex h-full min-w-0 flex-1 flex-col justify-end">
                {changed && (
                  <div
                    data-bar-outline
                    className="absolute inset-x-0 bottom-0 box-border rounded-t-md border-2 border-dashed border-landing-signal-on-deep"
                    style={{ height: `${h}px` }}
                  />
                )}
                <span
                  data-bar-label
                  className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[13px] font-extrabold text-landing-signal-on-deep"
                  style={{ bottom: `${h + 8}px` }}
                >
                  {PLAN.todayLabel}
                </span>
                <div
                  data-bar="today"
                  className="rounded-t-md bg-landing-chart-today"
                  style={{ height: `${changed ? Math.round(h * PLAN.todayShare) : h}px` }}
                />
              </div>
            )
          })}
        </div>
        <div
          className="mt-2.5 grid gap-1.5 text-[clamp(12px,1.4vw,15px)] font-semibold text-landing-on-deep-muted"
          style={{ gridTemplateColumns: plan === 'race' ? '5fr 5fr 3fr 3fr' : 'repeat(4, minmax(0, 1fr))' }}
        >
          {PLAN.phases[plan].map((label, i, all) => (
            <span key={label} className={i === all.length - 1 ? 'text-right' : undefined}>
              {label}
            </span>
          ))}
        </div>
        <figcaption className="mt-[22px] flex flex-wrap items-baseline gap-x-[22px] gap-y-2 rounded-[14px] bg-landing-deep-card px-5 py-4">
          <span className="text-lg font-extrabold text-landing-signal-on-deep">{PLAN.captionLead}</span>
          <span className="flex-[1_1_360px] text-base leading-normal text-landing-on-deep">
            {example.chartCaption} {changed && `${PLAN.captionOutline} `}
            {PLAN.captionExample}
          </span>
        </figcaption>
      </figure>
    </>
  )
}
