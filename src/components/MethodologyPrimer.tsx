import { useMemo } from 'react'
import type { TrainingPlan } from '../types'
import type { TrainingMethod } from '../types/training-method'
import type { OnboardingConfig } from '../hooks/useOnboarding'
import {
  buildMethodologyContext,
  formatVertRange,
  formatWeekRange,
  type MethodologyContext,
} from '../utils/methodologyContext'
import MethodologyPhaseBar from './MethodologyPhaseBar'

interface Props {
  plan: TrainingPlan
  method?: TrainingMethod
  config?: OnboardingConfig
  onContinue: () => void
}

/**
 * Shown once, right after a plan is generated (or first viewed) from the
 * onboarding flow. Walks the athlete through the structure of their plan
 * using the same MethodologyContext that powers Settings → Training
 * Methodology, so the prose is consistent across the app.
 *
 * Dismissal is persisted on `OnboardingConfig.primerSeenAt`.
 */
export default function MethodologyPrimer({ plan, method, config, onContinue }: Props) {
  const ctx = useMemo<MethodologyContext>(
    () => buildMethodologyContext(plan, method, config),
    [plan, method, config],
  )

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-slate-900 flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-8 pb-28">
        <p className="text-xs uppercase tracking-wide font-bold text-teal-700">Your plan is ready</p>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white leading-tight mt-1">
          Here's how it's structured
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-300 mt-2">
          A {ctx.totalWeeks}-week plan for {ctx.raceName || ctx.raceDistance}
          {ctx.methodName ? ` built on ${ctx.methodName} (${ctx.methodCoach ?? 'method'})` : ''}.
          Take 30 seconds — knowing the shape of the plan makes every easy day make sense.
        </p>

        <div className="mt-6">
          <MethodologyPhaseBar phases={ctx.phases} />
        </div>

        <div className="mt-6 space-y-3">
          {buildPrimerCards(ctx).map(card => (
            <PrimerCard key={card.id} title={card.title} body={card.body} />
          ))}
        </div>

        <div className="mt-6 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            <span className="font-semibold">Want the full methodology?</span>{' '}
            Open <span className="font-semibold">Settings → Training Methodology</span> any time
            for the deep dive with citations.
          </p>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 px-5 py-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-700">
        <button
          onClick={onContinue}
          className="w-full py-3.5 rounded-xl text-base font-semibold bg-teal-600 text-white active:bg-teal-700 transition"
        >
          Got it — show my plan
        </button>
      </div>
    </div>
  )
}

interface PrimerCardData {
  id: string
  title: string
  body: string
}

/** Build the ordered list of cards from the methodology context. Each card's
 *  prose mirrors the corresponding Section in `Methodology.tsx` so the
 *  primer is a true short-form of the Settings page. */
