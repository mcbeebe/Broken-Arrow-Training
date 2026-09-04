/**
 * Verification harness for docs/onboarding-logic-flow.html.
 *
 * Runs the REAL plan-generation engines (no hand-tracing) over a fixed set of
 * personas with a fixed `today`/`raceDate` so the output is deterministic, and
 * writes a single JSON file the documentation embeds as ground truth.
 *
 * It also dumps the method library's decision tables (applicability + mileage /
 * taper / phase / generation rules) so the in-browser "decision explorer" can be
 * driven by the exact same constants the engine uses — making the explorer's
 * faithfulness auditable against this file.
 *
 * Run:  npx tsx scripts/onboarding-logic-ground-truth.ts
 * Out:  docs/onboarding-ground-truth.json
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { generatePlanFromMethod } from '../src/engines/planGenerator/generatePlan'
import { generateHyroxPlan } from '../src/utils/planGenerator'
import { generateGeneralFitnessPlan } from '../src/engines/generalFitness'
import {
  selectMethods,
  inputsFromOnboarding,
} from '../src/engines/planGenerator/methodSelection'
import { ALL_METHODS, RECOMMENDABLE_METHODS } from '../src/data/methods'
import {
  resolvePaces,
  athleteCurrentVdot,
  formatZoneString,
} from '../src/engines/planGenerator/paceTargets'
import { vdotFromRace, sanitizeRaceTimeSeconds } from '../src/engines/planGenerator/vdot'
import {
  allocatePhaseWeeks,
  estimateCurrentWeeklyMileage,
  buildWeeklyMileage,
  chooseTotalWeeks,
} from '../src/engines/planGenerator/weekPlan'
import type { OnboardingConfig } from '../src/hooks/useOnboarding'
import type { Phase, TrainingMethod } from '../src/types/training-method'
import type { TrainingPlan } from '../src/types'

const TODAY = '2026-06-14'

// Race-distance miles for the GOAL VDOT — must mirror RACE_DISTANCE_LABELS in
// generatePlan.ts EXACTLY (the engine uses these rounded values for the goal
// blend; the *current* anchor uses the precise FITNESS_ANCHOR_DISTANCES instead).
const RACE_MILES: Record<string, number> = {
  '5k': 3.1,
  '10k': 6.2,
  half_marathon: 13.1,
  marathon: 26.2,
  '50k': 31.1,
  '50_mile': 50,
  '100k': 62.1,
  '100_mile': 100,
  mountain_ultra: 0,
}

function makeConfig(overrides: Partial<OnboardingConfig>): OnboardingConfig {
  return {
    raceType: 'trail',
    raceName: 'Demo Race',
    raceDate: '2026-10-18',
    experienceLevel: 'intermediate',
    trainingDaysPerWeek: 5,
    wearable: 'none',
    athleteName: 'Demo',
    age: 35,
    completedAt: TODAY,
    ...overrides,
  } as OnboardingConfig
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

// ── Pace + goal-pace summary, computed the way generatePlanFromMethod does ──
function paceSummary(method: TrainingMethod, config: OnboardingConfig) {
  const paces = resolvePaces(method, config)
  const zones = Object.values(paces.byZone).map(t => ({
    zone: t.zone,
    displayName: t.displayName,
    paceSecLow: t.paceSecPerMileLow,
    paceSecHigh: t.paceSecPerMileHigh,
    hrLow: t.hrBpmLow,
    hrHigh: t.hrBpmHigh,
    rpeLow: t.rpeLow,
    rpeHigh: t.rpeHigh,
    preferredMode: t.preferredMode,
    formatted: formatZoneString(t),
  }))

  const raceMiles = config.raceDistance ? RACE_MILES[config.raceDistance] ?? 0 : 0
  const currentVdot = athleteCurrentVdot(config)
  const goalSeconds =
    raceMiles > 0 ? sanitizeRaceTimeSeconds(config.goalRaceTimeSeconds, raceMiles) : null
  const rawGoalVdot =
    goalSeconds != null ? vdotFromRace({ distanceMiles: raceMiles, timeSeconds: goalSeconds }) : null
  const goalIsStretch = rawGoalVdot != null && currentVdot != null && rawGoalVdot > currentVdot
  const cappedGoalVdot = goalIsStretch ? Math.min(rawGoalVdot!, currentVdot! * 1.08) : null

  return {
    anchor: paces.anchor,
    zones,
    goal: {
      currentVdot: currentVdot != null ? round1(currentVdot) : null,
      rawGoalVdot: rawGoalVdot != null ? round1(rawGoalVdot) : null,
      goalIsStretch,
      cappedGoalVdot: cappedGoalVdot != null ? round1(cappedGoalVdot) : null,
      goalSeconds,
    },
  }
}

// ── Method-based running persona ──
function runMethodPersona(id: string, label: string, note: string, config: OnboardingConfig) {
  const inputs = inputsFromOnboarding(config)!
  const selection = selectMethods(RECOMMENDABLE_METHODS, inputs)
  const top3 = selection.map(s => ({
    methodId: s.methodId,
    score: s.score,
    distance: s.axes.distance.rating,
    experience: s.axes.experience.rating,
    terrain: s.axes.terrain.rating,
  }))
  const method = selection[0].method

  // Reproduce the exact internal mileage curve (none of these personas are
  // injured, so the engine's mileageAdjust is {} — see generatePlanFromMethod).
  const totalWeeks = chooseTotalWeeks(method, config.raceDate || undefined, TODAY)
  const blocks = allocatePhaseWeeks(method, totalWeeks)
  const currentMi = estimateCurrentWeeklyMileage(config)
  const paces = resolvePaces(method, config)
  const weekMileage = buildWeeklyMileage(method, totalWeeks, blocks, currentMi, {}, {
    raceDistance: config.raceDistance,
    easyPaceSecPerMile: paces.byZone.easy?.paceSecPerMileLow,
  })

  const plan: TrainingPlan = generatePlanFromMethod(method, config, TODAY)

  const ps = paceSummary(method, config)

  // The last build week before taper — the most informative week to sample:
  // peak volume, longest long run, and the most goal-sharpened quality paces.
  const taperWeeks = method.taper?.durationWeeks ?? 0
  const peakWeekIndex = Math.max(0, Math.min(plan.weeks.length - 1, totalWeeks - taperWeeks - 1))

  return {
    id,
    label,
    note,
    engine: 'method-based',
    inputs: summarizeInputs(config),
    terrainInferred: inputs.terrain,
    experienceMapped: inputs.experience,
    selection: top3,
    chosenMethodId: method.id,
    chosenMethodName: method.name ?? method.id,
    primaryAnchor: method.primaryAnchor,
    maxHR: plan.athlete.maxHR,
    zones: plan.zones,
    currentWeeklyMileage: currentMi,
    totalWeeks,
    phaseBlocks: blocks,
    peakMi: Math.max(...weekMileage.map(w => w.totalMi)),
    peakLongRunMi: Math.max(...weekMileage.map(w => w.longRunMi)),
    weeklyMileage: weekMileage.map(w => ({
      week: w.weekNumber,
      totalMi: w.totalMi,
      longRunMi: w.longRunMi,
      phaseId: w.phaseId,
      isCutback: w.isCutback,
      isTaper: w.isTaper,
    })),
    planWeeksMiles: plan.weeks.map(w => w.miles), // cross-confirm vs weeklyMileage
    paceAnchor: ps.anchor,
    goalPace: ps.goal,
    paceZones: ps.zones,
    sampleWeekNumber: peakWeekIndex + 1,
    sampleWeekDays: plan.weeks[peakWeekIndex].days.map(d => ({
      day: d.day,
      type: d.type,
      workout: d.workout,
      zone: d.zone,
      time: d.time,
      detail: d.detail,
    })),
  }
}

function runHyroxPersona(id: string, label: string, note: string, config: OnboardingConfig) {
  // TODAY must be pinned here like every other persona — without it the
  // runway clamp reads the wall clock and the "deterministic" ground
  // truth drifts with the date of regeneration.
  const plan = generateHyroxPlan(config, TODAY)
  return {
    id,
    label,
    note,
    engine: 'hyrox',
    inputs: summarizeInputs(config),
    maxHR: plan.athlete.maxHR,
    zones: plan.zones,
    totalWeeks: plan.weeks.length,
    weeks: plan.weeks.map(w => ({ num: w.num, miles: w.miles, focus: w.focus })),
    sampleWeekDays: plan.weeks[Math.min(plan.weeks.length - 1, 4)].days.map(d => ({
      day: d.day,
      type: d.type,
      workout: d.workout,
      zone: d.zone,
      time: d.time,
      detail: d.detail,
    })),
  }
}

function runGeneralPersona(id: string, label: string, note: string, config: OnboardingConfig) {
  const plan = generateGeneralFitnessPlan(config, TODAY)
  return {
    id,
    label,
    note,
    engine: 'general-fitness',
    inputs: summarizeInputs(config),
    generalGoal: plan.generalGoal,
    maxHR: plan.athlete.maxHR,
    zones: plan.zones,
    totalWeeks: plan.weeks.length,
    weeks: plan.weeks.map(w => ({ num: w.num, miles: w.miles, focus: w.focus })),
    sampleWeekDays: plan.weeks[0].days.map(d => ({
      day: d.day,
      type: d.type,
      workout: d.workout,
      zone: d.zone,
      time: d.time,
      detail: d.detail,
    })),
  }
}

function summarizeInputs(c: OnboardingConfig) {
  return {
    raceType: c.raceType,
    raceDate: c.raceDate,
    raceDistance: c.raceDistance,
    generalGoal: c.generalGoal,
    cardioModality: c.cardioModality,
    experienceLevel: c.experienceLevel,
    age: c.age,
    sex: c.sex,
    menopauseStatus: c.menopauseStatus,
    menopauseSymptoms: c.menopauseSymptoms,
    maxHR: c.maxHR,
    currentWeeklyMileage: c.currentWeeklyMileage,
    goalRaceTimeSeconds: c.goalRaceTimeSeconds,
    fitnessAnchor: c.fitnessAnchor,
    trainingDaysPerWeek: c.trainingDaysPerWeek,
    strengthDaysPerWeek: c.strengthDaysPerWeek,
    injuryStatus: c.injuryStatus,
    longRunDay: c.longRunDay,
    weakStation: c.weakStation,
    equipmentAccess: c.equipmentAccess,
    athleteGoal: c.athleteGoal,
  }
}

// ── Method decision tables for the explorer ──
function methodsTable() {
  return ALL_METHODS.map((m: TrainingMethod) => ({
    id: m.id,
    name: m.name ?? m.id,
    signature: m.signature,
    primaryAnchor: m.primaryAnchor,
    coachingOnly: !RECOMMENDABLE_METHODS.some(r => r.id === m.id),
    applicability: m.applicability,
    mileageProgression: m.mileageProgression,
    taper: {
      durationWeeks: m.taper?.durationWeeks,
      weeklyVolumePcts: m.taper?.weeklyVolumePcts,
    },
    phases: (m.phases ?? []).map((p: Phase) => ({
      id: p.id,
      name: p.name,
      order: p.order,
      pctOfPlanDefault: p.pctOfPlan?.default,
      minWeeks: p.weekBounds?.minWeeks,
      maxWeeks: p.weekBounds?.maxWeeks,
    })),
    generationRules: {
      defaultPlanWeeks: m.generationRules?.defaultPlanWeeks,
      supportedPlanWeeks: m.generationRules?.supportedPlanWeeks,
      compressionPriority: m.generationRules?.compressionPriority,
      expansionPriority: m.generationRules?.expansionPriority,
    },
  }))
}

// ── Personas ──
/** Whatever the three persona runners produce. Derived from them rather than
 *  hand-declared, so the shape can never drift from what is actually written. */
