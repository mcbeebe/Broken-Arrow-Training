import { useEffect, useRef, useState } from 'react'
import type {
  RaceType,
  GeneralGoal,
  CardioModality,
  RaceDistance,
  ExperienceLevel,
  WearableType,
  OnboardingConfig,
  AdditionalRace,
  FitnessAnchorType,
  InjuryStatus,
  BiologicalSex,
  MenopauseStatus,
  StrengthExperience,
  EquipmentAccess,
  CrossTrainingMode,
  TrainingTimeOfDay,
} from '../hooks/useOnboarding'
import { DETAIL_LEVELS, type DetailLevel } from '../types'
import { isHyroxRaceInfo } from '../engines/season/planSeason'
import { RACE_DISTANCE_MILES, normalizeSeasonConfig } from '../utils/seasonConfig'
import { parseTimeToSeconds } from '../utils/parseTime'
import { sanitizeRaceTimeSeconds } from '../engines/planGenerator/vdot'
import OnboardingPlanPreview from './OnboardingPlanPreview'

interface Props {
  onComplete: (config: OnboardingConfig) => void
  onSkip?: () => void
  /** The athlete's existing config when REDOING onboarding: basic info
   *  (name/age/sex/HR/FTP) and stable preferences are prefilled, and the
   *  profile step is skipped entirely — an account holder shouldn't
   *  retype who they are to change what they're training for. */
  previousConfig?: OnboardingConfig | null
  /** Measured recent fitness from logged history (Garmin/Strava/manual) —
   *  prefills the baseline step on a redo so the athlete confirms what we
   *  detected instead of re-typing what their watch already knows. */
  derivedFitness?: { weeklyMileage4wk: number | null; longestRecentRunMi: number | null } | null
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

// Step indices. STEP_RACE_DISTANCE is retired — distance is captured on
// the race step itself (a separate screen re-asking what the race name
// already said was redundant). The constant stays so old ids never shift.
const STEP_RACE_TYPE = 0
const STEP_RACE_NAME = 1
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
// Menopause context step — age-gated (>=45). Kept out of the 0-13 range like the
// general-fitness steps; order comes from ALL_STEPS. Placed after PROFILE (where
// age is entered) so the age gate has a value to read.
const STEP_MENOPAUSE = 16
// G3 — the belief-building moment: a real week-1 preview generated from the
// answers so far, shown BEFORE the schedule/equipment/profile questions so
// the athlete sees value before they finish investing.
const STEP_PREVIEW = 17
// Season-first onboarding (user-directed): upfront choice between one goal
// race and a season of races, then the multi-race builder for season mode.
const STEP_GOAL_MODE = 18
const STEP_SEASON_RACES = 19

// G3 ordering (goal-first, preview mid-flow, prefs last):
//   1. goal block — race type/name/distance (or general goal) + experience;
//   2. fitness anchor (BASELINE) pulled forward so the preview is personal;
//   3. PREVIEW — the live week-1 render, before 50% of questions are asked;
//   4. plan-shaping answers that refine it (days/variant/equipment/strength/
//      schedule/profile/menopause);
//   5. display prefs that change no plan output (detail level, wearable) sit
//      last, just ahead of review.
// The golden ground-truth harness proves identical answers ⇒ identical final
// plan regardless of this ordering (generation reads the finished config).
const ALL_STEPS = [
  STEP_GOAL_MODE, // the very first question: one race, a season, or no race
  STEP_RACE_TYPE,
  STEP_RACE_NAME,
  STEP_SEASON_RACES,
  STEP_GENERAL_GOAL,
  STEP_GENERAL_CARDIO,
  STEP_EXPERIENCE,
  STEP_BASELINE,
  STEP_PREVIEW,
  STEP_DAYS,
  STEP_VARIANT,
  STEP_EQUIPMENT,
  STEP_STRENGTH,
  STEP_SCHEDULE,
  STEP_PROFILE,
  STEP_MENOPAUSE,
  STEP_DETAIL,
  STEP_WEARABLE,
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

/** One row of the season race builder — AdditionalRace-shaped with the
 *  miles field kept as raw input text and a local key for React lists. */
interface SeasonRaceRow {
  key: number
  name: string
  date: string
  miles: string
  /** Elevation gain in feet (structured, P2) — free-typed, parsed on assemble. */
  vertFt: string
  priority: 'A' | 'B' | 'C'
  description: string
  integration: 'layered' | 'sequential'
  /** null = no chip tapped yet — format is inferred from name/description
   *  (so a row named "Hyrox LA" routes correctly without a tap). */
  format: 'road' | 'trail' | 'hyrox' | null
}

let seasonRowKey = 0
function newSeasonRaceRow(): SeasonRaceRow {
  return { key: ++seasonRowKey, name: '', date: '', miles: '', vertFt: '', priority: 'B', description: '', integration: 'layered', format: null }
}


/** Season-mode rows (and race-mode's single extra) → AdditionalRace list.
 *  Shared by handleComplete and the preview's provisionalConfig so both
 *  feed the SAME season shape into normalizeSeasonConfig. */
function assembleAdditionalRaces(args: {
  raceType: RaceType | null
  goalMode: 'race' | 'season' | 'general' | null
  seasonRaces: SeasonRaceRow[]
  primaryKey: 'anchor' | number
  extraRaceName: string
  extraRaceDate: string
  extraRacePriority: 'A' | 'B' | 'C'
  extraRaceMiles: string
  extraRaceDescription: string
}): AdditionalRace[] | undefined {
  const { raceType, goalMode, seasonRaces, primaryKey } = args
  if (raceType === 'general') return undefined
  if (goalMode === 'season') {
    const rows = seasonRaces
      .filter(r => r.name.trim() && r.date)
      .map(r => ({
        name: r.name.trim(),
        date: r.date,
        // The main goal is always a full 'A'; other rows carry their
        // role chip (Key race = B, Tune-up = C).
        priority: primaryKey === r.key ? 'A' as const : r.priority,
        isPrimary: primaryKey === r.key || undefined,
        distanceMiles: parseFloat(r.miles) || undefined,
        elevationGainFt: parseFloat(r.vertFt) > 0 ? Math.round(parseFloat(r.vertFt)) : undefined,
        description: r.description.trim() || undefined,
        // Untapped chips defer to name detection — never seed an
        // explicit format the athlete didn't choose.
        format: r.format ?? (isHyroxRaceInfo({ name: r.name, description: r.description }) ? 'hyrox' as const : undefined),
        // The integration ask applies to format-specific (Hyrox)
        // races; others run sequential (the only defined behavior).
        integration: (r.format ? r.format === 'hyrox' : isHyroxRaceInfo({ name: r.name, description: r.description }))
          ? r.integration
          : 'sequential' as const,
      }))
    return rows.length > 0 ? rows : undefined
  }
  return args.extraRaceName.trim() && args.extraRaceDate
    ? [{
        name: args.extraRaceName.trim(),
        date: args.extraRaceDate,
        priority: args.extraRacePriority,
        distanceMiles: parseFloat(args.extraRaceMiles) || undefined,
        description: args.extraRaceDescription.trim() || undefined,
      }]
    : undefined
}

const RACE_FORMAT_LABEL: Record<'road' | 'trail' | 'hyrox', string> = {
  road: 'Road', trail: 'Trail', hyrox: 'Hyrox',
}

/** Format a seconds total back into mm:ss or h:mm:ss for an input echo. */
function formatSecondsLabel(total: number): string {
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

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

const SEX_OPTIONS: { value: BiologicalSex; label: string }[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
]

const MENOPAUSE_STATUS_OPTIONS: { value: MenopauseStatus; label: string; desc: string }[] = [
  { value: 'premenopause', label: 'Premenopausal', desc: 'Regular cycles, no menopause signs yet — build your base ahead of the transition.' },
  { value: 'perimenopause', label: 'Perimenopause', desc: 'Cycles changing or irregular; symptoms may be starting.' },
  { value: 'menopause', label: 'Menopause', desc: 'Around the 12-month mark since your last period.' },
  { value: 'postmenopause', label: 'Postmenopause', desc: 'Past the menopause transition.' },
  { value: 'not_applicable', label: 'Not applicable', desc: "This doesn't apply to me." },
  { value: 'prefer_not_to_say', label: 'Prefer not to say', desc: 'Skip this — no problem.' },
]

const MENOPAUSE_SYMPTOM_OPTIONS: { value: string; label: string }[] = [
  { value: 'hot_flashes', label: 'Hot flashes' },
  { value: 'sleep_disruption', label: 'Sleep disruption' },
  { value: 'joint_pain', label: 'Joint pain' },
  { value: 'low_energy', label: 'Low energy' },
  { value: 'brain_fog', label: 'Brain fog' },
]

export default function Onboarding({ onComplete, onSkip, loadingDurationMs = 1800, previousConfig, derivedFitness }: Props) {
  const [step, setStep] = useState(STEP_GOAL_MODE) // ALL_STEPS[0] — the flow's first question
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatingMessage] = useState(
    () => GENERATING_MESSAGES[Math.floor(Math.random() * GENERATING_MESSAGES.length)],
  )
  // Redo prefills: who the athlete IS doesn't change between redos.
  const prev = previousConfig ?? null
  const hasProfilePrefill = !!(prev?.athleteName && prev?.age)
  const [raceType, setRaceType] = useState<RaceType | null>(null)
  const [raceName, setRaceName] = useState('')
  const [raceDate, setRaceDate] = useState('')
  const [raceDistance, setRaceDistance] = useState<RaceDistance | null>(null)
  // P2 — structured race profile: exact distance beats the enum snap, and
  // elevation gain unlocks the climbing/descent prescription.
  const [exactDistanceMi, setExactDistanceMi] = useState('')
  const [elevationGainFt, setElevationGainFtState] = useState('')
  const [generalGoal, setGeneralGoal] = useState<GeneralGoal | null>(null)
  const [cardioModality, setCardioModality] = useState<CardioModality | null>(null)
  const [raceDescription, setRaceDescription] = useState('')
  const [athleteGoal, setAthleteGoal] = useState('')
  // G1b — optional second race captured inline on the race step.
  const [showExtraRace, setShowExtraRace] = useState(false)
  const [extraRaceName, setExtraRaceName] = useState('')
  const [extraRaceDate, setExtraRaceDate] = useState('')
  const [extraRaceMiles, setExtraRaceMiles] = useState('')
  const [extraRacePriority, setExtraRacePriority] = useState<'A' | 'B' | 'C'>('B')
  const [extraRaceDescription, setExtraRaceDescription] = useState('')
  // Season-first onboarding: the upfront choice (THE first question) —
  // one race, a season of races, or general fitness — plus the multi-race
  // builder rows (season mode). Rows are AdditionalRace-shaped with miles
  // kept as raw input text. 'general' routes into the existing
  // general-fitness path (raceType 'general'); config.goalMode maps it to
  // undefined, exactly the legacy shape.
  const [goalMode, setGoalMode] = useState<'race' | 'season' | 'general' | null>(null)
  const [seasonRaces, setSeasonRaces] = useState<SeasonRaceRow[]>([])
  // Season mode: which race is the MAIN GOAL — the anchor (nearest race,
  // the plan we generate first) by default, or any added row by key. Asked
  // explicitly; drives priority mapping (primary = full build + taper,
  // everything else a stepping stone).
  const [primaryKey, setPrimaryKey] = useState<'anchor' | number>('anchor')
  // Season mode: ALL race kinds in the season (multi-select — a season can
  // mix trail + Hyrox). The anchor race's own kind (raceType) defaults to
  // the first selection and is adjustable on the race-name step when the
  // season mixes kinds.
  const [raceKinds, setRaceKinds] = useState<Exclude<RaceType, 'general'>[]>([])

  function toggleRaceKind(kind: Exclude<RaceType, 'general'>) {
    setRaceKinds(prev => {
      const next = prev.includes(kind) ? prev.filter(k => k !== kind) : [...prev, kind]
      // Anchor kind follows the first selection; if the anchor's kind was
      // just deselected, fall back to the new first selection.
      if (next.length === 0) setRaceType(null)
      else if (!raceType || !next.includes(raceType as Exclude<RaceType, 'general'>)) setRaceType(next[0])
      return next
    })
  }

  // Back-navigation-safe selection: picking general fixes raceType; moving
  // back to a race framing after general must re-ask the race type.
  function chooseGoalMode(mode: 'race' | 'season' | 'general') {
    setGoalMode(mode)
    if (mode === 'general') setRaceType('general')
    else if (raceType === 'general') setRaceType(null)
  }
  // Plan start control: '' = right away (default). Computed once at mount so
  // the "Next Monday" chip is stable through the flow.
  const [planStart, setPlanStart] = useState('')
  const [nextMondayIso] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7))
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${m}-${dd}`
  })
  const [experience, setExperience] = useState<ExperienceLevel | null>(prev?.experienceLevel ?? null)
  const [detailLevel, setDetailLevel] = useState<DetailLevel | null>(null)
  const [daysPerWeek, setDaysPerWeek] = useState<number | null>(null)
  const [longRunDay, setLongRunDay] = useState<string | null>(null)
  const [weakStation, setWeakStation] = useState<string | null>(null)
  const [hyroxDivision, setHyroxDivision] = useState<'open' | 'pro'>('open')
  const [wearable, setWearable] = useState<WearableType | null>(prev?.wearable ?? null)
  const [name, setName] = useState(prev?.athleteName ?? '')
  const [age, setAge] = useState(prev?.age ? String(prev.age) : '')
  const [sex, setSex] = useState<BiologicalSex | null>(prev?.sex ?? null)
  const [maxHR, setMaxHR] = useState(prev?.maxHR && prev.maxHR !== 220 - (prev.age ?? 0) ? String(prev.maxHR) : '')
  const [ftp, setFtp] = useState(prev?.ftpWatts ? String(prev.ftpWatts) : '')

  // Fitness baseline + constraints
  const [anchorType, setAnchorType] = useState<FitnessAnchorType>(prev?.fitnessAnchor?.type ?? 'none')
  const [anchorTime, setAnchorTime] = useState(
    prev?.fitnessAnchor?.valueSeconds ? formatSecondsLabel(prev.fitnessAnchor.valueSeconds) : '')
  const [anchorBpm, setAnchorBpm] = useState(
    prev?.fitnessAnchor?.bpm ? String(prev.fitnessAnchor.bpm) : '')
  const [goalRaceTime, setGoalRaceTime] = useState('')
  const [weeklyMileage, setWeeklyMileage] = useState(
    derivedFitness?.weeklyMileage4wk != null ? String(derivedFitness.weeklyMileage4wk)
    : prev?.currentWeeklyMileage ? String(prev.currentWeeklyMileage) : '')
  // Redo: the baseline renders as a compact "here's what we detected"
  // confirmation; Adjust expands the full controls.
  const [baselineAdjustOpen, setBaselineAdjustOpen] = useState(false)
  const hasBaselinePrefill = !!prev
  const [injury, setInjury] = useState<InjuryStatus | null>(null)
  const [injuryArea, setInjuryArea] = useState('')
  const [injuryTimeframe, setInjuryTimeframe] = useState('')
  const [injuryNote, setInjuryNote] = useState('')
  const [equipment, setEquipment] = useState<EquipmentAccess[]>(prev?.equipmentAccess ?? [])
  const [strengthDays, setStrengthDays] = useState<number | null>(prev?.strengthDaysPerWeek ?? null)
  const [strengthExperience, setStrengthExperience] = useState<StrengthExperience | null>(prev?.strengthExperience ?? null)
  const [crossTraining, setCrossTraining] = useState<CrossTrainingMode[]>(prev?.crossTrainingModes ?? [])
  const [crossDays, setCrossDays] = useState<number | null>(prev?.crossTrainingDaysPerWeek ?? null)
  const [trainingTimes, setTrainingTimes] = useState<TrainingTimeOfDay[]>(prev?.preferredTrainingTimes ?? [])
  const [scheduleNote, setScheduleNote] = useState('')
  const [menopause, setMenopause] = useState<MenopauseStatus | null>(null)
  const [menopauseSymptoms, setMenopauseSymptoms] = useState<string[]>([])
  const [menopauseNote, setMenopauseNote] = useState('')

  // Ref on the inner scrollable content area. Without resetting its
  // scrollTop on step change, a previous step that overflowed (e.g. the
  // race-type cards on a short phone) leaves the container scrolled down,
  // and the next step's shorter content paints above the visible window —
  // the user sees a blank white screen even though the markup is there.
  const contentRef = useRef<HTMLDivElement | null>(null)

  // Race-distance step only shows for trail/road races (hyrox is a fixed format,
  // general fitness has no target distance). The general-goal step is the mirror
  // image — shown only for general fitness.
  const showsDistanceStep = raceType === 'trail' || raceType === 'road'
  const showsGoalStep = raceType === 'general'
  // Menopause step is age-gated from 38 (age is entered on the prior PROFILE
  // step) — early perimenopause can begin in the late 30s, so a 40-only gate
  // missed it; premenopausal women also benefit from building bone ahead of the
  // transition. It is also sex-gated: an explicit 'male' answer skips it outright
  // (it can't apply), while 'female'/'prefer not to say'/unset keep the age
  // default. 'not_applicable' / 'prefer not to say' let anyone who still sees it
  // opt out, and the whole step is skippable.
  const showsMenopauseStep = (parseInt(age) || 0) >= 38 && sex !== 'male'
  const visibleSteps: readonly number[] = ALL_STEPS.filter(s => {
    if (s === STEP_GENERAL_GOAL) return showsGoalStep
    if (s === STEP_GENERAL_CARDIO) return showsGoalStep
    if (s === STEP_MENOPAUSE) return showsMenopauseStep
    // Account holders redoing onboarding never retype who they are.
    if (s === STEP_PROFILE) return !hasProfilePrefill
    // Experience carries over on a redo — confirmable on the baseline step.
    if (s === STEP_EXPERIENCE) return !prev?.experienceLevel
    // Season-first: the goal-mode question is ALWAYS step 1. Choosing
    // general fitness there fixes raceType and skips the race-type step;
    // the multi-race builder shows only for a season.
    if (s === STEP_RACE_TYPE) return goalMode !== 'general'
    if (s === STEP_SEASON_RACES) return goalMode === 'season'
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
  const toggleMenopauseSymptom = (s: string) => {
    setMenopauseSymptoms(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  const canContinue = (() => {
    switch (step) {
      case STEP_RACE_TYPE: return goalMode === 'season' ? raceKinds.length > 0 && !!raceType : !!raceType
      case STEP_RACE_NAME: return raceName.trim().length > 0 && raceDescription.trim().length >= 10 && athleteGoal.trim().length > 0 && (!showsDistanceStep || !!raceDistance)
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
      case STEP_MENOPAUSE: return true // fully optional — can advance with no selection
      case STEP_PREVIEW: return true // informational — nothing to answer
      case STEP_GOAL_MODE: return !!goalMode
      case STEP_SEASON_RACES: return true // races beyond the anchor are optional
      case STEP_REVIEW: return true
      default: return false
    }
  })()

  const buildFitnessAnchor = (): OnboardingConfig['fitnessAnchor'] => {
    const anchorOpt = ANCHOR_OPTIONS.find(o => o.value === anchorType)!
    if (anchorType !== 'none') {
      if (anchorOpt.kind === 'time') {
        const secs = parseTimeToSeconds(anchorTime)
        if (secs) return { type: anchorType, valueSeconds: secs }
      } else if (anchorOpt.kind === 'bpm') {
        const bpm = parseInt(anchorBpm)
        if (bpm > 0) return { type: anchorType, bpm }
      }
    }
    return undefined
  }

  // Provisional config for the mid-flow preview (G3): the answers so far
  // plus neutral defaults for everything not yet asked. Assembled only on
  // the preview step — nothing is saved, and the final config is built
  // exclusively by handleComplete from the full answer set.
  const provisionalConfig: OnboardingConfig | null =
    step === STEP_PREVIEW && raceType && experience
      ? normalizeSeasonConfig({
          raceType,
          raceName: raceName.trim() || 'Your race',
          raceDate,
          raceDistance: showsDistanceStep ? (raceDistance ?? undefined) : undefined,
          raceDistanceMiles: showsDistanceStep && parseFloat(exactDistanceMi) > 0 ? parseFloat(exactDistanceMi) : undefined,
          elevationGainFt: showsDistanceStep && parseFloat(elevationGainFt) > 0 ? Math.round(parseFloat(elevationGainFt)) : undefined,
          generalGoal: showsGoalStep ? (generalGoal ?? undefined) : undefined,
          cardioModality: showsGoalStep ? (cardioModality ?? undefined) : undefined,
          raceDescription: raceDescription.trim() || undefined,
          athleteGoal: athleteGoal.trim() || undefined,
          goalRaceTimeSeconds: showsDistanceStep && raceDistance
            ? (sanitizeRaceTimeSeconds(parseTimeToSeconds(goalRaceTime), RACE_DISTANCE_MILES[raceDistance]) ?? undefined)
            : undefined,
          experienceLevel: experience,
          detailLevel: effectiveDetail,
          trainingDaysPerWeek: daysPerWeek ?? 4,
          wearable: 'none',
          athleteName: name.trim(),
          age: parseInt(age) || 40,
          maxHR: maxHR ? parseInt(maxHR) : 220 - (parseInt(age) || 40),
          fitnessAnchor: buildFitnessAnchor(),
          currentWeeklyMileage: weeklyMileage ? parseFloat(weeklyMileage) : undefined,
          injuryStatus: injury ?? undefined,
          planStartDate: planStart || undefined,
          goalMode: goalMode === 'general' || raceType === 'general' ? undefined : (goalMode ?? 'race'),
          anchorIsPrimary: goalMode === 'season' ? primaryKey === 'anchor' : undefined,
          additionalRaces: assembleAdditionalRaces({ raceType, goalMode, seasonRaces, primaryKey, extraRaceName, extraRaceDate, extraRacePriority, extraRaceMiles, extraRaceDescription }),
          completedAt: '',
        })
      : null

  const handleComplete = () => {
    const ageNum = parseInt(age) || 30
    const fitnessAnchor = buildFitnessAnchor()

    const config: OnboardingConfig = {
      raceType: raceType!,
      raceName: raceName.trim(),
      raceDate,
      raceDistance: showsDistanceStep ? (raceDistance ?? undefined) : undefined,
      raceDistanceMiles: showsDistanceStep && parseFloat(exactDistanceMi) > 0 ? parseFloat(exactDistanceMi) : undefined,
      elevationGainFt: showsDistanceStep && parseFloat(elevationGainFt) > 0 ? Math.round(parseFloat(elevationGainFt)) : undefined,
      generalGoal: showsGoalStep ? (generalGoal ?? undefined) : undefined,
      cardioModality: showsGoalStep ? (cardioModality ?? undefined) : undefined,
      raceDescription: raceDescription.trim() || undefined,
      athleteGoal: athleteGoal.trim() || undefined,
      // Store the sanitized goal so every consumer sees the corrected value
      // ("2:30" for a half → 9000 s, not 150 s); null/invalid → omitted.
      goalRaceTimeSeconds: showsDistanceStep && raceDistance
        ? (sanitizeRaceTimeSeconds(parseTimeToSeconds(goalRaceTime), RACE_DISTANCE_MILES[raceDistance]) ?? undefined)
        : undefined,
      experienceLevel: experience!,
      detailLevel: effectiveDetail,
      trainingDaysPerWeek: daysPerWeek!,
      longRunDay: longRunDay ?? undefined,
      weakStation: weakStation ?? undefined,
      hyroxDivision: raceType === 'hyrox' ? hyroxDivision : undefined,
      wearable: wearable || 'none',
      athleteName: name.trim(),
      age: ageNum,
      sex: sex ?? undefined,
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
      planStartDate: planStart || undefined,
      menopauseStatus: showsMenopauseStep ? (menopause ?? undefined) : undefined,
      menopauseSymptoms:
        showsMenopauseStep && isRealMenopauseStage(menopause) && menopauseSymptoms.length > 0
          ? menopauseSymptoms
          : undefined,
      menopauseNote:
        showsMenopauseStep && isRealMenopauseStage(menopause) && menopauseNote.trim()
          ? menopauseNote.trim()
          : undefined,
      goalMode: goalMode === 'general' || raceType === 'general'
        ? undefined // general fitness has no race framing (legacy shape)
        : (goalMode ?? 'race'),
      raceKinds: goalMode === 'season' && raceKinds.length > 0 ? raceKinds : undefined,
      // Explicit main-goal answer. Undefined outside season mode (legacy
      // shape); in season mode the anchor is the default main goal.
      anchorIsPrimary: goalMode === 'season' ? primaryKey === 'anchor' : undefined,
      // Additional races → the season calendar. Season mode uses the
      // multi-race builder rows; race mode keeps the single optional
      // second-race capture. Half-filled entries (no name or date) are
      // dropped silently — they're optional.
      additionalRaces: assembleAdditionalRaces({ raceType, goalMode, seasonRaces, primaryKey, extraRaceName, extraRaceDate, extraRacePriority, extraRaceMiles, extraRaceDescription }),
      completedAt: '',
    }

    // The plan always anchors on the chronologically FIRST race — if an
    // added race predates the entered one, swap them (the entered race
    // keeps its main-goal flag as an additional race). See seasonConfig.ts.
    const normalized = normalizeSeasonConfig(config)

    // Skip the loading screen entirely when consumers (tests) opt out.
    // Otherwise show a brief generating screen so the handoff to the next
    // view doesn't feel like a blank flash on mobile browsers.
    if (loadingDurationMs <= 0) {
      onComplete(normalized)
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
    setTimeout(() => onComplete(normalized), loadingDurationMs)
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
        {step === STEP_RACE_TYPE && goalMode !== 'season' && (
          <StepContainer title="What kind of race?" subtitle="Pick the type that matches your goal event">
            <OptionCard selected={raceType === 'road'} onClick={() => setRaceType('road')} title="Road Race" desc="Marathon, half, 10K, 5K — paved, flat-to-rolling." icon="🛣️" />
            <OptionCard selected={raceType === 'trail'} onClick={() => setRaceType('trail')} title="Trail / Ultra" desc="Sky races, ultras, technical and mountain terrain." icon="mountain" />
            <OptionCard selected={raceType === 'hyrox'} onClick={() => setRaceType('hyrox')} title="Hyrox" desc="8 stations + 8km running. Functional fitness racing." icon="hyrox" />
          </StepContainer>
        )}

        {step === STEP_RACE_TYPE && goalMode === 'season' && (
          <StepContainer title="What kinds of races?" subtitle="Select all that apply — a season can mix formats (e.g. a trail half + a Hyrox)">
            <OptionCard selected={raceKinds.includes('road')} onClick={() => toggleRaceKind('road')} title="Road Race" desc="Marathon, half, 10K, 5K — paved, flat-to-rolling." icon="🛣️" />
            <OptionCard selected={raceKinds.includes('trail')} onClick={() => toggleRaceKind('trail')} title="Trail / Ultra" desc="Sky races, ultras, technical and mountain terrain." icon="mountain" />
            <OptionCard selected={raceKinds.includes('hyrox')} onClick={() => toggleRaceKind('hyrox')} title="Hyrox" desc="8 stations + 8km running. Functional fitness racing." icon="hyrox" />
          </StepContainer>
        )}

        {step === STEP_RACE_NAME && (
          <StepContainer title={raceType === 'general' ? 'Give your training plan a name' : goalMode === 'season' ? 'Tell us about race #1' : 'Tell us about your race'} subtitle={raceType === 'general' ? 'Something to keep you motivated' : goalMode === 'season' ? 'Your next race anchors the plan — the rest of the season comes next' : 'We\'ll build your plan around race day'}>
            <div className="space-y-4">
              {/* Mixed-format seasons: which kind is race #1? (defaults to
                  the first kind selected on the previous step) */}
              {goalMode === 'season' && raceKinds.length > 1 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Race #1 is a…</label>
                  <div className="flex gap-1.5" role="radiogroup" aria-label="Race 1 format">
                    {raceKinds.map(k => (
                      <button
                        key={k}
                        type="button"
                        role="radio"
                        aria-checked={raceType === k}
                        onClick={() => setRaceType(k)}
                        className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-bold ${
                          raceType === k ? 'border-teal-500 bg-teal-100 text-teal-800' : 'border-slate-200 text-slate-500'
                        }`}
                      >{RACE_FORMAT_LABEL[k]}</button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{raceType === 'general' ? 'Plan name' : 'Race name'}</label>
                <input
                  type="text"
                  value={raceName}
                  onChange={e => setRaceName(e.target.value)}
                  placeholder={raceType === 'hyrox' ? 'e.g. Hyrox San Francisco' : raceType === 'road' ? 'e.g. Boston Marathon' : raceType === 'trail' ? 'e.g. Broken Arrow Skyrace 18K' : 'e.g. Summer Fitness Block'}
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
              {showsDistanceStep && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Race distance</label>
                  <select
                    value={raceDistance ?? ''}
                    onChange={e => setRaceDistance((e.target.value || null) as RaceDistance | null)}
                    aria-label="Race distance"
                    className="w-full px-3 py-3 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
                  >
                    <option value="">Select distance…</option>
                    {DISTANCE_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label} — {o.desc}</option>
                    ))}
                  </select>
                  {/* P2 — the structured race profile. Vert is the input that
                      unlocks climbing/descent training; exact distance beats
                      the category snap (a 13.3 mi trail half is not 13.1). */}
                  <div className="flex gap-2 mt-2">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-500 mb-1">Exact distance (mi, optional)</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={exactDistanceMi}
                        onChange={e => setExactDistanceMi(e.target.value)}
                        placeholder="e.g. 13.3"
                        aria-label="Exact race distance in miles"
                        className="w-full px-3 py-2.5 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-500 mb-1">Elevation gain (ft, optional)</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={elevationGainFt}
                        onChange={e => setElevationGainFtState(e.target.value)}
                        placeholder="e.g. 2900"
                        aria-label="Race elevation gain in feet"
                        className="w-full px-3 py-2.5 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"
                      />
                    </div>
                  </div>
                  {(() => {
                    const vert = parseFloat(elevationGainFt)
                    const mi = parseFloat(exactDistanceMi) > 0
                      ? parseFloat(exactDistanceMi)
                      : raceDistance ? RACE_DISTANCE_MILES[raceDistance] : 0
                    if (!(vert > 0) || !(mi > 0)) return null
                    const density = Math.round(vert / mi)
                    return (
                      <p className="text-xs text-teal-700 mt-1">
                        ~{density} ft/mi{density > 100
                          ? ' — climbing and descent work will be built into your plan.'
                          : ' — gently rolling; your plan stays pace-oriented.'}
                      </p>
                    )
                  })()}
                </div>
              )}
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

              {/* G1b — optional multi-race capture. Fully skippable; the
                  season panel can always add races later. Not shown for
                  general fitness (no race to chain from) — nor in season
                  mode, where the dedicated builder step owns it. */}
              {raceType !== 'general' && goalMode !== 'season' && !showExtraRace && (
                <button
                  type="button"
                  onClick={() => setShowExtraRace(true)}
                  className="text-sm font-semibold text-teal-700 hover:text-teal-900"
                >
                  ＋ I have another race after this one
                </button>
              )}
              {raceType !== 'general' && goalMode !== 'season' && showExtraRace && (
                <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3 space-y-2">
                  <p className="text-xs text-slate-600">
                    Racing again later this season? Your plan will chain them:
                    recover, bridge, rebuild, taper — on purpose. (Optional —
                    leave blank to skip.)
                  </p>
                  <input
                    type="text"
                    value={extraRaceName}
                    onChange={e => setExtraRaceName(e.target.value)}
                    placeholder="Second race name (e.g. Hyrox LA, CIM Marathon)"
                    className="w-full px-3 py-2.5 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={extraRaceDate}
                      onChange={e => setExtraRaceDate(e.target.value)}
                      aria-label="Second race date"
                      className="flex-1 px-3 py-2.5 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"
                    />
                    <input
                      type="number"
                      inputMode="decimal"
                      value={extraRaceMiles}
                      onChange={e => setExtraRaceMiles(e.target.value)}
                      placeholder="miles"
                      aria-label="Second race distance in miles"
                      className="w-24 px-3 py-2.5 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"
                    />
                  </div>
                  <div className="flex gap-1.5" role="radiogroup" aria-label="Second race priority">
                    {([
                      ['A', 'A — full build + taper'],
                      ['B', 'B — mini-taper'],
                      ['C', 'C — train through'],
                    ] as const).map(([p, label]) => (
                      <button
                        key={p}
                        type="button"
                        role="radio"
                        aria-checked={extraRacePriority === p}
                        onClick={() => setExtraRacePriority(p)}
                        className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-bold ${
                          extraRacePriority === p ? 'border-teal-500 bg-teal-100 text-teal-800' : 'border-slate-200 text-slate-500'
                        }`}
                      >{label}</button>
                    ))}
                  </div>
                  <textarea
                    value={extraRaceDescription}
                    onChange={e => setExtraRaceDescription(e.target.value)}
                    rows={2}
                    placeholder="Tell us about it — format, goal, terrain (e.g. Hyrox open, first one, goal is to finish strong)"
                    aria-label="Second race details"
                    className="w-full px-3 py-2.5 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
                  />
                  {extraRaceDate && raceDate && extraRaceDate <= raceDate && (
                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                      ⚠️ This date is on or before your main race ({raceDate}). The season chains
                      races in date order — double-check both dates if this second race should
                      come after.
                    </p>
                  )}
                </div>
              )}
            </div>
          </StepContainer>
        )}

        {step === STEP_GOAL_MODE && (
          <StepContainer
            title="What are you training for?"
            subtitle="One goal race, a season, or just fitness — this shapes everything that follows."
          >
            <OptionCard
              selected={goalMode === 'race'}
              onClick={() => chooseGoalMode('race')}
              title="A specific race"
              desc="One goal event. Your whole plan builds toward it."
            />
            <OptionCard
              selected={goalMode === 'season'}
              onClick={() => chooseGoalMode('season')}
              title="A season of races"
              desc="Two or more events. You'll pick your main goal, and we plan the whole arc around it — builds, tapers, recovery, and the bridges between races."
            />
            <OptionCard
              selected={goalMode === 'general'}
              onClick={() => chooseGoalMode('general')}
              title="General fitness"
              desc="No race on the calendar. Build endurance, strength, and health."
              icon="general"
            />
          </StepContainer>
        )}

        {step === STEP_SEASON_RACES && (
          <StepContainer
            title="Your season calendar"
            subtitle="Add the rest of your season — including anything far out. Your plan starts with the earliest race."
          >
            <div className="space-y-3">
              {/* THE season question: which race is everything building
                  toward? Customer language only — priorities are derived. */}
              <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                <p className="text-sm font-semibold text-slate-700">Which race is your main goal this season?</p>
                <p className="text-xs text-slate-500">
                  This is the one everything builds toward — it gets the full build and
                  a proper taper. The others become stepping stones along the way.
                </p>
                <div className="space-y-1.5" role="radiogroup" aria-label="Main goal race">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={primaryKey === 'anchor'}
                    onClick={() => setPrimaryKey('anchor')}
                    className={`w-full text-left rounded-lg border px-3 py-2 text-sm font-semibold ${
                      primaryKey === 'anchor' ? 'border-teal-500 bg-teal-50 text-teal-900' : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    {primaryKey === 'anchor' ? '★ ' : ''}{raceName.trim() || 'Your nearest race'}
                    {raceDate ? <span className="font-normal text-slate-500"> · {raceDate}</span> : null}
                  </button>
                  {seasonRaces.filter(r => r.name.trim()).map(r => (
                    <button
                      key={r.key}
                      type="button"
                      role="radio"
                      aria-checked={primaryKey === r.key}
                      onClick={() => setPrimaryKey(r.key)}
                      className={`w-full text-left rounded-lg border px-3 py-2 text-sm font-semibold ${
                        primaryKey === r.key ? 'border-teal-500 bg-teal-50 text-teal-900' : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      {primaryKey === r.key ? '★ ' : ''}{r.name.trim()}
                      {r.date ? <span className="font-normal text-slate-500"> · {r.date}</span> : null}
                    </button>
                  ))}
                </div>
              </div>

              {seasonRaces.map((row, i) => {
                // Explicit format wins; name detection is the fallback so a
                // row named "Hyrox LA" still asks even before a chip tap.
                const rowIsHyrox = row.format ? row.format === 'hyrox' : isHyroxRaceInfo({ name: row.name, description: row.description })
                const update = (patch: Partial<SeasonRaceRow>) =>
                  setSeasonRaces(rs => rs.map(r => (r.key === row.key ? { ...r, ...patch } : r)))
                return (
                  <div key={row.key} className="rounded-xl border border-teal-200 bg-teal-50/50 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-600">
                        {primaryKey === row.key ? '★ Main goal' : `Added race ${i + 1}`}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          if (primaryKey === row.key) setPrimaryKey('anchor')
                          setSeasonRaces(rs => rs.filter(r => r.key !== row.key))
                        }}
                        className="text-xs text-slate-400 hover:text-rose-600"
                        aria-label={`Remove race ${i + 2}`}
                      >
                        Remove
                      </button>
                    </div>
                    <div className="flex gap-1.5" role="radiogroup" aria-label={`Race ${i + 2} format`}>
                      {(['road', 'trail', 'hyrox'] as const).map(k => (
                        <button
                          key={k}
                          type="button"
                          role="radio"
                          aria-checked={row.format === k}
                          onClick={() => update({ format: k })}
                          className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-bold ${
                            row.format === k ? 'border-teal-500 bg-teal-100 text-teal-800' : 'border-slate-200 text-slate-500'
                          }`}
                        >{RACE_FORMAT_LABEL[k]}</button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={row.name}
                      onChange={e => update({ name: e.target.value })}
                      placeholder="Race name (e.g. Hyrox LA, CIM Marathon)"
                      aria-label={`Race ${i + 2} name`}
                      className="w-full px-3 py-2.5 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"
                    />
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={row.date}
                        onChange={e => update({ date: e.target.value })}
                        aria-label={`Race ${i + 2} date`}
                        className="flex-1 px-3 py-2.5 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"
                      />
                      <input
                        type="number"
                        inputMode="decimal"
                        value={row.miles}
                        onChange={e => update({ miles: e.target.value })}
                        placeholder="miles"
                        aria-label={`Race ${i + 2} distance in miles`}
                        className="w-24 px-3 py-2.5 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"
                      />
                      {row.format !== 'hyrox' && (
                        <input
                          type="number"
                          inputMode="numeric"
                          value={row.vertFt}
                          onChange={e => update({ vertFt: e.target.value })}
                          placeholder="ft gain"
                          aria-label={`Race ${i + 2} elevation gain in feet`}
                          className="w-24 px-3 py-2.5 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"
                        />
                      )}
                    </div>
                    {primaryKey === row.key ? (
                      <p className="text-xs font-semibold text-teal-800 bg-teal-100 border border-teal-200 rounded-lg px-2.5 py-1.5">
                        ★ Main goal — full build + taper
                      </p>
                    ) : (
                      <div className="flex gap-1.5" role="radiogroup" aria-label={`Race ${i + 2} role`}>
                        {([
                          ['B', 'Key race — short taper'],
                          ['C', 'Tune-up — train through'],
                        ] as const).map(([p, label]) => (
                          <button
                            key={p}
                            type="button"
                            role="radio"
                            aria-checked={row.priority === p}
                            onClick={() => update({ priority: p })}
                            className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-bold ${
                              row.priority === p ? 'border-teal-500 bg-teal-100 text-teal-800' : 'border-slate-200 text-slate-500'
                            }`}
                          >{label}</button>
                        ))}
                      </div>
                    )}
                    <textarea
                      value={row.description}
                      onChange={e => update({ description: e.target.value })}
                      rows={2}
                      placeholder="Tell us about it — format, goal, terrain (e.g. Hyrox open, first one, goal is to finish strong)"
                      aria-label={`Race ${i + 2} details`}
                      className="w-full px-3 py-2.5 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
                    />
                    {rowIsHyrox && (
                      <div>
                        <p className="text-xs font-medium text-slate-600 mb-1">
                          When should {row.name.trim() || 'this race'}’s training start?
                        </p>
                        <div className="flex gap-1.5" role="radiogroup" aria-label={`Race ${i + 2} training start`}>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={row.integration === 'layered'}
                            onClick={() => update({ integration: 'layered' })}
                            className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold ${
                              row.integration === 'layered' ? 'border-teal-500 bg-teal-100 text-teal-800' : 'border-slate-200 text-slate-500'
                            }`}
                          >
                            Layer it into my build now (recommended)
                          </button>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={row.integration === 'sequential'}
                            onClick={() => update({ integration: 'sequential' })}
                            className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold ${
                              row.integration === 'sequential' ? 'border-teal-500 bg-teal-100 text-teal-800' : 'border-slate-200 text-slate-500'
                            }`}
                          >
                            After my main race
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">
                          Layered = 1–2 station/strength sessions a week woven into your current
                          build (your running stays untouched), ramping after race #1.
                        </p>
                      </div>
                    )}
                    {row.date && raceDate && row.date <= raceDate && (
                      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                        ⚠️ This date is on or before your main race ({raceDate}). The season
                        chains races in date order — double-check both dates.
                      </p>
                    )}
                  </div>
                )
              })}

              {/* Inline mirrors of the season engine's spacing rules — the
                  engine re-checks for real after onboarding (planSeason
                  advisories); these just catch it while the dates are
                  still on screen. */}
              {(() => {
                const dated = [
                  // Effective priorities mirror the engine: the main goal is
                  // the full 'A'; everything else is at most a key race.
                  ...(raceDate ? [{ date: raceDate, priority: (primaryKey === 'anchor' ? 'A' : 'B') as 'A' | 'B' | 'C', name: raceName || 'First race' }] : []),
                  ...seasonRaces.filter(r => r.date).map(r => ({ date: r.date, priority: (primaryKey === r.key ? 'A' : r.priority) as 'A' | 'B' | 'C', name: r.name || 'race' })),
                ].sort((a, b) => a.date.localeCompare(b.date))
                const notes: string[] = []
                for (let i = 1; i < dated.length; i++) {
                  const gapDays = Math.round((Date.parse(`${dated[i].date}T12:00:00`) - Date.parse(`${dated[i - 1].date}T12:00:00`)) / 86_400_000)
                  if (dated[i].priority === 'A' && dated[i - 1].priority === 'A' && gapDays < 56) {
                    notes.push(`${dated[i - 1].name} → ${dated[i].name}: ${Math.round(gapDays / 7)} weeks apart — two full peaks usually need 8+. We'll treat the second build as compressed.`)
                  } else if (gapDays <= 10) {
                    notes.push(`${dated[i].name} is only ${gapDays} days after ${dated[i - 1].name} — it'll be treated as a train-through effort.`)
                  }
                }
                return notes.length > 0 ? (
                  <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 space-y-1">
                    {notes.map(n => <p key={n}>· {n}</p>)}
                  </div>
                ) : null
              })()}

              <button
                type="button"
                onClick={() => setSeasonRaces(rs => [...rs, newSeasonRaceRow()])}
                className="text-sm font-semibold text-teal-700 hover:text-teal-900"
              >
                ＋ Add another race
              </button>
              <p className="text-xs text-slate-500">
                Add everything — even races far in the future. They live on your
                season timeline and enter the plan automatically when they're in
                range. You can always add, remove, or reprioritize later.
              </p>
            </div>
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

        {step === STEP_VARIANT && (raceType === 'trail' || raceType === 'road') && (
          <StepContainer title="Which day do you want to do your long runs?" subtitle="Choose one to continue">
            {['Saturday', 'Sunday', 'Tuesday', 'Friday'].map(d => (
              <OptionCard key={d} selected={longRunDay === d} onClick={() => setLongRunDay(d)} title={d} />
            ))}
          </StepContainer>
        )}

        {step === STEP_VARIANT && raceType === 'hyrox' && (
          <StepContainer title="Which station do you find hardest?" subtitle="We'll give it extra focus in your plan">
            {/* P3 — division picks the loads every station prescription uses
                (Open vs Pro differ by ~50 kg on the sleds alone). */}
            <div className="mb-3">
              <p className="text-xs font-semibold text-slate-500 mb-1.5">Your division</p>
              <div className="flex gap-1.5" role="radiogroup" aria-label="Hyrox division">
                {(['open', 'pro'] as const).map(d => (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={hyroxDivision === d}
                    onClick={() => setHyroxDivision(d)}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-bold ${
                      hyroxDivision === d ? 'border-teal-500 bg-teal-100 text-teal-800' : 'border-slate-200 text-slate-500'
                    }`}
                  >{d === 'open' ? 'Open' : 'Pro'}</button>
                ))}
              </div>
            </div>
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
          <StepContainer
            title="Where are you right now?"
            subtitle={hasBaselinePrefill
              ? 'We pulled your baseline from your training history and last setup — confirm or adjust.'
              : 'Your current fitness baseline. Anchor and mileage are optional but make your plan more accurate.'}
          >
            <div className="space-y-5">
              {hasBaselinePrefill && (
                <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-3">
                  <p className="text-sm font-semibold text-slate-800">Here's what we detected:</p>
                  <p className="text-sm text-slate-700 mt-1">
                    {weeklyMileage ? `~${weeklyMileage} mi/week` : 'No recent mileage'}
                    {derivedFitness?.longestRecentRunMi != null ? ` · long run ${derivedFitness.longestRecentRunMi} mi` : ''}
                    {anchorType !== 'none' && anchorTime ? ` · ${ANCHOR_OPTIONS.find(o => o.value === anchorType)?.label ?? 'anchor'}: ${anchorTime}` : ''}
                    {experience ? ` · ${experience.replace('_', ' ')}` : ''}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {derivedFitness?.weeklyMileage4wk != null
                      ? 'Mileage comes from your last 4 weeks of logged training.'
                      : 'From your previous setup.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setBaselineAdjustOpen(v => !v)}
                    className="mt-2 text-sm font-semibold text-teal-700 hover:text-teal-900"
                  >
                    {baselineAdjustOpen ? 'Done adjusting' : 'Adjust'}
                  </button>
                </div>
              )}
              {(!hasBaselinePrefill || baselineAdjustOpen) && (<>
              {hasBaselinePrefill && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fitness level</label>
                  <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Fitness level">
                    {(['first_timer', 'beginner', 'intermediate', 'advanced', 'elite'] as const).map(lvl => (
                      <button
                        key={lvl}
                        type="button"
                        role="radio"
                        aria-checked={experience === lvl}
                        onClick={() => setExperience(lvl)}
                        className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold capitalize ${
                          experience === lvl ? 'border-teal-500 bg-teal-100 text-teal-800' : 'border-slate-200 text-slate-500'
                        }`}
                      >{lvl.replace('_', ' ')}</button>
                    ))}
                  </div>
                </div>
              )}
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
                  <>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={anchorTime}
                      onChange={e => setAnchorTime(e.target.value)}
                      placeholder={`${selectedAnchor.placeholder} — e.g. 21:30 or 2130`}
                      className="mt-2 w-full px-3 py-3 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"
                    />
                    {anchorTime.trim() && (
                      parseTimeToSeconds(anchorTime) != null
                        ? <p className="text-xs text-teal-600 mt-1">Reading this as {formatSecondsLabel(parseTimeToSeconds(anchorTime)!)}.</p>
                        : <p className="text-xs text-amber-600 mt-1">Enter as mm:ss (e.g. 21:30) — the “:” is optional.</p>
                    )}
                  </>
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

              {/* Goal finish time — road/trail races only. Drives goal-pace
                  personalization when paired with the fitness anchor above. */}
              {showsDistanceStep && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Goal finish time (optional)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={goalRaceTime}
                    onChange={e => setGoalRaceTime(e.target.value)}
                    placeholder="e.g. 3:25:00 or 32500"
                    className="w-full px-3 py-3 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                  {goalRaceTime.trim() && (() => {
                    const parsed = parseTimeToSeconds(goalRaceTime)
                    if (parsed == null) {
                      return <p className="text-xs text-amber-600 mt-1">Enter as hh:mm:ss (e.g. 3:25:00) — the “:” is optional.</p>
                    }
                    const miles = raceDistance ? RACE_DISTANCE_MILES[raceDistance] : 0
                    const sane = miles > 0 ? sanitizeRaceTimeSeconds(parsed, miles) : parsed
                    if (miles > 0 && sane != null && sane !== parsed) {
                      // Ambiguous mm:ss vs hh:mm:ss (e.g. "2:30" → impossibly fast).
                      return <p className="text-xs text-amber-600 mt-1">{formatSecondsLabel(parsed)} is impossibly fast for a {DISTANCE_OPTIONS.find(o => o.value === raceDistance)?.label} — reading it as <strong>{formatSecondsLabel(sane)}</strong>. Use hh:mm:ss to be exact.</p>
                    }
                    return <p className="text-xs text-teal-600 mt-1">Goal: {formatSecondsLabel(sane ?? parsed)}. We’ll build your quality paces toward it.</p>
                  })()}
                  <p className="text-xs text-slate-400 mt-1">If you have a target, we progress your workout paces from current fitness toward it.</p>
                </div>
              )}

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

              </>)}

              {/* Injury status — required, ALWAYS asked (safety) */}
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

        {step === STEP_PREVIEW && (
          <StepContainer
            title="Here's your plan taking shape"
            subtitle="A real preview built from your answers — not a template"
          >
            {provisionalConfig ? (
              <OnboardingPlanPreview config={provisionalConfig} />
            ) : (
              <p className="text-sm text-slate-500">
                Keep going — your plan takes shape from the next few answers.
              </p>
            )}
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
                <label className="block text-sm font-medium text-slate-700 mb-2">When should training start?</label>
                <div className="flex gap-1.5 mb-2" role="radiogroup" aria-label="Plan start">
                  <button type="button" role="radio" aria-checked={planStart === ''}
                    onClick={() => setPlanStart('')}
                    className={`flex-1 rounded-lg border px-2 py-2 text-sm font-semibold ${
                      planStart === '' ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-500'
                    }`}>Right away</button>
                  <button type="button" role="radio" aria-checked={planStart === nextMondayIso}
                    onClick={() => setPlanStart(nextMondayIso)}
                    className={`flex-1 rounded-lg border px-2 py-2 text-sm font-semibold ${
                      planStart === nextMondayIso ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-500'
                    }`}>Next Monday</button>
                </div>
                <input
                  type="date"
                  value={planStart}
                  onChange={e => setPlanStart(e.target.value)}
                  aria-label="Custom plan start date"
                  className="w-full px-3 py-2.5 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Coming back from vacation or finishing a rest block? Pick the day week 1 should
                  begin — a later start means less runway to race day, and your plan will say so
                  honestly.
                </p>
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
              raceDescription={raceDescription}
              athleteGoal={athleteGoal}
              seasonRaces={goalMode === 'season' ? seasonRaces.filter(r => r.name.trim() && r.date) : []}
              primaryKey={goalMode === 'season' ? primaryKey : 'anchor'}
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
                <label className="block text-sm font-medium text-slate-700 mb-1">Biological sex (optional)</label>
                <div className="grid grid-cols-2 gap-2">
                  {SEX_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSex(sex === opt.value ? null : opt.value)}
                      className={`${opt.value === 'prefer_not_to_say' ? 'col-span-2' : ''} px-3 py-2.5 text-sm font-medium rounded-xl border-2 transition ${
                        sex === opt.value
                          ? 'border-teal-500 bg-teal-50 text-teal-800'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-1">Lets us skip questions that don't apply to you.</p>
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

        {step === STEP_MENOPAUSE && (
          <StepContainer
            title="A quick personal note"
            subtitle="The menopause transition — and the years before it — change what training works best. If that's relevant to you, your coach will tailor your plan. Totally optional — skip if it doesn't apply."
          >
            <div className="space-y-2">
              {MENOPAUSE_STATUS_OPTIONS.map(opt => (
                <OptionCard
                  key={opt.value}
                  selected={menopause === opt.value}
                  onClick={() => setMenopause(opt.value)}
                  title={opt.label}
                  desc={opt.desc}
                />
              ))}
            </div>

            {isRealMenopauseStage(menopause) && (
              <div className="mt-3 space-y-3 rounded-xl border border-teal-200 bg-teal-50 p-3">
                <p className="text-xs text-teal-800">
                  A few details help your coach be specific. All optional.
                </p>
                <div>
                  <p className="text-xs font-medium text-slate-600 mb-1.5">Noticing any of these?</p>
                  <div className="space-y-2">
                    {MENOPAUSE_SYMPTOM_OPTIONS.map(opt => (
                      <OptionCard
                        key={opt.value}
                        selected={menopauseSymptoms.includes(opt.value)}
                        onClick={() => toggleMenopauseSymptom(opt.value)}
                        title={opt.label}
                        multi
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Anything else we should know?</label>
                  <textarea
                    value={menopauseNote}
                    onChange={e => setMenopauseNote(e.target.value)}
                    placeholder="e.g. sleep's been rough, joints feel stiff in the mornings"
                    rows={2}
                    className="w-full px-3 py-2.5 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  This tailors your training and coaching — it isn't medical advice. Check with your clinician for anything clinical.
                </p>
              </div>
            )}
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

// A "real" stage on the menopause continuum carries coach personalization; the
// non-answers ('not_applicable' / 'prefer_not_to_say') and null do not.
function isRealMenopauseStage(s: MenopauseStatus | null): boolean {
  return (
    s === 'premenopause' ||
    s === 'perimenopause' ||
    s === 'menopause' ||
    s === 'postmenopause'
  )
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
  road: 'Road Race',
  trail: 'Trail / Ultra',
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
  raceDescription,
  athleteGoal,
  seasonRaces,
  primaryKey,
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
  raceDescription: string
  athleteGoal: string
  seasonRaces: SeasonRaceRow[]
  primaryKey: 'anchor' | number
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
      <SummaryCard label={seasonRaces.length > 0 ? `Season · ${seasonRaces.length + 1} races` : 'Goal'}>
        <p className="font-semibold text-slate-900">
          {raceName || 'Untitled plan'}
          {seasonRaces.length > 0 && primaryKey === 'anchor' && (
            <span className="ml-1.5 text-xs font-bold text-teal-700">★ Main goal</span>
          )}
          {seasonRaces.length > 0 && !seasonRaces.some(r => r.date && raceDate && r.date < raceDate) && (
            <span className="ml-1.5 text-xs font-semibold text-slate-500">Starts your plan</span>
          )}
        </p>
        <p className="text-sm text-slate-600">
          {raceType ? RACE_TYPE_LABELS[raceType] : '—'}
          {showsDistanceStep && raceDistance ? ` · ${DISTANCE_LABELS[raceDistance]}` : ''}
          {raceType === 'general' && generalGoal ? ` · ${GENERAL_GOAL_LABELS[generalGoal]}` : ''}
          {raceDate ? ` · ${raceDate}` : ''}
        </p>
        {raceDescription.trim() && (
          <p className="text-sm text-slate-500 mt-0.5">{raceDescription.trim()}</p>
        )}
        {athleteGoal.trim() && (
          <p className="text-sm text-slate-600 mt-0.5">Goal: <span className="text-slate-800">{athleteGoal.trim()}</span></p>
        )}
        {[...seasonRaces].sort((a, b) => a.date.localeCompare(b.date)).map(r => {
          const fmt = r.format ?? (isHyroxRaceInfo({ name: r.name, description: r.description }) ? 'hyrox' : null)
          return (
            <div key={r.key} className="mt-2 pt-2 border-t border-slate-100">
              <p className="font-semibold text-slate-900">
                {r.name.trim()}
                {primaryKey === r.key && (
                  <span className="ml-1.5 text-xs font-bold text-teal-700">★ Main goal</span>
                )}
                {r.date && (!raceDate || r.date < raceDate) &&
                  !seasonRaces.some(o => o.date && o.date < r.date) && (
                  <span className="ml-1.5 text-xs font-semibold text-slate-500">Starts your plan</span>
                )}
              </p>
              <p className="text-sm text-slate-600">
                {fmt ? `${RACE_FORMAT_LABEL[fmt]} · ` : ''}
                {primaryKey === r.key ? 'Full build + taper' : r.priority === 'C' ? 'Tune-up — train through' : 'Key race — short taper'} · {r.date}
                {fmt === 'hyrox' ? ` · ${r.integration === 'layered' ? 'training layered into your build now' : 'training starts after the previous race'}` : ''}
              </p>
              {r.description.trim() && (
                <p className="text-sm text-slate-500 mt-0.5">{r.description.trim()}</p>
              )}
            </div>
          )
        })}
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
