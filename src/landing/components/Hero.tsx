import { HERO } from '../content'
import type { Sport } from '../content'
import { InviteForm } from './InviteForm'
import { MorningCard } from './MorningCard'

interface Props {
  sport: Sport
  onSportChange?: (sport: Sport) => void
}

/** The headline, the invite form (`#join`) and the “This morning” card. */
export function Hero({ sport, onSportChange }: Props) {
  return (
    <section id="top" className="mx-auto flex max-w-landing flex-wrap items-center gap-16 px-6 pb-24 pt-14">
      <div id="join" className="min-w-0 flex-[1_1_460px]">
        <h1 className="m-0 max-w-[11ch] text-[clamp(44px,6vw,76px)] font-extrabold leading-[0.98] tracking-[-0.035em]">
          {HERO.title}
        </h1>
        <p className="m-0 mt-7 max-w-[30em] text-[21px] font-bold leading-[1.45]">{HERO.subhead}</p>
        <p className="m-0 mt-2 max-w-[32em] text-[19px] leading-normal text-landing-muted">{HERO.lead}</p>
        <InviteForm />
      </div>
      <div className="mx-auto min-w-0 max-w-[520px] flex-[1_1_420px]">
        <MorningCard sport={sport} onSportChange={onSportChange} />
      </div>
    </section>
  )
}
