import { useEffect, useRef, useState } from 'react'
import type {
  RaceType,
  GeneralGoal,
  CardioModality,
  RaceDistance,
  ExperienceLevel,
  WearableType,
  OnboardingConfig,
  FitnessAnchorType,
  InjuryStatus,
  StrengthExperience,
  EquipmentAccess,
  CrossTrainingMode,
  TrainingTimeOfDay,
} from '../hooks/useOnboarding'
import { DETAIL_LEVELS, type DetailLevel } from '../types'
import { parseTimeToSeconds } from '../utils/parseTime'

interface Props {
  onComplete: (config: OnboardingConfig) => void
  onSkip?: () => void
  // Duration (ms) to show the "generating your plan" screen after the user
  // submits. Defaults to a short delay so the handoff to the next screen
  // doesn't feel like a blank flash. Tests pass 0 to call onComplete
  // synchronously.
  loadingDurationMs?: number
}

const GENERATING_MESSAGES = [
  'Lacing up your virtual shoes...',
  'Negotiating with your VO₂ max...',
  'Asking the trail gods for permission...',
  'Brewing a fresh batch of intervals...',
  'Counting hills so you don\'t have to...',
  'Plotting your path to the finish line...',
  'Sweet-talking your hamstrings...',
  'Stretching the calendar to fit your goals...',
] as const

// Step indices. Race-distance (step 2) is conditional — only shown for trail/road races.
// For hyrox/general, navigation skips index 2 (see visibleSteps below).
const STEP_RACE_TYPE = 0
const STEP_RACE_NAME = 1
const STEP_RACE_DISTANCE = 2
const STEP_EXPERIENCE = 3
const STEP_DETAIL = 4
const STEP_DAYS = 5
const STEP_VARIANT = 6
const STEP_BASELINE = 7
const STEP_EQUIPMENT = 8
const STEP_STRENGTH = 9
const STEP_SCHEDULE = 10
const STEP_WEARABLE = 11
const STEP_PROFILE = 12
const STEP_REVIEW = 13
// General-fitness goal step (raceType === 'general' only). Kept out of the 0-13
// range so existing step IDs are untouched; order comes from ALL_STEPS, and all
// navigation/progress is index-based (visibleSteps.indexOf), not value-based.
const STEP_GENERAL_GOAL = 14
const STEP_GENERAL_CARDIO = 15

const ALL_STEPS = [
  STEP_RACE_TYPE,
  STEP_RACE_NAME,
  STEP_RACE_DISTANCE,
  STEP_GENERAL_GOAL,
  STEP_GENERAL_CARDIO,
  STEP_EXPERIENCE,
  STEP_DETAIL,
  STEP_DAYS,
  STEP_VARIANT,
  STEP_BASELINE,
  STEP_EQUIPMENT,
  STEP_STRENGTH,
  STEP_SCHEDULE,
  STEP_WEARABLE,
  STEP_PROFILE,
  STEP_REVIEW,
] as const

const DISTANCE_OPTIONS: ReadonlyArray<{ value: RaceDistance; label: string; desc: string }> = [
  { value: '5k',             label: '5K',              desc: '3.1 mi · short, sharp, speed-focused' },
  { value: '10k',            label: '10K',             desc: '6.2 mi · threshold + speed' },
  { value: 'half_marathon',  label: 'Half Marathon',   desc: '13.1 mi · endurance + threshold' },
  { value: 'marathon',       label: 'Marathon',        desc: '26.2 mi · pure aerobic endurance' },
  { value: '50k',            label: '50K Ultra',       desc: '31 mi · ultra entry distance' },
  { value: '50_mile',        label: '50 Mile',         desc: '50 mi · ultra endurance' },
  { value: '100k',           label: '100K',            desc: '62 mi · long-format ultra' },
  { value: '100_mile',       label: '100 Mile',        desc: '100 mi · all-day-and-night ultra' },
  { value: 'mountain_ultra', label: 'Mountain Ultra',  desc: 'Vertical-heavy, technical terrain' },
]

const ANCHOR_OPTIONS: { value: FitnessAnchorType; label: string; placeholder: string; kind: 'time' | 'bpm' | 'none' }[] = [
  { value: 'race_5k', label: 'Recent 5K time', placeholder: 'mm:ss', kind: 'time' },
  { value: 'race_10k', label: 'Recent 10K time', placeholder: 'mm:ss or hh:mm:ss', kind: 'time' },
  { value: 'race_hm', label: 'Half marathon time', placeholder: 'hh:mm:ss', kind: 'time' },
  { value: 'race_marathon', label: 'Marathon time', placeholder: 'hh:mm:ss', kind: 'time' },
  { value: 'easy_pace', label: 'Self-reported easy pace (per mile)', placeholder: 'mm:ss', kind: 'time' },
  { value: 'lthr', label: 'Lactate threshold HR (LTHR)', placeholder: 'bpm', kind: 'bpm' },
  { value: 'none', label: "I don't know yet", placeholder: '', kind: 'none' },
]

const EQUIPMENT_OPTIONS: { value: EquipmentAccess; label: string; desc: string; icon: string }[] = [
  { value: 'track', label: 'Track', desc: 'Measured intervals, repeats', icon: '🏟' },
  { value: 'hills', label: 'Hills', desc: 'For climbs, hill repeats', icon: '⛰' },
  { value: 'trails', label: 'Trails', desc: 'Off-road running', icon: '🌲' },
  { value: 'treadmill', label: 'Treadmill', desc: 'Indoor running', icon: '🏃' },
  { value: 'gym', label: 'Gym', desc: 'Strength + functional work', icon: '🏋️' },
]

const CROSS_TRAINING_OPTIONS: { value: CrossTrainingMode; label: string; icon: string }[] = [
  { value: 'cycling', label: 'Cycling', icon: '🚴' },
  { value: 'swimming', label: 'Swimming', icon: '🏊' },
  { value: 'rowing', label: 'Rowing', icon: '🚣' },
  { value: 'hiking', label: 'Hiking', icon: '🥾' },
  { value: 'yoga', label: 'Yoga / Mobility', icon: '🧘' },
]

