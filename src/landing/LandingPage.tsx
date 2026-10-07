import { useReducer } from 'react'
import { COACH, SKIP_LINK } from './content'
import { INITIAL_STATE, atTryLimit, landingReducer } from './state'
import { SiteHeader } from './components/SiteHeader'
import { Hero } from './components/Hero'
import { HowItWorks } from './components/HowItWorks'
import { PathCards } from './components/PathCards'
import { PlanChart } from './components/PlanChart'
import { CoachDemo } from './components/CoachDemo'
import { MakeItYours } from './components/MakeItYours'
import { AppScreens } from './components/AppScreens'
import { GearGrid } from './components/GearGrid'
import { ToolsPanel } from './components/ToolsPanel'
import { FounderNote } from './components/FounderNote'
import { Faq } from './components/Faq'
import { SiteFooter } from './components/SiteFooter'

/**
 * attune.coach's landing page. It owns the shared state (state.ts): the
 * athlete tabs and the chart toggle stay in step, and the persona editor
 * drives the coach demo's header and the voice of its replies.
 */
export function LandingPage() {
  const [state, dispatch] = useReducer(landingReducer, INITIAL_STATE)
  const limitReached = atTryLimit(state)
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
        <Hero sport={state.sport} onSportChange={sport => dispatch({ type: 'sport', sport })} />
        <HowItWorks />
        <section id="you" className="bg-landing-deep text-landing-on-deep">
          <div className="mx-auto max-w-landing px-6 py-24">
            <PathCards />
            <PlanChart plan={state.plan} sport={state.sport} onPlanChange={plan => dispatch({ type: 'plan', plan })} />
          </div>
        </section>
        <section id="coach" className="mx-auto flex max-w-landing flex-wrap items-start gap-14 px-6 py-24">
          <div className="min-w-0 flex-[1_1_400px]">
            <h2 className="m-0 text-[clamp(36px,4.6vw,56px)] font-extrabold leading-none tracking-[-0.035em]">{COACH.title}</h2>
            <p className="m-0 mt-5 max-w-[32em] text-[19px] leading-[1.55] text-landing-muted">{COACH.body}</p>
            <ul className="m-0 mt-6 list-disc pl-5 text-[17px] leading-[1.8] text-landing-muted">
              {COACH.bullets.map(b => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            <MakeItYours
              coachName={state.coachName}
              personality={state.personality}
              limitReached={limitReached}
              onNameChange={name => dispatch({ type: 'name', name })}
              onPickPersonality={id => dispatch({ type: 'personality', id })}
            />
          </div>
          <CoachDemo
            coachName={state.coachName}
            personality={state.personality}
            question={state.question}
            approved={state.approved}
            limitReached={limitReached}
            onApprove={() => dispatch({ type: 'approve' })}
            onAsk={() => dispatch({ type: 'ask' })}
            onReset={() => dispatch({ type: 'reset' })}
          />
        </section>
        <AppScreens />
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