type Persona =
  | ReturnType<typeof runMethodPersona>
  | ReturnType<typeof runHyroxPersona>
  | ReturnType<typeof runGeneralPersona>

const personas: Persona[] = []

// 1a. 2:50 marathon @ 15 mi/wk — WITH a current race anchor (3:10 marathon)
personas.push(
  runMethodPersona(
    'p1a_marathon_250_anchored',
    '2:50 marathon goal · 15 mi/wk · current 3:10 anchor',
    'Goal-pace fires because both a current race anchor and a goal time exist; stretch is capped at +8% VDOT. Peak volume is governed by current mileage × 2.3, not by the goal.',
    makeConfig({
      raceType: 'trail',
      raceName: 'Goal Marathon',
      raceDistance: 'marathon',
      raceDate: '2026-10-18',
      experienceLevel: 'advanced',
      age: 34,
      sex: 'male',
      currentWeeklyMileage: 15,
      goalRaceTimeSeconds: 2 * 3600 + 50 * 60, // 2:50:00 = 10200
      fitnessAnchor: { type: 'race_marathon', valueSeconds: 3 * 3600 + 10 * 60 }, // 3:10 = 11400
      trainingDaysPerWeek: 5,
      strengthDaysPerWeek: 2,
      crossTrainingDaysPerWeek: 0,
      longRunDay: 'Sunday',
      equipmentAccess: ['track', 'gym', 'hills'],
      injuryStatus: 'none',
    }),
  ),
)