const STRENGTH_EXPERIENCE_OPTIONS: { value: StrengthExperience; label: string; desc: string }[] = [
  { value: 'new', label: 'New to lifting', desc: "Little or no weight training. We'll start light and build form first." },
  { value: 'recreational', label: 'Some experience', desc: 'You lift occasionally and know the basic movements.' },
  { value: 'experienced', label: 'Experienced lifter', desc: 'You train with weights regularly and know your working loads.' },
]

const INJURY_AREA_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Select area (optional)' },
  { value: 'knee', label: 'Knee' },
  { value: 'achilles_calf', label: 'Achilles / calf' },
  { value: 'hamstring', label: 'Hamstring' },
  { value: 'hip', label: 'Hip / glute' },
  { value: 'foot', label: 'Foot / plantar' },
  { value: 'shin', label: 'Shin' },
  { value: 'it_band', label: 'IT band' },
  { value: 'back', label: 'Back' },
  { value: 'other', label: 'Other' },
]

const RETURNING_TIMEFRAME_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'When were you cleared? (optional)' },
  { value: 'Cleared this week', label: 'This week' },
  { value: 'Cleared 1-2 weeks ago', label: '1–2 weeks ago' },
  { value: 'Cleared 3-4 weeks ago', label: '3–4 weeks ago' },
  { value: 'Cleared over a month ago', label: 'Over a month ago' },
]

const CURRENT_TIMEFRAME_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'How long has it been going on? (optional)' },
  { value: 'Less than a week', label: 'Less than a week' },
  { value: '1-2 weeks', label: '1–2 weeks' },
  { value: '3-4 weeks', label: '3–4 weeks' },
  { value: 'Over a month', label: 'Over a month' },
]

const TIME_OF_DAY_OPTIONS: { value: TrainingTimeOfDay; label: string; desc: string }[] = [
  { value: 'early_am', label: 'Early morning', desc: 'Before 7am' },
  { value: 'morning', label: 'Morning', desc: '7am – 11am' },
  { value: 'midday', label: 'Midday', desc: '11am – 2pm' },
  { value: 'afternoon', label: 'Afternoon', desc: '2pm – 5pm' },
  { value: 'evening', label: 'Evening', desc: 'After 5pm' },
]

