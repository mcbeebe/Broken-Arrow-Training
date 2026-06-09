// Workout coaching narratives for the General Fitness path.
//
// The trail-race coaching in utils/coaching.ts is hardcoded to mountain racing
// ("3,800 ft of climbing", "Shirley Canyon descent", taper, race day). That copy
// is wrong for a General Fitness user. This module is the method-less analog:
// goal-aware, race-free narratives keyed on the same PlannedDay.type the engine
// emits (strength · run/zone2 · long · quality/vo2max · cross · rest).
//
// Pure: (day, goal, experienceLevel) → narrative. No race, taper, poles,
// altitude, or named landmarks anywhere.

import type { PlannedDay } from '../../types'
import type { CoachingNarrative } from '../../utils/coaching'
import type { GeneralGoal, ExperienceLevel } from '../../hooks/useOnboarding'
import { experienceScale } from './presets'

/** Short, goal-specific flavor woven into otherwise shared copy. */
const GOAL_LABEL: Record<GeneralGoal, string> = {
  stay_healthy: 'Stay Healthy & Fit',
  lose_fat: 'Lose Fat',
  build_muscle: 'Build Muscle',
  build_endurance: 'Build Endurance',
}

function isDeloadDay(day: PlannedDay): boolean {
  return /deload/i.test(day.workout)
}

// ── Per-pillar narratives ───────────────────────────────────────────────────

function strengthCoaching(day: PlannedDay, goal: GeneralGoal, level?: ExperienceLevel): CoachingNarrative {
  const deload = isDeloadDay(day)
  const loadingCue = experienceScale(level ?? 'beginner').loadingCue

  const purpose: Record<GeneralGoal, string> = {
    stay_healthy:
      'Full-body strength is one of the highest-leverage things you can do for long-term health — it protects muscle and bone, keeps your metabolism up, and makes everyday movement easier as the years add up.',
    lose_fat:
      'Strength training tells your body to KEEP muscle while you lose fat. Your diet creates the deficit; lifting makes sure the weight you drop is fat, not the muscle you want to keep.',
    build_muscle:
      'This is the main event for your goal. Progressive overload — adding a little weight or a rep over time — is the signal that builds muscle. Clean, controlled reps drive the growth.',
    build_endurance:
      'Strength here is support work: a little resistance training keeps your muscles, tendons, and joints resilient and improves your economy, so the same pace costs you less energy.',
  }

  const mindset: Record<GeneralGoal, string> = {
    stay_healthy: 'Consistency beats intensity. Two solid sessions a week, kept up for months, is what actually moves your health.',
    lose_fat: 'Strong while leaning out feels great. The scale isn\'t the whole story — holding your strength as you cut means it\'s working.',
    build_muscle: 'Muscle is built over weeks, not single workouts. Log your lifts, try to beat last week by a rep or a few pounds, and let it compound.',
    build_endurance: 'You\'re not chasing big lifts here — just staying durable. Keep it crisp and leave plenty in the tank for your aerobic work.',
  }

  const execution = [
    'WARM-UP (5–7 min): a few minutes of easy cardio, then 10 bodyweight squats, 10 arm circles, and a light set of the day\'s first move.',
    'Work through the exercises in order. Tap any exercise for a full form guide and easier swaps.',
    deload
      ? 'Deload week: lighter weight and fewer sets. The point is to recover, not to push — you\'ll come back stronger.'
      : loadingCue,
    'Move with control — about 2 seconds up, 3 seconds down — and use a full range of motion on every rep.',
    'COOL-DOWN (5 min): easy walk, then stretch the muscles you trained.',
  ]

  const nutrition =
    goal === 'build_muscle'
      ? 'Protein within an hour or so after (shake, eggs, chicken, Greek yogurt). Across the day aim for ~0.7–1 g of protein per lb of bodyweight, and eat enough overall — muscle needs a slight surplus.'
      : goal === 'lose_fat'
      ? 'Protein within an hour or so after, and keep protein high at every meal even in a deficit — it protects muscle and keeps you full.'
      : 'Protein within an hour or so after (shake, yogurt, eggs, beans). Protein at each meal supports recovery and muscle.'

  return {
    title: deload ? 'Strength — Deload' : 'Strength Session',
    purpose: purpose[goal],
    execution,
    mindset: mindset[goal],
    nutrition,
    recovery: 'Expect some muscle soreness 24–48 h later — normal, especially early on. Light movement, water, and sleep clear it fastest.',
  }
}

function easyCardioCoaching(goal: GeneralGoal, long: boolean): CoachingNarrative {
  const goalPurpose: Partial<Record<GeneralGoal, string>> = {
    lose_fat: ' It also burns steady, sustainable calories without leaving you wrecked for the next session.',
    build_endurance: ' This easy volume is most of how endurance is built — roughly 80% of your cardio should feel exactly this relaxed.',
  }
  const purpose =
    (long
      ? 'The week\'s longest easy effort builds durability and stamina — your body learns to keep going and to burn fat for fuel. Still easy, just longer.'
      : 'Easy cardio builds your aerobic base — the engine under everything. At this effort your heart gets stronger and you recover without piling on fatigue.') +
    (goalPurpose[goal] ?? '')

  const execution = [
    'Keep it conversational — the Talk Test: you can speak full sentences but not sing. If you can\'t get the words out, ease off.',
    'Pick your cardio: walk/jog, bike, row, swim, or the machine you like. The mode matters far less than the easy effort.',
    long
      ? 'Settle into a steady, sustainable rhythm. The first stretch should feel almost too easy — that\'s correct.'
      : 'Warm up 5 min building into it; cool down 5 min easing out.',
    'If your heart rate drifts above the zone on a hill or in the heat, slow down — easy means easy.',
  ]

  return {
    title: long ? 'Long Easy Session' : 'Easy Aerobic Session',
    purpose,
    execution,
    mindset:
      'Easy days are not junk time — they\'re where aerobic fitness is built. Going too hard here is the most common mistake. Keep it relaxed and let it add up.',
    nutrition: long
      ? 'For efforts over ~75 min, sip water and take a small carb snack (banana, chews) partway through. Otherwise just be hydrated.'
      : 'No special fueling needed for an easy session under ~75 min — just be hydrated. A light snack beforehand if you\'re hungry.',
    recovery: long
      ? 'Refuel and hydrate within ~30 min. Keep tomorrow easy or off.'
      : 'Easy cardio doubles as recovery — you should finish feeling like you could do more.',
  }
}