// 1b. 2:50 marathon @ 15 mi/wk — NO current anchor (goal only)
personas.push(
  runMethodPersona(
    'p1b_marathon_250_noanchor',
    '2:50 marathon goal · 15 mi/wk · no current anchor',
    'With no current race anchor, currentVdot is null → goal-pace progression cannot fire. A VDOT method (Daniels) then has no concrete paces and falls back to HR/RPE.',
    makeConfig({
      raceType: 'trail',
      raceName: 'Goal Marathon',
      raceDistance: 'marathon',
      raceDate: '2026-10-18',
      experienceLevel: 'advanced',
      age: 34,
      sex: 'male',
      currentWeeklyMileage: 15,
      goalRaceTimeSeconds: 2 * 3600 + 50 * 60,
      trainingDaysPerWeek: 5,
      strengthDaysPerWeek: 2,
      longRunDay: 'Sunday',
      equipmentAccess: ['track', 'gym', 'hills'],
      injuryStatus: 'none',
    }),
  ),
)

// 2. Female, 55, 4:30 marathon — menopause overlay
personas.push(
  runMethodPersona(
    'p2_f55_marathon_430',
    'Female · 55 · 4:30 marathon · postmenopause',
    'Age 55 + female triggers the menopause step. maxHR = 220-55 = 165. Postmenopause appends a bone-loading strength finisher ("Strength + bone").',
    makeConfig({
      raceType: 'trail',
      raceName: 'Masters Marathon',
      raceDistance: 'marathon',
      raceDate: '2026-10-18',
      experienceLevel: 'intermediate',
      age: 55,
      sex: 'female',
      menopauseStatus: 'postmenopause',
      menopauseSymptoms: ['joint_pain'],
      currentWeeklyMileage: 22,
      goalRaceTimeSeconds: 4 * 3600 + 30 * 60, // 4:30 = 16200
      fitnessAnchor: { type: 'race_hm', valueSeconds: 2 * 3600 + 5 * 60 }, // 2:05 half = 7500
      trainingDaysPerWeek: 4,
      strengthDaysPerWeek: 2,
      strengthExperience: 'recreational',
      longRunDay: 'Saturday',
      equipmentAccess: ['gym', 'hills'],
      injuryStatus: 'none',
    }),
  ),
)