export default function Onboarding({ onComplete, onSkip, loadingDurationMs = 1800 }: Props) {
  const [step, setStep] = useState(0)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatingMessage] = useState(
    () => GENERATING_MESSAGES[Math.floor(Math.random() * GENERATING_MESSAGES.length)],
  )
  const [raceType, setRaceType] = useState<RaceType | null>(null)
  const [raceName, setRaceName] = useState('')
  const [raceDate, setRaceDate] = useState('')
  const [raceDistance, setRaceDistance] = useState<RaceDistance | null>(null)
  const [generalGoal, setGeneralGoal] = useState<GeneralGoal | null>(null)
  const [cardioModality, setCardioModality] = useState<CardioModality | null>(null)
  const [raceDescription, setRaceDescription] = useState('')
  const [athleteGoal, setAthleteGoal] = useState('')
  const [experience, setExperience] = useState<ExperienceLevel | null>(null)
  const [detailLevel, setDetailLevel] = useState<DetailLevel | null>(null)
  const [daysPerWeek, setDaysPerWeek] = useState<number | null>(null)
  const [longRunDay, setLongRunDay] = useState<string | null>(null)
  const [weakStation, setWeakStation] = useState<string | null>(null)
  const [wearable, setWearable] = useState<WearableType | null>(null)
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [maxHR, setMaxHR] = useState('')
  const [ftp, setFtp] = useState('')

  // Fitness baseline + constraints
  const [anchorType, setAnchorType] = useState<FitnessAnchorType>('none')
  const [anchorTime, setAnchorTime] = useState('')
  const [anchorBpm, setAnchorBpm] = useState('')
  const [weeklyMileage, setWeeklyMileage] = useState('')
  const [injury, setInjury] = useState<InjuryStatus | null>(null)
  const [injuryArea, setInjuryArea] = useState('')
  const [injuryTimeframe, setInjuryTimeframe] = useState('')
  const [injuryNote, setInjuryNote] = useState('')
  const [equipment, setEquipment] = useState<EquipmentAccess[]>([])
  const [strengthDays, setStrengthDays] = useState<number | null>(null)
  const [strengthExperience, setStrengthExperience] = useState<StrengthExperience | null>(null)
  const [crossTraining, setCrossTraining] = useState<CrossTrainingMode[]>([])
  const [crossDays, setCrossDays] = useState<number | null>(null)
  const [trainingTimes, setTrainingTimes] = useState<TrainingTimeOfDay[]>([])
  const [scheduleNote, setScheduleNote] = useState('')

  // Ref on the inner scrollable content area. Without resetting its
  // scrollTop on step change, a previous step that overflowed (e.g. the
  // race-type cards on a short phone) leaves the container scrolled down,
  // and the next step's shorter content paints above the visible window —
  // the user sees a blank white screen even though the markup is there.
  const contentRef = useRef<HTMLDivElement | null>(null)

  // Race-distance step only shows for trail/road races (hyrox is a fixed format,
  // general fitness has no target distance). The general-goal step is the mirror
  // image — shown only for general fitness.
  const showsDistanceStep = raceType === 'trail'
  const showsGoalStep = raceType === 'general'
  const visibleSteps: readonly number[] = ALL_STEPS.filter(s => {
    if (s === STEP_RACE_DISTANCE) return showsDistanceStep
    if (s === STEP_GENERAL_GOAL) return showsGoalStep
    if (s === STEP_GENERAL_CARDIO) return showsGoalStep
    return true
  })
  const visibleIdx = visibleSteps.indexOf(step)
  const isLastStep = visibleIdx === visibleSteps.length - 1

  // iOS Safari scrolls the document up when an input is focused so the keyboard
  // doesn't cover it. That scroll offset survives the step change, so the next
  // step's content (which mounts inside our `fixed inset-0` overlay) ends up
  // above the visible viewport — the user sees a blank screen with only the
  // header and Continue button. Blur the active input and reset window scroll
  // every time `step` changes so each new step paints in the visible area.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const active = document.activeElement as HTMLElement | null
      if (active && typeof active.blur === 'function') active.blur()
    }
    if (typeof window !== 'undefined') window.scrollTo(0, 0)
    // The inner scrollable container keeps its scrollTop across step
    // changes; reset it so each new step paints at the top of the
    // visible viewport rather than wherever the previous step was
    // scrolled to.
    if (contentRef.current) contentRef.current.scrollTop = 0
  }, [step])

  // Pre-select a sensible detail level from the experience answer (derived,
  // not stored) so the question comes up pre-filled but stays overridable —
  // a manual pick in `detailLevel` always wins.
  const effectiveDetail: DetailLevel = detailLevel ?? defaultDetailLevel(experience)

  const next = () => {
    if (visibleIdx < visibleSteps.length - 1) {
      setStep(visibleSteps[visibleIdx + 1])
    }
  }
  const back = () => {
    if (visibleIdx > 0) {
      setStep(visibleSteps[visibleIdx - 1])
    }
  }

  const toggleEquipment = (e: EquipmentAccess) => {
    setEquipment(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e])
  }
  const toggleCrossTraining = (m: CrossTrainingMode) => {
    setCrossTraining(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])
  }
  const toggleTrainingTime = (t: TrainingTimeOfDay) => {
    setTrainingTimes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  const canContinue = (() => {
    switch (step) {
      case STEP_RACE_TYPE: return !!raceType
      case STEP_RACE_NAME: return raceName.trim().length > 0 && raceDescription.trim().length >= 10 && athleteGoal.trim().length > 0
      case STEP_RACE_DISTANCE: return !!raceDistance
      case STEP_GENERAL_GOAL: return !!generalGoal
      case STEP_GENERAL_CARDIO: return !!cardioModality
      case STEP_EXPERIENCE: return !!experience
      case STEP_DETAIL: return !!effectiveDetail
      case STEP_DAYS: return !!daysPerWeek
      case STEP_VARIANT: return raceType === 'trail' ? !!longRunDay : raceType === 'hyrox' ? !!weakStation : !!longRunDay
      case STEP_BASELINE: return !!injury // anchor + mileage are optional; injury is the gating answer
      case STEP_EQUIPMENT: return equipment.length > 0
      case STEP_STRENGTH:
        // Strength frequency is required. Cross-training frequency is also
        // required (None is a valid answer); modalities are required only
        // when crossDays > 0. Lifting background is required only when the
        // athlete asked for at least one strength day.
        if (strengthDays === null) return false
        if (strengthDays > 0 && strengthExperience === null) return false
        if (crossDays === null) return false
        if (crossDays > 0 && crossTraining.length === 0) return false
        return true
      case STEP_SCHEDULE: return trainingTimes.length > 0 // schedule note is optional
      case STEP_WEARABLE: return !!wearable
      case STEP_PROFILE: return name.trim().length > 0 && age.trim().length > 0
      case STEP_REVIEW: return true
      default: return false
    }
  })()

  const handleComplete = () => {
    const ageNum = parseInt(age) || 30
    const anchorOpt = ANCHOR_OPTIONS.find(o => o.value === anchorType)!
    let fitnessAnchor: OnboardingConfig['fitnessAnchor']
    if (anchorType !== 'none') {
      if (anchorOpt.kind === 'time') {
        const secs = parseTimeToSeconds(anchorTime)
        if (secs) fitnessAnchor = { type: anchorType, valueSeconds: secs }
      } else if (anchorOpt.kind === 'bpm') {
        const bpm = parseInt(anchorBpm)
        if (bpm > 0) fitnessAnchor = { type: anchorType, bpm }
      }
    }

    const config: OnboardingConfig = {
      raceType: raceType!,
      raceName: raceName.trim(),
      raceDate,
      raceDistance: showsDistanceStep ? (raceDistance ?? undefined) : undefined,
      generalGoal: showsGoalStep ? (generalGoal ?? undefined) : undefined,
      cardioModality: showsGoalStep ? (cardioModality ?? undefined) : undefined,
      raceDescription: raceDescription.trim() || undefined,
      athleteGoal: athleteGoal.trim() || undefined,
      experienceLevel: experience!,
      detailLevel: effectiveDetail,
      trainingDaysPerWeek: daysPerWeek!,
      longRunDay: longRunDay ?? undefined,
      weakStation: weakStation ?? undefined,
      wearable: wearable || 'none',
      athleteName: name.trim(),
      age: ageNum,
      maxHR: maxHR ? parseInt(maxHR) : 220 - ageNum,
      ftpWatts: ftp ? parseInt(ftp) : undefined,
      fitnessAnchor,
      currentWeeklyMileage: weeklyMileage ? parseFloat(weeklyMileage) : undefined,
      injuryStatus: injury ?? undefined,
      injuryArea: injury && injury !== 'none' && injuryArea ? injuryArea : undefined,
      injuryTimeframe: injury && injury !== 'none' && injuryTimeframe ? injuryTimeframe : undefined,
      injuryNote: injury && injury !== 'none' && injuryNote.trim() ? injuryNote.trim() : undefined,
      equipmentAccess: equipment.length > 0 ? equipment : undefined,
      strengthDaysPerWeek: strengthDays ?? undefined,
      strengthExperience: (strengthDays ?? 0) > 0 ? (strengthExperience ?? undefined) : undefined,
      crossTrainingModes: crossTraining.length > 0 ? crossTraining : undefined,
      crossTrainingDaysPerWeek: crossDays ?? undefined,
      preferredTrainingTimes: trainingTimes.length > 0 ? trainingTimes : undefined,
      scheduleConstraintsNote: scheduleNote.trim() || undefined,
      completedAt: '',
    }

    // Skip the loading screen entirely when consumers (tests) opt out.
    // Otherwise show a brief generating screen so the handoff to the next
    // view doesn't feel like a blank flash on mobile browsers.
    if (loadingDurationMs <= 0) {
      onComplete(config)
      return
    }
    // iOS Safari leaves the document scrolled after a focused form input,
    // which would push the next overlay above the viewport. Blur the
    // active element and reset scroll BEFORE the loading screen mounts so
    // the first paint already lands in the visible viewport.
    if (typeof document !== 'undefined') {
      const active = document.activeElement as HTMLElement | null
      if (active && typeof active.blur === 'function') active.blur()
    }
    if (typeof window !== 'undefined') window.scrollTo(0, 0)
    setIsGenerating(true)
    setTimeout(() => onComplete(config), loadingDurationMs)
  }

  const selectedAnchor = ANCHOR_OPTIONS.find(o => o.value === anchorType)!

  if (isGenerating) {
    return <GeneratingScreen message={generatingMessage} />
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <button onClick={visibleIdx > 0 ? back : undefined} className={`w-8 h-8 flex items-center justify-center ${visibleIdx > 0 ? 'text-slate-600' : 'text-transparent'}`}>
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 4L7 10l8 6" /></svg>
        </button>
        {/* Progress bar */}
        <div className="flex-1 mx-4 h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full bg-teal-500 rounded-full transition-all duration-300" style={{ width: `${((visibleIdx + 1) / visibleSteps.length) * 100}%` }} />
        </div>
        {onSkip && (
          <button onClick={onSkip} className="w-8 h-8 flex items-center justify-center text-slate-400">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l10 10M14 4L4 14" /></svg>
          </button>
        )}
      </div>

      {/* Content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto px-5 pt-4 pb-24">
        {step === STEP_RACE_TYPE && (
          <StepContainer title="What are you training for?" subtitle="Pick the type that matches your goal">
            <OptionCard selected={raceType === 'trail'} onClick={() => setRaceType('trail')} title="Trail / Road Race" desc="Sky races, ultras, marathons, half marathons, 10K, 5K" icon="mountain" />
            <OptionCard selected={raceType === 'hyrox'} onClick={() => setRaceType('hyrox')} title="Hyrox" desc="8 stations + 8km running. Functional fitness racing." icon="hyrox" />
            <OptionCard selected={raceType === 'general'} onClick={() => setRaceType('general')} title="General Fitness" desc="No specific race. Build endurance, strength, and health." icon="general" />
          </StepContainer>
        )}

        {step === STEP_RACE_NAME && (
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
                {raceType === 'general' && (
                  <p className="text-xs text-slate-400 mt-1">
                    Leave blank for an ongoing rolling plan. Set a date to build toward it.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {raceType === 'general' ? 'Tell us about your situation & what you’re working toward' : 'Tell us about it — terrain, elevation, climate, the course'}
                </label>
                <textarea
                  value={raceDescription}
                  onChange={e => setRaceDescription(e.target.value)}
                  rows={3}
                  placeholder="Terrain, elevation, climate, the course, why it matters — anything helps"
                  className="w-full px-3 py-3 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
                />
                <p className="text-xs text-slate-400 mt-1">
                  At least 10 characters — the more your coach knows, the better your plan. ({raceDescription.trim().length}/10)
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {raceType === 'general' ? 'What’s your goal?' : 'What’s your goal for it?'}
                </label>
                <textarea
                  value={athleteGoal}
                  onChange={e => setAthleteGoal(e.target.value)}
                  rows={2}
                  placeholder="e.g. finish strong, a sub-4:00, top 10 — or just feel great"
                  className="w-full px-3 py-3 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
                />
              </div>
            </div>
          </StepContainer>
        )}

        {step === STEP_RACE_DISTANCE && showsDistanceStep && (
          <StepContainer title="What's your race distance?" subtitle="We'll match you with training methods designed for that distance">
            {DISTANCE_OPTIONS.map(opt => (
              <OptionCard
                key={opt.value}
                selected={raceDistance === opt.value}
                onClick={() => setRaceDistance(opt.value)}
                title={opt.label}
                desc={opt.desc}
              />
            ))}
          </StepContainer>
        )}

        {step === STEP_GENERAL_GOAL && (
          <StepContainer title="What's your main goal?" subtitle="We'll shape your plan around this — you can change it later">
            <OptionCard selected={generalGoal === 'stay_healthy'} onClick={() => setGeneralGoal('stay_healthy')} title="Stay Healthy & Fit" desc="Balanced cardio, strength, and mobility for overall health and longevity." icon="general" />
            <OptionCard selected={generalGoal === 'lose_fat'} onClick={() => setGeneralGoal('lose_fat')} title="Lose Fat" desc="Keep your muscle while leaning out — strength plus efficient cardio." icon="general" />
            <OptionCard selected={generalGoal === 'build_muscle'} onClick={() => setGeneralGoal('build_muscle')} title="Build Muscle" desc="Strength-focused with higher lifting volume; cardio kept for health." icon="general" />
            <OptionCard selected={generalGoal === 'build_endurance'} onClick={() => setGeneralGoal('build_endurance')} title="Build Endurance" desc="More aerobic volume and intervals, with strength to support it." icon="general" />
          </StepContainer>
        )}

        {step === STEP_GENERAL_CARDIO && (
          <StepContainer title="What's your main cardio?" subtitle="We'll build your aerobic and interval sessions around this">
            <OptionCard selected={cardioModality === 'running'} onClick={() => setCardioModality('running')} title="Running" desc="Road, trail, or treadmill." icon="general" />
            <OptionCard selected={cardioModality === 'cycling'} onClick={() => setCardioModality('cycling')} title="Cycling" desc="Outdoor or indoor bike. Low impact." icon="general" />
            <OptionCard selected={cardioModality === 'rowing'} onClick={() => setCardioModality('rowing')} title="Rowing" desc="Erg or water. Full-body, low impact." icon="general" />
            <OptionCard selected={cardioModality === 'swimming'} onClick={() => setCardioModality('swimming')} title="Swimming" desc="Pool or open water. Zero impact." icon="general" />
            <OptionCard selected={cardioModality === 'mixed'} onClick={() => setCardioModality('mixed')} title="Mix it up" desc="A blend — we'll vary your cardio across run, bike, and row." icon="general" />
          </StepContainer>
        )}

        {step === STEP_EXPERIENCE && (
          <StepContainer title="How would you rate your fitness?" subtitle="Pick the level that suits you best (you can change this later)">
            <OptionCard selected={experience === 'first_timer'} onClick={() => setExperience('first_timer')} title="First Timer"
              desc={raceType === 'hyrox' ? 'Never done Hyrox or functional fitness. May not run regularly yet.' : 'New to structured exercise. Building the habit.'} />
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

        {step === STEP_DETAIL && (
          <StepContainer title="How much detail do you want to see?" subtitle="Sets how much data and jargon the app shows you. You can change this anytime in Settings.">
            {DETAIL_LEVELS.map(opt => (
              <OptionCard
                key={opt.id}
                selected={effectiveDetail === opt.id}
                onClick={() => setDetailLevel(opt.id)}
                title={`${opt.emoji}  ${opt.label}`}
                desc={opt.desc}
              />
            ))}
          </StepContainer>
        )}

        {step === STEP_DAYS && (
          <StepContainer
            title="How many total days per week do you want to train?"
            subtitle="Includes runs, strength, and cross-training. Should be at most one more than you currently train."
          >
            {[3, 4, 5, 6, 7].map(n => (
              <OptionCard key={n} selected={daysPerWeek === n} onClick={() => setDaysPerWeek(n)} title={`${n} Days`}
                desc={n === 3 ? 'Minimum effective dose. Great for busy schedules.' : n === 4 ? 'Balanced. Most popular choice.' : n === 5 ? 'Solid volume. Includes dedicated recovery.' : n === 6 ? 'High commitment. For experienced athletes.' : 'Daily training. Requires careful recovery management.'} />
            ))}
          </StepContainer>
        )}

        {step === STEP_VARIANT && raceType === 'trail' && (
          <StepContainer title="Which day do you want to do your long runs?" subtitle="Choose one to continue">
            {['Saturday', 'Sunday', 'Tuesday', 'Friday'].map(d => (
              <OptionCard key={d} selected={longRunDay === d} onClick={() => setLongRunDay(d)} title={d} />
            ))}
          </StepContainer>
        )}

        {step === STEP_VARIANT && raceType === 'hyrox' && (
          <StepContainer title="Which station do you find hardest?" subtitle="We'll give it extra focus in your plan">
            {['SkiErg', 'Sled Push', 'Sled Pull', 'Burpee Broad Jump', 'Rowing', 'Farmer Carry', 'Sandbag Lunges', 'Wall Balls'].map(s => (
              <OptionCard key={s} selected={weakStation === s} onClick={() => setWeakStation(s)} title={s} />
            ))}
          </StepContainer>
        )}

        {step === STEP_VARIANT && raceType === 'general' && (
          <StepContainer title="Which day do you prefer for your longest workout?" subtitle="Choose one to continue">
            {['Saturday', 'Sunday', 'Tuesday', 'Friday'].map(d => (
              <OptionCard key={d} selected={longRunDay === d} onClick={() => setLongRunDay(d)} title={d} />
            ))}
          </StepContainer>
        )}

        {step === STEP_BASELINE && (
          <StepContainer title="Where are you right now?" subtitle="Your current fitness baseline. Anchor and mileage are optional but make your plan more accurate.">
            <div className="space-y-5">
              {/* Fitness anchor */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Fitness anchor (optional)</label>
                <select
                  value={anchorType}
                  onChange={e => setAnchorType(e.target.value as FitnessAnchorType)}
                  className="w-full px-3 py-3 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
                >
                  {ANCHOR_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {selectedAnchor.kind === 'time' && (
                  <input
                    type="text"
                    inputMode="numeric"
                    value={anchorTime}
                    onChange={e => setAnchorTime(e.target.value)}
                    placeholder={selectedAnchor.placeholder}
                    className="mt-2 w-full px-3 py-3 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                )}
                {selectedAnchor.kind === 'bpm' && (
                  <input
                    type="number"
                    value={anchorBpm}
                    onChange={e => setAnchorBpm(e.target.value)}
                    placeholder={selectedAnchor.placeholder}
                    className="mt-2 w-full px-3 py-3 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                )}
                <p className="text-xs text-slate-400 mt-1">Helps us set accurate paces and HR zones.</p>
              </div>

              {/* Weekly mileage */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Current weekly running mileage (optional)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={weeklyMileage}
                  onChange={e => setWeeklyMileage(e.target.value)}
                  placeholder="e.g. 20"
                  className="w-full px-3 py-3 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
                <p className="text-xs text-slate-400 mt-1">Sets a safe baseline so we don't ramp volume too fast.</p>
              </div>

              {/* Injury status — required */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Recent injury status</label>
                <div className="space-y-2">
                  <OptionCard selected={injury === 'none'} onClick={() => setInjury('none')} title="No injuries" desc="Healthy and ready to train." />
                  <OptionCard selected={injury === 'returning'} onClick={() => setInjury('returning')} title="Returning from injury" desc="Recently cleared. We'll ramp gently." />
                  <OptionCard selected={injury === 'current'} onClick={() => setInjury('current')} title="Currently injured" desc="We'll prioritize recovery & cross-training." />
                </div>

                {/* Injury follow-ups — only when returning/current. Optional,
                    but they let us shape the ramp and the coach's greeting to
                    the actual injury. */}
                {(injury === 'returning' || injury === 'current') && (
                  <div className="mt-3 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs text-amber-800">
                      A few details help us adapt your ramp and brief your coach. All optional.
                    </p>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">What area?</label>
                      <select
                        aria-label="Injury area"
                        value={injuryArea}
                        onChange={e => setInjuryArea(e.target.value)}
                        className="w-full px-3 py-2.5 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
                      >
                        {INJURY_AREA_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        {injury === 'returning' ? 'When were you cleared?' : 'How long has it been going on?'}
                      </label>
                      <select
                        aria-label="Injury timeframe"
                        value={injuryTimeframe}
                        onChange={e => setInjuryTimeframe(e.target.value)}
                        className="w-full px-3 py-2.5 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
                      >
                        {(injury === 'returning' ? RETURNING_TIMEFRAME_OPTIONS : CURRENT_TIMEFRAME_OPTIONS).map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Anything else we should know?</label>
                      <textarea
                        value={injuryNote}
                        onChange={e => setInjuryNote(e.target.value)}
                        placeholder="e.g. still some pain on downhills, cleared for flat running only"
                        rows={2}
                        className="w-full px-3 py-2.5 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </StepContainer>
        )}

        {step === STEP_EQUIPMENT && (
          <StepContainer title="What do you have access to?" subtitle="Select all that apply. We'll match workouts to your environment.">
            {EQUIPMENT_OPTIONS.map(opt => (
              <OptionCard
                key={opt.value}
                selected={equipment.includes(opt.value)}
                onClick={() => toggleEquipment(opt.value)}
                title={opt.label}
                desc={opt.desc}
                icon={opt.icon}
                multi
              />
            ))}
          </StepContainer>
        )}

        {step === STEP_STRENGTH && (
          <StepContainer title="Strength & cross-training" subtitle="Tell us how you want to round out your running.">
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Strength training per week</label>
                <div className="grid grid-cols-4 gap-2" data-testid="strength-frequency">
                  {[0, 1, 2, 3].map(n => (
                    <button
                      key={n}
                      aria-label={`Strength ${n === 0 ? 'None' : n === 3 ? '3+' : `${n}x`}`}
                      onClick={() => setStrengthDays(n)}
                      className={`py-3 rounded-xl border-2 text-base font-semibold transition ${
                        strengthDays === n ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200 bg-slate-50 text-slate-700'
                      }`}
                    >
                      {n === 0 ? 'None' : n === 3 ? '3+' : `${n}x`}
                    </button>
                  ))}
                </div>
              </div>
              {(strengthDays ?? 0) > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">How much lifting experience do you have?</label>
                  <p className="text-xs text-slate-400 mb-2">We use this to set your starting weights — too heavy too soon is how people get hurt.</p>
                  <div className="space-y-2">
                    {STRENGTH_EXPERIENCE_OPTIONS.map(opt => (
                      <OptionCard
                        key={opt.value}
                        selected={strengthExperience === opt.value}
                        onClick={() => setStrengthExperience(opt.value)}
                        title={opt.label}
                        desc={opt.desc}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Cross-training per week (optional)</label>
                <div className="grid grid-cols-4 gap-2" data-testid="cross-frequency">
                  {[0, 1, 2, 3].map(n => (
                    <button
                      key={n}
                      aria-label={`Cross-training ${n === 0 ? 'None' : n === 3 ? '3+' : `${n}x`}`}
                      onClick={() => setCrossDays(n)}
                      className={`py-3 rounded-xl border-2 text-base font-semibold transition ${
                        crossDays === n ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200 bg-slate-50 text-slate-700'
                      }`}
                    >
                      {n === 0 ? 'None' : n === 3 ? '3+' : `${n}x`}
                    </button>
                  ))}
                </div>
              </div>
              {(crossDays ?? 0) > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Pick your modalities</label>
                  <div className="space-y-2">
                    {CROSS_TRAINING_OPTIONS.map(opt => (
                      <OptionCard
                        key={opt.value}
                        selected={crossTraining.includes(opt.value)}
                        onClick={() => toggleCrossTraining(opt.value)}
                        title={opt.label}
                        icon={opt.icon}
                        multi
                      />
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    We'll rotate through these on your cross-training days.
                  </p>
                </div>
              )}
              <WeekBreakdown
                daysPerWeek={daysPerWeek}
                strengthDays={strengthDays ?? 0}
                crossDays={(crossDays ?? 0) > 0 && crossTraining.length > 0 ? crossDays! : 0}
              />
            </div>
          </StepContainer>
        )}

        {step === STEP_SCHEDULE && (
          <StepContainer title="Schedule & constraints" subtitle="So we can fit training around your life.">
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">When do you usually train?</label>
                <div className="space-y-2">
                  {TIME_OF_DAY_OPTIONS.map(opt => (
                    <OptionCard
                      key={opt.value}
                      selected={trainingTimes.includes(opt.value)}
                      onClick={() => toggleTrainingTime(opt.value)}
                      title={opt.label}
                      desc={opt.desc}
                      multi
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Travel, blackout dates, or other constraints (optional)</label>
                <textarea
                  value={scheduleNote}
                  onChange={e => setScheduleNote(e.target.value)}
                  placeholder="e.g. Travel May 15–22, no equipment July 4 week, work crunch in June"
                  rows={3}
                  className="w-full px-3 py-3 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
                />
                <p className="text-xs text-slate-400 mt-1">We'll account for these when shaping your weekly load.</p>
              </div>
            </div>
          </StepContainer>
        )}

        {step === STEP_WEARABLE && (
          <StepContainer title="What wearable do you use?" subtitle="We'll pull heart rate, sleep, and recovery data from your device">
            <OptionCard selected={wearable === 'garmin'} onClick={() => setWearable('garmin')} title="Garmin Watch" desc="Syncs HR, HRV, sleep, body battery, and activities directly." icon="garmin" />
            <OptionCard selected={wearable === 'apple_watch'} onClick={() => setWearable('apple_watch')} title="Apple Watch" desc="Syncs HRV, resting HR, and sleep via the companion iOS app." icon="apple" />
            <OptionCard selected={wearable === 'oura'} onClick={() => setWearable('oura')} title="Oura Ring" desc="Syncs HRV, resting HR, and sleep via Apple Health + iOS app." icon="oura" />
            <OptionCard selected={wearable === 'none'} onClick={() => setWearable('none')} title="No wearable" desc="You can still log workouts manually and use the coach." />
          </StepContainer>
        )}

        {step === STEP_REVIEW && (
          <StepContainer title="Review your plan setup" subtitle="Quick check before we build it. Tap Back to change anything.">
            <ReviewSummary
              raceType={raceType}
              raceName={raceName}
              raceDate={raceDate}
              raceDistance={raceDistance}
              generalGoal={generalGoal}
              showsDistanceStep={showsDistanceStep}
              experience={experience}
              detailLevel={effectiveDetail}
              daysPerWeek={daysPerWeek}
              longRunDay={longRunDay}
              weakStation={weakStation}
              strengthDays={strengthDays}
              strengthExperience={strengthExperience}
              crossTraining={crossTraining}
              crossDays={crossDays}
              injury={injury}
              injuryArea={injuryArea}
              wearable={wearable}
              name={name}
              age={age}
            />
          </StepContainer>
        )}

        {step === STEP_PROFILE && (
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
                <p className="text-xs text-slate-400 mt-1">Used for MAF formula and masters-athlete adjustments.</p>
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
                <p className="text-xs text-slate-400 mt-1">
                  We derive Z2 from your lactate threshold (~88% of max HR by default). For tighter zones, enter LTHR directly under "Fitness anchor" on the prior step.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Cycling FTP (optional)</label>
                <input
                  type="number"
                  value={ftp}
                  onChange={e => setFtp(e.target.value)}
                  placeholder="e.g. 250 (watts)"
                  className="w-full px-3 py-3 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
                <p className="text-xs text-slate-400 mt-1">Sharpens cycling load when you ride with a power meter. Skip if you don't have one — we'll fall back to heart rate.</p>
              </div>
            </div>
          </StepContainer>
        )}
      </div>

      {/* Continue button */}
      <div className="fixed bottom-0 left-0 right-0 px-5 py-4 bg-white border-t border-slate-100">
        <button
          onClick={isLastStep ? handleComplete : next}
          disabled={!canContinue}
          className={`w-full py-3.5 rounded-xl text-base font-semibold transition ${
            canContinue
              ? 'bg-teal-600 text-white active:bg-teal-700'
              : 'bg-slate-200 text-slate-400'
          }`}
        >
          {isLastStep ? 'Create My Plan' : 'Continue'}
        </button>
      </div>
    </div>
  )
}

function GeneratingScreen({ message }: { message: string }) {
  // iOS Safari scrolls the page body to keep focused inputs visible above
  // the on-screen keyboard. That scroll persists across renders, so a
  // newly mounted fixed overlay can end up above the visible viewport and
  // the user sees a blank screen until they swipe down. Reset the scroll
  // position (and any lingering input focus) so the screen renders where
  // the user expects.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const active = document.activeElement as HTMLElement | null
      if (active && typeof active.blur === 'function') active.blur()
    }
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0)
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center px-6 text-center">
      <div className="relative w-16 h-16 mb-6">
        <div className="absolute inset-0 rounded-full border-4 border-teal-100" />
        <div className="absolute inset-0 rounded-full border-4 border-teal-500 border-t-transparent animate-spin" />
      </div>
      <h1 className="text-2xl font-bold text-slate-900">Building your plan</h1>
      <p className="text-base text-slate-500 mt-3 max-w-xs">{message}</p>
      <p className="text-xs text-slate-400 mt-6">This only takes a moment.</p>
    </div>
  )
}

/**
 * Live preview of how the days/week budget will be allocated.
 *
 * The plan generator treats `trainingDaysPerWeek` as a TOTAL: strength
 * and cross-training count against the budget rather than stacking on
 * top. This panel makes that visible while the user is still on the
 * Strength step so they can adjust before submission.
 *
 * The exact run count can shift after method selection (some methods
 * have minimum running-day patterns) — the caption notes that without
 * burying the user in detail.
 */
function WeekBreakdown({
  daysPerWeek,
  strengthDays,
  crossDays,
}: {
  daysPerWeek: number | null
  strengthDays: number
  crossDays: number
}) {
  if (daysPerWeek == null) return null
  const cross = crossDays
  const extras = strengthDays + cross
  const runs = Math.max(0, daysPerWeek - extras)
  const over = extras > daysPerWeek

  return (
    <div className={`rounded-xl p-3 border ${over ? 'border-amber-300 bg-amber-50' : 'border-teal-200 bg-teal-50'}`}>
      <p className={`text-xs font-semibold mb-1 ${over ? 'text-amber-800' : 'text-teal-800'}`}>
        Your {daysPerWeek}-day week
      </p>
      <p className={`text-sm ${over ? 'text-amber-900' : 'text-teal-900'}`}>
        {runs} running · {strengthDays} strength · {cross} cross-training
      </p>
      {over ? (
        <p className="text-xs text-amber-700 mt-1">
          Strength + cross exceed your {daysPerWeek}-day budget. We'll trim them to fit.
        </p>
      ) : (
        <p className="text-xs text-teal-700 mt-1">
          We'll pick a training method that matches this split — your exact run count may shift by ±1.
        </p>
      )}
    </div>
  )
}

// Sensible default detail level derived from the experience answer. Newer
// athletes default to the simplest view; seasoned athletes to the fullest.
function defaultDetailLevel(exp: ExperienceLevel | null): DetailLevel {
  if (exp === 'first_timer' || exp === 'beginner') return 'simple'
  if (exp === 'advanced' || exp === 'elite') return 'detailed'
  return 'balanced'
}

const INJURY_LABELS: Record<InjuryStatus, string> = {
  none: 'No injuries',
  returning: 'Returning from injury',
  current: 'Currently injured',
}

const STRENGTH_EXP_LABELS: Record<StrengthExperience, string> = {
  new: 'New to lifting',
  recreational: 'Some lifting experience',
  experienced: 'Experienced lifter',
}

const INJURY_AREA_LABELS: Record<string, string> = {
  knee: 'knee',
  achilles_calf: 'Achilles/calf',
  hamstring: 'hamstring',
  hip: 'hip',
  foot: 'foot',
  shin: 'shin',
  it_band: 'IT band',
  back: 'back',
  other: 'other',
}

const CROSS_LABELS: Record<CrossTrainingMode, string> = {
  cycling: 'Cycling',
  swimming: 'Swimming',
  rowing: 'Rowing',
  hiking: 'Hiking',
  yoga: 'Yoga / Mobility',
}

const RACE_TYPE_LABELS: Record<RaceType, string> = {
  trail: 'Trail / Road Race',
  hyrox: 'Hyrox',
  general: 'General Fitness',
}

const GENERAL_GOAL_LABELS: Record<GeneralGoal, string> = {
  stay_healthy: 'Stay Healthy & Fit',
  lose_fat: 'Lose Fat',
  build_muscle: 'Build Muscle',
  build_endurance: 'Build Endurance',
}

const DISTANCE_LABELS: Record<RaceDistance, string> = {
  '5k': '5K',
  '10k': '10K',
  half_marathon: 'Half Marathon',
  marathon: 'Marathon',
  '50k': '50K',
  '50_mile': '50 Mile',
  '100k': '100K',
  '100_mile': '100 Mile',
  mountain_ultra: 'Mountain Ultra',
}

function ReviewSummary({
  raceType,
  raceName,
  raceDate,
  raceDistance,
  generalGoal,
  showsDistanceStep,
  experience,
  detailLevel,
  daysPerWeek,
  longRunDay,
  weakStation,
  strengthDays,
  strengthExperience,
  crossTraining,
  crossDays,
  injury,
  injuryArea,
  wearable,
  name,
  age,
}: {
  raceType: RaceType | null
  raceName: string
  raceDate: string
  raceDistance: RaceDistance | null
  generalGoal: GeneralGoal | null
  showsDistanceStep: boolean
  experience: ExperienceLevel | null
  detailLevel: DetailLevel | null
  daysPerWeek: number | null
  longRunDay: string | null
  weakStation: string | null
  strengthDays: number | null
  strengthExperience: StrengthExperience | null
  crossTraining: CrossTrainingMode[]
  crossDays: number | null
  injury: InjuryStatus | null
  injuryArea: string
  wearable: WearableType | null
  name: string
  age: string
}) {
  const cross = (crossDays ?? 0) > 0 && crossTraining.length > 0 ? crossDays! : 0
  const strength = strengthDays ?? 0
  const total = daysPerWeek ?? 0
  const runs = Math.max(0, total - strength - cross)
  const injuryAdjustNote = injury === 'returning'
    ? 'Capped at 4 total days with a gentler ramp.'
    : injury === 'current'
      ? 'Capped at 3 total days with extra recovery.'
      : null

  return (
    <div className="space-y-3">
      <SummaryCard label="Goal">
        <p className="font-semibold text-slate-900">{raceName || 'Untitled plan'}</p>
        <p className="text-sm text-slate-600">
          {raceType ? RACE_TYPE_LABELS[raceType] : '—'}
          {showsDistanceStep && raceDistance ? ` · ${DISTANCE_LABELS[raceDistance]}` : ''}
          {raceType === 'general' && generalGoal ? ` · ${GENERAL_GOAL_LABELS[generalGoal]}` : ''}
          {raceDate ? ` · ${raceDate}` : ''}
        </p>
      </SummaryCard>

      <SummaryCard label="Weekly volume">
        <p className="font-semibold text-slate-900">{total} days/week</p>
        <p className="text-sm text-slate-600">
          {runs} running · {strength} strength · {cross} cross-training
          {cross > 0 && crossTraining.length > 0 && (
            <> · <span className="text-slate-500">{crossTraining.map(m => CROSS_LABELS[m]).join(', ')}</span></>
          )}
        </p>
        {longRunDay && raceType !== 'hyrox' && (
          <p className="text-sm text-slate-500 mt-1">Long day: {longRunDay}</p>
        )}
        {weakStation && raceType === 'hyrox' && (
          <p className="text-sm text-slate-500 mt-1">Focus station: {weakStation}</p>
        )}
      </SummaryCard>

      <SummaryCard label="Fitness & recovery">
        <p className="text-sm text-slate-700">
          {experience ? experience.replace(/_/g, ' ') : '—'}
          {injury ? ` · ${INJURY_LABELS[injury]}` : ''}
          {injury && injury !== 'none' && injuryArea ? ` (${INJURY_AREA_LABELS[injuryArea] ?? injuryArea})` : ''}
          {detailLevel ? ` · ${DETAIL_LEVELS.find(d => d.id === detailLevel)?.label}` : ''}
        </p>
        {strength > 0 && strengthExperience && (
          <p className="text-sm text-slate-600 mt-1">Strength: {STRENGTH_EXP_LABELS[strengthExperience]} — weights calibrated to match</p>
        )}
        {injuryAdjustNote && (
          <p className="text-xs text-amber-700 mt-1">{injuryAdjustNote}</p>
        )}
      </SummaryCard>

      <SummaryCard label="Profile">
        <p className="text-sm text-slate-700">
          {name || '—'}{age ? `, ${age}` : ''}
          {wearable && wearable !== 'none' ? ` · ${wearable.replace('_', ' ')}` : ''}
        </p>
      </SummaryCard>
    </div>
  )
}

function SummaryCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs uppercase tracking-wide font-bold text-slate-500 mb-1">{label}</p>
      {children}
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

function OptionCard({ selected, onClick, title, desc, icon, multi }: {
  selected: boolean; onClick: () => void; title: string; desc?: string; icon?: string; multi?: boolean
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
            {icon === 'mountain' ? '🏔' : icon === 'hyrox' ? '🏋️' : icon === 'general' ? '💪' : icon === 'garmin' ? '⌚' : icon === 'apple' ? '⌚' : icon === 'oura' ? '💍' : icon}
          </span>
        )}
        <div className="flex-1">
          <p className={`font-semibold ${selected ? 'text-teal-800' : 'text-slate-800'}`}>{title}</p>
          {desc && <p className="text-sm text-slate-500 mt-0.5">{desc}</p>}
        </div>
        <div className={`${multi ? 'rounded' : 'rounded-full'} w-5 h-5 border-2 mt-0.5 flex items-center justify-center shrink-0 ${
          selected ? 'border-teal-500 bg-teal-500' : 'border-slate-300'
        }`}>
          {selected && <svg width="12" height="12" fill="white" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" /></svg>}
        </div>
      </div>
    </button>
  )
}
