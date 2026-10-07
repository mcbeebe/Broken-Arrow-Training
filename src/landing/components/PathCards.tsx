import { PATHS } from '../content'

/** “Whatever you’re training for”: the four paths, on deep. */
export function PathCards() {
  return (
    <>
      <div className="flex flex-wrap items-end gap-x-14 gap-y-6">
        <h2 className="m-0 min-w-0 flex-[1_1_420px] text-[clamp(34px,4.6vw,56px)] font-extrabold leading-none tracking-[-0.035em]">
          {PATHS.title}
        </h2>
        <p className="m-0 min-w-0 flex-[1_1_420px] text-lg leading-[1.55] text-landing-on-deep-muted">{PATHS.intro}</p>
      </div>
      <div className="mt-11 grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
        {PATHS.cards.map(card => (
          <div key={card.id} className="rounded-[20px] bg-landing-deep-card p-[22px]">
            <h3 className="m-0 text-[22px] font-extrabold tracking-[-0.02em]">{card.title}</h3>
            <p className="m-0 mt-1.5 text-[15px] font-semibold text-landing-accent-on-deep">{card.subtitle}</p>
            <ul className="m-0 mt-3.5 list-disc pl-[18px] text-[15px] leading-[1.6] text-landing-on-deep-muted">
              {card.points.map(point => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  )
}
