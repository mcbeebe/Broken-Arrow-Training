import { GEAR } from '../content'

/** Names as text only: no Garmin, Strava or Apple logos (trademark guidelines). */
export function GearGrid() {
  return (
    <section className="mx-auto max-w-landing px-6 pb-6 pt-[72px]">
      <h2 className="m-0 text-[26px] font-extrabold tracking-[-0.02em]">{GEAR.title}</h2>
      <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-4">
        {GEAR.items.map(g => (
          <div key={g.name} className="rounded-2xl bg-landing-card px-[22px] py-5">
            <h3 className="m-0 text-[19px] font-bold">{g.name}</h3>
            <p className="m-0 mt-1.5 text-[15px] leading-normal text-landing-muted">{g.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
