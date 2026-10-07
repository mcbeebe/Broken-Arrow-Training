import { useState } from 'react'
import { COACH, MAKE, SKIP_LINK, type PlanKind, type Sport, type TraitId } from './content'
import { SiteHeader } from './components/SiteHeader'
import { Hero } from './components/Hero'
import { HowItWorks } from './components/HowItWorks'
import { PathCards } from './components/PathCards'
import { PlanChart } from './components/PlanChart'
import { CoachDemo } from './components/CoachDemo'
import { MakeItYours } from './components/MakeItYours'
import { GearGrid } from './components/GearGrid'
import { ToolsPanel } from './components/ToolsPanel'
import { FounderNote } from './components/FounderNote'
import { Faq } from './components/Faq'
import { SiteFooter } from './components/SiteFooter'

/** The page's shared state (design-spec.md § Shared state). Page-local; nothing is persisted or sent. */
export interface LandingState {
  sport: Sport
  plan: PlanKind
  coachName: string
  traits: ReadonlySet<TraitId>
  approved: boolean
}

const INITIAL_STATE: LandingState = {
  sport: 'run',
  plan: 'race',
  coachName: MAKE.defaultName,
  traits: new Set(MAKE.defaultTraits),
  approved: false,
}

/**
 * attune.coach's landing page. Initiative 003 PR 3 renders every section in
 * its default state; PR 4 wires the tabs, the chart toggle, Approve and the
 * persona editor to this state.
 */
export function LandingPage() {
  const [state] = useState<LandingState>(INITIAL_STATE)
  return (
    <div className="min-h-screen bg-landing-ground font-landing text-landing-ink">
      <a
        href="#main"
        className="absolute left-4 top-4 z-50 -translate-y-32 rounded-lg bg-landing-ink px-4 py-3 font-semibold text-landing-ground no-underline focus:translate-y-0"
      >
        {SKIP_LINK}
      </a>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="outline-none">
        <Hero sport={state.sport} />
        <HowItWorks />
        <section id="you" className="bg-landing-deep text-landing-on-deep">
          <div className="mx-auto max-w-landing px-6 py-24">
            <PathCards />
            <PlanChart plan={state.plan} sport={state.sport} />
          </div>
        </section>
        <section id="coach" className="mx-auto flex max-w-landing flex-wrap items-center gap-14 px-6 py-24">
          <div className="min-w-0 flex-[1_1_400px]">
            <h2 className="m-0 text-[clamp(36px,4.6vw,56px)] font-extrabold leading-none tracking-[-0.035em]">{COACH.title}</h2>
            <p className="m-0 mt-5 max-w-[32em] text-[19px] leading-[1.55] text-landing-muted">{COACH.body}</p>
            <ul className="m-0 mt-6 list-disc pl-5 text-[17px] leading-[1.8] text-landing-muted">
              {COACH.bullets.map(b => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
          <CoachDemo coachName={state.coachName} traits={state.traits} approved={state.approved} />
        </section>
        <MakeItYours coachName={state.coachName} traits={state.traits} />
        <GearGrid />
        <ToolsPanel />
        <section className="mx-auto flex max-w-landing flex-wrap gap-14 px-6 pb-[88px] pt-6">
          <FounderNote />
          <Faq />
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
