import { useMemo, useState } from 'react'
import type { HRZone, TrainingPlan } from '../types'
import type { TrainingMethod } from '../types/training-method'
import type { OnboardingConfig } from '../hooks/useOnboarding'
import {
  buildMethodologyContext,
  formatVertRange,
  formatWeekRange,
  type MethodologyContext,
  type MethodologyPhase,
} from '../utils/methodologyContext'

interface MethodologyProps {
  zones?: HRZone[]
  plan?: TrainingPlan
  method?: TrainingMethod
  onboardingConfig?: OnboardingConfig
}

export default function Methodology({ zones, plan, method, onboardingConfig }: MethodologyProps = {}) {
  const ctx = useMemo<MethodologyContext | null>(
    () => (plan ? buildMethodologyContext(plan, method, onboardingConfig) : null),
    [plan, method, onboardingConfig],
  )

  const intro = ctx ? buildIntro(ctx) : DEFAULT_INTRO
  const periodization = ctx ? buildPeriodizationCopy(ctx) : null
  const specificity = ctx ? buildSpecificityCopy(ctx) : null

  return (
    <div className="px-4 py-4 space-y-5 pb-8">
      <h2 className="text-xl font-bold text-slate-800 dark:text-white">Training Philosophy</h2>
      <p className="text-base text-slate-600 dark:text-slate-300">{intro}</p>

      {/* Periodization */}
      <Section title="Periodization: Why the Weeks Are Structured This Way" defaultOpen>
        <p>{periodization?.summary ?? DEFAULT_PERIODIZATION_SUMMARY}</p>
        <PhaseBar phases={ctx?.phases ?? DEFAULT_PHASES} />
        <p>{periodization?.attribution ?? DEFAULT_PERIODIZATION_ATTRIBUTION}</p>
        <Citation
          text="The foundation of all endurance performance is aerobic capacity, built through consistent sub-threshold volume."
          source="House, S., Johnston, S., & Jornet, K. (2019). Training for the Uphill Athlete. Patagonia Books."
        />
      </Section>

      {/* 80/20 Polarized */}
      <Section title="The 80/20 Rule: Why Most Runs Are Easy">
        <p>
          {ctx?.intensityDistribution ? (
            <>
              The selected method targets <strong>~{ctx.intensityDistribution.easyPct}% easy</strong>,
              {' '}~{ctx.intensityDistribution.moderatePct}% moderate, and ~{ctx.intensityDistribution.hardPct}% hard.
              The easy bulk is not laziness — it's how elite endurance athletes train.
            </>
          ) : (
            <>
              Approximately <strong>80% of training volume is in Zone 1-2</strong> (easy/aerobic),
              with only 20% at higher intensities. This isn't laziness — it's how elite endurance
              athletes train.
            </>
          )}
        </p>
        <p>
          Research by <strong>Stephen Seiler</strong> found that polarized training (lots of easy +
          some very hard, with little moderate effort) produces greater endurance gains than
          threshold-heavy programs.
        </p>
        <Citation
          text="The training intensity distribution of successful endurance athletes is polarized: ~75-80% low intensity, ~5% moderate, and ~15-20% high intensity."
          source="Seiler, S. (2010). What is Best Practice for Training Intensity and Duration Distribution? International Journal of Sports Physiology and Performance, 5(3), 276-291."
        />
        <p>
          For this plan: easy runs, long runs{ctx?.hasCrossTraining ? ', and cross-training' : ''} are all
          {' '}Z1-2. Only quality sessions (hill repeats, tempo intervals, race-pace work) push into Z3-4.
        </p>
      </Section>

      {/* Specificity */}
      <Section title="Specificity: Training for the Mountain">
        <p>{specificity?.intro ?? DEFAULT_SPECIFICITY_INTRO}</p>
        <ul className="space-y-2 text-base text-slate-700 dark:text-slate-200">
          {(ctx?.phases ?? DEFAULT_PHASES).map(p => (
            <li key={p.id} className="flex gap-2">
              <span className="text-teal-600 font-bold shrink-0">{formatWeekRange(p.weekStart, p.weekEnd)}:</span>
              <span>{describePhase(p, ctx)}</span>
            </li>
          ))}
        </ul>
        <Citation
          text="The principle of specificity states that training adaptations are specific to the muscles used and the manner in which they are trained."
          source="Hawley, J.A. (2008). Specificity of Training Adaptation. Journal of Sports Sciences, 26(S1), S1-S2."
        />
      </Section>

      {/* Eccentric Strength — only when the plan actually trains it */}
      {(ctx?.eccentricFocus ?? true) && (
        <Section title="Eccentric Strength: Saving Your Quads for the Descent">
          <p>
            The gym sessions emphasize <strong>eccentric (lowering) movements</strong>: slow squats,
            Nordic curls, eccentric calf drops, and step-downs. This is critical because
            {' '}{ctx?.descentLandmark
              ? <>the <strong>{ctx.descentLandmark}</strong> descent</>
              : <>the race's biggest descent</>}
            {' '}will destroy unprepared quads.
          </p>
          <p>
            Eccentric training creates structural adaptations in muscle fibers, shifting the
            length-tension relationship so muscles can produce force at longer lengths — exactly
            what's needed for steep downhill running.
          </p>
          <Citation
            text="Eccentric exercise training reduces muscle damage and improves running economy during downhill running in trained runners."
            source="Toyomura, J., et al. (2018). Effects of Eccentric Training on Downhill Running Performance. European Journal of Sport Science, 18(10), 1392-1401."
          />
        </Section>
      )}

      {/* Trekking Poles — only when the plan uses poles */}
      {(ctx ? ctx.hasPoles : true) && (
        <Section title={`Trekking Poles: Why They Start in Week ${ctx?.polesStartWeek ?? 4}`}>
          <p>
            Poles are introduced in <strong>Week {ctx?.polesStartWeek ?? 4}</strong> to allow{' '}
            {ctx ? Math.max(0, ctx.totalWeeks - (ctx.polesStartWeek ?? 4)) : 6} weeks of practice
            before race day. Research shows poles reduce lower-limb muscle damage by 15-20% during
            steep climbs and improve climbing economy by redistributing effort to the upper body.
          </p>
          <p>
            The key is <strong>plant rhythm</strong> — a consistent alternating pattern that becomes
            automatic through practice. This is a motor skill that requires repetition.
          </p>
          <Citation
            text="Pole use during uphill walking significantly reduces the metabolic cost of locomotion and perceived exertion at steep gradients."
            source="Giandolini, M., et al. (2019). Trekking Poles Reduce the Physiological Cost of Steep Uphill Walking. Medicine & Science in Sports & Exercise, 51(6S), 247."
          />
        </Section>
      )}

      {/* Heart Rate Training */}
      <Section title="Heart Rate Zone Training: Your Internal Speedometer">
        <p>
          Pace is unreliable on trails — a 15:00/mi pace uphill can be harder than an 8:00/mi
          pace on flat ground. Heart rate provides a <strong>consistent measure of internal effort</strong>
          regardless of terrain or conditions.
        </p>
        <div className="bg-white dark:bg-slate-800 rounded-xl p-3 border border-slate-100 dark:border-slate-700 space-y-1.5 text-base">
          {zones && zones.length > 0 ? (
            zones.map((z) => (
              <div key={z.zone} className="flex justify-between">
                <strong>{z.zone} ({z.hr})</strong><span>{z.desc}</span>
              </div>
            ))
          ) : (
            <>
              <div className="flex justify-between"><strong>Z1</strong><span>Recovery / warm-up</span></div>
              <div className="flex justify-between"><strong>Z2</strong><span>Aerobic base (80% of training)</span></div>
              <div className="flex justify-between"><strong>Z3</strong><span>Tempo / sustained effort</span></div>
              <div className="flex justify-between"><strong>Z4</strong><span>Threshold / hard intervals</span></div>
            </>
          )}
        </div>
        <Citation
          text="Heart rate monitoring provides a practical, real-time index of exercise intensity that accounts for environmental and terrain variables."
          source="Achten, J. & Jeukendrup, A. (2003). Heart Rate Monitoring: Applications and Limitations. Sports Medicine, 33(7), 517-538."
        />
        {ctx?.hasAltitude && (
          <div className="bg-amber-50 rounded-xl p-3 border border-amber-200 mt-2">
            <p className="text-base text-amber-800">
              <strong>Altitude note:</strong> At race altitude ({ctx.raceElevationRange ?? 'high elevation'}),
              {' '}HR runs 5-10 bpm higher for the same effort. On race day, pace by{' '}
              <strong>perceived effort</strong>, not HR targets.
            </p>
          </div>
        )}
      </Section>

      {/* Recovery Week — only when the plan has one */}
      {ctx?.recoveryWeek && (
        <Section title={`The Recovery Week (Week ${ctx.recoveryWeek.num}): Why Less Is More`}>
          <p>
            Week {ctx.recoveryWeek.num} drops volume by
            {ctx.recoveryWeek.volumeDropPct ? <> <strong>~{ctx.recoveryWeek.volumeDropPct}%</strong></> : <strong> a meaningful amount</strong>}
            . This isn't a step backward — it's when <strong>supercompensation</strong> occurs.
            Your body absorbs the training stress from the prior weeks and emerges stronger.
          </p>
          <p>
            Skipping recovery weeks leads to <strong>overreaching</strong>: accumulated fatigue that
            blunts performance gains. Signs include elevated resting HR, poor sleep, persistent
            soreness, and declining motivation.
          </p>
          <Citation
            text="Planned recovery periods allow physiological supercompensation and reduce the risk of non-functional overreaching in endurance athletes."
            source="Meeusen, R., et al. (2013). Prevention, Diagnosis, and Treatment of the Overtraining Syndrome. Medicine & Science in Sports & Exercise, 45(1), 186-205."
          />
        </Section>
      )}

      {/* Taper — only when the plan has one */}
      {ctx?.taper && (
        <Section title={`The Taper (${formatWeekRange(ctx.taper.startWeek, ctx.taper.endWeek)}): Trust the Process`}>
          <p>
            Volume drops{ctx.taper.volumeDropPct ? <> <strong>~{ctx.taper.volumeDropPct}%</strong></> : ' significantly'}
            {' '}while intensity is maintained. Research shows a
            {' '}<strong>2-week taper with 40-60% volume reduction</strong> optimizes race-day performance.
          </p>
          <p>
            You will feel restless, possibly sluggish. This is normal — your body is consolidating
            {' '}{ctx.totalWeeks} weeks of training. Trust the science: you cannot gain meaningful fitness
            in the final 2 weeks, but you can absolutely lose fitness by training too hard.
          </p>
          <Citation
            text="A 2-week exponential taper with 41-60% training volume reduction produces a 3% mean performance improvement."
            source="Bosquet, L., et al. (2007). Effects of Tapering on Performance: A Meta-Analysis. Medicine & Science in Sports & Exercise, 39(8), 1358-1365."
          />
        </Section>
      )}

      {/* References */}
      <Section title="References">
        <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
          <p>Achten, J. & Jeukendrup, A. (2003). Heart Rate Monitoring: Applications and Limitations. <em>Sports Medicine</em>, 33(7), 517-538.</p>
          {ctx?.taper && <p>Bosquet, L., et al. (2007). Effects of Tapering on Performance: A Meta-Analysis. <em>Medicine & Science in Sports & Exercise</em>, 39(8), 1358-1365.</p>}
          {(ctx ? ctx.hasPoles : true) && <p>Giandolini, M., et al. (2019). Trekking Poles and Uphill Walking. <em>Medicine & Science in Sports & Exercise</em>, 51(6S), 247.</p>}
          <p>Hawley, J.A. (2008). Specificity of Training Adaptation. <em>Journal of Sports Sciences</em>, 26(S1).</p>
          <p>House, S., Johnston, S., & Jornet, K. (2019). <em>Training for the Uphill Athlete</em>. Patagonia Books.</p>
          {ctx?.recoveryWeek && <p>Meeusen, R., et al. (2013). Prevention of Overtraining Syndrome. <em>Medicine & Science in Sports & Exercise</em>, 45(1), 186-205.</p>}
          <p>Seiler, S. (2010). Training Intensity and Duration Distribution. <em>IJSPP</em>, 5(3), 276-291.</p>
          {(ctx?.eccentricFocus ?? true) && <p>Toyomura, J., et al. (2018). Eccentric Training and Downhill Running. <em>European Journal of Sport Science</em>, 18(10).</p>}
          {ctx?.methodName && ctx.methodKeyBook && <p>{ctx.methodCoach ?? ctx.methodName}. <em>{ctx.methodKeyBook}</em>.</p>}
        </div>
      </Section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Default fallback copy (used when no plan is supplied)
// ---------------------------------------------------------------------------

const DEFAULT_INTRO =
  'This plan is built on proven endurance training principles from Uphill Athlete, ' +
  'TrainingPeaks methodology, and sport-specific research for trail and mountain racing.'

const DEFAULT_PERIODIZATION_SUMMARY =
  'The plan follows a linear periodization model adapted for trail racing: ' +
  'volume and intensity increase progressively, with a deliberate recovery week ' +
  'and a taper before race day.'

const DEFAULT_PERIODIZATION_ATTRIBUTION =
  "This structure is based on the work of Tudor Bompa, who pioneered periodization in sport training, " +
  "and adapted for mountain endurance by Steve House and Scott Johnston in Training for the Uphill Athlete (2019)."

const DEFAULT_SPECIFICITY_INTRO =
  'The plan progressively builds the specific demands of the race.'

const DEFAULT_PHASES: MethodologyPhase[] = [
  { id: 'base', label: 'Base', weekStart: 1, weekEnd: 3, widthPct: 30 },
  { id: 'build', label: 'Build', weekStart: 4, weekEnd: 6, widthPct: 30 },
  { id: 'peak', label: 'Peak', weekStart: 7, weekEnd: 8, widthPct: 20 },
  { id: 'taper', label: 'Taper', weekStart: 9, weekEnd: 10, widthPct: 20 },
]

// ---------------------------------------------------------------------------
// Copy builders driven by the methodology context
// ---------------------------------------------------------------------------

function buildIntro(ctx: MethodologyContext): string {
  const weeks = `${ctx.totalWeeks}-week`
  const distance = ctx.raceDistance ? ` for the ${ctx.raceName || ctx.raceDistance}` : ''
  const methodPart = ctx.methodName
    ? ` Built on the ${ctx.methodName} method (${ctx.methodCoach ?? 'principles'}).`
    : ' Built on proven endurance training principles from Uphill Athlete and TrainingPeaks methodology.'
  return `This ${weeks} plan${distance} is structured around four phases.` + methodPart
}

interface PeriodizationCopy {
  summary: string
  attribution: string
}

function buildPeriodizationCopy(ctx: MethodologyContext): PeriodizationCopy {
  const recoveryNote = ctx.recoveryWeek
    ? `, with a deliberate recovery week (Week ${ctx.recoveryWeek.num})`
    : ''
  const taperNote = ctx.taper
    ? ` and a ${ctx.taper.endWeek - ctx.taper.startWeek + 1}-week taper (${formatWeekRange(ctx.taper.startWeek, ctx.taper.endWeek)}) before race day`
    : ' and a taper before race day'
  const summary =
    `The plan follows a linear periodization model adapted for trail racing: ` +
    `volume and intensity increase progressively${recoveryNote}${taperNote}.`

  const attribution = ctx.methodPhilosophy
    ? `Periodization theory from Tudor Bompa is layered with the ${ctx.methodName ?? 'selected'} ` +
      `methodology: ${ctx.methodPhilosophy}`
    : DEFAULT_PERIODIZATION_ATTRIBUTION

  return { summary, attribution }
}

function buildSpecificityCopy(ctx: MethodologyContext): { intro: string } {
  const elev = ctx.raceElevation ? ` features ${ctx.raceElevation}` : ''
  const range = ctx.raceElevationRange ? ` at altitude (${ctx.raceElevationRange})` : ''
  const name = ctx.raceName || ctx.raceDistance
  const intro = `${name}${elev}${range}. The plan progressively builds these specific demands:`
  return { intro }
}

function describePhase(phase: MethodologyPhase, ctx: MethodologyContext | null): string {
  const bits: string[] = []
  if (phase.id === 'base') bits.push('Base aerobic fitness')
  if (phase.id === 'build') bits.push('Race-specific intensity')
  if (phase.id === 'peak') bits.push('Peak volume')
  if (phase.id === 'taper') bits.push('Volume drops, sharpness maintained')

  if (phase.vertRangeFt) {
    bits.push(`long runs ${formatVertRange(phase.vertRangeFt)}`)
  }
  if (phase.introducesPoles && ctx?.polesStartWeek && phase.weekStart <= ctx.polesStartWeek && ctx.polesStartWeek <= phase.weekEnd) {
    bits.push('poles introduced')
  }
  if (phase.id === 'build' && ctx?.eccentricFocus) {
    bits.push('eccentric strength')
  }
  return bits.join(' • ')
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700 dark:bg-slate-900 transition-colors"
      >
        <h3 className="text-base font-bold text-slate-800 dark:text-white">{title}</h3>
        <span className="text-sm text-teal-600 ml-2 shrink-0">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 text-base text-slate-700 dark:text-slate-200 space-y-2 border-t border-slate-100 dark:border-slate-700 pt-3">
          {children}
        </div>
      )}
    </div>
  )
}

