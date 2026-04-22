import { useState } from 'react'
import type { RaceType, ExperienceLevel, WearableType, OnboardingConfig } from '../hooks/useOnboarding'

interface Props {
  onComplete: (config: OnboardingConfig) => void
  onSkip?: () => void
}

const TOTAL_STEPS = 7

export default function Onboarding({ onComplete, onSkip }: Props) {
  const [step, setStep] = useState(0)
  const [raceType, setRaceType] = useState<RaceType | null>(null)
  const [raceName, setRaceName] = useState('')
  const [raceDate, setRaceDate] = useState('')
  const [experience, setExperience] = useState<ExperienceLevel | null>(null)
  const [daysPerWeek, setDaysPerWeek] = useState<number | null>(null)
  const [longRunDay, setLongRunDay] = useState<string | null>(null)
  const [weakStation, setWeakStation] = useState<string | null>(null)
  const [wearable, setWearable] = useState<WearableType | null>(null)
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [maxHR, setMaxHR] = useState('')

  const next = () => setStep(s => Math.min(s + 1, TOTAL_STEPS - 1))
  const back = () => setStep(s => Math.max(s - 1, 0))

  const canContinue = (() => {
    switch (step) {
      case 0: return !!raceType
      case 1: return raceName.trim().length > 0
      case 2: return !!experience
      case 3: return !!daysPerWeek
      case 4: return raceType === 'trail' ? !!longRunDay : raceType === 'hyrox' ? !!weakStation : true
      case 5: return !!wearable
      case 6: return name.trim().length > 0 && age.trim().length > 0
      default: return false
    }
  })()

  const handleComplete = () => {
    const ageNum = parseInt(age) || 30
    onComplete({
      raceType: raceType!,
      raceName: raceName.trim(),
      raceDate,
      experienceLevel: experience!,
      trainingDaysPerWeek: daysPerWeek!,
      longRunDay: longRunDay ?? undefined,
      weakStation: weakStation ?? undefined,
      wearable: wearable || 'none',
      athleteName: name.trim(),
      age: ageNum,
      maxHR: maxHR ? parseInt(maxHR) : 220 - ageNum,
      completedAt: '',
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <button onClick={step > 0 ? back : undefined} className={`w-8 h-8 flex items-center justify-center ${step > 0 ? 'text-slate-600' : 'text-transparent'}`}>
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 4L7 10l8 6" /></svg>
        </button>
        {/* Progress bar */}
        <div className="flex-1 mx-4 h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full bg-teal-500 rounded-full transition-all duration-300" style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }} />
        </div>
        {onSkip && (
          <button onClick={onSkip} className="w-8 h-8 flex items-center justify-center text-slate-400">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l10 10M14 4L4 14" /></svg>
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-24">
        {step === 0 && (
          <StepContainer title="What are you training for?" subtitle="Pick the type that matches your goal">
            <OptionCard selected={raceType === 'trail'} onClick={() => setRaceType('trail')} title="Trail / Road Race" desc="Sky races, ultras, marathons, half marathons, 10K, 5K" icon="mountain" />
            <OptionCard selected={raceType === 'hyrox'} onClick={() => setRaceType('hyrox')} title="Hyrox" desc="8 stations + 8km running. Functional fitness racing." icon="hyrox" />
            <OptionCard selected={raceType === 'general'} onClick={() => setRaceType('general')} title="General Fitness" desc="No specific race. Build endurance, strength, and health." icon="general" />
          </StepContainer>
        )}

        {step === 1 && (
          <StepContainer title={raceType === 'general' ? 'Give your training plan a name' : 'Tell us about your race'} subtitle={raceType === 'general' ? 'Something to keep you motivated' : 'We\'ll build your plan around race day'}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{raceType === 'general' ? 'Plan name' : 'Race name'}</label>
                <input
                  type="text"
                  value={raceName}
                  onChange={e => setRaceName(e.target.value)}
                  placeholder={raceType === 'hyrox' ? 'e.g. Hyrox San Francisco' : raceType === 'trail' ? 'e.g. Broken Arrow Skyrace 18K' : 'e.g. Summer Fitness Block'}
                  className="w-full px-3 py-3 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {raceType === 'general' ? 'Target date (optional)' : 'Race date'}
                </label>
                <input
                  type="date"
                  value={raceDate}
                  onChange={e => setRaceDate(e.target.value)}
                  className="w-full px-3 py-3 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
              </div>
            </div>
          </StepContainer>
        )}

        {step === 2 && (
          <StepContainer title="How would you rate your fitness?" subtitle="Pick the level that suits you best (you can change this later)">
            <OptionCard selected={experience === 'beginner'} onClick={() => setExperience('beginner')} title="Beginner"
              desc={raceType === 'hyrox' ? 'New to functional fitness. Can run 2-3 miles.' : 'You can complete a 3mi run without stopping, in under 60 minutes'} />
            <OptionCard selected={experience === 'intermediate'} onClick={() => setExperience('intermediate')} title="Intermediate"
              desc={raceType === 'hyrox' ? 'Regular gym-goer. Comfortable with most exercises. Run 3-5 miles.' : 'You regularly run at least 3mi but don\'t structure your training'} />
            <OptionCard selected={experience === 'advanced'} onClick={() => setExperience('advanced')} title="Advanced"
              desc={raceType === 'hyrox' ? 'Experienced with CrossFit or functional training. Run 5+ miles.' : 'You regularly run at least 6mi and do structured training (intervals, tempo)'} />
            <OptionCard selected={experience === 'elite'} onClick={() => setExperience('elite')} title="Elite"
              desc={raceType === 'hyrox' ? 'Competitive Hyrox finisher or high-level CrossFit athlete.' : 'You regularly run half-marathons or further with structured periodization'} />
          </StepContainer>
        )}

        {step === 3 && (
          <StepContainer title="How many days per week do you want to train?" subtitle="This should be at most one more than you currently train to reduce injury risk">
            {[3, 4, 5, 6].map(n => (
              <OptionCard key={n} selected={daysPerWeek === n} onClick={() => setDaysPerWeek(n)} title={`${n} Days`}
                desc={n === 3 ? 'Minimum effective dose. Great for busy schedules.' : n === 4 ? 'Balanced. Most popular choice.' : n === 5 ? 'Solid volume. Includes dedicated recovery.' : 'High commitment. For experienced athletes.'} />
            ))}
          </StepContainer>
        )}

        {step === 4 && raceType === 'trail' && (
          <StepContainer title="Which day do you want to do your long runs?" subtitle="Choose one to continue">
            {['Saturday', 'Sunday', 'Tuesday', 'Friday'].map(d => (
              <OptionCard key={d} selected={longRunDay === d} onClick={() => setLongRunDay(d)} title={d} />
            ))}
          </StepContainer>
        )}

        {step === 4 && raceType === 'hyrox' && (
          <StepContainer title="Which station do you find hardest?" subtitle="We'll give it extra focus in your plan">
            {['SkiErg', 'Sled Push', 'Sled Pull', 'Burpee Broad Jump', 'Rowing', 'Farmer Carry', 'Sandbag Lunges', 'Wall Balls'].map(s => (
              <OptionCard key={s} selected={weakStation === s} onClick={() => setWeakStation(s)} title={s} />
            ))}
          </StepContainer>
        )}

        {step === 4 && raceType === 'general' && (
          <StepContainer title="Which day do you prefer for your longest workout?" subtitle="Choose one to continue">
            {['Saturday', 'Sunday', 'Tuesday', 'Friday'].map(d => (
              <OptionCard key={d} selected={longRunDay === d} onClick={() => setLongRunDay(d)} title={d} />
            ))}
          </StepContainer>
        )}

        {step === 5 && (
          <StepContainer title="What wearable do you use?" subtitle="We'll pull heart rate, sleep, and recovery data from your device">
            <OptionCard selected={wearable === 'garmin'} onClick={() => setWearable('garmin')} title="Garmin Watch" desc="Syncs HR, HRV, sleep, body battery, and activities directly." icon="garmin" />
            <OptionCard selected={wearable === 'apple_watch'} onClick={() => setWearable('apple_watch')} title="Apple Watch" desc="Syncs HRV, resting HR, and sleep via the companion iOS app." icon="apple" />
            <OptionCard selected={wearable === 'oura'} onClick={() => setWearable('oura')} title="Oura Ring" desc="Syncs HRV, resting HR, and sleep via Apple Health + iOS app." icon="oura" />
            <OptionCard selected={wearable === 'none'} onClick={() => setWearable('none')} title="No wearable" desc="You can still log workouts manually and use the coach." />
          </StepContainer>
        )}

        {step === 6 && (
          <StepContainer title="Almost done! Tell us about yourself." subtitle="This helps us personalize your plan">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Jenn"
                  className="w-full px-3 py-3 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Age</label>
                <input
                  type="number"
                  value={age}
                  onChange={e => setAge(e.target.value)}
                  placeholder="e.g. 41"
                  className="w-full px-3 py-3 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Max Heart Rate (optional)</label>
                <input
                  type="number"
                  value={maxHR}
                  onChange={e => setMaxHR(e.target.value)}
                  placeholder={age ? `Estimated: ${220 - parseInt(age)} bpm` : 'We\'ll estimate from your age'}
                  className="w-full px-3 py-3 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
                {age && !maxHR && (
                  <p className="text-xs text-slate-400 mt-1">Using estimated max HR: {220 - (parseInt(age) || 30)} bpm (220 - age)</p>
                )}
              </div>
            </div>
          </StepContainer>
        )}
      </div>

      {/* Continue button */}
      <div className="fixed bottom-0 left-0 right-0 px-5 py-4 bg-white border-t border-slate-100">
        <button
          onClick={step === TOTAL_STEPS - 1 ? handleComplete : next}
          disabled={!canContinue}
          className={`w-full py-3.5 rounded-xl text-base font-semibold transition ${
            canContinue
              ? 'bg-teal-600 text-white active:bg-teal-700'
              : 'bg-slate-200 text-slate-400'
          }`}
        >
          {step === TOTAL_STEPS - 1 ? 'Create My Plan' : 'Continue'}
        </button>
      </div>
    </div>
  )
}

function StepContainer({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 leading-tight">{title}</h1>
      {subtitle && <p className="text-sm text-slate-500 mt-1 mb-5">{subtitle}</p>}
      <div className="space-y-3 mt-4">{children}</div>
    </div>
  )
}

function OptionCard({ selected, onClick, title, desc, icon }: {
  selected: boolean; onClick: () => void; title: string; desc?: string; icon?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-xl border-2 transition ${
        selected
          ? 'border-teal-500 bg-teal-50'
          : 'border-slate-200 bg-slate-50 hover:border-slate-300'
      }`}
    >
      <div className="flex items-start gap-3">
        {icon && (
          <span className="text-2xl mt-0.5">
            {icon === 'mountain' ? '🏔' : icon === 'hyrox' ? '🏋️' : icon === 'general' ? '💪' : icon === 'garmin' ? '⌚' : icon === 'apple' ? '⌚' : icon === 'oura' ? '💍' : ''}
          </span>
        )}
        <div className="flex-1">
          <p className={`font-semibold ${selected ? 'text-teal-800' : 'text-slate-800'}`}>{title}</p>
          {desc && <p className="text-sm text-slate-500 mt-0.5">{desc}</p>}
        </div>
        <div className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center shrink-0 ${
          selected ? 'border-teal-500 bg-teal-500' : 'border-slate-300'
        }`}>
          {selected && <svg width="12" height="12" fill="white" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" /></svg>}
        </div>
      </div>
    </button>
  )
}