// 3. 25yo, 100-mile ultra — Koop
personas.push(
  runMethodPersona(
    'p3_25_100mile_ultra',
    '25 · 100-mile ultra',
    '100-mile distance → only Koop is BEST (road methods NOT_SUITED). Koop is LTHR-anchored; with no explicit LTHR it estimates 0.88 × maxHR. peakMult 3.2, long-run cap 34 mi / 300 min.',
    makeConfig({
      raceType: 'trail',
      raceName: 'Hundred Miler',
      raceDistance: '100_mile',
      raceDate: '2026-12-13',
      experienceLevel: 'advanced',
      age: 25,
      sex: 'male',
      currentWeeklyMileage: 40,
      trainingDaysPerWeek: 6,
      strengthDaysPerWeek: 2,
      crossTrainingDaysPerWeek: 1,
      crossTrainingModes: ['hiking'],
      longRunDay: 'Saturday',
      equipmentAccess: ['trails', 'hills', 'gym'],
      injuryStatus: 'none',
    }),
  ),
)

// 4. Hyrox persona
personas.push(
  runHyroxPersona(
    'p4_hyrox_intermediate',
    'Hyrox · intermediate · 4 days · weak station Sled Push',
    'Hyrox length/structure come entirely from experienceLevel (intermediate = 12 weeks). weakStation is a textual focus only. Menopause / sex / injury / equipment / strengthDays are ignored.',
    makeConfig({
      raceType: 'hyrox',
      raceName: 'Hyrox SF',
      raceDistance: undefined,
      raceDate: '2026-09-06',
      experienceLevel: 'intermediate',
      age: 30,
      sex: 'female',
      menopauseStatus: undefined,
      weakStation: 'Sled Push',
      trainingDaysPerWeek: 4,
      strengthDaysPerWeek: 3,
      equipmentAccess: ['gym'],
      injuryStatus: 'returning',
    }),
  ),
)