function buildPrimerCards(ctx: MethodologyContext): PrimerCardData[] {
  const cards: PrimerCardData[] = []

  const phaseList = ctx.phases
    .map(p => `${p.label} ${formatWeekRange(p.weekStart, p.weekEnd)}`)
    .join(' → ')
  cards.push({
    id: 'periodization',
    title: 'Periodization: progressive, not random',
    body: `Volume and intensity build phase by phase: ${phaseList}. ` +
      (ctx.recoveryWeek
        ? `A deliberate recovery week (Week ${ctx.recoveryWeek.num}) is when supercompensation happens — that lighter week is the work, not the absence of it.`
        : `Each block has a purpose; trust the order even when an easy week feels too easy.`),
  })

  if (ctx.intensityDistribution) {
    const { easyPct, moderatePct, hardPct } = ctx.intensityDistribution
    cards.push({
      id: '80-20',
      title: 'Most runs are easy — on purpose',
      body: `The method targets ~${easyPct}% easy, ${moderatePct}% moderate, and ${hardPct}% hard. ` +
        `Easy runs build the aerobic engine; only quality sessions push into Z3-4. ` +
        `If easy days feel slow, that's the point.`,
    })
  } else {
    cards.push({
      id: '80-20',
      title: 'Most runs are easy — on purpose',
      body:
        `About 80% of training volume sits in Zone 1-2 (easy/aerobic), with only ~20% at higher ` +
        `intensities. That polarized split is what elite endurance athletes do — and it produces ` +
        `bigger gains than threshold-heavy programs.`,
    })
  }

  if (ctx.phases.length > 0) {
    const phaseLines = ctx.phases.map(p => {
      const bits: string[] = []
      if (p.id === 'base') bits.push('build aerobic fitness')
      if (p.id === 'build') bits.push('race-specific intensity')
      if (p.id === 'peak') bits.push('peak volume')
      if (p.id === 'taper') bits.push('volume drops, sharpness held')
      if (p.vertRangeFt) bits.push(`long runs ${formatVertRange(p.vertRangeFt)}`)
      if (p.introducesPoles && ctx.polesStartWeek && p.weekStart <= ctx.polesStartWeek && ctx.polesStartWeek <= p.weekEnd) {
        bits.push('poles introduced')
      }
      return `• ${formatWeekRange(p.weekStart, p.weekEnd)}: ${bits.join(' • ')}`
    })
    cards.push({
      id: 'specificity',
      title: ctx.raceName ? `Specific to ${ctx.raceName}` : 'Specific to your race',
      body: phaseLines.join('\n'),
    })
  }

  if (ctx.eccentricFocus) {
    cards.push({
      id: 'eccentric',
      title: 'Eccentric strength saves your quads',
      body:
        `Gym sessions emphasize slow lowering — squats, Nordic curls, calf drops, step-downs. ` +
        (ctx.descentLandmark
          ? `That's what keeps the ${ctx.descentLandmark} descent from destroying your quads.`
          : `Eccentric training prepares the legs for steep downhill running.`),
    })
  }

  if (ctx.hasPoles && ctx.polesStartWeek) {
    cards.push({
      id: 'poles',
      title: `Trekking poles start Week ${ctx.polesStartWeek}`,
      body:
        `Poles redistribute climbing effort to the upper body, cutting lower-limb muscle damage ` +
        `15-20% on steep grades. Plant rhythm is a motor skill — that's why we start ` +
        `${Math.max(0, ctx.totalWeeks - ctx.polesStartWeek)} weeks before race day, not the week of.`,
    })
  }

  cards.push({
    id: 'hr',
    title: 'Heart rate, not pace, on trails',
    body:
      `Pace is unreliable when terrain changes. HR is your internal speedometer; trust the zones ` +
      `on the plan.${
        ctx.hasAltitude && ctx.raceElevationRange
          ? ` At race altitude (${ctx.raceElevationRange}), HR runs 5-10 bpm higher for the same effort — race day, pace by perceived effort.`
          : ''
      }`,
  })

  if (ctx.recoveryWeek) {
    cards.push({
      id: 'recovery',
      title: `The Week ${ctx.recoveryWeek.num} recovery dip`,
      body:
        `Volume drops${ctx.recoveryWeek.volumeDropPct ? ` ~${ctx.recoveryWeek.volumeDropPct}%` : ' meaningfully'} ` +
        `in this week. You'll feel restless — that's normal. Skipping it leads to overreaching: ` +
        `elevated RHR, poor sleep, persistent soreness.`,
    })
  }

  if (ctx.taper) {
    const dur = ctx.taper.endWeek - ctx.taper.startWeek + 1
    cards.push({
      id: 'taper',
      title: `Trust the taper (${formatWeekRange(ctx.taper.startWeek, ctx.taper.endWeek)})`,
      body:
        `Volume drops${ctx.taper.volumeDropPct ? ` ~${ctx.taper.volumeDropPct}%` : ' significantly'} ` +
        `while intensity stays. You can't gain fitness in the final ${dur} weeks — but you can lose ` +
        `it by training too hard. Sleep, hydrate, visualize the race.`,
    })
  }

  return cards
}

function PrimerCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
      <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
      <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5 leading-snug whitespace-pre-line">
        {body}
      </p>
    </div>
  )
}