function Citation({ text, source }: { text: string; source: string }) {
  return (
    <blockquote className="bg-slate-50 dark:bg-slate-900 rounded-xl p-3 border-l-4 border-teal-500 my-2">
      <p className="text-base text-slate-700 dark:text-slate-200 italic">"{text}"</p>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">— {source}</p>
    </blockquote>
  )
}

const PHASE_COLORS: Record<MethodologyPhase['id'], string> = {
  base: 'bg-green-400',
  build: 'bg-amber-400',
  peak: 'bg-red-400',
  taper: 'bg-blue-400',
}

function PhaseBar({ phases }: { phases: MethodologyPhase[] }) {
  if (phases.length === 0) return null
  // Renormalize widths so they always sum to 100 even with rounding drift.
  const total = phases.reduce((s, p) => s + p.widthPct, 0) || 100
  return (
    <div className="my-3">
      <div className="flex rounded-lg overflow-hidden h-7">
        {phases.map(p => (
          <div
            key={p.id}
            className={`${PHASE_COLORS[p.id]} flex items-center justify-center`}
            style={{ width: `${(p.widthPct / total) * 100}%` }}
          >
            <span className="text-xs font-bold text-white">{p.label}</span>
          </div>
        ))}
      </div>
      <div className="flex mt-1">
        {phases.map(p => (
          <div
            key={p.id}
            className="text-center text-xs text-slate-500 dark:text-slate-400"
            style={{ width: `${(p.widthPct / total) * 100}%` }}
          >
            {formatWeekRange(p.weekStart, p.weekEnd)}
          </div>
        ))}
      </div>
    </div>
  )
}