// 5. General Fitness persona — perimenopausal, build muscle
personas.push(
  runGeneralPersona(
    'p5_general_build_muscle',
    'General Fitness · build muscle · 48 · perimenopause · 6 days',
    'Rolling 12-week block (no race date). build_muscle preset = 4×10 strength, low cardio bias. Perimenopause overlay: bone finisher on strength, hard day becomes SIT sprints, recovery nudge from sleep_disruption. "bigger arms" adds arm accessories.',
    makeConfig({
      raceType: 'general',
      raceName: 'Strength Block',
      raceDistance: undefined,
      raceDate: '',
      generalGoal: 'build_muscle',
      cardioModality: 'running',
      athleteGoal: 'build bigger arms and feel strong',
      experienceLevel: 'intermediate',
      age: 48,
      sex: 'female',
      menopauseStatus: 'perimenopause',
      menopauseSymptoms: ['sleep_disruption', 'low_energy'],
      trainingDaysPerWeek: 6,
      strengthDaysPerWeek: 3,
      strengthExperience: 'recreational',
      equipmentAccess: ['gym'],
      injuryStatus: 'none',
    }),
  ),
)

const out = {
  generatedWith: 'scripts/onboarding-logic-ground-truth.ts',
  today: TODAY,
  note: 'Deterministic output of the REAL engines. Embedded by docs/onboarding-logic-flow.html as ground truth.',
  methods: methodsTable(),
  personas,
}

const here = dirname(fileURLToPath(import.meta.url))
const outPath = resolve(here, '../docs/onboarding-ground-truth.json')
writeFileSync(outPath, JSON.stringify(out, null, 2))

// Console summary for eyeballing in the run log.
console.log(`Wrote ${outPath}`)
for (const p of personas) {
  if (p.engine === 'method-based') {
    console.log(
      `\n[${p.id}] ${p.label}\n  engine=method-based  method=${p.chosenMethodId} (anchor=${p.primaryAnchor})  maxHR=${p.maxHR}` +
        `\n  weeks=${p.totalWeeks}  current=${p.currentWeeklyMileage}mi  peak=${p.peakMi}mi  peakLong=${p.peakLongRunMi}mi` +
        `\n  goal: currentVdot=${p.goalPace.currentVdot} rawGoalVdot=${p.goalPace.rawGoalVdot} stretch=${p.goalPace.goalIsStretch} cappedGoalVdot=${p.goalPace.cappedGoalVdot}` +
        `\n  top3=${p.selection.map(s => `${s.methodId}:${s.score}`).join(', ')}`,
    )
  } else {
    console.log(
      `\n[${p.id}] ${p.label}\n  engine=${p.engine}  maxHR=${p.maxHR}  weeks=${p.totalWeeks}  goal=${p.generalGoal ?? '—'}`,
    )
  }
}