function intervalsCoaching(goal: GeneralGoal): CoachingNarrative {
  const goalPurpose: Partial<Record<GeneralGoal, string>> = {
    lose_fat: ' And the after-burn means you keep spending energy for a while once you stop.',
    build_endurance: ' One quality session a week is your ~20% hard — it lifts the threshold that all your easy work sits under.',
  }
  return {
    title: 'Intervals / Quality Session',
    purpose:
      'Short, hard efforts above your easy pace raise your ceiling — your VO₂max and top-end fitness. The hard reps are the stimulus; the recoveries let you repeat them with good form.' +
      (goalPurpose[goal] ?? ''),
    execution: [
      'Quality work is a prescription, not a race — hit the target effort and take the FULL recovery between reps.',
      'WARM UP well: ~10 min easy plus a few short pickups. Don\'t start the first hard rep cold.',
      'The hard efforts should be hard but repeatable — by the last rep you\'re working, not falling apart.',
      'COOL-DOWN: 5–10 min very easy to flush out.',
    ],
    mindset: 'Depth of the recovery is what makes the next rep count. Respect the easy bits as much as the hard ones.',
    nutrition: 'A light carb snack 60–90 min before helps. Hydrate well; you don\'t need fuel during a session this short.',
    recovery: 'Cool down fully and prioritize sleep tonight — that\'s when the adaptation lands. Keep tomorrow easy.',
  }
}

function crossCoaching(): CoachingNarrative {
  return {
    title: 'Cross-Training',
    purpose:
      'Low-impact aerobic work keeps your fitness up while giving your joints and your main movements a break — most of the benefit, less of the wear and tear.',
    execution: [
      'Keep the effort easy to moderate — this is active recovery with a fitness bonus.',
      'Bike, row, swim, or an easy hike all work. Use whatever feels good today.',
      'Add a few minutes of mobility for hips, ankles, and shoulders.',
    ],
    mindset: 'Variety is what keeps training sustainable and your body balanced. Show up and move well.',
    nutrition: 'Hydrate and eat normally — nothing special needed for easy cross-training.',
    recovery: 'This counts as recovery. Keep it gentle and you\'ll feel fresher tomorrow.',
  }
}

function restCoaching(): CoachingNarrative {
  return {
    title: 'Rest Day',
    purpose:
      'Rest is when your body actually adapts — muscles repair, energy stores refill, and your nervous system recovers. Progress happens on rest days, not in spite of them.',
    execution: [
      'Move gently if you like — a walk, light stretching, or mobility all count.',
      'Aim for ~8k steps of easy movement if you can. This is not a workout.',
      'Hydrate well and aim for 7–9 hours of sleep.',
    ],
    mindset: 'Doing less today is part of the plan. Rest well so you can train well tomorrow.',
    nutrition: 'Eat well — whole foods, plenty of protein and vegetables. Rest days are rebuilding days.',
    recovery: 'This IS recovery. Prioritize sleep — it\'s the single most powerful recovery tool you have.',
  }
}

/**
 * Goal-aware, race-free coaching for a General Fitness planned day. Mirrors the
 * CoachingNarrative shape that WorkoutModal renders (PURPOSE / HOW TO EXECUTE /
 * MINDSET / NUTRITION / RECOVERY). `experienceLevel` tunes the strength loading
 * cue; absent it defaults to the beginner cue.
 */
export function getGeneralFitnessCoaching(
  day: PlannedDay,
  goal: GeneralGoal,
  experienceLevel?: ExperienceLevel,
): CoachingNarrative {
  switch (day.type) {
    case 'strength':
      return strengthCoaching(day, goal, experienceLevel)
    case 'run':
      return easyCardioCoaching(goal, false)
    case 'long':
      return easyCardioCoaching(goal, true)
    case 'quality':
      return intervalsCoaching(goal)
    case 'cross':
      return crossCoaching()
    case 'rest':
      return restCoaching()
    default:
      // The engine only emits the types above, but never return undefined.
      return {
        title: `${GOAL_LABEL[goal]} Session`,
        purpose: 'A session in your general-fitness plan. Move at the prescribed effort and keep it sustainable.',
        execution: ['Follow the prescription for the day.', 'Keep good form and stop a couple of reps short of failure.'],
        mindset: 'Consistency is the whole game. Show up and do the work.',
        nutrition: 'Stay hydrated and eat a balanced meal a couple of hours beforehand.',
        recovery: 'Listen to your body — persistent fatigue or poor sleep are signs to back off.',
      }
  }
}
